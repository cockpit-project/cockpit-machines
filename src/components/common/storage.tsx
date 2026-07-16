/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */

import cockpit from 'cockpit';
import React from 'react';

import type { ConnectionName, VM, VMDisk } from '../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { InputGroup } from '@patternfly/react-core/dist/esm/components/InputGroup/index.js';
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { fsinfo } from 'cockpit/fsinfo';

import { units, convertToUnit } from '../../helpers.js';
import { appState } from '../../state';

import {
    DialogField,
    DialogHelperText,
    DialogDropdownSelect, DialogDropdownSelectObject,
    DialogTextInput,
} from 'cockpit/dialog';

import { DialogFileChooserInput, FileChooserCollection } from "cockpit/react/FileChooser";

import { SizeInput, SizeValue } from './dialog';

const _ = cockpit.gettext;

function getDefaultLocation(connectionName: ConnectionName): string {
    for (const p of appState.storagePools) {
        if (p.name == "default" && p.connectionName == connectionName && p.type == "dir" && p.target && p.target.path)
            return p.target.path;
    }

    if (connectionName == "session")
        return cockpit.info.user.home + "/.local/share/libvirt/images";
    else
        return "/var/lib/libvirt/images";
}

async function getDefaultDiskImageName(baseName: string, location: string, format: string) {
    try {
        const info = await fsinfo(location, ["entries"], { superuser: "try" });
        if (info.entries) {
            for (let idx = 0; idx < 100; idx++) {
                const n = baseName + (idx ? "-" + String(idx) : "");
                if (!info.entries[n + "." + format])
                    return n;
            }
        }
    } catch (ex) {
        console.log("Failed to list directory", String(ex));
    }

    return null;
}

export interface CreateNewValue {
    connectionName: string;
    defaultLocation: string;
    location: string;
    name: {
        base: string;
        format: string;
    };
    size: SizeValue;
    exists: boolean;
}

export async function init_CreateNew(defaultBaseName: string, connectionName: ConnectionName): Promise<CreateNewValue> {
    const defaultFormat = "qcow2";
    const defaultLocation = getDefaultLocation(connectionName);
    const uniqueDefaultName = await getDefaultDiskImageName(defaultBaseName, defaultLocation, defaultFormat);
    const defaultName = uniqueDefaultName || defaultBaseName;
    return {
        connectionName,
        defaultLocation,
        location: defaultLocation,
        name: {
            base: defaultName,
            format: defaultFormat,
        },
        size: { size: "1", unit: units.GiB.name },
        exists: !!defaultBaseName && !uniqueDefaultName,
    };
}

export function validate_CreateNew(field: DialogField<CreateNewValue>) {
    field.sub("size").validate(size => {
        if (size.size === "")
            return _("Size must be a number");
    });
}

export const CreateNew = ({
    field,
    warning,
    namePlaceholder,
} : {
    field: DialogField<CreateNewValue>,
    warning?: React.ReactNode,
    namePlaceholder?: string | undefined,
}) => {
    async function changed() {
        field.set_async(async value => {
            let exists = false;
            try {
                const pathname = value.location + "/" + value.name.base + "." + value.name.format;
                const info = await fsinfo(pathname, ["type"], { superuser: "try" });
                exists = !!info.type;
            } catch (ex) {
                console.warn("Failed to check for file existence", String(ex));
            }

            return { ...value, exists };
        });
    }

    async function makeUnique() {
        field.set_async(async value => {
            const newDefaultName = await getDefaultDiskImageName(value.name.base, value.location, value.name.format);
            if (newDefaultName)
                return { ...value, name: { ...value.name, base: newDefaultName }, exists: false };
            return value;
        });
    }

    const { defaultLocation, exists } = field.get();

    return (
        <>
            <DialogFileChooserInput
                label={_("Location")}
                field={field.sub("location", changed)}
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
            <FormGroup
                label={_("Name and format")}
            >
                <InputGroup>
                    <DialogTextInput
                        field={field.sub("name").sub("base", changed)}
                        {...namePlaceholder ? { placeholder: namePlaceholder } : {}}
                    />
                    {"." /* XXX - align this */}
                    <DialogDropdownSelectObject
                        className="ct-machines-select-format"
                        field={field.sub("name").sub("format", changed)}
                        options={["qcow2", "raw"]}
                    />
                </InputGroup>
                <DialogHelperText
                    field={field.sub("name")}
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
            </FormGroup>
            <SizeInput
                label={_("Size")}
                field={field.sub("size")}
                max={Infinity}
                warning={warning}
            />
        </>
    );
};

export async function getNewDiskImagePath(values: CreateNewValue, baseName?: string): Promise<string> {
    let base: string | null = values.name.base;
    if (!base && baseName)
        base = await getDefaultDiskImageName(baseName, values.location, values.name.format);
    if (!base)
        throw new Error("Can not find unused disk image file name");
    return values.location + "/" + base + "." + values.name.format;
}

export async function createNewDiskImage(values: CreateNewValue, baseName?: string): Promise<string> {
    const size = convertToUnit(values.size.size, values.size.unit, 'B');
    const path = await getNewDiskImagePath(values, baseName);
    await cockpit.spawn(
        ["qemu-img", "create", "-f", values.name.format, "--", path, String(size)],
        { superuser: "try", err: "message" }
    );

    return path;
}

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

const interestingPoolTypes = ["disk", "logical"];

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

export interface UseExistingValue {
    file: string,
    device: "disk" | "cdrom",
    format: string,
    defaultLocation: string,
    collections: FileChooserCollection[],
    inUse: string | null,
}

export function init_UseExisting(connectionName: ConnectionName): UseExistingValue {
    return {
        file: "",
        device: "disk",
        format: "",
        defaultLocation: getDefaultLocation(connectionName),
        collections: getPoolCollections(connectionName),
        inUse: null,
    };
}

export function validate_UseExisting(field: DialogField<UseExistingValue>) {
    field.sub("file").validate_async(async (file, signal) => {
        if (!file)
            return _("Path cannot be empty");

        const { format, usesBackingFile } = await getImageFileInfo(file);
        if (!signal.aborted)
            field.sub("format").set(format);

        if (usesBackingFile)
            return _("Importing an image with a backing file is unsupported");
    });
}

export const UseExisting = ({
    field,
    hideDeviceRow
} : {
    field: DialogField<UseExistingValue>,
    hideDeviceRow?: boolean,
}) => {
    function file_changed(val: string) {
        if (val.endsWith(".iso"))
            field.sub("device").set("cdrom");
        field.sub("inUse").set_async(async () => {
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
                field={field.sub("file", file_changed)}
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
