/*
 * This file is part of Cockpit.
 *
 * Copyright (C) Red Hat, Inc.
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
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon";
import { Label } from "@patternfly/react-core/dist/esm/components/Label";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { PendingIcon } from "@patternfly/react-icons";

import type { VM, VMDisk, VMInterface } from '../../types';

import {
    getIfaceSourceName,
    nicLookupByMAC
} from "../../helpers.js";

const _ = cockpit.gettext;

const NEEDS_SHUTDOWN_MESSAGE = _("Changes will take effect after shutting down the VM");

function diskPropertyChanged(disk: VMDisk, inactiveDisk: VMDisk, property: keyof VMDisk) {
    return disk[property] !== inactiveDisk[property];
}

export function needsShutdownDiskAccess(vm: VM, diskTarget: string) {
    const inactiveDisk = vm.inactiveXML.disks[diskTarget];
    const disk = vm.disks[diskTarget];

    return inactiveDisk &&
        (diskPropertyChanged(disk, inactiveDisk, "readonly") ||
         diskPropertyChanged(disk, inactiveDisk, "shareable"));
}

export function needsShutdownIfaceType(vm: VM, iface: VMInterface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface && inactiveIface.type !== iface.type;
}

export function needsShutdownIfaceModel(vm: VM, iface: VMInterface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface && inactiveIface.model !== iface.model;
}

export function needsShutdownIfaceSource(vm: VM, iface: VMInterface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface &&
        getIfaceSourceName(inactiveIface) !== getIfaceSourceName(iface);
}

export function needsShutdownVcpu(vm: VM) {
    return ((vm.vcpus.count !== vm.inactiveXML.vcpus.count) ||
            (vm.vcpus.max !== vm.inactiveXML.vcpus.max) ||
            (vm.cpu.topology.sockets !== vm.inactiveXML.cpu.topology.sockets) ||
            (vm.cpu.topology.threads !== vm.inactiveXML.cpu.topology.threads) ||
            (vm.cpu.topology.cores !== vm.inactiveXML.cpu.topology.cores));
}

export function needsShutdownCpuModel(vm: VM) {
    /* The live xml shows what host-model expanded to when started
     * This is important since the expansion varies depending on the host and so needs to be tracked across migration
     */
    if (vm.inactiveXML.cpu.mode === 'host-model')
        return !(vm.cpu.mode == 'host-model' || vm.cpu.model === vm.capabilities.cpuHostModel);
    if (vm.inactiveXML.cpu.mode === 'host-passthrough')
        return vm.cpu.mode !== 'host-passthrough';
    if (vm.inactiveXML.cpu.mode === 'custom')
        return vm.cpu.mode !== 'custom' || vm.cpu.model !== vm.inactiveXML.cpu.model;

    return false;
}

export function needsShutdownWatchdog(vm: VM) {
    return vm.persistent && vm.state === "running" && vm.inactiveXML.watchdog.action !== vm.watchdog.action;
}

export function needsShutdownTpm(vm: VM) {
    return vm.persistent && vm.state === "running" && vm.inactiveXML.hasTPM !== vm.hasTPM;
}

export function needsShutdownSpice(vm: VM) {
    return vm.hasSpice !== vm.inactiveXML.hasSpice;
}

export function getDevicesRequiringShutdown(vm: VM) {
    if (!vm.persistent)
        return [];

    const devices = [];

    // DISKS
    for (const target in vm.disks) {
        if (needsShutdownDiskAccess(vm, target)) {
            devices.push(_("Disk"));
            break;
        }
    }

    // INTERFACES
    for (const iface of vm.interfaces) {
        if (needsShutdownIfaceType(vm, iface) ||
            needsShutdownIfaceModel(vm, iface) ||
            needsShutdownIfaceSource(vm, iface)) {
            devices.push(_("Network interface"));
            break;
        }
    }

    // VCPU
    if (needsShutdownVcpu(vm))
        devices.push(_("vCPUs"));

    // CPU
    if (needsShutdownCpuModel(vm))
        devices.push(_("CPU"));

    // Watchdog
    if (needsShutdownWatchdog(vm))
        devices.push(_("Watchdog"));

    // SPICE
    if (needsShutdownSpice(vm))
        devices.push(_("SPICE"));

    // TPM
    if (needsShutdownTpm(vm))
        devices.push(_("TPM"));

    return devices;
}

export const NeedsShutdownTooltip = ({
    iconId,
    tooltipId
}: {
    iconId: string,
    tooltipId: string,
}) => {
    return (
        <Tooltip id={tooltipId} content={NEEDS_SHUTDOWN_MESSAGE}>
            <Icon status="custom">
                <PendingIcon id={iconId} />
            </Icon>
        </Tooltip>
    );
};

export const NeedsShutdownAlert = ({ idPrefix } : { idPrefix: string }) =>
    <Alert isInline id={`${idPrefix}-idle-message`} customIcon={<PendingIcon />} title={NEEDS_SHUTDOWN_MESSAGE} />;

export const VmNeedsShutdown = ({ vm } : { vm: VM }) => {
    const devices = getDevicesRequiringShutdown(vm);

    if (devices.length === 0)
        return;

    const body = (
        <>
            {_("Some configuration changes only take effect after a fresh boot:")}
            <List className="configuration-changes-list">
                { devices.map(device => {
                    return (
                        <ListItem key={device}>
                            {device}
                        </ListItem>
                    );
                }) }
            </List>
        </>
    );

    const header = _("VM needs shutdown");
    return (
        <Popover aria-label={header}
            headerContent={header}
            headerIcon={<PendingIcon />}
            position="bottom"
            hasAutoWidth
            bodyContent={body}>
            <Label className="resource-state-text" color="teal" id={`vm-${vm.name}-needs-shutdown`}
                   icon={<PendingIcon />} onClick={() => null}>
                {_("Changes pending")}
            </Label>
        </Popover>
    );
};
