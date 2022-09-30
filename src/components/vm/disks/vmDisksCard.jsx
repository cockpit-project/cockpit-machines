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
import { Button, Flex, FlexItem } from '@patternfly/react-core';
import { useDialogs } from 'dialogs.jsx';

import { convertToUnit, diskPropertyChanged, toReadableNumber, units, vmId } from "../../../helpers.js";
import { AddDiskModalBody } from './diskAdd.jsx';
import WarningInactive from '../../common/warningInactive.jsx';
import { ListingTable } from "cockpit-components-table.jsx";
import { DiskSourceCell, DiskExtras, DiskActions } from './vmDiskColumns.jsx';

const _ = cockpit.gettext;

const StorageUnit = ({ value, id }) => {
    if (!value) {
        return null;
    }

    if (isNaN(value)) {
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

const VmDiskCell = ({ value, id }) => {
    return (
        <div id={id}>
            {value}
        </div>
    );
};

export const VmDisksActions = ({ vm, vms, supportedDiskBusTypes }) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vm.name)}-disks`;

    function open() {
        Dialogs.show(<AddDiskModalBody idPrefix={idPrefix}
                                       vm={vm} vms={vms}
                                       supportedDiskBusTypes={supportedDiskBusTypes} />);
    }

    return (
        <Button id={`${idPrefix}-adddisk`} variant='secondary'
                onClick={open} isDisabled={!supportedDiskBusTypes || supportedDiskBusTypes.length == 0}>
            {_("Add disk")}
        </Button>
    );
};

export class VmDisksCardLibvirt extends React.Component {
    /**
     * Returns true, if disk statistics are retrieved.
     */
    getDiskStatsSupport(vm) {
        /* Possible states for disk stats:
            available ~ already read
            supported, but not available yet ~ will be read soon
         */
        let areDiskStatsSupported = false;
        if (vm.disksStats) {
            // stats are read/supported if there is a non-NaN stat value
            areDiskStatsSupported = !!Object.getOwnPropertyNames(vm.disksStats)
                    .some(target => {
                        if (!vm.disks[target] || (vm.disks[target].type !== 'volume' && !vm.disksStats[target])) {
                            return false; // not yet retrieved, can't decide about disk stats support
                        }
                        return vm.disks[target].type == 'volume' || !isNaN(vm.disksStats[target].capacity) || !isNaN(vm.disksStats[target].allocation);
                    });
        }

        return areDiskStatsSupported;
    }

    prepareDiskData(disk, diskStats, idPrefix, storagePools) {
        diskStats = diskStats || {};

        let used = diskStats.allocation;
        let capacity = diskStats.capacity;

        /*
         * For disks of type `volume` allocation and capacity stats are not
         * fetched with the virConnectGetAllDomainStats API so we need to get
         * them from the volume.
         *
         * Both pool and volume of the disk might have been undefined so make
         * required checks before reading them.
         */
        if (disk.type == 'volume') {
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
            used: used,
            capacity: capacity,
        };
    }

    render() {
        const { vm, storagePools, supportedDiskBusTypes } = this.props;

        const idPrefix = `${vmId(vm.name)}-disks`;
        const areDiskStatsSupported = this.getDiskStatsSupport(vm);

        const disks = Object.getOwnPropertyNames(vm.disks)
                .sort() // by 'target'
                .map(target => this.prepareDiskData(vm.disks[target],
                                                    vm.disksStats && vm.disksStats[target],
                                                    `${idPrefix}-${target}`,
                                                    storagePools));
        return (
            <VmDisksCard
                vm={vm}
                disks={disks}
                renderCapacity={areDiskStatsSupported}
                supportedDiskBusTypes={supportedDiskBusTypes} />
        );
    }
}

VmDisksCardLibvirt.propTypes = {
    supportedDiskBusTypes: PropTypes.array,
    vm: PropTypes.object.isRequired,
};

export const VmDisksCard = ({ vm, disks, renderCapacity, supportedDiskBusTypes }) => {
    let renderCapacityUsed, renderAccess, renderAdditional;
    const columnTitles = [_("Device")];
    const idPrefix = `${vmId(vm.name)}-disks`;

    if (disks && disks.length > 0) {
        renderCapacityUsed = disks.some(disk => (!!disk.used));
        renderAccess = disks.some(disk => (typeof disk.readonly !== "undefined") || (typeof disk.shareable !== "undefined"));
        renderAdditional = disks.some(disk => (disk.driver.cache || disk.driver.io || disk.driver.discard || disk.driver.errorPolicy || disk.serial));

        if (renderCapacity) {
            if (renderCapacityUsed) {
                columnTitles.push(_("Used"));
            }
            columnTitles.push(_("Capacity"));
        }
        columnTitles.push(_("Bus"));
        if (renderAccess) {
            columnTitles.push(_("Access"));
        }
        columnTitles.push(_("Source"));
        if (renderAdditional)
            columnTitles.push(_("Additional"));

        columnTitles.push('');
    }

    const rows = disks.map(disk => {
        const idPrefixRow = `${idPrefix}-${(disk.target || disk.device)}`;
        const columns = [
            { title: <VmDiskCell value={disk.device} id={`${idPrefixRow}-device`} key={`${idPrefixRow}-device`} /> },

        ];

        if (renderCapacity) {
            if (renderCapacityUsed) {
                columns.push({ title: <StorageUnit value={disk.used} id={`${idPrefixRow}-used`} key={`${idPrefixRow}-used`} /> });
            }
            columns.push({ title: <StorageUnit value={disk.capacity} id={`${idPrefixRow}-capacity`} key={`${idPrefixRow}-capacity`} /> });
        }

        columns.push({ title: <VmDiskCell value={disk.bus} id={`${idPrefixRow}-bus`} key={`${idPrefixRow}-bus`} /> });

        if (renderAccess) {
            const access = (
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${idPrefixRow}-access`}>
                    <FlexItem>{ disk.readonly ? _("Read-only") : disk.shareable ? _("Writeable and shared") : _("Writeable") }</FlexItem>
                    { vm.state === "running" &&
                    (diskPropertyChanged(vm, disk.target, "readonly") || diskPropertyChanged(vm, disk.target, "shareable")) &&
                        <WarningInactive iconId={`${idPrefixRow}-access-tooltip`} tooltipId={`tip-${idPrefixRow}-access`} /> }
                </Flex>
            );
            columns.push({ title: access });
        }

        columns.push({ title: <DiskSourceCell diskSource={disk.source} idPrefix={idPrefixRow} /> });

        if (renderAdditional) {
            columns.push({
                title: <DiskExtras idPrefix={idPrefixRow}
                                   cache={disk.driver.cache}
                                   io={disk.driver.io}
                                   discard={disk.driver.discard}
                                   serial={disk.serial}
                                   errorPolicy={disk.driver.errorPolicy} />
            });
        }

        columns.push({
            title: <DiskActions vm={vm}
                                disk={disk}
                                supportedDiskBusTypes={supportedDiskBusTypes}
                                idPrefixRow={idPrefixRow} />
        });
        return { columns, props: { key: idPrefixRow } };
    });

    return (
        <>
            <ListingTable variant='compact'
                gridBreakPoint='grid-xl'
                emptyCaption={_("No disks defined for this VM")}
                aria-label={`VM ${vm.name} Disks`}
                columns={columnTitles}
                rows={rows} />
        </>
    );
};

VmDisksCard.propTypes = {
    disks: PropTypes.array.isRequired,
    renderCapacity: PropTypes.bool,
    supportedDiskBusTypes: PropTypes.array,
};
