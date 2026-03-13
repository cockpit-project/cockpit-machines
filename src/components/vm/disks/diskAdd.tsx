/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */

import type { VM, VMDisk, VMDiskDevice, StoragePool, StorageVolume } from '../../../types';

import React from 'react';
import { Bullseye } from "@patternfly/react-core/dist/esm/layouts/Bullseye";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import cockpit from 'cockpit';
import { useDialogs } from 'dialogs.jsx';

import { FileAutoComplete } from 'cockpit-components-file-autocomplete.jsx';
import { diskBusTypes, diskCacheModes, convertToUnit, getDefaultVolumeFormat, getNextAvailableTarget, getStorageVolumesUsage, getVmStoragePools } from '../../../helpers.js';
import {
    VolumeCreate, init_VolumeCreate, update_VolumeCreate, validate_VolumeCreate,
    type VolumeCreateValue,
} from '../../storagePools/storageVolumeCreateBody.jsx';
import { domainAttachDisk, domainGet, virtXmlHotEdit, domainIsRunning } from '../../../libvirtApi/domain.js';
import { storagePoolGetAll } from '../../../libvirtApi/storagePool.js';
import { storageVolumeCreateAndAttach } from '../../../libvirtApi/storageVolume.js';
import { appState } from '../../../state';

import {
    useDialogState_async, DialogState,
    DialogField,
    DialogError, DialogErrorMessage,
    DialogRadioSelect, DialogRadioSelectOption,
    DialogDropdownSelect, DialogDropdownSelectObject,
    DialogTextInput,
    DialogCheckbox,
    DialogHelperText,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

const _ = cockpit.gettext;

const CREATE_NEW = 'create-new';
const USE_EXISTING = 'use-existing';
const CUSTOM_PATH = 'custom-path';

const poolTypesNotSupportingVolumeCreation = ['iscsi', 'iscsi-direct', 'gluster', 'mpath'];

function clearSerial(serial: string): string {
    return serial.replace(' ', '_').replace(/([^A-Za-z0-9_.+-]+)/gi, '');
}

function getFilteredVolumes(vmStoragePool: StoragePool, disks: Record<string, VMDisk>): StorageVolume[] {
    const usedDiskPaths = Object.getOwnPropertyNames(disks)
            .filter(target => disks[target].source && (disks[target].source.file || disks[target].source.volume))
            .map(target => (disks[target].source && (disks[target].source.file || disks[target].source.volume)));

    const filteredVolumes = (vmStoragePool.volumes || []).filter(volume => !usedDiskPaths.includes(volume.path) && !usedDiskPaths.includes(volume.name));

    const filteredVolumesSorted = filteredVolumes.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });

    return filteredVolumesSorted;
}

function getDiskUsageMessage(vms: VM[], storagePool: StoragePool, volumeName: string) {
    const isVolumeUsed = getStorageVolumesUsage(vms, storagePool);

    if (!isVolumeUsed[volumeName] || (isVolumeUsed[volumeName].length === 0))
        return null;

    const vmsUsing = isVolumeUsed[volumeName].join(', ');
    return cockpit.format(_("This volume is already used by $0."), vmsUsing);
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

interface CreateNewValue {
    pool: StoragePool;
    volume: VolumeCreateValue;

    _pools: StoragePool[];
}

function init_CreateNew(pools: StoragePool[]): CreateNewValue | string {
    const filtered_pools = pools.filter(p => !poolTypesNotSupportingVolumeCreation.includes(p.type));

    if (filtered_pools.length == 0)
        return _("No pools that allow volume creation");

    return {
        pool: filtered_pools[0],
        volume: init_VolumeCreate(filtered_pools[0]),

        _pools: filtered_pools,
    };
}

function validate_CreateNew(field: DialogField<CreateNewValue | string>) {
    const val = field.get();
    if (typeof val == "string")
        return;

    const vc_field = field.at(val);
    validate_VolumeCreate(vc_field.sub("volume"));
}

const CreateNew = ({
    field,
} : {
    field: DialogField<CreateNewValue | string>,
}) => {
    const val = field.get();
    if (typeof val == "string")
        return null;

    const vc_field = field.at(val);
    const { _pools } = val;

    function update_pool(p: StoragePool) {
        update_VolumeCreate(vc_field.sub("volume"), p);
    }

    return (
        <>
            <DialogDropdownSelectObject
                label={_("Pool")}
                field={vc_field.sub("pool", update_pool)}
                options={_pools}
                option_label={p => p.name}
            />
            <VolumeCreate field={vc_field.sub("volume")} />
        </>
    );
};

interface ExistingPool {
    name: string,
    volumes: string[],

    _storagePool: StoragePool,
}

interface UseExistingValue {
    pool: ExistingPool,
    volume: string,

    _pools: ExistingPool[];
    _vms: VM[];
}

function init_UseExisting(vm: VM, vms: VM[], pools: StoragePool[]): UseExistingValue | string {
    const filtered_pools: ExistingPool[] = [];
    for (const p of pools) {
        const volumes = getFilteredVolumes(p, vm.disks);
        if (volumes.length > 0) {
            filtered_pools.push(
                {
                    name: p.name,
                    volumes: volumes.map(v => v.name),
                    _storagePool: p,
                }
            );
        }
    }

    if (filtered_pools.length == 0)
        return _("No usable storage volumes");

    return {
        pool: filtered_pools[0],
        volume: filtered_pools[0].volumes[0],

        _pools: filtered_pools,
        _vms: vms,
    };
}

const UseExisting = ({
    field,
} : {
    field: DialogField<UseExistingValue | string>,
}) => {
    const val = field.get();
    if (typeof val == "string")
        return null;

    const ue_field = field.at(val);
    const { pool, volume, _pools, _vms } = val;

    function update_pool(p: ExistingPool) {
        ue_field.sub("volume").set(p.volumes[0]);
    }

    const diskUsageMessage = pool._storagePool && getDiskUsageMessage(_vms, pool._storagePool, volume);

    return (
        <>
            <DialogDropdownSelectObject
                label={_("Pool")}
                field={ue_field.sub("pool", update_pool)}
                options={_pools}
                option_label={p => p.name}
            />
            <DialogDropdownSelectObject
                label={_("Volume")}
                field={ue_field.sub("volume")}
                options={pool.volumes}
                warning={diskUsageMessage}
            />
        </>
    );
};

interface FileInfo {
    format: string;
    usesBackingFile: boolean;
}

type FileInfoCache = Record<string, FileInfo>;

async function getFileInfo(file: string, cache: FileInfoCache): Promise<FileInfo> {
    if (file in cache)
        return cache[file];

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

    cache[file] = result;
    return result;
}

interface CustomPathValue {
    file: string,
    device: "disk" | "cdrom",
    _fileInfoCache: FileInfoCache,
}

function init_CustomPath(): CustomPathValue {
    return {
        file: "",
        device: "disk",
        _fileInfoCache: {},
    };
}

function validate_CustomPath(field: DialogField<CustomPathValue>) {
    const { _fileInfoCache } = field.get();
    field.sub("file").validate_async(0, async file => {
        if (!file)
            return _("Path can not be empty");

        const { usesBackingFile } = await getFileInfo(file, _fileInfoCache);
        if (usesBackingFile)
            return _("Importing an image with a backing file is unsupported");
    });
}

const CustomPath = ({
    field,
    hideDeviceRow
} : {
    field: DialogField<CustomPathValue>,
    hideDeviceRow?: boolean,
}) => {
    function update_file(val: string) {
        if (val.endsWith(".iso"))
            field.sub("device").set("cdrom");
    }

    return (
        <>
            <FormGroup
                label={_("Custom path")}
                id={field.sub("file").id()}
            >
                <FileAutoComplete
                    placeholder={_("Path to file on host's file system")}
                    onChange={(val: string) => field.sub("file", update_file).set(val)}
                    superuser="try"
                />
                <DialogHelperText field={field.sub("file")} />
            </FormGroup>
            {
                !hideDeviceRow &&
                    <DialogDropdownSelect
                        label={_("Device")}
                        field={field.sub("device")}
                        options={
                            [
                                { value: "disk", label: _("Disk image file") },
                                { value: "cdrom", label: _("CD/DVD disc") },
                            ]
                        }
                    />
            }
        </>
    );
};

function getPoolFormatAndDevice(pool: StoragePool | undefined, volName: string | false) {
    const params: { format: string, device: VMDiskDevice } = {
        format: pool ? getDefaultVolumeFormat(pool) || "" : "",
        device: "disk"
    };
    if (pool && volName && ['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(pool.type) > -1) {
        const volume = (pool.volumes || []).find(vol => vol.name === volName);
        if (volume?.format) {
            params.format = volume.format;
            if (volume.format === "iso")
                params.device = "cdrom";
        }
    }
    return params;
}

const sortFunction = (poolA: StoragePool, poolB: StoragePool) => poolA.name.localeCompare(poolB.name);

type Mode = typeof USE_EXISTING | typeof CUSTOM_PATH | typeof CREATE_NEW;

interface AddDiskValues {
    mode: Mode,
    custom_path: CustomPathValue,
    use_existing: UseExistingValue | string,
    create_new: CreateNewValue | string,
    permanent: boolean,
    additional_options: AdditionalOptionsValue,
}

export const AddDisk = ({
    disk,
    idPrefix,
    isMediaInsertion = false,
    vm,
} : {
    disk?: VMDisk,
    idPrefix: string,
    isMediaInsertion?: boolean,
    vm: VM,
}) => {
    const Dialogs = useDialogs();

    async function init(): Promise<AddDiskValues> {
        const vms = await appState.getVms();

        // Refresh storage volume list before displaying the dialog.
        // There are recently no Libvirt events for storage volumes and polling is ugly.
        // https://bugzilla.redhat.com/show_bug.cgi?id=1578836
        await storagePoolGetAll({ connectionName: vm.connectionName });
        const pools = getVmStoragePools(vm.connectionName).sort(sortFunction);

        const custom_path = init_CustomPath();
        const use_existing = init_UseExisting(vm, vms, pools);
        const create_new = init_CreateNew(pools);

        let mode: AddDiskValues["mode"] = CUSTOM_PATH;
        if (!isMediaInsertion && typeof create_new != "string")
            mode = CREATE_NEW;
        else if (!isMediaInsertion && typeof use_existing != "string")
            mode = USE_EXISTING;

        return {
            mode,
            custom_path,
            use_existing,
            create_new,
            permanent: vm.persistent,
            additional_options: init_AdditionalOptions(vm, "disk"),
        };
    }

    function validate(dlg: DialogState<AddDiskValues>) {
        if (dlg.values.mode == CREATE_NEW)
            validate_CreateNew(dlg.field("create_new"));
        if (dlg.values.mode == CUSTOM_PATH)
            validate_CustomPath(dlg.field("custom_path"));
        if (!isMediaInsertion)
            validate_AdditionalOptions(dlg.field("additional_options"));
    }

    function get_device(values: AddDiskValues): VMDiskDevice {
        const { mode } = values;
        if (mode == USE_EXISTING && typeof values.use_existing != "string") {
            const { pool, volume } = values.use_existing;
            return getPoolFormatAndDevice(pool._storagePool, volume).device;
        } else if (mode == CREATE_NEW) {
            return "disk";
        } else if (mode == CUSTOM_PATH) {
            return values.custom_path.device;
        } else
            return "disk";
    }

    function update_bus() {
        cockpit.assert(dlg instanceof DialogState);
        const device = get_device(dlg.values);
        if (device)
            update_AdditionalOptions(dlg.field("additional_options"), vm, device);
    }

    const dlg = useDialogState_async<AddDiskValues>(init, validate);

    let defaultBody;

    if (!dlg) {
        defaultBody = (
            <Bullseye>
                <Spinner />
            </Bullseye>
        );
    } else if (dlg instanceof DialogError) {
        defaultBody = null;
    } else {
        const { mode, use_existing, create_new } = dlg.values;

        let mode_options: DialogRadioSelectOption<Mode>[] = [
            {
                value: CREATE_NEW,
                label: _("Create new"),
                excuse: typeof create_new == "string" ? create_new : undefined,
            },
            {
                value: USE_EXISTING,
                label: _("Use existing"),
                excuse: typeof use_existing == "string" ? use_existing : undefined,
            },
            {
                value: CUSTOM_PATH,
                label: _("Custom path")
            },
        ];

        if (isMediaInsertion)
            mode_options = [mode_options[2], mode_options[1]];

        defaultBody = (
            <>
                <Form onSubmit={e => e.preventDefault()} isHorizontal>
                    <DialogRadioSelect
                        isInline
                        label={_("Source")}
                        field={dlg.field("mode", update_bus)}
                        options={mode_options}
                    />
                    {
                        mode === CREATE_NEW &&
                            <CreateNew field={dlg.field("create_new", update_bus)} />
                    }
                    {
                        mode === USE_EXISTING &&
                            <UseExisting field={dlg.field("use_existing", update_bus)} />
                    }
                    {
                        mode === CUSTOM_PATH &&
                            <CustomPath field={dlg.field("custom_path", update_bus)} hideDeviceRow={isMediaInsertion} />
                    }
                    {
                        !isMediaInsertion && vm.persistent && domainIsRunning(vm.state) &&
                            <DialogCheckbox
                                field_label={_("Persistence")}
                                checkbox_label={_("Always attach")}
                                field={dlg.field("permanent")}
                            />
                    }
                </Form>
                { !isMediaInsertion &&
                    <AdditionalOptions field={dlg.field("additional_options")} />
                }
            </>
        );
    }

    async function insert_media(values: AddDiskValues) {
        try {
            let xml;
            if (values.mode === CUSTOM_PATH) {
                xml = {
                    type: "file",
                    source: {
                        file: values.custom_path.file
                    }
                };
            } else if (values.mode === USE_EXISTING && typeof values.use_existing != "string") {
                xml = {
                    type: "volume",
                    source: {
                        pool: values.use_existing.pool.name,
                        volume: values.use_existing.volume,
                    }
                };
            } else
                return;

            cockpit.assert(disk);

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

    async function add_disk(values: AddDiskValues) {
        try {
            const existingTargets = Object.getOwnPropertyNames(vm.disks);
            const target = getNextAvailableTarget(existingTargets, values.additional_options.bus_type);

            if (!target)
                throw new DialogError(_("Failed to add disk"), _("Can not determine guest device name"));

            const hotplug = domainIsRunning(vm.state);

            const common = {
                permanent: values.permanent,
                hotplug,
                vmId: vm.id,
                cacheMode: values.additional_options.cache_mode,
                busType: values.additional_options.bus_type,
                serial: values.additional_options.serial,
            };

            if (values.mode === CREATE_NEW && typeof values.create_new != "string") {
                const params = values.create_new;
                const size = convertToUnit(params.volume.size, params.volume.unit, 'MiB');
                await storageVolumeCreateAndAttach({
                    connectionName: vm.connectionName,
                    target,
                    poolName: params.pool.name,
                    volumeName: params.volume.name,
                    format: params.volume.format,
                    size,
                    ...common
                });
            } else if (values.mode == CUSTOM_PATH) {
                const params = values.custom_path;
                const file_info = await getFileInfo(params.file, params._fileInfoCache);
                await domainAttachDisk({
                    connectionName: vm.connectionName,
                    target,
                    type: "file",
                    file: params.file,
                    device: params.device,
                    format: file_info.format,
                    shareable: false,
                    ...common
                });
            } else if (values.mode == USE_EXISTING && typeof values.use_existing != "string") {
                const params = values.use_existing;
                const { device, format } = getPoolFormatAndDevice(params.pool._storagePool, params.volume);
                await domainAttachDisk({
                    connectionName: vm.connectionName,
                    target,
                    type: "volume",
                    device,
                    format,
                    poolName: params.pool.name,
                    volumeName: params.volume,
                    shareable: false,
                    ...common
                });
            }

            // force reload of VM data, events are not reliable (i.e. for a down VM)
            domainGet({ connectionName: vm.connectionName, id: vm.id });
        } catch (ex) {
            throw DialogError.fromError(_("Disk failed to be added"), ex);
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
            <ModalHeader title={isMediaInsertion ? _("Insert disc media") : _("Add disk")} />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                {
                    isMediaInsertion
                        ? <DialogActionButton dialog={dlg} action={insert_media} onClose={Dialogs.close}>
                            {_("Insert")}
                        </DialogActionButton>
                        : <DialogActionButton dialog={dlg} action={add_disk} onClose={Dialogs.close}>
                            {_("Add")}
                        </DialogActionButton>
                }
                <DialogCancelButton dialog={dlg} onClose={Dialogs.close} />
            </ModalFooter>
        </Modal>
    );
};
