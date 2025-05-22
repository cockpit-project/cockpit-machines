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

import type { optString, StoragePool } from '../../types';

import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { convertToUnit, units, digitFilter } from '../../helpers.js';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

export interface ValidationFailed {
    volumeName?: string | undefined;
    size?: string | undefined;
}

export interface DialogValues {
    volumeName: string,
    size: number,
    unit: string;
    format: optString;
}

type OnValueChanged = <K extends keyof DialogValues>(key: K, value: string) => void;

const VolumeName = ({
    idPrefix,
    volumeName,
    validationFailed,
    onValueChanged
} : {
    idPrefix: string,
    volumeName: string,
    validationFailed: ValidationFailed,
    onValueChanged: OnValueChanged,
}) => {
    const validationStateName = validationFailed.volumeName ? 'error' : 'default';
    return (
        <FormGroup fieldId={`${idPrefix}-name`}
                   label={_("Name")}>
            <TextInput id={`${idPrefix}-name`}
                        minLength={1}
                        placeholder={_("New volume name")}
                        value={volumeName || ""}
                        validated={validationStateName}
                        onChange={(_, value) => onValueChanged('volumeName', value)} />
            <FormHelper fieldId={`${idPrefix}-name`} helperTextInvalid={validationStateName == "error" ? validationFailed.volumeName : null} />
        </FormGroup>
    );
};

const VolumeDetails = ({
    idPrefix,
    size,
    unit,
    format,
    storagePoolCapacity,
    storagePoolType,
    validationFailed,
    onValueChanged
} : {
    idPrefix: string,
    size: number,
    unit: string,
    format: optString,
    storagePoolCapacity: optString,
    storagePoolType: string,
    validationFailed: ValidationFailed,
    onValueChanged: OnValueChanged,
}) => {
    // TODO: Use slider
    let formatRow;
    let validVolumeFormats;
    const existingValidVolumeFormats = []; // valid for existing volumes, but not for creation
    const volumeMaxSize = parseFloat(convertToUnit(storagePoolCapacity, units.B, unit).toFixed(2));
    const validationStateSize = validationFailed.size ? 'error' : 'default';

    // For the valid volume format types for different pool types see https://libvirt.org/storage.html
    if (['disk'].indexOf(storagePoolType) > -1) {
        validVolumeFormats = [
            'none', 'linux', 'fat16', 'fat32', 'linux-swap', 'linux-lvm',
            'linux-raid', 'extended'
        ];
    } else if (['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(storagePoolType) > -1) {
        validVolumeFormats = ['qcow2', 'raw'];
        existingValidVolumeFormats.push('iso');
    }

    if (validVolumeFormats) {
        if (!format)
            console.error("VolumeDetails internal error: format is not set for storage pool type", storagePoolType); // not-covered: assertion
        else if (!validVolumeFormats.includes(format) && !existingValidVolumeFormats.includes(format))
            console.error("VolumeDetails internal error: format", format, "is not valid for storage pool type", storagePoolType); // not-covered: assertion
        else
            formatRow = (
                <FormGroup fieldId={`${idPrefix}-fileformat`} label={_("Format")}>
                    <FormSelect id={`${idPrefix}-format`}
                        onChange={(_event, value) => onValueChanged('format', value)}
                        value={format}>
                        { validVolumeFormats.map(format => <FormSelectOption value={format} key={format} label={format} />) }
                    </FormSelect>
                </FormGroup>
            );
    }

    return (
        <Grid hasGutter md={6}>
            <FormGroup fieldId={`${idPrefix}-size`}
                       id={`${idPrefix}-size-group`}
                       label={_("Size")}>
                <InputGroup>
                    <TextInput id={`${idPrefix}-size`}
                               type="number" inputMode='numeric' pattern="[0-9]*"
                               value={size.toFixed(0)}
                               onKeyUp={digitFilter}
                               step={1}
                               min={0}
                               max={volumeMaxSize}
                               validated={validationStateSize}
                               onChange={(_, value) => onValueChanged('size', value)} />
                    <FormSelect id={`${idPrefix}-unit`}
                                className="ct-machines-select-unit"
                                value={unit}
                                onChange={(_event, value) => onValueChanged('unit', value)}>
                        <FormSelectOption value={units.MiB.name} key={units.MiB.name}
                                          label={_("MiB")} />
                        <FormSelectOption value={units.GiB.name} key={units.GiB.name}
                                          label={_("GiB")} />
                    </FormSelect>
                </InputGroup>
                <FormHelper fieldId={`${idPrefix}-size`} helperTextInvalid={validationStateSize == "error" ? validationFailed.size : null} />
            </FormGroup>
            {formatRow}
        </Grid>
    );
};

export const VolumeCreateBody = ({
    format,
    idPrefix,
    onValueChanged,
    size,
    storagePool,
    unit,
    validationFailed,
    volumeName,
} : {
    format: optString,
    idPrefix: string,
    onValueChanged: OnValueChanged,
    size: number,
    storagePool: StoragePool,
    unit: string,
    validationFailed: ValidationFailed,
    volumeName: string,
}) => {
    return (
        <>
            <VolumeName idPrefix={idPrefix}
                        volumeName={volumeName}
                        validationFailed={validationFailed}
                        onValueChanged={onValueChanged} />
            <VolumeDetails format={format}
                           idPrefix={idPrefix}
                           onValueChanged={onValueChanged}
                           size={size}
                           storagePoolCapacity={storagePool.capacity}
                           storagePoolType={storagePool.type}
                           unit={unit}
                           validationFailed={validationFailed} />
        </>
    );
};
