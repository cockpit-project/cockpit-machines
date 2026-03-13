/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';

import type { VM, VMDisk } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';

import { useDialogs } from 'dialogs.jsx';
import {
    useDialogState,
    DialogError, DialogErrorMessage,
    DialogField,
    DialogRadioSelect, DialogRadioSelectOption,
    DialogDropdownSelectObject,
    DialogActionButton,
    DialogCancelButton,
} from 'cockpit/dialog';

import { virtXmlEdit } from "../../../libvirtApi/domain.js";
import {
    diskBusTypes, diskCacheModes, getDiskPrettyName, getDiskFullName, getNextAvailableTarget
} from '../../../helpers.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

const _ = cockpit.gettext;

const Name = ({
    idPrefix,
    disk,
} : {
    idPrefix: string,
    disk: VMDisk,
}) => {
    let label = _("ID");
    if (disk.type == "file" || disk.type == "block" || disk.type == "dir")
        label = _("Path");
    else if (disk.type === "network")
        label = _("Url");
    else if (disk.type === "volume")
        label = _("Storage volume");

    return (
        <FormGroup fieldId={`${idPrefix}-name`} label={label} hasNoPaddingTop>
            <div id={`${idPrefix}-name`}>
                {getDiskFullName(disk)}
            </div>
        </FormGroup>
    );
};

interface BusValue {
    type: string,
    _options: string[],
    _excuse: string | false,
}

function init_Bus(vm: VM, disk: VMDisk): BusValue {
    const type = disk.bus || "";
    const _options: string[] =
        diskBusTypes[disk.device || "disk"].filter(bus => vm.capabilities.supportedDiskBusTypes.includes(bus));
    if (!_options.includes(type))
        _options.push(type);

    return {
        type,
        _options,
        // TODO - Changing the bus type will change the target, which
        // in principle is totally fine. However, we use the target to
        // identify disks, so that would mess up the UI quite a
        // bit. We could identify disks by their source.
        _excuse: vm.state != "shut off" && _("Machine must be shut off before changing bus type"),
    };
}

const Bus = ({
    field,
} : {
    field: DialogField<BusValue>,
}) => {
    const { _options, _excuse } = field.get();
    return (
        <DialogDropdownSelectObject
            label={_("Bus")}
            field={field.sub("type")}
            options={_options}
            excuse={_excuse}
        />
    );
};

type AccessMode = "readonly" | "writable";

interface AccessValue {
    mode: AccessMode,
    _options: DialogRadioSelectOption<AccessMode>[];
}

function init_Access(disk: VMDisk): AccessValue {
    const _options: DialogRadioSelectOption<AccessMode>[] = [
        { value: "readonly", label: _("Read-only") },
    ];

    if (disk.device != "cdrom")
        _options.push({ value: "writable", label: _("Writeable") });

    return {
        mode: disk.readonly ? "readonly" : "writable",
        _options,
    };
}

const Access = ({
    field,
} : {
    field: DialogField<AccessValue>,
}) => {
    const { _options } = field.get();
    return (
        <DialogRadioSelect
            label={_("Access")}
            isInline
            field={field.sub("mode")}
            options={_options}
        />
    );
};

interface EditDiskValues {
    access: AccessValue;
    bus: BusValue,
    cache: string,
}

const EditDisk = ({
    idPrefix,
    disk,
    vm,
} : {
    idPrefix: string;
    disk: VMDisk;
    vm: VM;
}) => {
    const Dialogs = useDialogs();

    const dlg = useDialogState(() => ({
        access: init_Access(disk),
        bus: init_Bus(vm, disk),
        cache: disk.driver.cache,
    }));

    const defaultBody = (
        <Form isHorizontal>
            <Name idPrefix={idPrefix} disk={disk} />
            <Access field={dlg.field("access")} />
            <Bus field={dlg.field("bus")} />
            <DialogDropdownSelectObject
                label={_("Cache")}
                field={dlg.field("cache")}
                options={diskCacheModes}
            />
        </Form>
    );

    async function save(values: EditDiskValues) {
        const existingTargets = Object.getOwnPropertyNames(vm.disks);
        let newTarget: string | undefined = disk.target;
        let address = null;

        if (values.bus.type != disk.bus) {
            newTarget = getNextAvailableTarget(existingTargets, values.bus.type);
            if (!newTarget)
                throw new DialogError(cockpit.format(_("No free targets for bus type $0."), values.bus.type));

            // HACK - virt-xml will not reset the address when
            // changing the bus type, and we need to add
            // "xpath0.delete=./address" explicitly. However, not all
            // versions of virt-xml that we care about support xpath
            // yet, so we reset the address explicitly to something
            // acceptable.
            //
            // See https://github.com/virt-manager/virt-manager/issues/430

            if (values.bus.type == "virtio") {
                address = { type: "pci" };
            } else if (values.bus.type == "usb") {
                address = { type: "usb", bus: 0 };
            } else if (values.bus.type == "scsi" || values.bus.type == "sata") {
                address = { type: "drive", bus: 0 };
            }
        }

        try {
            await virtXmlEdit(
                vm,
                "disk",
                { target: disk.target },
                {
                    target: newTarget,
                    bus: values.bus.type,
                    address,
                    cache: values.cache,
                    readonly: (values.access.mode == "readonly") ? "yes" : "no",
                }
            );
        } catch (ex) {
            throw DialogError.fromError(_("Disk settings could not be saved"), ex);
        }
    }

    const showWarning = () => {
        if (vm.state === 'running')
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
    };

    return (
        <Modal position="top" variant="medium" id={`${idPrefix}-dialog`}
            isOpen
            onClose={Dialogs.close}
        >
            <ModalHeader title={cockpit.format(_("Edit $0 attributes"), getDiskPrettyName(disk))} />
            <ModalBody>
                {showWarning()}
                <DialogErrorMessage dialog={dlg} />
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                <DialogActionButton dialog={dlg} action={save} onClose={Dialogs.close}>
                    {_("Save")}
                </DialogActionButton>
                <DialogCancelButton dialog={dlg} onClose={Dialogs.close} />
            </ModalFooter>
        </Modal>
    );
};

export const EditDiskAction = ({
    idPrefix,
    disk,
    vm,
} : {
    idPrefix: string,
    disk: VMDisk,
    vm: VM,
}) => {
    const Dialogs = useDialogs();

    function open() {
        Dialogs.show(
            <EditDisk
                idPrefix={idPrefix}
                disk={disk}
                vm={vm}
            />
        );
    }

    const enabled = (Object.keys(diskBusTypes).includes(disk.device || "") &&
                     vm.capabilities.supportedDiskBusTypes.length > 0);

    return (
        <Button id={idPrefix}
                isDisabled={!enabled}
                variant='secondary'
                onClick={open}>
            {_("Edit")}
        </Button>
    );
};
