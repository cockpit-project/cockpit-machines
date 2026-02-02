/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
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
    NetworkTypeAndSourceValue, NetworkTypeAndSourceRow,
    init_NetworkTypeAndSourceRow, validate_NetworkTypeAndSourceRow,
    NetworkModelRow,
    PortForwardsValue, NetworkPortForwardsRow, validate_PortForwards,
    interfacePortForwardsToDialog, dialogPortForwardsToInterface,
} from './nicBody.jsx';
import { virtXmlEdit, domainModifyXML, domainGet } from '../../../libvirtApi/domain.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

import {
    useDialogState, DialogField, DialogError,
    DialogErrorMessage,
    DialogTextInput,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

const _ = cockpit.gettext;

const NetworkMacRow = ({
    field,
    isShutoff,
} : {
    field: DialogField<string>,
    isShutoff: boolean,
}) => {
    let macInput = (
        <DialogTextInput
            field={field}
            {...(!isShutoff ? { readOnlyVariant: "plain" } : {})} />
    );
    if (!isShutoff)
        macInput = <Tooltip content={_("Only editable when the guest is shut off")}>{macInput}</Tooltip>;

    return (
        <FormGroup fieldId={field.id()} label={_("MAC address")}>
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
    model: string,
    type_and_source: NetworkTypeAndSourceValue,
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
        return {
            model: network.model || "",
            type_and_source: init_NetworkTypeAndSourceRow(vm, network, availableSources),
            mac: network.mac || "",
            portForwards: interfacePortForwardsToDialog(network.portForward),
        };
    }

    function validate() {
        validate_NetworkTypeAndSourceRow(dlg.field("type_and_source"));
        if (dlg.values.type_and_source.type == "user")
            validate_PortForwards(dlg.field("portForwards"));
    }

    async function save(values: EditNICValues) {
        // disallow duplicate MACs
        if (values.mac != network.mac && vm.interfaces.some(iface => iface.mac === values.mac)) {
            throw new DialogError(
                _("MAC address already in use"),
                _("Please choose a different MAC address"));
        }

        const tas = values.type_and_source;

        // Only touch port forwards for "user" interfaces with a
        // default or "passt" backend.
        const configure_port_forwards =
            tas.type == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                (!network.backend || network.backend == "passt");

        // If the backend is still at "default" and there are port
        // forwards, force it to "passt".
        let force_backend = null;
        if (configure_port_forwards && values.portForwards.length > 0)
            force_backend = "passt";

        let source;
        if (tas.type == "direct") {
            source = {
                "": tas.source,
                mode: tas.mode,
            };
        } else {
            source = tas.source;
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
                    type: tas.type,
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
            dlg.values.type_and_source.type !== network.type ||
                dlg.values.type_and_source.source !== getNetworkSource(network) ||
                dlg.values.model !== network.model)
        ) {
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
        }
    };

    const defaultBody = (
        <>
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NetworkTypeAndSourceRow field={dlg.field("type_and_source")} />
                <NetworkModelRow
                    field={dlg.field("model")}
                    osTypeArch={vm.arch}
                    osTypeMachine={vm.emulatedMachine}
                />
                <NetworkMacRow
                    field={dlg.field("mac")}
                    isShutoff={vm.state == "shut off"}
                />
            </Form>
            { dlg.values.type_and_source.type == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                (!network.backend || network.backend == "passt") &&
                <Form>
                    <br />
                    <NetworkPortForwardsRow field={dlg.field("portForwards")} />
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
