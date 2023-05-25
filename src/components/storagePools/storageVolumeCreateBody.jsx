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
import PropTypes from 'prop-types';
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { convertToUnit, units, digitFilter } from '../../helpers.js';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

const VolumeName = ({ idPrefix, volumeName, validationFailed, onValueChanged }) => {
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
            <FormHelper fieldId={`${idPrefix}-name`} helperTextInvalid={validationStateName == "error" && validationFailed.volumeName} />
        </FormGroup>
    );
};

const VolumeDetails = ({ idPrefix, size, unit, format, storagePoolCapacity, storagePoolType, validationFailed, onValueChanged }) => {
    // TODO: Use slider
    let formatRow;
    let validVolumeFormats;
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
    }

    if (validVolumeFormats) {
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
                               value={parseFloat(size).toFixed(0)}
                               onKeyPress={digitFilter}
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
                <FormHelper fieldId={`${idPrefix}-size`} helperTextInvalid={validationStateSize == "error" && validationFailed.size} />
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

VolumeCreateBody.propTypes = {
    format: PropTypes.string.isRequired,
    idPrefix: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    size: PropTypes.number.isRequired,
    storagePool: PropTypes.object.isRequired,
    unit: PropTypes.string.isRequired,
    volumeName: PropTypes.string,
};
