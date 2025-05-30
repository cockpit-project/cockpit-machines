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

import type { Dialogs } from 'dialogs';
import type { optString, VM, VMInterface } from '../../../types';
import type { DialogBodyValues } from './nicBody';
import type { AvailableSources } from './vmNicsCard';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal
} from '@patternfly/react-core/dist/esm/deprecated/components/Modal';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { NetworkTypeAndSourceRow, NetworkModelRow } from './nicBody.jsx';
import { domainChangeInterfaceSettings, domainGet } from '../../../libvirtApi/domain.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

const _ = cockpit.gettext;

interface DialogValues extends DialogBodyValues {
    networkMac: string,
}

type OnValueChanged = <K extends keyof DialogValues>(key: K, value: DialogValues[K]) => void;

const NetworkMacRow = ({
    mac,
    onValueChanged,
    idPrefix,
    isShutoff
} : {
    mac: string,
    onValueChanged: OnValueChanged,
    idPrefix: string,
    isShutoff: boolean,
}) => {
    let macInput = (
        <TextInput id={`${idPrefix}-mac`}
                   value={mac}
                   {...(!isShutoff ? { readOnlyVariant: "plain" } : {})}
                   onChange={(_, value) => onValueChanged("networkMac", value)} />
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

        this.state = {
            dialogError: undefined,
            networkType: props.network.type,
            networkSource: defaultNetworkSource || "",
            networkModel: props.network.model || "",
            networkMac: props.network.mac || "",
            saveDisabled: false,
        };
        this.save = this.save.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
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

    onValueChanged<K extends keyof DialogValues>(key: K, value: DialogValues[K]): void {
        const stateDelta = { [key]: value } as Pick<EditNICModalState, K>;

        this.setState(stateDelta);

        if (key == 'networkType' && ['network', 'direct', 'bridge'].includes(value)) {
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
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    save() {
        const Dialogs = this.context;
        const { vm, network } = this.props;

        // disallow duplicate MACs
        if (this.state.networkMac != this.props.network.mac &&
              vm.interfaces.some(iface => iface.mac === this.state.networkMac)) {
            this.dialogErrorSet(_("MAC address already in use"), _("Please choose a different MAC address"));
            return;
        }

        domainChangeInterfaceSettings({
            vmName: vm.name,
            connectionName: vm.connectionName,
            persistent: vm.persistent,
            macAddress: network.mac || "",
            newMacAddress: this.state.networkMac,
            networkModel: this.state.networkModel,
            networkType: this.state.networkType,
            networkSource: this.state.networkSource,
        })
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch((exc) => {
                    this.dialogErrorSet(_("Network interface settings could not be saved"), exc.message);
                });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm, network } = this.props;

        const defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NetworkTypeAndSourceRow idPrefix={idPrefix}
                                         dialogValues={{ ...this.state, availableSources: this.props.availableSources }}
                                         onValueChanged={this.onValueChanged}
                                         connectionName={vm.connectionName} />
                <NetworkModelRow idPrefix={idPrefix}
                                 dialogValues={this.state}
                                 onValueChanged={this.onValueChanged}
                                 osTypeArch={vm.arch}
                                 osTypeMachine={vm.emulatedMachine} />
                <NetworkMacRow mac={this.state.networkMac}
                               onValueChanged={this.onValueChanged}
                               idPrefix={idPrefix}
                               isShutoff={vm.state == "shut off"} />
            </Form>
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
            <Modal position="top" variant="medium" id={`${idPrefix}-modal-window`} isOpen onClose={Dialogs.close} className='nic-edit'
                   title={cockpit.format(_("$0 virtual network interface settings"), network.mac)}
                   footer={
                       <>
                           <Button isDisabled={this.state.saveDisabled} id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    { showWarning() }
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    {defaultBody}
                </>
            </Modal>
        );
    }
}
