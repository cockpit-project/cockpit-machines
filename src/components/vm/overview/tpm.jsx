/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
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
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { ExpandableSection, ExpandableSectionToggle } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainRemoveTpm, domainSetTpm } from "../../../libvirtApi/domain.js";
import { rephraseUI } from "../../../helpers.js";
import { NeedsShutdownAlert, NeedsShutdownTooltip, needsShutdownTpm } from "../../common/needsShutdown.jsx";

const _ = cockpit.gettext;

const SUPPORTEDTPMMODELS = ["tpm-tis", "tpm-crb"];
const SUPPORTEDTPMTYPES = ["emulator", "passthrough"];
const SUPPORTEDTPMVERSIONS = ["2.0", "1.2"];

const TpmModalAlert = ({ dialogError }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!dialogError)
        return;

    if (dialogError.variant === "warning") {
        return (
            <Alert variant="warning"
                title={dialogError.text}
                actionLinks={<>
                    <ExpandableSectionToggle onToggle={() => setIsExpanded(!isExpanded)}
                        isExpanded={isExpanded}>
                        {isExpanded ? _("Show less") : _("Show more")}
                    </ExpandableSectionToggle>
                    <ExpandableSection isExpanded={isExpanded}
                        isDetached>
                        {dialogError.expandableDetail}
                    </ExpandableSection>
                </>}
                isInline>
                {dialogError.detail}
            </Alert>
        );
    }

    return <ModalError dialogError={dialogError.text} dialogErrorDetail={dialogError.detail} />;
};

export const TpmModal = ({ vm, isTpmAttached, isRemovable, idPrefix }) => {
    const [dialogError, setDialogError] = useState();
    const [tpmModel, setTpmModel] = useState(vm.tpm.model || SUPPORTEDTPMMODELS[0]);
    const [tpmType, setTpmType] = useState(vm.tpm.type || SUPPORTEDTPMTYPES[0]);
    const [tpmVersion, setTpmVersion] = useState(vm.tpm.version || SUPPORTEDTPMVERSIONS[0]);
    const [devicePath, setDevicePath] = useState(vm.tpm.devicePath || "");
    const [inProgress, setInProgress] = useState(false);
    const [offerColdplug, setOfferColdplug] = useState(false);

    const Dialogs = useDialogs();

    const setTpmColdplug = () => {
        return domainSetTpm({
            connectionName: vm.connectionName,
            vmName: vm.name,
            model: tpmModel,
            type: tpmType,
            version: tpmVersion,
            devicePath: tpmType === "passthrough" ? devicePath : undefined,
            defineOffline: true,
            hotplug: false,
            isTpmAttached,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to configure TPM"), detail: exc.message, variant: "danger" }));
    };

    const setTpmHotplug = () => {
        return domainSetTpm({
            connectionName: vm.connectionName,
            vmName: vm.name,
            model: tpmModel,
            type: tpmType,
            version: tpmVersion,
            devicePath: tpmType === "passthrough" ? devicePath : undefined,
            defineOffline: false,
            hotplug: true,
            isTpmAttached,
        })
                .then(vm.persistent ? setTpmColdplug : Dialogs.close())
                .catch(exc => {
                    if (vm.persistent)
                        setOfferColdplug(true);

                    setDialogError({
                        text: _("Could not dynamically add TPM"),
                        detail: _("Adding a TPM will require a reboot to take effect."),
                        expandableDetail: exc.message,
                        variant: vm.persistent ? "warning" : "danger"
                    });
                });
    };

    const save = (coldplug) => {
        setInProgress(true);

        let handler = setTpmHotplug;

        if ((coldplug || vm.state !== "running") && vm.persistent)
            handler = setTpmColdplug;

        return handler()
                .finally(() => setInProgress(false));
    };

    const detach = () => {
        setInProgress(true);
        return domainRemoveTpm({
            connectionName: vm.connectionName,
            vmName: vm.name,
            hotplug: vm.state === "running",
            permanent: vm.persistent,
            model: vm.tpm.model,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to detach TPM"), detail: exc.message, variant: "danger" }))
                .finally(() => setInProgress(false));
    };

    const needsShutdown = () => {
        if (vm.state === 'running' && isTpmAttached && (vm.tpm.model !== tpmModel || vm.tpm.type !== tpmType || vm.tpm.version !== tpmVersion))
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
    };

    // Transient VM doesn't have offline config
    // Libvirt doesn't allow live editing TPM, so we should disallow such operation
    const isEditingTransientVm = isTpmAttached && !vm.persistent;
    let primaryButton = (
        <Button variant='primary'
            id="tpm-dialog-apply"
            onClick={() => save(false)}
            isLoading={inProgress && !offerColdplug}
            isAriaDisabled={inProgress || offerColdplug || isEditingTransientVm}>
            {isTpmAttached ? _("Save") : _("Add")}
        </Button>
    );

    if (isEditingTransientVm) {
        primaryButton = (
            <Tooltip id='tpm-live-edit-tooltip'
                content={_("Cannot edit TPM device on a transient VM")}>
                {primaryButton}
            </Tooltip>
        );
    }

    return (
        <Modal id={`${idPrefix}-tpm-modal`}
               position="top"
               variant="small"
               onClose={Dialogs.close}
               title={isTpmAttached ? _("Edit TPM device type") : _("Add TPM device type")}
               isOpen
               footer={
                   <>
                       {primaryButton}
                       {offerColdplug && <Button variant='secondary'
                               id="tpm-dialog-apply-next-boot"
                               onClick={() => save(true)}
                               isLoading={inProgress}
                               isDisabled={inProgress}>
                           {_("Apply on next boot")}
                       </Button>}
                       {isTpmAttached && isRemovable &&
                       <Button variant='secondary'
                               id="tpm-dialog-detach"
                               onClick={detach}
                               isLoading={inProgress}
                               isDisabled={inProgress}>
                           {_("Remove")}
                       </Button>}
                       <Button variant='link' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            {needsShutdown()}
            <TpmModalAlert dialogError={dialogError} />
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <FormGroup role="radiogroup"
                           label={_("Model")}
                           fieldId="tpm-model"
                           hasNoPaddingTop
                           isStack>
                    {SUPPORTEDTPMMODELS.map(model => (
                        <Radio label={rephraseUI("tpmModel", model)}
                               key={model}
                               id={model}
                               isChecked={tpmModel === model}
                               onChange={() => setTpmModel(model)}
                               isLabelWrapped />)
                    )}
                </FormGroup>
                <FormGroup role="radiogroup"
                           label={_("Type")}
                           fieldId="tpm-type"
                           hasNoPaddingTop
                           isStack>
                    {SUPPORTEDTPMTYPES.map(type => (
                        <Radio label={rephraseUI("tpmType", type)}
                               key={type}
                               id={type}
                               isChecked={tpmType === type}
                               onChange={() => setTpmType(type)}
                               isLabelWrapped />)
                    )}
                </FormGroup>
                {tpmType === "passthrough" && (
                    <FormGroup label={_("Device Path")}
                               fieldId="tpm-device-path">
                        <TextInput value={devicePath}
                                   type="text"
                                   id="tpm-device-path"
                                   onChange={(_, value) => setDevicePath(value)} />
                    </FormGroup>
                )}
                {tpmType === "emulator" && (
                <FormGroup role="radiogroup"
                           label={_("Version")}
                           fieldId="tpm-version"
                           hasNoPaddingTop
                           isStack>
                    {SUPPORTEDTPMVERSIONS.map(version => (
                        <Radio label={rephraseUI("tpmVersion", version)}
                               key={version}
                               id={version}
                               isChecked={tpmVersion === version}
                               onChange={() => setTpmVersion(version)}
                               isLabelWrapped />)
                    )}
                </FormGroup>
                )}
            </Form>
        </Modal>
    );
};

TpmModal.propTypes = {
    vm: PropTypes.object.isRequired,
    isTpmAttached: PropTypes.bool.isRequired,
    idPrefix: PropTypes.string.isRequired,
};

export const TpmLink = ({ vm, idPrefix, onAddErrorNotification }) => {
    const Dialogs = useDialogs();

    const isTpmAttached = Object.keys(vm.tpm).length > 0;

    const isRemovable = true;

    function open() {
        Dialogs.show(<TpmModal vm={vm}
                               isTpmAttached={isTpmAttached}
                               isRemovable={isRemovable}
                               idPrefix={idPrefix}
                               onAddErrorNotification={onAddErrorNotification} />);
    }

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem id={`${idPrefix}-tpm-state`}>
                {isTpmAttached ? _("Enabled") : _("none")}
            </FlexItem>
            { needsShutdownTpm(vm) && <NeedsShutdownTooltip iconId="tpm-tooltip" tooltipId="tip-tpm" /> }
            <Button variant="link" isInline id={`${idPrefix}-tpm-button`} onClick={open}>
                {isTpmAttached ? _("edit") : _("add")}
            </Button>
        </Flex>
    );
};
