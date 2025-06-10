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
import cockpit from 'cockpit';

import type { optString, VM, VMDisk, StoragePool } from '../../../types';
import type { Notification } from '../../../app';
import type { DeleteResourceModalProps } from '../../common/deleteResource';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { KebabDropdown } from 'cockpit-components-dropdown.jsx';

import { useDialogs } from 'dialogs.jsx';
import { domainDeleteStorage, domainDetachDisk, domainGet } from '../../../libvirtApi/domain.js';
import { MediaEjectModal } from './mediaEject.jsx';
import { EditDiskAction } from './diskEdit.jsx';
import { AddDiskModalBody } from './diskAdd.jsx';
import { DeleteResourceModal } from '../../common/deleteResource.jsx';
import { canDeleteDiskFile } from '../../../helpers.js';

const _ = cockpit.gettext;

type DiskSource = VMDisk["source"];
type DiskSourceKey = keyof DiskSource | "port";

export const DISK_SOURCE_LIST: { name: DiskSourceKey, label: string }[] = [
    { name: "file", label: _("File") },
    { name: "dev", label: _("Block device") },
    { name: "protocol", label: _("Protocol") },
    { name: "pool", label: _("Pool") },
    { name: "volume", label: _("Volume") },
    { name: "name", label: _("Host") },
    { name: "port", label: _("Port") },
];

export function getDiskSourceValue(diskSource: DiskSource, value: DiskSourceKey): optString {
    if (value === "host")
        return diskSource.host.name;
    else if (value === "port")
        return diskSource.host.port;
    else
        return diskSource[value];
}

export const DiskSourceCell = ({
    diskSource,
    idPrefix
} : {
    diskSource: DiskSource,
    idPrefix: string,
}) => {
    const addOptional = (chunks: React.ReactNode[], value: optString, type: string, descr: string) => {
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

    const chunks: React.ReactNode[] = [];
    DISK_SOURCE_LIST.forEach(entry => addOptional(chunks, getDiskSourceValue(diskSource, entry.name), entry.name, entry.label));

    return <DescriptionList isHorizontal>{chunks}</DescriptionList>;
};

export const DiskExtras = ({
    idPrefix,
    cache,
    type,
    serial
} : {
    idPrefix: string,
    cache: optString,
    type: optString,
    serial: optString,
}) => {
    const addOptional = (chunks: React.ReactNode[], value: optString, type: string, descr: string) => {
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

    const chunks: React.ReactNode[] = [];
    addOptional(chunks, cache, "cache", _("Cache"));
    addOptional(chunks, serial, "serial", _("Serial"));
    addOptional(chunks, type, "type", _("Format"));

    return <DescriptionList isHorizontal>{chunks}</DescriptionList>;
};

export const RemoveDiskModal = ({
    vm,
    disk,
    storagePools,
    onAddErrorNotification
} : {
    vm: VM,
    disk: VMDisk,
    storagePools: StoragePool[],
    onAddErrorNotification: (notification: Notification) => void,
}) => {
    const onRemoveDisk = (deleteFile: boolean) => {
        return domainDetachDisk({
            connectionName: vm.connectionName,
            id: vm.id,
            target: disk.target,
            live: vm.state === 'running',
            persistent: vm.persistent,
        })
                .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }))
                .then(() => { // Cleanup operations
                    if (deleteFile) {
                        return domainDeleteStorage({ connectionName: vm.connectionName, storage: [disk], storagePools })
                                .catch(exc => {
                                    onAddErrorNotification({
                                        resourceId: vm.id,
                                        text: cockpit.format(_("Could not delete disk's storage")),
                                        detail: exc.message,
                                        type: "warning"
                                    });
                                });
                    } else {
                        return Promise.resolve();
                    }
                });
    };

    const dialogProps: DeleteResourceModalProps = {
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
        deleteHandler: () => onRemoveDisk(false),
    };

    if (canDeleteDiskFile(disk)) {
        dialogProps.actionNameSecondary = _("Remove and delete file");
        dialogProps.deleteHandlerSecondary = () => onRemoveDisk(true);
    }

    return <DeleteResourceModal {...dialogProps} />;
};

export const DiskActions = ({
    vm,
    vms,
    disk,
    supportedDiskBusTypes,
    idPrefixRow,
    storagePools,
    onAddErrorNotification,
    isActionOpen,
    setIsActionOpen
} : {
    vm: VM,
    vms: VM[],
    disk: VMDisk,
    supportedDiskBusTypes: string[],
    idPrefixRow: string,
    storagePools: StoragePool[],
    onAddErrorNotification: (notification: Notification) => void,
    isActionOpen: boolean,
    setIsActionOpen: (open: boolean) => void,
}) => {
    const Dialogs = useDialogs();

    function openMediaInsertionDialog() {
        Dialogs.show(<AddDiskModalBody idPrefix={idPrefixRow + "-insert-dialog-adddisk"}
                                       vm={vm} vms={vms}
                                       disk={disk}
                                       supportedDiskBusTypes={supportedDiskBusTypes}
                                       isMediaInsertion />);
    }

    let cdromAction;
    if (disk.device === "cdrom" && ["file", "volume"].includes(disk.type || "")) {
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
                                                        disk={disk}
                                                        storagePools={storagePools}
                                                        onAddErrorNotification={onAddErrorNotification} />);
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
            <KebabDropdown
                key={idPrefixRow + "-action-kebab"}
                toggleButtonId={idPrefixRow + "-action-kebab"}
                position='right'
                dropdownItems={dropdownItems}
                isOpen={isActionOpen}
                setIsOpen={setIsActionOpen as React.Dispatch<React.SetStateAction<boolean>>}
            />
        </div>
    );
};
