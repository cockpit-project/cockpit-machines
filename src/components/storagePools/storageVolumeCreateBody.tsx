/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import type { StoragePool } from '../../types';

import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { convertToUnit, units, digitFilter, getDefaultVolumeFormat } from '../../helpers.js';
import cockpit from 'cockpit';

import {
    DialogField,
    DialogTextInput,
    DialogDropdownSelect, DialogDropdownSelectObject,
    DialogHelperText,
} from 'cockpit/dialog';

const _ = cockpit.gettext;

export interface VolumeCreateValue {
    name: string,
    size: number,
    unit: string,
    format: string,

    _storagePool: StoragePool,
}

export function init_VolumeCreate(storagePool: StoragePool): VolumeCreateValue {
    return {
        name: "",
        size: 0,
        unit: "GiB",
        format: getDefaultVolumeFormat(storagePool) || "",

        _storagePool: storagePool,
    };
}

export function update_VolumeCreate(field: DialogField<VolumeCreateValue>, storagePool: StoragePool) {
    if (storagePool.type != field.get()._storagePool.type)
        field.sub("format").set(getDefaultVolumeFormat(storagePool) || "");
    field.sub("_storagePool").set(storagePool);
}

export function validate_VolumeCreate(value: DialogField<VolumeCreateValue>) {
    value.sub("name").validate(v => {
        if (!v)
            return _("Please enter new volume name");
    });
    value.sub("size").validate(size => {
        const { unit, _storagePool } = value.get();
        const poolCapacity = convertToUnit(_storagePool.capacity, units.B, unit);
        if (!isNaN(Number(poolCapacity)) && size > Number(poolCapacity)) {
            return cockpit.format(
                _("Storage volume size must not exceed the storage pool's capacity ($0 $1)"),
                poolCapacity?.toFixed(2),
                unit
            );
        }
    });
}

export const VolumeCreate = ({
    field,
} : {
    field: DialogField<VolumeCreateValue>
}) => {
    const { size, unit, format, _storagePool } = field.get();
    const volumeMaxSize = parseFloat(convertToUnit(_storagePool.capacity, units.B, unit).toFixed(2));

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
                <FormGroup
                    id={field.id("size-group")}
                    label={_("Size")}>
                    <InputGroup>
                        <TextInput
                            id={field.sub("size").id()}
                            type="number"
                            inputMode='numeric'
                            pattern="[0-9]*"
                            value={size.toFixed(0)}
                            onKeyUp={digitFilter}
                            step={1}
                            min={0}
                            max={volumeMaxSize}
                            onChange={(_, val) => field.sub("size").set(parseInt(val))}
                        />
                        <DialogDropdownSelect
                            className="ct-machines-select-unit"
                            field={field.sub("unit")}
                            options={
                                [
                                    { value: units.MiB.name, label: _("MiB") },
                                    { value: units.GiB.name, label: _("GiB") },
                                ]
                            }
                        />
                    </InputGroup>
                    <DialogHelperText field={field.sub("size")} />
                </FormGroup>
                {formatRow}
            </Grid>
        </>
    );
};
