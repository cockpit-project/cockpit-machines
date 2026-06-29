/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */

/* TODO

   - Warn when "using existing" that is already in use somewhere else
   - Use the FileChooser directly for inserting media (or at least tweak the filters)
 */

import cockpit from 'cockpit';
import React from 'react';

import type { ConnectionName, VM, VMDisk, VMDiskDevice } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { useDialogs } from 'dialogs.jsx';
import { fsinfo } from 'cockpit/fsinfo';

import { diskBusTypes, diskCacheModes, units, convertToUnit, getNextAvailableTarget  } from '../../../helpers.js';
import { domainGet, virtXmlHotAdd, virtXmlHotEdit, domainIsRunning } from '../../../libvirtApi/domain.js';
import { appState } from '../../../state';

import {
    useDialogState, useDialogState_async, DialogState,
    DialogField,
    DialogError, DialogErrorMessage,
    DialogRadioSelect, DialogRadioSelectOption,
    DialogDropdownSelect, DialogDropdownSelectObject,
    DialogTextInput,
    DialogCheckbox,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

import { DialogFileChooserInput, FileChooserCollection } from "cockpit/react/FileChooser";

import { SizeInput, SizeValue } from '../../common/dialog';

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

function getDefaultLocation(vm: VM): string {
    for (const p of appState.storagePools) {
        if (p.name == "default" && p.connectionName == vm.connectionName && p.type == "dir" && p.target && p.target.path)
            return p.target.path;
    }

    if (vm.connectionName == "session")
        return cockpit.info.user.home + "/.local/share/libvirt/images";
    else
        return "/var/lib/libvirt/images";
}

async function getDefaultDiskImageName(vm: VM, location: string, format: string) {
    try {
        const info = await fsinfo(location, ["entries"], { superuser: "try" });
        if (info.entries) {
            for (let idx = 0; idx < 100; idx++) {
                const n = vm.name + (idx ? "-" + String(idx) : "") + (format ? "." + format : "");
                if (!info.entries[n])
                    return n;
            }
        }
    } catch (ex) {
        console.log("ERR", ex);
    }

    return null;
}

interface CreateNewValue {
    vm: VM,
    defaultLocation: string;
    defaultName: string;
    location: string;
    name: string;
    size: SizeValue;
    format: string;
    exists: boolean;
}

async function init_CreateNew(vm: VM): Promise<CreateNewValue> {
    const defaultFormat = "qcow2";
    const defaultLocation = getDefaultLocation(vm);
    const uniqueDefaultName = await getDefaultDiskImageName(vm, defaultLocation, defaultFormat);
    const defaultName = uniqueDefaultName || vm.name + "." + defaultFormat;
    return {
        vm,
        defaultLocation,
        defaultName,
        location: defaultLocation,
        name: defaultName,
        format: defaultFormat,
        size: { size: "1", unit: units.GiB.name },
        exists: !uniqueDefaultName,
    };
}

const CreateNew = ({
    field,
} : {
    field: DialogField<CreateNewValue>,
}) => {
    async function updated(trigger: string) {
        field.set_async(200, async value => {
            console.log("TRIGGER", trigger);

            // Change to new default when user hasn't touched it

            if (trigger == "location" && value.name == value.defaultName) {
                const newDefaultName = await getDefaultDiskImageName(value.vm, value.location, value.format);
                if (newDefaultName)
                    return { ...value, name: newDefaultName, defaultName: newDefaultName, exists: false };
            }

            // Mabye change format based on name, or vice versa

            const suffix = value.name.split(".").pop();
            let name = value.name;
            let format = value.format;
            if (trigger == "name") {
                if (suffix == "qcow2" || suffix == "raw")
                    format = suffix;
            } else if (trigger == "format") {
                name = name.substring(0, name.length - (suffix ? suffix.length : 0)) + value.format;
            }

            // Check whether it exists already

            let exists = false;
            try {
                const info = await fsinfo(value.location + "/" + name, ["type"], { superuser: "try" })
                exists = !!info.type;
            } catch (ex) {
            }

            return { ...value, name, format, exists };
        });
    }

    async function makeUnique() {
        field.set_async(0, async value => {
            const newDefaultName = await getDefaultDiskImageName(value.vm, value.location, value.format);
            if (newDefaultName)
                return { ...value, name: newDefaultName, defaultName: newDefaultName, exists: false };
            return value;
        });
    }


    const { defaultLocation, exists } = field.get();

    return (
        <>
            <DialogFileChooserInput
                label={_("Location")}
                field={field.sub("location", () => updated("location"))}
                fileChooserProps={
                    {
                        title: _("Select the location of the new disk image"),
                        onlyDirectories: true,
                        shortcuts: [
                            { label: _("Default location"), path: defaultLocation },
                        ],
                        superuser: "try",
                    }
                }
            />
            <DialogTextInput
                label={_("Name")}
                field={field.sub("name", () => updated("name"))}
                warning={
                    exists &&
                        <>
                            {_("File exists already and will be overwritten.")}
                            {"\n"}
                            <Button
                                component="span"
                                isInline
                                variant="link"
                                onClick={makeUnique}
                            >
                                {_("Change to unused name")}
                            </Button>
                        </>
                }
            />
            <Grid hasGutter md={6}>
                <SizeInput
                    label={_("Size")}
                    field={field.sub("size")}
                    max={Infinity}
                />
                <DialogDropdownSelectObject
                    label={_("Format")}
                    field={field.sub("format", () => updated("format"))}
                    options={["qcow2", "raw"]}
                />
            </Grid>

        </>
    );
};

interface ImageFileInfo {
    format: string;
    usesBackingFile: boolean;
}

async function getImageFileInfo(file: string): Promise<ImageFileInfo> {
    const file_header = await cockpit.spawn(
        ["head", "--bytes=16", file],
        { binary: true, err: "message", superuser: "try" }
    );

    // https://git.qemu.org/?p=qemu.git;a=blob;f=docs/interop/qcow2.txt
    let result;
    if (file_header[0] == 81 && file_header[1] == 70 &&
        file_header[2] == 73 && file_header[3] == 251) {
        result = {
            format: "qcow2",
            // All zeros, no backing file offset
            usesBackingFile: !file_header.slice(8).every(bytes => bytes === 0),
        };
    } else {
        result = {
            format: "raw",
            usesBackingFile: false,
        };
    }

    return result;
}

const interestingPoolTypes = [ "disk", "logical" ];

function getPoolCollections(connectionName: ConnectionName) {
    const res: FileChooserCollection[] = [];
    for (const p of appState.storagePools) {
        if (p.connectionName == connectionName && p.active && interestingPoolTypes.includes(p.type)) {
            res.push({
                label: cockpit.format(_("Pool $0"), p.name),
                emptyLabel: _("Pool has no volumes"),
                list: async () => p.volumes.map(v => v.path || "--"),
            });
        }
    }
    return res;
}

// XXX - this code probably exists somehere already
//
async function getPathUse(path: string): Promise<null | { vm: VM, disk: VMDisk }> {
    for (const vm of await appState.getVms()) {
        for (const disk of Object.values(vm.disks)) {
            if (disk.type == "file" && disk.source.file == path)
                return { vm, disk };
            if (disk.type == "block" && disk.source.dev == path)
                return { vm, disk };
            if (disk.type == "volume") {
                // XXX - dtrt
            }
        }
    }

    return null;
}

interface UseExistingValue {
    file: string,
    device: "disk" | "cdrom",
    format: string,
    defaultLocation: string,
    collections: FileChooserCollection[],
    inUse: string | null,
}

function init_UseExisting(vm: VM): UseExistingValue {
    return {
        file: "",
        device: "disk",
        format: "",
        defaultLocation: getDefaultLocation(vm),
        collections: getPoolCollections(vm.connectionName),
        inUse: null,
    };
}

function validate_UseExisting(field: DialogField<UseExistingValue>) {
    field.sub("file").validate_async(0, async file => {
        if (!file)
            return _("Path cannot be empty");

        const { format, usesBackingFile } = await getImageFileInfo(file);
        if (usesBackingFile)
            return _("Importing an image with a backing file is unsupported");
        field.sub("format").set(format);
    });
}

const UseExisting = ({
    field,
    hideDeviceRow
} : {
    field: DialogField<UseExistingValue>,
    hideDeviceRow?: boolean,
}) => {
    function update_file(val: string) {
        if (val.endsWith(".iso"))
            field.sub("device").set("cdrom");
        field.sub("inUse").set_async(200, async () => {
            const use = await getPathUse(val);
            if (use)
                return cockpit.format(_("Disk image is already in use by $0 for $1"), use.vm.name, use.disk.target);
            else
                return null;
        });
    }

    const { defaultLocation, collections, inUse } = field.get();

    return (
        <>

            <DialogFileChooserInput
                field={field.sub("file", update_file)}
                label={_("Disk image")}
                placeholder={_("Path to disk image file on host's file system")}
                warning={inUse}
                fileChooserProps={
                    {
                        title: _("Select disk image"),
                        filters: [
                            {
                                label: _("Disk images"),
                                filter: (name, type) => (type == "reg" && !!name.match("\\.(iso|qcow2|raw)$")) || type == "blk",
                            }
                        ],
                        shortcuts: [
                            { label: _("Default location"), path: defaultLocation },
                        ],
                        collections,
                        superuser: "try",
                    }
                }
            />
            {
                !hideDeviceRow &&
                    <DialogDropdownSelect
                        label={_("Device type")}
                        field={field.sub("device")}
                        options={
                            [
                                { value: "disk", label: _("Disk") },
                                { value: "cdrom", label: _("CD/DVD drive") },
                            ]
                        }
                    />
            }
        </>
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
            create_new: await init_CreateNew(vm),
            use_existing: init_UseExisting(vm),
            permanent: vm.persistent,
            additional_options: init_AdditionalOptions(vm, "disk"),
        };
    }

    function validate(dlg: DialogState<AddDiskValues>) {
        if (dlg.values.mode == USE_EXISTING)
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

    let mode_options: DialogRadioSelectOption<Mode>[] = [
        {
            value: CREATE_NEW,
            label: _("Create a new disk image"),
        },
        {
            value: USE_EXISTING,
            label: _("Use an existing disk image"),
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
                const size = convertToUnit(params.size.size, params.size.unit, 'B');
                const path = params.location + "/" + params.name;
                await cockpit.spawn(
                    ["qemu-img", "create", "-f", params.format, "--", path, String(size)],
                    { superuser: "try", err: "message" }
                );
                await virtXmlHotAdd(
                    vm,
                    "disk",
                    {
                        path,
                        format: params.format,
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

// XXX - this whole dialog should just be the file chooser

type InsertMediaValues = UseExistingValue;

export const InsertMedia = ({
    disk,
    idPrefix,
    vm,
} : {
    disk: VMDisk,
    idPrefix: string,
    vm: VM,
}) => {
    const Dialogs = useDialogs();

    function init(): InsertMediaValues {
        return init_UseExisting(vm);
    }

    function validate(dlg: DialogState<InsertMediaValues>) {
        validate_UseExisting(dlg.top());
    }

    const dlg = useDialogState<InsertMediaValues>(init, validate);

    async function insert_media(values: InsertMediaValues) {
        try {
            const xml = {
                type: "file",
                source: {
                    file: values.file
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
        <Modal
            position="top"
            variant="medium"
            id={`${idPrefix}-dialog-modal-window`}
            isOpen
            onClose={Dialogs.close}
        >
            <ModalHeader title={_("Insert media")} />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                <Form onSubmit={e => e.preventDefault()} isHorizontal>
                    <UseExisting field={dlg.top()} hideDeviceRow />
                </Form>
            </ModalBody>
            <ModalFooter>
                <DialogActionButton dialog={dlg} action={insert_media} onClose={Dialogs.close}>
                    {_("Insert")}
                </DialogActionButton>
                <DialogCancelButton dialog={dlg} onClose={Dialogs.close} />
            </ModalFooter>
        </Modal>
    );
};
