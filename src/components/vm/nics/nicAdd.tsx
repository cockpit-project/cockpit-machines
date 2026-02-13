/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
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
    NetworkTypeAndSourceValue, NetworkTypeAndSourceRow,
    init_NetworkTypeAndSourceRow, validate_NetworkTypeAndSourceRow,
    NetworkModelRow,
    PortForwardsValue, NetworkPortForwardsRow, validate_PortForwards,
    dialogPortForwardsToInterface,
} from './nicBody.jsx';
import { virtXmlHotAdd, domainGet, domainIsRunning } from '../../../libvirtApi/domain.js';
import { appState } from '../../../state';

import {
    useDialogState, DialogField, DialogError,
    DialogErrorMessage, DialogHelperText,
    DialogActionButton, DialogCancelButton
} from 'cockpit/dialog';

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
    val: string,
}

const NetworkMacRow = ({
    field,
} : {
    field: DialogField<NetworkMacValue>
}) => {
    const f_set = field.sub("set");
    const f_val = field.sub("val");

    return (
        <FormGroup
            label={_("MAC address")}
            hasNoPaddingTop
            isInline
        >
            <Radio
                id={f_set.id("off")}
                name="mac-setting"
                isChecked={!f_set.get()}
                label={_("Generate automatically")}
                onChange={() => f_set.set(false)}
            />
            <Radio
                id={f_set.id("on")}
                name="mac-setting"
                isChecked={f_set.get()}
                label={_("Set manually")}
                onChange={() => f_set.set(true)}
            />
            <TextInput
                id={f_val.id()}
                className="nic-add-mac-setting-manual"
                isDisabled={!f_set.get()}
                value={f_val.get()}
                onChange={(_, value) => f_val.set(value)}
            />
            <DialogHelperText field={field} />
        </FormGroup>
    );
};

function init_NetworkMacRow() {
    return { set: false, val: "" };
}

function validate_NetworkMacRow(field: DialogField<NetworkMacValue>) {
    field.validate(v => {
        if (v.set && v.val === "")
            return _("Network MAC can not be empty.");
    });
}

const PermanentChange = ({
    field,
} : {
    field: DialogField<boolean>,
}) => {
    // By default for a running VM, the iface is attached until shut
    // down only. Enable permanent change of the domain.xml

    return (
        <FormGroup
            fieldId={field.id()}
            label={_("Persistence")}
            hasNoPaddingTop
        >
            <Checkbox
                id={field.id()}
                isChecked={field.get()}
                label={_("Always attach")}
                onChange={(_event, checked) => field.set(checked)}
            />
        </FormGroup>
    );
};

interface AddNICValues {
    model: string,
    type_and_source: NetworkTypeAndSourceValue,
    mac: NetworkMacValue;
    portForwards: PortForwardsValue;
    permanent: boolean;
}

export const AddNIC = ({
    idPrefix,
    vm,
    availableSources,
} : {
    idPrefix: string,
    vm: VM,
    availableSources: AvailableSources,
}) => {
    const Dialogs = useDialogs();

    function init(): AddNICValues {
        return {
            model: "virtio",
            type_and_source: init_NetworkTypeAndSourceRow(vm, null, availableSources),
            mac: init_NetworkMacRow(),
            portForwards: [],
            permanent: false,
        };
    }

    function validate() {
        validate_NetworkMacRow(dlg.field("mac"));
        validate_NetworkTypeAndSourceRow(dlg.field("type_and_source"));
        if (dlg.values.type_and_source.type == "user")
            validate_PortForwards(dlg.field("portForwards"));
    }

    async function add(values: AddNICValues) {
        // disallow duplicate MACs
        if (values.mac.set && vm.interfaces.some(iface => iface.mac === values.mac.val))
            throw new DialogError(_("MAC address already in use"), _("Please choose a different MAC address"));

        try {
            const tas = values.type_and_source;
            let source;
            if (tas.type == "direct") {
                source = {
                    "": tas.source,
                    mode: tas.mode,
                };
            } else {
                source = tas.source;
            }
            let backend = null;
            if (tas.type == "user" && vm.capabilities.interfaceBackends.includes("passt"))
                backend = "passt";
            await virtXmlHotAdd(
                vm,
                "network",
                {
                    mac: (
                        values.mac.set
                            ? values.mac.val
                            : getRandomMac(await appState.getVms())
                    ),
                    model: values.model,
                    type: tas.type,
                    backend: { type: backend },
                    source,
                    portForward: (
                        tas.type == "user"
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
                <NetworkTypeAndSourceRow field={dlg.field("type_and_source")} />

                <NetworkModelRow
                    field={dlg.field("model")}
                    osTypeArch={vm.arch}
                    osTypeMachine={vm.emulatedMachine}
                />

                <NetworkMacRow field={dlg.field("mac")} />

                { domainIsRunning(vm.state) && vm.persistent &&
                    <PermanentChange field={dlg.field("permanent")} />
                }
            </Form>
            { dlg.values.type_and_source.type == "user" &&
                vm.capabilities.interfaceBackends.includes("passt") &&
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
                    dialog={dlg}
                    action={add}
                    onClose={Dialogs.close}
                >
                    {_("Add")}
                </DialogActionButton>
                <DialogCancelButton
                    dialog={dlg}
                    onClose={Dialogs.close}
                />
            </ModalFooter>
        </Modal>
    );
};
