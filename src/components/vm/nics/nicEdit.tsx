/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */
import React from 'react';
import cockpit from 'cockpit';

import type { Dialogs } from 'dialogs';
import type { optString, VM, VMInterface } from '../../../types';
import type { DialogBodyValues, ValidationBody } from './nicBody';
import type { AvailableSources } from './vmNicsCard';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import {
    NetworkTypeAndSourceRow, NetworkModelRow, NetworkPortForwardsRow,
    interfacePortForwardsToDialog, dialogPortForwardsToInterface,
    validateDialogBodyValues,
} from './nicBody.jsx';
import { virtXmlEdit, domainModifyXML, domainGet } from '../../../libvirtApi/domain.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

const _ = cockpit.gettext;

interface DialogValues extends DialogBodyValues {
    networkMac: string,
}

const NetworkMacRow = ({
    mac,
    onChanged,
    idPrefix,
    isShutoff
} : {
    mac: string,
    onChanged: (val: string) => void,
    idPrefix: string,
    isShutoff: boolean,
}) => {
    let macInput = (
        <TextInput id={`${idPrefix}-mac`}
                   value={mac}
                   {...(!isShutoff ? { readOnlyVariant: "plain" } : {})}
                   onChange={(_, value) => onChanged(value)} />
    );
    if (!isShutoff)
        macInput = <Tooltip content={_("Only editable when the guest is shut off")}>{macInput}</Tooltip>;

    return (
        <FormGroup fieldId={`${idPrefix}-mac`} label={_("MAC address")}>
            {macInput}
        </FormGroup>
    );
};

interface EditNICModalProps {
    idPrefix: string,
    vm: VM,
    network: VMInterface,
    availableSources: AvailableSources,
}

interface EditNICModalState extends DialogValues {
    dialogError: string | undefined,
    dialogErrorDetail?: string,
    saveDisabled: boolean,
    validation: ValidationBody | undefined,
    doOnlineValidation: boolean,
}

export class EditNICModal extends React.Component<EditNICModalProps, EditNICModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: EditNICModalProps) {
        super(props);

        let defaultNetworkSource;
        const currentSource = this.getNetworkSource(props.network);
        let availableSources: string[] = [];

        if (props.network.type === "network")
            availableSources = props.availableSources.network;
        else if (props.network.type === "direct")
            availableSources = Object.keys(props.availableSources.device).filter(dev => props.availableSources.device[dev].type != "bridge");
        else if (props.network.type === "bridge")
            availableSources = Object.keys(props.availableSources.device).filter(dev => props.availableSources.device[dev].type == "bridge");

        if (availableSources.includes(currentSource || ""))
            defaultNetworkSource = currentSource;
        else
            defaultNetworkSource = availableSources.length > 0 ? availableSources[0] : "";

        const init: DialogValues = {
            networkType: props.network.type,
            networkSource: defaultNetworkSource || "",
            networkSourceMode: props.network.type == "direct" ? (props.network.source.mode || "") : "bridge",
            networkModel: props.network.model || "",
            networkMac: props.network.mac || "",
            portForwards: interfacePortForwardsToDialog(props.network.portForward),
        };

        this.state = {
            dialogError: undefined,
            saveDisabled: false,
            ...init,
            validation: validateDialogBodyValues(init),
            doOnlineValidation: false,
        };
        this.save = this.save.bind(this);
        this.onBodyValueChanged = this.onBodyValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    getNetworkSource(network: VMInterface): optString {
        if (network.type === "network")
            return network.source.network;
        else if (network.type === "direct")
            return network.source.dev;
        else if (network.type === "bridge")
            return network.source.bridge;
    }

    onBodyValueChanged<K extends keyof DialogBodyValues>(key: K, value: DialogBodyValues[K]): void {
        const stateDelta = { [key]: value } as Pick<EditNICModalState, K>;

        this.setState(stateDelta);

        if (key == 'networkType' && typeof value == "string" && ['network', 'direct', 'bridge'].includes(value)) {
            let sources;
            if (value === "network")
                sources = this.props.availableSources.network;
            else if (value === "direct")
                sources = Object.keys(this.props.availableSources.device).filter(dev => this.props.availableSources.device[dev].type != "bridge");
            else if (value === "bridge")
                sources = Object.keys(this.props.availableSources.device).filter(dev => this.props.availableSources.device[dev].type == "bridge");

            if (sources && sources.length > 0)
                this.setState({ networkSource: sources[0], saveDisabled: false });
            else
                this.setState({ networkSource: "", saveDisabled: true });
        }

        if (this.state.doOnlineValidation)
            this.setState(state => ({ validation: validateDialogBodyValues(state) }));
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    async save() {
        const Dialogs = this.context;
        const { vm, network } = this.props;

        // disallow duplicate MACs
        if (this.state.networkMac != this.props.network.mac &&
              vm.interfaces.some(iface => iface.mac === this.state.networkMac)) {
            this.dialogErrorSet(_("MAC address already in use"), _("Please choose a different MAC address"));
            return;
        }

        const validation = validateDialogBodyValues(this.state);
        if (validation) {
            this.setState({ validation, doOnlineValidation: true });
            return;
        }

        // Only touch port forwards for "user" interfaces with a
        // default or "passt" backend.
        const configure_port_forwards =
            this.state.networkType == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                (!network.backend || network.backend == "passt");

        // If the backend is still at "default" and there are port
        // forwards, force it to "passt".
        let force_backend = null;
        if (configure_port_forwards && this.state.portForwards.length > 0)
            force_backend = "passt";

        let source;
        if (this.state.networkType == "direct") {
            source = {
                "": this.state.networkSource,
                mode: this.state.networkSourceMode,
            };
        } else {
            source = this.state.networkSource;
        }

        try {
            const mac = network.mac;
            const portForward = dialogPortForwardsToInterface(this.state.portForwards);
            await virtXmlEdit(
                vm,
                "network",
                { mac },
                {
                    mac: this.state.networkMac,
                    model: this.state.networkModel,
                    type: this.state.networkType,
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
            Dialogs.close();
        } catch (exc) {
            this.dialogErrorSet(_("Network interface settings could not be saved"), String(exc));
        }
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm, network } = this.props;

        const defaultBody = (
            <>
                <Form onSubmit={e => e.preventDefault()} isHorizontal>
                    <NetworkTypeAndSourceRow
                        vm={vm}
                        idPrefix={idPrefix}
                        dialogValues={{ ...this.state, availableSources: this.props.availableSources }}
                        onValueChanged={this.onBodyValueChanged}
                    />
                    <NetworkModelRow
                        idPrefix={idPrefix}
                        dialogValues={this.state}
                        onValueChanged={this.onBodyValueChanged}
                        osTypeArch={vm.arch}
                        osTypeMachine={vm.emulatedMachine}
                    />
                    <NetworkMacRow
                        mac={this.state.networkMac}
                        onChanged={mac => this.setState({ networkMac: mac })}
                        idPrefix={idPrefix}
                        isShutoff={vm.state == "shut off"}
                    />
                </Form>
                { this.state.networkType == "user" &&
                    vm.capabilities.interfaceBackends.includes("passt") &&
                    (!network.backend || network.backend == "passt") &&
                    <Form>
                        <br />
                        <NetworkPortForwardsRow
                            idPrefix={idPrefix}
                            dialogValues={this.state}
                            validation={this.state.validation}
                            onValueChanged={this.onBodyValueChanged}
                        />
                    </Form>
                }
            </>
        );
        const showWarning = () => {
            if (vm.state === 'running' && (
                this.state.networkType !== network.type ||
                this.state.networkSource !== this.getNetworkSource(network) ||
                this.state.networkModel !== network.model)
            ) {
                return <NeedsShutdownAlert idPrefix={idPrefix} />;
            }
        };

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal-window`} isOpen onClose={Dialogs.close} className='nic-edit'>
                <ModalHeader title={cockpit.format(_("$0 virtual network interface settings"), network.mac)} />
                <ModalBody>
                    { showWarning() }
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    {defaultBody}
                </ModalBody>
                <ModalFooter>
                    <Button isDisabled={this.state.saveDisabled || !!this.state.validation} id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                        {_("Save")}
                    </Button>
                    <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}
