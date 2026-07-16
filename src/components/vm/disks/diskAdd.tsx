/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */

import cockpit from 'cockpit';
import React from 'react';

import type { VM, VMDisk, VMDiskDevice } from '../../../types';

import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { useDialogs } from 'dialogs.jsx';

import { diskBusTypes, diskCacheModes, convertToUnit, getNextAvailableTarget } from '../../../helpers.js';
import { domainGet, virtXmlHotAdd, virtXmlHotEdit, domainIsRunning } from '../../../libvirtApi/domain.js';

import {
    useDialogState_async, DialogState,
    DialogField,
    DialogError, DialogErrorMessage,
    DialogRadioSelect, DialogRadioSelectOption,
    DialogDropdownSelectObject,
    DialogTextInput,
    DialogCheckbox,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

import { FileChooser } from "cockpit/react/FileChooser";

import {
    CreateNewValue, init_CreateNew, validate_CreateNew, CreateNew,
    createNewDiskImage,
    UseExistingValue, init_UseExisting, validate_UseExisting, UseExisting,
} from '../../common/storage';

const _ = cockpit.gettext;

const CREATE_NEW = 'create-new';
const USE_EXISTING = 'use-existing';

function clearSerial(serial: string): string {
    return serial.replace(' ', '_').replace(/([^A-Za-z0-9_.+-]+)/gi, '');
}

interface AdditionalOptionsValue {
    expanded: boolean;
    cache_mode: string;
    bus_type: string;
    serial: string;

    _bus_types: string[];
}

function getBusType(vm: VM, device: VMDiskDevice) {
    // According to https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms (section about 'target'),
    // scsi is the default option for libvirt for cdrom devices

    let bus_type: string = "";
    if (device == "cdrom")
        bus_type = "scsi";
    else {
        // If disk with the same device exists, use the same bus too
        bus_type = "virtio";
        for (const disk of Object.values(vm.disks)) {
            if (disk.device === device && disk.bus) {
                bus_type = disk.bus;
                break;
            }
        }
    }

    return bus_type;
}

function init_AdditionalOptions(vm: VM, device: VMDiskDevice): AdditionalOptionsValue {
    const bus_types: string[] = diskBusTypes[device].filter(bus => vm.capabilities.supportedDiskBusTypes.includes(bus));
    const bus_type = getBusType(vm, device);

    if (!bus_types.includes(bus_type))
        bus_types.push(bus_type);

    return {
        expanded: false,
        cache_mode: "default",
        bus_type,
        serial: "",

        _bus_types: bus_types,
    };
}

function update_AdditionalOptions(field: DialogField<AdditionalOptionsValue>, vm: VM, device: VMDiskDevice) {
    const { _bus_types } = field.get();
    const bus_type = getBusType(vm, device);

    if (!_bus_types.includes(bus_type))
        _bus_types.push(bus_type);

    field.sub("_bus_types").set(_bus_types);
    field.sub("bus_type").set(bus_type);
}

function validate_AdditionalOptions(field: DialogField<AdditionalOptionsValue>) {
    field.sub("serial").validate(v => {
        if (v != clearSerial(v))
            return _("Allowed characters: basic Latin alphabet, numbers, and limited punctuation (-, _, +, .)");
    });
}

const AdditionalOptions = ({
    field,
} : {
    field: DialogField<AdditionalOptionsValue>,
}) => {
    const { expanded, bus_type, serial, _bus_types } = field.get();

    // Many disk types have serial length limitations.
    //
    // libvirt docs: "IDE/SATA devices are commonly limited to 20
    // characters. SCSI devices depending on hypervisor version are
    // limited to 20, 36 or 247 characters."
    //
    // https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms

    const maxSerialLength = bus_type === "scsi" ? 36 : 20;

    return (
        <ExpandableSection
            toggleText={ expanded ? _("Hide additional options") : _("Show additional options")}
            onToggle={() => field.sub("expanded").set(!expanded)}
            isExpanded={expanded}
            className="pf-v6-u-pt-lg"
        >
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <Grid hasGutter md={6}>
                    <DialogDropdownSelectObject
                        label={_("Cache")}
                        field={field.sub("cache_mode")}
                        options={diskCacheModes}
                    />
                    <DialogDropdownSelectObject
                        label={_("Bus")}
                        field={field.sub("bus_type")}
                        options={_bus_types}
                    />
                </Grid>
                <DialogTextInput
                    label={_("Disk identifier")}
                    field={field.sub("serial")}
                    className="ct-monospace"
                    warning={
                        serial.length > maxSerialLength
                            ? cockpit.format(
                                _("Identifier may be silently truncated to $0 characters "),
                                maxSerialLength)
                            : null
                    }
                />
            </Form>
        </ExpandableSection>
    );
};

type Mode = typeof CREATE_NEW | typeof USE_EXISTING;

interface AddDiskValues {
    mode: Mode,
    create_new: CreateNewValue,
    use_existing: UseExistingValue,
    permanent: boolean,
    additional_options: AdditionalOptionsValue,
}

export const AddDisk = ({
    idPrefix,
    vm,
} : {
    idPrefix: string,
    vm: VM,
}) => {
    const Dialogs = useDialogs();

    async function init(): Promise<AddDiskValues> {
        return {
            mode: CREATE_NEW,
            /* XXX - select default location and basename based on existing disks of vm. */
            create_new: await init_CreateNew(vm.name, vm.connectionName),
            use_existing: init_UseExisting(vm.connectionName),
            permanent: vm.persistent,
            additional_options: init_AdditionalOptions(vm, "disk"),
        };
    }

    function validate(dlg: DialogState<AddDiskValues>) {
        if (dlg.values.mode == CREATE_NEW) {
            validate_CreateNew(dlg.field("create_new"));
            dlg.field("create_new").sub("name").validate(val => {
                if (val.base == "")
                    return _("Name can not be empty");
            });
        }
        else if (dlg.values.mode == USE_EXISTING)
            validate_UseExisting(dlg.field("use_existing"));
        validate_AdditionalOptions(dlg.field("additional_options"));
    }

    function get_device(values: AddDiskValues): VMDiskDevice {
        const { mode } = values;
        if (mode == CREATE_NEW) {
            return "disk";
        } else if (mode == USE_EXISTING) {
            return values.use_existing.device;
        } else
            return "disk";
    }

    function update_options() {
        cockpit.assert(dlg instanceof DialogState);
        const device = get_device(dlg.values);
        if (device)
            update_AdditionalOptions(dlg.field("additional_options"), vm, device);
    }

    const dlg = useDialogState_async<AddDiskValues>(init, validate);

    const mode_options: DialogRadioSelectOption<Mode>[] = [
        {
            value: CREATE_NEW,
            label: _("Create a new disk image"),
        },
        {
            value: USE_EXISTING,
            label: _("Use an existing disk image, block device, or storage volume"),
        },
    ];

    let defaultBody;

    if (dlg instanceof DialogState) {
        const { mode } = dlg.values;
        defaultBody = (
            <>
                <Form onSubmit={e => e.preventDefault()} isHorizontal>
                    <DialogRadioSelect
                        isInline
                        label={" "}
                        field={dlg.field("mode", update_options)}
                        options={mode_options}
                    />
                    {
                        mode === CREATE_NEW &&
                            <CreateNew field={dlg.field("create_new", update_options)} />
                    }
                    {
                        mode === USE_EXISTING &&
                            <UseExisting field={dlg.field("use_existing", update_options)} />
                    }
                    {
                        vm.persistent && domainIsRunning(vm.state) &&
                            <DialogCheckbox
                                field_label={_("Persistence")}
                                checkbox_label={_("Always attach")}
                                field={dlg.field("permanent")}
                            />
                    }
                </Form>
                <AdditionalOptions field={dlg.field("additional_options")} />
            </>
        );
    }

    async function add_disk(values: AddDiskValues) {
        try {
            const existingTargets = Object.getOwnPropertyNames(vm.disks);
            const target = getNextAvailableTarget(existingTargets, values.additional_options.bus_type);

            if (!target)
                throw new DialogError(_("Failed to add disk"), _("Can not determine guest device name"));

            const common = {
                target,
                // Using "cache=default" is mostly the same as
                // omitting cache altogether, except when
                // "type=block". In that case, "cache=default" is an
                // error and omitting "cache" gives the real default
                // for block devices, which is "cache=none". So we
                // omit "cache" when the user selects "default" to
                // cover both cases.
                cache: values.additional_options.cache_mode == "default" ? null : values.additional_options.cache_mode,
                bus: values.additional_options.bus_type,
                serial: values.additional_options.serial === "" ? null : values.additional_options.serial,
                driver: {
                    // virt-install does this by default for the OS
                    // disk, but virt-xml does not when adding
                    // additional ones. Cockpit-machines has been
                    // doing it since 078628b75167, so we keep doing it.
                    discard: "unmap",
                },
            };

            if (values.mode === CREATE_NEW) {
                const params = values.create_new;
                const path = await createNewDiskImage(params);
                await virtXmlHotAdd(
                    vm,
                    "disk",
                    {
                        path,
                        format: params.name.format,
                        ...common,
                    },
                    values.permanent,
                );
            } else if (values.mode == USE_EXISTING) {
                const params = values.use_existing;
                await virtXmlHotAdd(
                    vm,
                    "disk",
                    {
                        path: params.file,
                        format: params.format,
                        device: params.device,
                        ...common,
                    },
                    values.permanent,
                );
            }

            // force reload of VM data, events are not reliable (i.e. for a down VM)
            domainGet({ connectionName: vm.connectionName, id: vm.id });
        } catch (ex) {
            throw DialogError.fromError(_("Disk failed to be added"), ex);
        }
    }

    const overwrite = dlg instanceof DialogState && dlg.values.mode == CREATE_NEW && dlg.values.create_new.exists;

    return (
        <Modal
            position="top"
            variant="medium"
            id={`${idPrefix}-dialog-modal-window`}
            isOpen
            onClose={Dialogs.close}
        >
            <ModalHeader title={_("Add disk")} />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                <DialogActionButton
                    dialog={dlg}
                    action={add_disk}
                    onClose={Dialogs.close}
                    variant={overwrite ? "danger" : "primary"}
                >
                    {overwrite ? _("Overwrite and add") : _("Add")}
                </DialogActionButton>
                <DialogCancelButton dialog={dlg} onClose={Dialogs.close} />
            </ModalFooter>
        </Modal>
    );
};

export const InsertMedia = ({
    disk,
    vm,
} : {
    disk: VMDisk,
    vm: VM,
}) => {
    async function insert_media(file: string) {
        try {
            const xml = {
                type: "file",
                source: {
                    file
                }
            };

            await virtXmlHotEdit(
                vm,
                "disk",
                { target: { dev: disk.target } },
                xml
            );

            // force reload of VM data, events are not reliable (i.e. for a down VM)
            domainGet({ connectionName: vm.connectionName, id: vm.id });
        } catch (ex) {
            throw DialogError.fromError(_("Media failed to be inserted"), ex);
        }
    }

    return (
        <FileChooser
            title={_("Insert media")}
            actionLabel={_("Insert")}
            action={insert_media}
            filters={
                [
                    {
                        label: _("ISO files"),
                        filter: name => !!name.match("\\.iso$"),
                    },
                ]
            }
        />
    );
};
