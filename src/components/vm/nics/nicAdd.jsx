/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { DialogsContext } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { NetworkTypeAndSourceRow, NetworkModelRow } from './nicBody.jsx';
import { domainAttachIface, domainGet, domainIsRunning } from '../../../libvirtApi/domain.js';

import './nic.css';

const _ = cockpit.gettext;

function getRandomMac(vms) {
    // prevent getting cycled in inforseen case where all MACs will conflict with existing ones
    for (let i = 0; i < 42; i++) {
        const parts = ["52", "54", "00"];
        for (let j = 0; j < 3; j++)
            parts.push(Math.floor(Math.random() * 256).toString(16)
                    .padStart(2, '0'));

        const mac = parts.join(':');

        // check no other VM uses the same MAC address
        let addressConflicts = false;
        vms.forEach(vm => {
            vm.interfaces.forEach(iface => {
                if (iface.mac === mac)
                    addressConflicts = true;
            });
        });

        console.log(mac);
        if (!addressConflicts)
            return mac;
    }

    console.warn("Could not generate non-conflicting MAC address");
    return undefined;
}

const NetworkMacRow = ({ idPrefix, dialogValues, onValueChanged }) => {
    return (
        <FormGroup fieldId={`${idPrefix}-generate-mac`} label={_("MAC address")} hasNoPaddingTop isInline>
            <Radio id={`${idPrefix}-generate-mac`}
                   name="mac-setting"
                   isChecked={!dialogValues.setNetworkMac}
                   label={_("Generate automatically")}
                   onChange={() => onValueChanged('setNetworkMac', false)} />
            <Radio id={`${idPrefix}-set-mac`}
                   name="mac-setting"
                   isChecked={dialogValues.setNetworkMac}
                   label={_("Set manually")}
                   onChange={() => onValueChanged('setNetworkMac', true)} />
            <TextInput id={`${idPrefix}-mac`}
                       className="nic-add-mac-setting-manual"
                       isDisabled={!dialogValues.setNetworkMac}
                       value={dialogValues.networkMac}
                       onChange={(_, value) => onValueChanged('networkMac', value)} />
        </FormGroup>
    );
};

const PermanentChange = ({ idPrefix, onValueChanged, dialogValues, vm }) => {
    // By default for a running VM, the iface is attached until shut down only. Enable permanent change of the domain.xml
    return (
        <FormGroup label={_("Persistence")} fieldId={`${idPrefix}-permanent`} hasNoPaddingTop>
            <Checkbox id={`${idPrefix}-permanent`}
                      isChecked={dialogValues.permanent}
                      label={_("Always attach")}
                      onChange={(_event, checked) => onValueChanged('permanent', checked)} />
        </FormGroup>
    );
};

export class AddNIC extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            networkType: "network",
            networkSource: props.availableSources.network.length > 0 ? props.availableSources.network[0] : undefined,
            networkModel: "virtio",
            setNetworkMac: false,
            networkMac: "",
            permanent: false,
            addVNicInProgress: false,
        };
        this.add = this.add.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    onValueChanged(key, value) {
        const stateDelta = { [key]: value };

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
                this.setState({ networkSource: undefined, saveDisabled: true });
        }
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    add() {
        const Dialogs = this.context;
        const { vm, vms } = this.props;

        this.setState({ addVNicInProgress: true });
        domainAttachIface({
            connectionName: vm.connectionName,
            vmName: vm.name,
            model: this.state.networkModel,
            sourceType: this.state.networkType,
            source: this.state.networkSource,
            // Generate our own random MAC address because virt-xml has bug which generates different MAC for online and offline XML
            // https://github.com/virt-manager/virt-manager/issues/305
            mac: this.state.setNetworkMac ? this.state.networkMac : getRandomMac(vms),
            permanent: this.state.permanent,
            hotplug: vm.state === "running",
        })
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch(exc => this.dialogErrorSet(_("Network interface settings could not be saved"), exc.message))
                .finally(() => this.setState({ addVNicInProgress: false }));
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm } = this.props;

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

                <NetworkMacRow idPrefix={idPrefix}
                               dialogValues={this.state}
                               onValueChanged={this.onValueChanged} />

                {domainIsRunning(vm.state) && vm.persistent &&
                <PermanentChange idPrefix={idPrefix}
                                 dialogValues={this.state}
                                 onValueChanged={this.onValueChanged}
                                 vm={vm} />}
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-dialog`} isOpen onClose={Dialogs.close} className='nic-add'
                title={_("Add virtual network interface")}
                footer={
                    <>
                        <Button isLoading={this.state.addVNicInProgress}
                                isDisabled={
                                    (["network", "direct", "bridge"].includes(this.state.networkType) && this.state.networkSource === undefined) ||
                                    this.state.addVNicInProgress
                                }
                                id={`${idPrefix}-add`}
                                variant='primary'
                                onClick={this.add}>
                            {_("Add")}
                        </Button>
                        <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                            {_("Cancel")}
                        </Button>
                    </>
                }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                {defaultBody}
            </Modal>
        );
    }
}

AddNIC.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    vms: PropTypes.array.isRequired,
};

export default AddNIC;
