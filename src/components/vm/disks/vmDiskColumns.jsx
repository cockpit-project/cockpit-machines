/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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
import cockpit from 'cockpit';

import {
    DescriptionList,
    DescriptionListTerm,
    DescriptionListGroup,
    DescriptionListDescription,
} from '@patternfly/react-core';

const _ = cockpit.gettext;

export const DISK_SOURCE_LIST = [
    { name: "file", label: _("File") },
    { name: "device", label: _("Device") },
    { name: "protocol", label: _("Protocol") },
    { name: "pool", label: _("Pool") },
    { name: "volume", label: _("Volume") },
    { name: "name", label: _("Host") },
    { name: "port", label: _("Port") },
];

export function getDiskSourceValue(diskSource, value) {
    if (value === "host")
        return diskSource.host.name;
    else if (value === "port")
        return diskSource.host.port;
    else
        return diskSource[value];
}

export const DiskSourceCell = ({ diskSource, idPrefix }) => {
    const addOptional = (chunks, value, type, descr) => {
        if (value) {
            chunks.push(
                <DescriptionListGroup key={descr}>
                    <DescriptionListTerm>
                        {descr}
                    </DescriptionListTerm>
                    <DescriptionListDescription id={`${idPrefix}-source-${type}`}>
                        {value}
                    </DescriptionListDescription>
                </DescriptionListGroup>
            );
        }
    };

    const chunks = [];
    DISK_SOURCE_LIST.forEach(entry => addOptional(chunks, getDiskSourceValue(diskSource, entry.name), entry.name, entry.label));

    return <DescriptionList isHorizontal>{chunks}</DescriptionList>;
};

DiskSourceCell.propTypes = {
    diskSource: PropTypes.object.isRequired,
    idPrefix: PropTypes.string.isRequired,
};

export const DiskExtras = ({ idPrefix, cache, io, discard, serial, errorPolicy }) => {
    const addOptional = (chunks, value, type, descr) => {
        if (value) {
            chunks.push(
                <DescriptionListGroup key={descr}>
                    <DescriptionListTerm>
                        {descr}
                    </DescriptionListTerm>
                    <DescriptionListDescription id={`${idPrefix}-${type}`}>
                        {value}
                    </DescriptionListDescription>
                </DescriptionListGroup>
            );
        }
    };

    const chunks = [];
    addOptional(chunks, cache, "cache", _("Cache"));
    addOptional(chunks, serial, "serial", _("Serial"));

    return <DescriptionList isHorizontal>{chunks}</DescriptionList>;
};

DiskExtras.propTypes = {
    cache: PropTypes.string,
    io: PropTypes.string,
    discard: PropTypes.string,
    errorPolicy: PropTypes.string,
    idPrefix: PropTypes.string.isRequired,
};
