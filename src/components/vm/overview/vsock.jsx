/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2023 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { NumberInput } from "@patternfly/react-core/dist/esm/components/NumberInput";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { HelpIcon } from '@patternfly/react-icons';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { useDialogs } from 'dialogs.jsx';
import { fmt_to_fragments } from 'utils.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { FormHelper } from "cockpit-components-form-helper.jsx";
import { domainRemoveVsock, domainSetVsock } from "../../../libvirtApi/domain.js";
import { NeedsShutdownAlert, NeedsShutdownTooltip } from "../../common/needsShutdown.jsx";
import {
    SOCAT_EXAMPLE,
    SOCAT_EXAMPLE_HEADER,
    VSOCK_INFO_MESSAGE,
} from './helpers.jsx';

import "./vsock.scss";

const _ = cockpit.gettext;

const ASSIGN_AUTOMATICALLY = _("Assign automatically");
// There  are  several  reserved  addresses:
// VMADDR_CID_ANY  (-1U)  means  any  address  for  binding;
// VMADDR_CID_HYPERVISOR (0) is reserved for services built into the hypervisor;
// VMADDR_CID_LOCAL (1) is the well-known address for local communication (loopback);
// VMADDR_CID_HOST (2) is the well-known address of the host.
const MIN_VSOCK_CID = 3;

function getVsockUsageMessage(vmName, connectionName, vms, auto, address) {
    if (auto)
        return;

    const vmsUsingCIDAddress = vms
            .filter(vm => !(vmName === vm.name && connectionName === vm.connectionName) && vm.vsock.cid.auto === "no" && vm.vsock.cid.address === String(address))
            .map(vm => vm.name);
    if (vmsUsingCIDAddress.length === 0)
        return;

    const vmsUsingCIDAddressString = vmsUsingCIDAddress.join(", ");

    return (
        <span>
            {fmt_to_fragments(_("Identifier in use by $0. VMs with an identical identifier cannot run at the same time."), <b>{vmsUsingCIDAddressString}</b>)}
        </span>
    );
}

function getNextAvailableVsockCID(vmName, connectionName, vms) {
    let availableAddress = MIN_VSOCK_CID;

    const vmsCIDAddresses = vms.filter(vm => !(vmName === vm.name && connectionName === vm.connectionName) && vm.vsock.cid.auto === "no")
            .map(vm => Number(vm.vsock.cid.address))
            .sort();

    for (let i = 0; i < vmsCIDAddresses.length; i++) {
        const addressInUse = vmsCIDAddresses[i];
        if (availableAddress === addressInUse) {
            availableAddress++;
            i = 0;
        }
    }

    return availableAddress;
}

export const VsockModal = ({ vm, vms, vmVsockNormalized, isVsockAttached, idPrefix }) => {
    const [dialogError, setDialogError] = useState();
    const [auto, setAuto] = useState(vm.vsock.cid.auto ? vmVsockNormalized.auto : true);
    const [address, _setAddress] = useState(vmVsockNormalized.address || getNextAvailableVsockCID(vm.name, vm.connectionName, vms));
    const [actionInProgress, setActionInProgress] = useState(undefined);

    const setAddress = (value) => {
        // Allow empty string
        if (value === "") {
            _setAddress(value);
            return;
        }

        _setAddress(parseInt(value));
    };

    const onBlur = (value) => {
        if (value < MIN_VSOCK_CID)
            value = MIN_VSOCK_CID;

        _setAddress(value);
    };

    const Dialogs = useDialogs();

    const save = () => {
        setActionInProgress("save");
        return domainSetVsock({
            connectionName: vm.connectionName,
            vmName: vm.name,
            hotplug: vm.state === "running",
            permanent: vm.persistent,
            auto: auto ? "yes" : "no",
            address,
            isVsockAttached,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to configure vsock"), detail: exc.message }))
                .finally(() => setActionInProgress(undefined));
    };

    const detach = () => {
        setActionInProgress("detach");
        return domainRemoveVsock({
            connectionName: vm.connectionName,
            vmName: vm.name,
            hotplug: vm.state === "running",
            permanent: vm.persistent,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to detach vsock"), detail: exc.message }))
                .finally(() => setActionInProgress(undefined));
    };

    const showWarning = () => {
        if (isVsockAttached && vm.persistent && vm.state === "running" &&
            (vmVsockNormalized.auto !== auto ||
            // If automatic generation is set, then adress in live XML is prefilled with a value libvirt chooses,
            // and it's expected that live XML will contain different address than inactiveXML
            (!auto && vmVsockNormalized.address !== address)))
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
    };

    const vsockUsage = getVsockUsageMessage(vm.name, vm.connectionName, vms, auto, address);

    const body = (
        <Form onSubmit={e => e.preventDefault()} isHorizontal>
            <FormGroup fieldId="vsock-cid"
                       label={_("Custom identifier")}
                       isInline>
                <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <Checkbox id='vsock-cid-generate'
                              isChecked={!auto}
                              onChange={() => setAuto(!auto)} />
                    <NumberInput value={!auto ? address : ""}
                        onMinus={() => setAddress(address - 1)}
                        onChange={event => setAddress(event.target.value)}
                        onPlus={() => setAddress(address + 1)}
                        onBlur={event => onBlur(event.target.value)}
                        min={MIN_VSOCK_CID}
                        isDisabled={auto}
                        inputName="vsock-context-identifier"
                        id="vsock-context-identifier"
                        inputAriaLabel="vsock context identifier"
                        allowEmptyInput
                        widthChars={4} />
                </Flex>
                <FormHelper fieldId="vsock-cid-usage"
                    variant="warning"
                    helperTextInvalid={vsockUsage}
                    helperText={vsockUsage} />
            </FormGroup>
        </Form>
    );

    // Transient VM doesn't have offline config
    // Libvirt doesn't allow live editing vsock, so we should disallow such operation
    // Similar to https://bugzilla.redhat.com/show_bug.cgi?id=2213740
    const isEditingTransientVm = isVsockAttached && !vm.persistent;
    let primaryButton = (
        <Button variant='primary'
            id="vsock-dialog-apply"
            onClick={save}
            isLoading={actionInProgress == "save"}
            isAriaDisabled={actionInProgress || isEditingTransientVm}>
            {isVsockAttached ? _("Save") : _("Add")}
        </Button>
    );

    if (isEditingTransientVm) {
        primaryButton = (
            <Tooltip id='vsock-live-edit-tooltip'
                content={_("Cannot edit vsock device on a transient VM")}>
                {primaryButton}
            </Tooltip>
        );
    }

    return (
        <Modal id={`${idPrefix}-vsock-modal`}
               position="top"
               variant="small"
               onClose={Dialogs.close}
               title={isVsockAttached ? _("Edit vsock interface") : _("Add vsock interface")}
               description={<>
                   {VSOCK_INFO_MESSAGE}
                   <Popover alertSeverityVariant="info"
                       position="bottom"
                       headerContent={SOCAT_EXAMPLE_HEADER}
                       bodyContent={
                           <Flex direction={{ default: 'column' }}>
                               {SOCAT_EXAMPLE}
                           </Flex>
                       }
                       hasAutoWidth>
                       <Button variant="plain" className="pf-v5-u-px-sm pf-v5-u-py-0" aria-label={_("more info")}>
                           <HelpIcon noVerticalAlign />
                       </Button>
                   </Popover>
               </>}
               isOpen
               footer={
                   <>
                       {primaryButton}
                       {isVsockAttached &&
                       <Button variant='secondary'
                               id="vsock-dialog-detach"
                               onClick={detach}
                               isLoading={actionInProgress == "detach"}
                               isDisabled={actionInProgress}>
                           {_("Remove")}
                       </Button>}
                       <Button variant='link' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            {showWarning()}
            {dialogError && <ModalError dialogError={dialogError.text} dialogErrorDetail={dialogError.detail} />}
            {body}
        </Modal>
    );
};

VsockModal.propTypes = {
    vm: PropTypes.object.isRequired,
    vmVsockNormalized: PropTypes.object.isRequired,
    vms: PropTypes.array.isRequired,
    isVsockAttached: PropTypes.bool.isRequired,
    idPrefix: PropTypes.string.isRequired,
};

export const VsockLink = ({ vm, vms, idPrefix }) => {
    const Dialogs = useDialogs();
    const isVsockAttached = Object.keys(vm.vsock.cid).length > 0;
    const vmVsockNormalized = {
        auto: vm.vsock.cid.auto && vm.vsock.cid.auto === "yes",
        address: vm.vsock.cid.address && Number(vm.vsock.cid.address),
    };
    const vsockActionChanged = vm.persistent && vm.state === "running" &&
                               (vm.inactiveXML.vsock.cid.auto !== vm.vsock.cid.auto ||
                               // If automatic generation is set, then adress in live XML is prefilled with a value libvirt chooses,
                               // and it's expected that live XML will contain different address than inactiveXML
                               (!vmVsockNormalized.auto && vm.inactiveXML.vsock.cid.address !== vm.vsock.cid.address));
    let vsockAddress = _("none");
    if (vmVsockNormalized.auto && vm.state !== "running") {
        vsockAddress = ASSIGN_AUTOMATICALLY.toLowerCase(); // small hack so translators don't have to translate both uppercase and lowercase string
    } else if (vmVsockNormalized.address) {
        vsockAddress = vmVsockNormalized.address;
    }

    function open() {
        Dialogs.show(<VsockModal vm={vm} vms={vms} vmVsockNormalized={vmVsockNormalized} isVsockAttached={isVsockAttached} idPrefix={idPrefix} />);
    }

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem id={`${idPrefix}-vsock-address`}>
                {vsockAddress}
            </FlexItem>
            { vsockActionChanged && <NeedsShutdownTooltip iconId="vsock-tooltip" tooltipId="tip-vsock" /> }
            <Button variant="link" isInline id={`${idPrefix}-vsock-button`} onClick={open}>
                {isVsockAttached ? _("edit") : _("add")}
            </Button>
        </Flex>
    );
};
