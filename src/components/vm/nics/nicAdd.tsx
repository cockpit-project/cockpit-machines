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

import { useDialogs } from 'dialogs';
import type { VM } from '../../../types';
import type { AvailableSources } from './vmNicsCard';

import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import {
    NetworkTypeAndSourceRow, validate_NetworkTypeAndSourceRow,
    NetworkModelRow,
    PortForwardsValue, NetworkPortForwardsRow, validate_PortForwards,
    dialogPortForwardsToInterface,
} from './nicBody.jsx';
import { virtXmlHotAdd, domainGet, domainIsRunning } from '../../../libvirtApi/domain.js';
import { AppState } from '../../../app';

import {
    useDialogState, DialogValue, DialogError,
    DialogErrorMessage, DialogValidationText,
    DialogActionButton, DialogCancelButton
} from '../../common/dialog';

import './nic.css';

const _ = cockpit.gettext;

function getRandomMac(vms: VM[]): string | undefined {
    // prevent getting cycled in the unforeseen case where all MACs will conflict with existing ones
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

        if (!addressConflicts)
            return mac;
    }

    console.warn("Could not generate non-conflicting MAC address");
    return undefined;
}

interface NetworkMacValue {
    set: boolean,
    mac: string,
}

const NetworkMacRow = ({
    idPrefix,
    value,
} : {
    idPrefix: string,
    value: DialogValue<NetworkMacValue>
}) => {
    const v_set = value.sub("set");
    const v_mac = value.sub("mac");

    return (
        <FormGroup
            fieldId={`${idPrefix}-generate-mac`}
            label={_("MAC address")}
            hasNoPaddingTop
            isInline
        >
            <Radio
                id={`${idPrefix}-generate-mac`}
                name="mac-setting"
                isChecked={!v_set.get()}
                label={_("Generate automatically")}
                onChange={() => v_set.set(false)}
            />
            <Radio
                id={`${idPrefix}-set-mac`}
                name="mac-setting"
                isChecked={v_set.get()}
                label={_("Set manually")}
                onChange={() => v_set.set(true)}
            />
            <TextInput
                id={`${idPrefix}-mac`}
                className="nic-add-mac-setting-manual"
                isDisabled={!v_set.get()}
                value={v_mac.get()}
                onChange={(_, value) => v_mac.set(value)}
            />
            <DialogValidationText value={value} />
        </FormGroup>
    );
};

function init_NetworkMacRow() {
    return { set: false, mac: "" };
}

function validate_NetworkMacRow(value: DialogValue<NetworkMacValue>) {
    value.validate(v => {
        if (v.set && v.mac === "")
            return _("Network MAC can not be empty.");
    });
}

const PermanentChange = ({
    idPrefix,
    value,
} : {
    idPrefix: string,
    value: DialogValue<boolean>,
}) => {
    // By default for a running VM, the iface is attached until shut
    // down only. Enable permanent change of the domain.xml

    return (
        <FormGroup
            fieldId={`${idPrefix}-permanent`}
            label={_("Persistence")}
            hasNoPaddingTop
        >
            <Checkbox
                id={`${idPrefix}-permanent`}
                isChecked={value.get()}
                label={_("Always attach")}
                onChange={(_event, checked) => value.set(checked)}
            />
        </FormGroup>
    );
};

interface AddNICValues {
    networkModel: string,
    networkType: string;
    networkSource: string;
    networkSourceMode: string;
    networkMac: NetworkMacValue;
    portForwards: PortForwardsValue;
    permanent: boolean;
}

export const AddNIC = ({
    idPrefix,
    vm,
    availableSources,
    appState,
} : {
    idPrefix: string,
    vm: VM,
    availableSources: AvailableSources;
    appState: AppState;
}) => {
    const Dialogs = useDialogs();

    const init: AddNICValues = {
        networkModel: "virtio",
        networkType: vm.connectionName == "session" ? "user" : "network",
        networkSource: availableSources.network.length > 0 ? availableSources.network[0] : "",
        networkSourceMode: "bridge",
        networkMac: init_NetworkMacRow(),
        portForwards: [],
        permanent: false,
    };

    function validate() {
        validate_NetworkMacRow(dlg.value("networkMac"));
        validate_NetworkTypeAndSourceRow(dlg.value("networkSource"), vm, availableSources);
        if (dlg.value("networkType").get() == "user")
            validate_PortForwards(dlg.value("portForwards"));
    }

    async function add(values: AddNICValues) {
        console.log("ADD", values);

        // disallow duplicate MACs
        if (values.networkMac.set && vm.interfaces.some(iface => iface.mac === values.networkMac.mac))
            throw new DialogError(_("MAC address already in use"), _("Please choose a different MAC address"));

        try {
            let source;
            if (values.networkType == "direct") {
                source = {
                    "": values.networkSource,
                    mode: values.networkSourceMode,
                };
            } else {
                source = values.networkSource;
            }
            let backend = null;
            if (values.networkType == "user" && vm.capabilities.interfaceBackends.includes("passt"))
                backend = "passt";
            await virtXmlHotAdd(
                vm,
                "network",
                {
                    mac: (
                        values.networkMac.set
                            ? values.networkMac.mac
                            : getRandomMac(await appState.getVms())
                    ),
                    model: values.networkModel,
                    type: values.networkType,
                    backend: { type: backend },
                    source,
                    portForward: (
                        values.networkType == "user"
                            ? dialogPortForwardsToInterface(values.portForwards)
                            : null
                    ),
                },
                values.permanent
            );
            domainGet({ connectionName: vm.connectionName, id: vm.id });
        } catch (exc) {
            throw DialogError.fromError(_("Network interface settings could not be saved"), exc);
        }
    }

    const dlg = useDialogState(init, validate);

    const defaultBody = (
        <>
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NetworkTypeAndSourceRow
                    vm={vm}
                    idPrefix={idPrefix}
                    type_value={dlg.value("networkType")}
                    source_value={dlg.value("networkSource")}
                    source_mode_value={dlg.value("networkSourceMode")}
                    availableSources={availableSources}
                />

                <NetworkModelRow
                    idPrefix={idPrefix}
                    value={dlg.value("networkModel")}
                    osTypeArch={vm.arch}
                    osTypeMachine={vm.emulatedMachine}
                />

                <NetworkMacRow
                    idPrefix={idPrefix}
                    value={dlg.value("networkMac")}
                />

                { domainIsRunning(vm.state) && vm.persistent &&
                    <PermanentChange
                        idPrefix={idPrefix}
                        value={dlg.value("permanent")}
                    />
                }
            </Form>
            { dlg.value("networkType").get() == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
                <Form>
                    <br />
                    <NetworkPortForwardsRow
                        idPrefix={idPrefix}
                        value={dlg.value("portForwards")}
                    />
                </Form>
            }
        </>
    );

    return (
        <Modal
            position="top"
            variant="medium"
            id={`${idPrefix}-dialog`}
            isOpen
            onClose={Dialogs.close}
            className='nic-add'
        >
            <ModalHeader title={_("Add virtual network interface")} />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                <DialogActionButton
                    id={`${idPrefix}-add`}
                    dialog={dlg}
                    action={add}
                    onClose={Dialogs.close}
                >
                    {_("Add")}
                </DialogActionButton>
                <DialogCancelButton
                    id={`${idPrefix}-cancel`}
                    dialog={dlg}
                    onClose={Dialogs.close}
                />
            </ModalFooter>
        </Modal>
    );
};
