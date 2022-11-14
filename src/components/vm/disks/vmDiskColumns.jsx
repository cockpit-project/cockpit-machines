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

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Dropdown, DropdownItem, KebabToggle } from "@patternfly/react-core/dist/esm/components/Dropdown/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";

import { useDialogs } from 'dialogs.jsx';
import { domainDetachDisk, domainGet } from '../../../libvirtApi/domain.js';
import { MediaEjectModal } from './mediaEject.jsx';
import { EditDiskAction } from './diskEdit.jsx';
import { AddDiskModalBody } from './diskAdd.jsx';
import { DeleteResourceModal } from '../../common/deleteResource.jsx';

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

export const RemoveDiskModal = ({ vm, disk }) => {
    const onRemoveDisk = () => {
        return domainDetachDisk({
            connectionName: vm.connectionName,
            id: vm.id,
            name: vm.name,
            target: disk.target,
            live: vm.state === 'running',
            persistent: vm.persistent,
        })
                .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }));
    };

    const dialogProps = {
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

    return <DeleteResourceModal {...dialogProps} />;
};

export const DiskActions = ({ vm, vms, disk, supportedDiskBusTypes, idPrefixRow }) => {
    const [isActionOpen, setIsActionOpen] = useState(false);

    const Dialogs = useDialogs();

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
            cdromAction = (
                <Button id={`${idPrefixRow}-insert`}
                              variant='secondary'
                              onClick={openMediaInsertionDialog}
                              isDisabled={!supportedDiskBusTypes || supportedDiskBusTypes.length == 0}>
                    {_("Insert")}
                </Button>
            );
        } else {
            cdromAction = (
                <Button id={`${idPrefixRow}-eject-button`}
                    variant="secondary"
                    onClick={() => Dialogs.show(<MediaEjectModal idPrefix={idPrefixRow} vm={vm} disk={disk} />)}>
                    {_("Eject")}
                </Button>
            );
        }
    }

    const disabled = vm.state != 'shut off' && vm.state != 'running';

    let button = (
        <DropdownItem className="pf-m-danger"
                      id={`delete-${idPrefixRow}`}
                      key={`delete-${idPrefixRow}`}
                      isDisabled={disabled}
                      onClick={() => {
                          Dialogs.show(<RemoveDiskModal vm={vm}
                                                        disk={disk} />);
                      }}>
            {_("Remove")}
        </DropdownItem>
    );

    if (disabled) {
        button = (
            <Tooltip id={`delete-${idPrefixRow}-tooltip`}
                     key={`delete-${idPrefixRow}-tooltip`}
                     content={_("The VM needs to be running or shut off to detach this device")}>
                <span>{button}</span>
            </Tooltip>
        );
    }

    const dropdownItems = [
        button,
    ];

    return (
        <div className='machines-listing-actions'>
            { cdromAction }
            { vm.persistent && vm.inactiveXML.disks[disk.target] && // supported only  for persistent disks
            <EditDiskAction disk={disk}
                            vm={vm}
                            idPrefix={`${idPrefixRow}-edit`}
                            supportedDiskBusTypes={supportedDiskBusTypes} />}
            <Dropdown onSelect={() => setIsActionOpen(false)}
                      key={idPrefixRow + "-action-kebab"}
                      id={idPrefixRow + "-action-kebab"}
                      toggle={<KebabToggle onToggle={(isOpen) => setIsActionOpen(isOpen)} />}
                      isPlain
                      isOpen={isActionOpen}
                      position='right'
                      dropdownItems={dropdownItems} />
        </div>
    );
};
