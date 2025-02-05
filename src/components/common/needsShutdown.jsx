import React from 'react';
import cockpit from 'cockpit';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon";
import { Label } from "@patternfly/react-core/dist/esm/components/Label";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { PendingIcon } from "@patternfly/react-icons";

import {
    getIfaceSourceName,
    nicLookupByMAC
} from "../../helpers.js";

import "./needsShutdown.css";

const _ = cockpit.gettext;

const NEEDS_SHUTDOWN_MESSAGE = _("Changes will take effect after shutting down the VM");

function diskPropertyChanged(disk, inactiveDisk, property) {
    return disk[property] !== inactiveDisk[property];
}

export function needsShutdownDiskAccess(vm, diskTarget) {
    const inactiveDisk = vm.inactiveXML.disks[diskTarget];
    const disk = vm.disks[diskTarget];

    return inactiveDisk &&
        (diskPropertyChanged(disk, inactiveDisk, "readonly") ||
         diskPropertyChanged(disk, inactiveDisk, "shareable"));
}

export function needsShutdownIfaceType(vm, iface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface && inactiveIface.type !== iface.type;
}

export function needsShutdownIfaceModel(vm, iface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface && inactiveIface.model !== iface.model;
}

export function needsShutdownIfaceSource(vm, iface) {
    const inactiveIface = nicLookupByMAC(vm.inactiveXML.interfaces, iface.mac);

    return inactiveIface &&
        getIfaceSourceName(inactiveIface) !== getIfaceSourceName(iface);
}

export function needsShutdownVcpu(vm) {
    return ((vm.vcpus.count !== vm.inactiveXML.vcpus.count) ||
            (vm.vcpus.max !== vm.inactiveXML.vcpus.max) ||
            (vm.cpu.sockets !== vm.inactiveXML.cpu.sockets) ||
            (vm.cpu.threads !== vm.inactiveXML.cpu.threads) ||
            (vm.cpu.cores !== vm.inactiveXML.cpu.cores));
}

export function needsShutdownCpuModel(vm) {
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

export function needsShutdownWatchdog(vm) {
    return vm.persistent && vm.state === "running" && vm.inactiveXML.watchdog.action !== vm.watchdog.action;
}

export function needsShutdownTpm(vm) {
    return vm.persistent && vm.state === "running" && vm.inactiveXML.hasTPM !== vm.hasTPM;
}

export function needsShutdownSpice(vm) {
    return vm.hasSpice !== vm.inactiveXML.hasSpice;
}

export function needsShutdownVnc(vm) {
    function find_vnc(v) {
        return v.displays && v.displays.find(d => d.type == "vnc");
    }

    const active_vnc = find_vnc(vm);
    const inactive_vnc = find_vnc(vm.inactiveXML);

    if (inactive_vnc && !active_vnc)
        return true;

    return false;
}

export function getDevicesRequiringShutdown(vm) {
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

    // VNC
    if (needsShutdownVnc(vm))
        devices.push(_("VNC"));

    // TPM
    if (needsShutdownTpm(vm))
        devices.push(_("TPM"));

    return devices;
}

export const NeedsShutdownTooltip = ({ iconId, tooltipId }) => {
    return (
        <Tooltip id={tooltipId} content={NEEDS_SHUTDOWN_MESSAGE}>
            <Icon status="custom">
                <PendingIcon id={iconId} />
            </Icon>
        </Tooltip>
    );
};

export const NeedsShutdownAlert = ({ idPrefix }) =>
    <Alert isInline id={`${idPrefix}-idle-message`} customIcon={<PendingIcon />} title={NEEDS_SHUTDOWN_MESSAGE} />;

export const VmNeedsShutdown = ({ vm }) => {
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
            <Label className="resource-state-text" color="cyan" id={`vm-${vm.name}-needs-shutdown`}
                   icon={<PendingIcon />} onClick={() => null}>
                {_("Changes pending")}
            </Label>
        </Popover>
    );
};
