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
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import cockpit from 'cockpit';

import {
    DescriptionList,
    DescriptionListTerm,
    DescriptionListGroup,
    DescriptionListDescription,
    Dropdown,
    KebabToggle,
} from '@patternfly/react-core';

import { domainDetachDisk, domainGet } from '../../../libvirtApi/domain.js';
import { EditDiskAction } from './diskEdit.jsx';
import { AddDiskModalBody } from './diskAdd.jsx';
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

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

export const DiskActions = ({ vm, vms, disk, supportedDiskBusTypes, idPrefixRow }) => {
    const [isActionOpen, setIsActionOpen] = useState(false);

    const onRemoveDisk = () => {
        return domainDetachDisk({ connectionName: vm.connectionName, id: vm.id, name: vm.name, target: disk.target, live: vm.state === 'running', persistent: vm.persistent })
                .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }));
    };

    const deleteDialogProps = {
        title: _("Remove disk from VM?"),
        actionName: _("Remove"),
        errorMessage: cockpit.format(_("Disk $0 could not be removed"), disk.target),
        actionDescription: cockpit.format(_("This disk will be removed from $0:"), vm.name),
        objectDescription: [
            { name: _("Target"), value: <span className="ct-monospace">{disk.target}</span> },
            ...DISK_SOURCE_LIST.flatMap(entry => getDiskSourceValue(disk.source, entry.name)
                ? { name: entry.label, value: <span className="ct-monospace">{getDiskSourceValue(disk.source, entry.name)}</span> }
                : [])
        ],
        deleteHandler: onRemoveDisk,
    };

    function openMediaInsertionDialog() {
        Dialogs.show(<AddDiskModalBody idPrefix={idPrefixRow + "-insert-dialog"}
                                       vm={vm} vms={vms}
                                       disk={disk}
                                       supportedDiskBusTypes={supportedDiskBusTypes}
                                       isMediaInsertion />);
    }

    let cdromAction;
    if (disk.device === "cdrom" && ["file", "volume"].includes(disk.type)) {
        if (!disk.source.file && !(disk.source.pool && disk.source.volume)) {
            cdromAction = <Button id={`${idPrefixRow}-insert`}
                              variant='secondary'
                              onClick={openMediaInsertionDialog}
                              isDisabled={!supportedDiskBusTypes || supportedDiskBusTypes.length == 0}>
                {_("Insert")}
            </Button>;
        }
    }

    return (
        <div className='machines-listing-actions'>
            { cdromAction }
            { vm.persistent && vm.inactiveXML.disks[disk.target] && // supported only  for persistent disks
            <EditDiskAction disk={disk}
                            vm={vm}
                            idPrefix={`${idPrefixRow}-edit`}
                            supportedDiskBusTypes={supportedDiskBusTypes} />}
            <Dropdown onSelect={() => setIsActionOpen(!isActionOpen)}
                      key={idPrefixRow + "-action-kebab"}
                      id={idPrefixRow + "-action-kebab"}
                      toggle={<KebabToggle onToggle={(isOpen) => setIsActionOpen(isOpen)} />}
                      isPlain
                      isOpen={isActionOpen}
                      position='right'
                      dropdownItems={[
                          <DeleteResourceButton objectId={idPrefixRow}
                                                key={idPrefixRow}
                                                disabled={vm.state != 'shut off' && vm.state != 'running'}
                                                dialogProps={deleteDialogProps}
                                                overlayText={_("The VM needs to be running or shut off to detach this device")}
                                                actionName={_("Remove")}
                                                isDropdownItem />
                      ]} />
        </div>
    );
};
