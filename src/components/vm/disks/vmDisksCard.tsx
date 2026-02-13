/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2016 Red Hat, Inc.
 */
import React, { useState } from 'react';
import cockpit from 'cockpit';

import type { optString, VM, VMDisk, VMDiskStat, StoragePool } from '../../../types';
import type { ListingTableColumnProps, ListingTableRowProps } from 'cockpit-components-table';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { useDialogs } from 'dialogs.jsx';

import { convertToUnit, toReadableNumber, units, vmId } from "../../../helpers.js";
import { AddDiskModalBody } from './diskAdd.jsx';
import { needsShutdownDiskAccess, needsShutdownDiskCache, WithPending } from '../../common/needsShutdown.jsx';
import { ListingTable } from "cockpit-components-table.jsx";
import { DiskSourceDescriptions, DiskSourceAbbrev, DiskExtraDescriptions, DiskActions } from './vmDiskColumns.jsx';

const _ = cockpit.gettext;

const StorageUnit = ({ value, id } : { value: optString | number, id: string }) => {
    if (!value) {
        return null;
    }

    if (isNaN(Number(value))) {
        return (
            <div id={id}>
                {value}
            </div>
        );
    }

    return (
        <div id={id}>
            {toReadableNumber(convertToUnit(value, units.B, units.GiB))}&nbsp;{_("GiB")}
        </div>
    );
};

const VmDiskCell = ({ value, id } : { value: React.ReactNode, id: string }) => {
    return (
        <div id={id}>
            {value}
        </div>
    );
};

export const VmDisksActions = ({
    vm,
    supportedDiskBusTypes
} : {
    vm: VM,
    supportedDiskBusTypes: string[],
}) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vm.name)}-disks`;

    function open() {
        Dialogs.show(<AddDiskModalBody idPrefix={idPrefix + "-adddisk"}
                                       vm={vm}
                                       supportedDiskBusTypes={supportedDiskBusTypes} />);
    }

    return (
        <Button id={`${idPrefix}-adddisk`} variant='secondary'
                onClick={open} isDisabled={supportedDiskBusTypes.length == 0}>
            {_("Add disk")}
        </Button>
    );
};

interface VMDiskWithData extends VMDisk {
    used: optString | number;
    capacity: optString | number;
}

interface VmDisksCardLibvirtProps {
    vm: VM,
    storagePools: StoragePool[],
    supportedDiskBusTypes: string[],
}

export class VmDisksCardLibvirt extends React.Component<VmDisksCardLibvirtProps> {
    prepareDiskData(vm: VM, disk: VMDisk, diskStats: VMDiskStat | undefined, storagePools: StoragePool[]): VMDiskWithData {
        // A shut off VM reports the actual storage size on the host
        // in the "allocation" property, while a running VM reports
        // the same number in the "physical" property...

        let used: optString | number = diskStats && (vm.state == "shut off" ? diskStats.allocation : diskStats.physical);
        let capacity: optString | number = diskStats && diskStats.capacity;

        /*
         * For disks of type `volume` allocation and capacity stats
         * are not fetched with the virConnectGetAllDomainStats API
         * when the VM is shut off, so we need to get them from the
         * volume.  We do this only when necessary, since the
         * domainstats are kept up-to-date.
         *
         * Both pool and volume of the disk might have been undefined so make
         * required checks before reading them.
         */
        if ((!used || !capacity) && disk.type == 'volume') {
            const pool = storagePools.filter(pool => pool.name == disk.source.pool)[0];
            const volumes = pool ? pool.volumes : [];
            const volumeName = disk.source.volume;
            let volume;
            if (volumes)
                volume = volumes.filter(vol => vol.name == volumeName)[0];

            if (volume) {
                capacity = volume.capacity;
                used = volume.allocation;
            }
        }

        return {
            ...disk,
            used,
            capacity,
        };
    }

    render() {
        const { vm, storagePools, supportedDiskBusTypes } = this.props;

        const disks = Object.getOwnPropertyNames(vm.disks)
                .sort() // by 'target'
                .map(target => this.prepareDiskData(vm,
                                                    vm.disks[target],
                                                    vm.disksStats && vm.disksStats[target],
                                                    storagePools));

        return (
            <VmDisksCard
                vm={vm}
                disks={disks}
                storagePools={storagePools}
                supportedDiskBusTypes={supportedDiskBusTypes} />
        );
    }
}

export const VmDisksCard = ({
    vm,
    disks,
    supportedDiskBusTypes,
    storagePools
} : {
    vm: VM,
    disks: VMDiskWithData[],
    supportedDiskBusTypes: string[],
    storagePools: StoragePool[],
}) => {
    const [openActions, setOpenActions] = useState(new Set());
    const columnTitles: (string | ListingTableColumnProps)[] = [];
    const idPrefix = `${vmId(vm.name)}-disks`;

    if (disks && disks.length > 0) {
        columnTitles.push(_("Source"));
        columnTitles.push(_("Target"));
        columnTitles.push(_("Size"));
        columnTitles.push(_("Used on host"));
        columnTitles.push({ title: '', props: { "aria-label": _("Actions") } });
    }

    const rows: ListingTableRowProps[] = disks.map(disk => {
        const idPrefixRow = `${idPrefix}-${(disk.target || disk.device)}`;
        const columns: ListingTableRowProps["columns"] = [
        ];

        columns.push({ title: <DiskSourceAbbrev disk={disk} /> });
        columns.push({ title: <div id={`${idPrefixRow}-target`}>{disk.target}</div> });
        columns.push({
            title: <StorageUnit
                       value={disk.capacity}
                       id={`${idPrefixRow}-capacity`}
                       key={`${idPrefixRow}-capacity`}
            />
        });
        columns.push({
            title: !isNaN(Number(disk.used)) &&
                <StorageUnit
                    value={disk.used}
                    id={`${idPrefixRow}-used`}
                    key={`${idPrefixRow}-used`}
                />
        });

        columns.push({
            title: <DiskActions vm={vm}
                                disk={disk}
                                storagePools={storagePools}
                                supportedDiskBusTypes={supportedDiskBusTypes}
                                idPrefixRow={idPrefixRow}
                                isActionOpen={openActions.has(disk.target)}
                                setIsActionOpen={open => setOpenActions(prev => {
                                    const next = new Set(prev);
                                    if (open)
                                        next.add(disk.target);
                                    else
                                        next.delete(disk.target);
                                    return next;
                                })
                                } />
        });

        const Description = ({
            term,
            children
        } : {
            term: string,
            children: React.ReactNode
        }) => (
            <DescriptionListGroup>
                <DescriptionListTerm>{term}</DescriptionListTerm>
                <DescriptionListDescription>{children}</DescriptionListDescription>
            </DescriptionListGroup>
        );

        const DescriptionWithPending = ({
            id,
            term,
            isPending,
            children,
        } : {
            id: string,
            term: string,
            isPending: boolean,
            children: React.ReactNode
        }) => (
            <Description term={term}>
                <WithPending id={id} isPending={isPending}>
                    {children}
                </WithPending>
            </Description>
        );

        const expandedContent = (
            <DescriptionList isAutoFit>
                <Description term={_("Device")}>
                    <VmDiskCell value={disk.device} id={`${idPrefixRow}-device`} key={`${idPrefixRow}-device`} />
                </Description>
                <Description term={_("Bus")}>
                    <div id={`${idPrefixRow}-bus`}>{disk.bus}</div>
                </Description>
                <DescriptionWithPending
                    id={`${idPrefixRow}-access`}
                    term={_("Access")}
                    isPending={!!disk.target && needsShutdownDiskAccess(vm, disk.target)}
                >
                    {disk.readonly ? _("Read-only") : disk.shareable ? _("Concurrently writeable") : _("Writeable")}
                </DescriptionWithPending>
                <DiskSourceDescriptions
                    diskSource={disk.source}
                    idPrefix={idPrefixRow}
                />
                <DescriptionWithPending
                    id={`${idPrefixRow}-cache`}
                    term={_("Cache")}
                    isPending={!!disk.target && needsShutdownDiskCache(vm, disk.target)}
                >
                    {disk.driver.cache}
                </DescriptionWithPending>
                <DiskExtraDescriptions
                    idPrefix={idPrefixRow}
                    type={disk.driver.type}
                    serial={disk.serial}
                />
            </DescriptionList>
        );

        return {
            columns,
            props: { key: idPrefixRow, 'data-row-id': disk.target },
            expandedContent,
            hasPadding: true,
        };
    });

    return (
        <ListingTable variant='compact'
                gridBreakPoint='grid-lg'
                emptyCaption={_("No disks")}
                aria-label={`VM ${vm.name} Disks`}
                columns={columnTitles}
                rows={rows} />
    );
};
