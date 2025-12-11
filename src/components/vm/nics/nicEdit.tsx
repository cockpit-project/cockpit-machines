/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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
import React from 'react';
import cockpit from 'cockpit';

import { useDialogs } from 'dialogs';
import type { optString, VM, VMInterface } from '../../../types';
import type { AvailableSources } from './vmNicsCard';

import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import {
    NetworkTypeAndSourceRow, validate_NetworkTypeAndSourceRow,
    NetworkModelRow,
    PortForwardsValue, NetworkPortForwardsRow, validate_PortForwards,
    interfacePortForwardsToDialog, dialogPortForwardsToInterface,
} from './nicBody.jsx';
import { virtXmlEdit, domainModifyXML, domainGet } from '../../../libvirtApi/domain.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

import {
    useDialogState, DialogValue, DialogError,
    DialogErrorMessage,
    DialogTextInput,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

const _ = cockpit.gettext;

const NetworkMacRow = ({
    value,
    isShutoff,
} : {
    value: DialogValue<string>,
    isShutoff: boolean,
}) => {
    let macInput = (
        <DialogTextInput
            value={value}
            {...(!isShutoff ? { readOnlyVariant: "plain" } : {})} />
    );
    if (!isShutoff)
        macInput = <Tooltip content={_("Only editable when the guest is shut off")}>{macInput}</Tooltip>;

    return (
        <FormGroup fieldId={value.id()} label={_("MAC address")}>
            {macInput}
        </FormGroup>
    );
};

function getNetworkSource(network: VMInterface): optString {
    if (network.type === "network")
        return network.source.network;
    else if (network.type === "direct")
        return network.source.dev;
    else if (network.type === "bridge")
        return network.source.bridge;
}

interface EditNICValues {
    type: string;
    source: string;
    source_mode: string;
    model: string,
    mac: string;
    portForwards: PortForwardsValue;
}

export const EditNICModal = ({
    idPrefix,
    vm,
    network,
    availableSources,
} : {
    idPrefix: string,
    vm: VM,
    network: VMInterface,
    availableSources: AvailableSources,
}) => {
    const Dialogs = useDialogs();

    function init(): EditNICValues {
        let defaultNetworkSource;
        const currentSource = getNetworkSource(network);
        let available: string[] = [];

        if (network.type === "network")
            available = availableSources.network;
        else if (network.type === "direct")
            available = Object.keys(availableSources.device).filter(dev => availableSources.device[dev].type != "bridge");
        else if (network.type === "bridge")
            available = Object.keys(availableSources.device).filter(dev => availableSources.device[dev].type == "bridge");

        if (available.includes(currentSource || ""))
            defaultNetworkSource = currentSource;
        else
            defaultNetworkSource = available.length > 0 ? available[0] : "";

        return {
            type: network.type,
            source: defaultNetworkSource || "",
            source_mode: network.type == "direct" ? (network.source.mode || "") : "bridge",
            model: network.model || "",
            mac: network.mac || "",
            portForwards: interfacePortForwardsToDialog(network.portForward),
        };
    }

    function validate() {
        validate_NetworkTypeAndSourceRow(dlg.value("source"), vm, availableSources);
        if (dlg.values.type == "user")
            validate_PortForwards(dlg.value("portForwards"));
    }

    async function save(values: EditNICValues) {
        // disallow duplicate MACs
        if (values.mac != network.mac &&
              vm.interfaces.some(iface => iface.mac === values.mac)) {
            throw new DialogError(_("MAC address already in use"), _("Please choose a different MAC address"));
        }

        // Only touch port forwards for "user" interfaces with a
        // default or "passt" backend.
        const configure_port_forwards =
            values.type == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                (!network.backend || network.backend == "passt");

        // If the backend is still at "default" and there are port
        // forwards, force it to "passt".
        let force_backend = null;
        if (configure_port_forwards && values.portForwards.length > 0)
            force_backend = "passt";

        let source;
        if (values.type == "direct") {
            source = {
                "": values.source,
                mode: values.source_mode,
            };
        } else {
            source = values.source;
        }

        try {
            const mac = network.mac;
            const portForward = dialogPortForwardsToInterface(values.portForwards);
            await virtXmlEdit(
                vm,
                "network",
                { mac },
                {
                    mac: values.mac,
                    model: values.model,
                    type: values.type,
                    backend: { type: force_backend },
                    source,
                    portForward: configure_port_forwards ? portForward : null,
                }
            );
            if (configure_port_forwards && mac) {
                // HACK - https://github.com/virt-manager/virt-manager/issues/982
                //
                // virt-xml has no way to remove portForward elements,
                // so we remove them here explicitly after virt-xml
                // has done its job successfully.
                await domainModifyXML(vm, doc => {
                    const elements =
                        doc.querySelectorAll(`devices interface:has(mac[address="${CSS.escape(mac)}" i]) portForward`);
                    if (elements && elements.length > portForward.length) {
                        for (let i = portForward.length; i < elements.length; i++)
                            elements[i].remove();
                        return true;
                    }
                    return false;
                });
            }
            domainGet({ connectionName: vm.connectionName, id: vm.id });
        } catch (exc) {
            throw DialogError.fromError(_("Network interface settings could not be saved"), exc);
        }
    }

    const dlg = useDialogState<EditNICValues>(init, validate);

    const showWarning = () => {
        if (vm.state === 'running' && (
            dlg.values.type !== network.type ||
                dlg.values.source !== getNetworkSource(network) ||
                dlg.values.model !== network.model)
        ) {
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
        }
    };

    const defaultBody = (
        <>
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NetworkTypeAndSourceRow
                    vm={vm}
                    type_value={dlg.value("type")}
                    source_value={dlg.value("source")}
                    source_mode_value={dlg.value("source_mode")}
                    availableSources={availableSources}
                />
                <NetworkModelRow
                    value={dlg.value("model")}
                    osTypeArch={vm.arch}
                    osTypeMachine={vm.emulatedMachine}
                />
                <NetworkMacRow
                    value={dlg.value("mac")}
                    isShutoff={vm.state == "shut off"}
                />
            </Form>
            { dlg.values.type == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                (!network.backend || network.backend == "passt") &&
                <Form>
                    <br />
                    <NetworkPortForwardsRow value={dlg.value("portForwards")} />
                </Form>
            }
        </>
    );

    return (
        <Modal
            position="top"
            variant="medium"
            id={`${idPrefix}-modal-window`}
            isOpen
            onClose={Dialogs.close}
            className='nic-edit'
        >
            <ModalHeader title={cockpit.format(_("$0 virtual network interface settings"), network.mac)} />
            <ModalBody>
                { showWarning() }
                <DialogErrorMessage dialog={dlg} />
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                <DialogActionButton
                    dialog={dlg}
                    action={save}
                    onClose={Dialogs.close}
                >
                    {_("Save")}
                </DialogActionButton>
                <DialogCancelButton
                    dialog={dlg}
                    onClose={Dialogs.close}
                />
            </ModalFooter>
        </Modal>
    );
};
