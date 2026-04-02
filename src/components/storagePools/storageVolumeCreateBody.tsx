/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import type { StoragePool } from '../../types';

import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";

import { convertToUnit, units, getDefaultVolumeFormat } from '../../helpers.js';
import cockpit from 'cockpit';

import {
    DialogField,
    DialogTextInput,
    DialogDropdownSelectObject,
} from 'cockpit/dialog';

import { SizeInput, SizeValue } from '../common/dialog';

const _ = cockpit.gettext;

export interface VolumeCreateValue {
    name: string,
    newSize: SizeValue,
    format: string,

    _storagePool: StoragePool,
}

export function init_VolumeCreate(storagePool: StoragePool): VolumeCreateValue {
    return {
        name: "",
        newSize: {
            size: "1",
            unit: units.GiB.name,
        },
        format: getDefaultVolumeFormat(storagePool) || "",

        _storagePool: storagePool,
    };
}

export function update_VolumeCreate(field: DialogField<VolumeCreateValue>, storagePool: StoragePool) {
    if (storagePool.type != field.get()._storagePool.type)
        field.sub("format").set(getDefaultVolumeFormat(storagePool) || "");
    field.sub("_storagePool").set(storagePool);
}

export function validate_VolumeCreate(field: DialogField<VolumeCreateValue>) {
    field.sub("name").validate(v => {
        if (!v)
            return _("Please enter new volume name");
    });
    field.sub("newSize").validate(v => {
        const { _storagePool } = field.get();
        const poolCapacity = convertToUnit(_storagePool.capacity, units.B, v.unit);
        if (!v.size || isNaN(Number(v.size)))
            return _("Size must be a number");
        if (!isNaN(Number(poolCapacity)) && Number(v.size) > Number(poolCapacity)) {
            return cockpit.format(
                _("Storage volume size must not exceed the storage pool's capacity ($0 $1)"),
                poolCapacity?.toFixed(2),
                v.unit
            );
        }
    });
}

export const VolumeCreate = ({
    field,
} : {
    field: DialogField<VolumeCreateValue>
}) => {
    const { format, _storagePool } = field.get();

    let formatRow;
    let validVolumeFormats;
    const existingValidVolumeFormats = []; // valid for existing volumes, but not for creation

    // For the valid volume format types for different pool types see https://libvirt.org/storage.html
    if (['disk'].indexOf(_storagePool.type) > -1) {
        validVolumeFormats = [
            'none', 'linux', 'fat16', 'fat32', 'linux-swap', 'linux-lvm',
            'linux-raid', 'extended'
        ];
    } else if (['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(_storagePool.type) > -1) {
        validVolumeFormats = ['qcow2', 'raw'];
        existingValidVolumeFormats.push('iso');
    }

    if (validVolumeFormats) {
        if (!format)
            console.error("VolumeDetails internal error: format is not set for storage pool type", _storagePool.type); // not-covered: assertion
        else if (!validVolumeFormats.includes(format) && !existingValidVolumeFormats.includes(format))
            console.error("VolumeDetails internal error: format", format, "is not valid for storage pool type", _storagePool.type); // not-covered: assertion
        else
            formatRow = (
                <DialogDropdownSelectObject
                    label={_("Format")}
                    field={field.sub("format")}
                    options={validVolumeFormats}
                />
            );
    }

    return (
        <>
            <DialogTextInput
                label={_("Name")}
                field={field.sub("name")}
                minLength={1}
                placeholder={_("New volume name")}
            />
            <Grid hasGutter md={6}>
                <SizeInput
                    label={_("Size")}
                    field={field.sub("newSize")}
                    max={Number(_storagePool.capacity)}
                />
                {formatRow}
            </Grid>
        </>
    );
};
