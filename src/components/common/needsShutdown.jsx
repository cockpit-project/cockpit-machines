import React from 'react';
import cockpit from 'cockpit';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";
import { PendingIcon } from "@patternfly/react-icons";

import {
    getIfaceSourceName,
    nicLookupByMAC
} from "../../helpers.js";

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

export const NeedsShutdownTooltip = ({ iconId, tooltipId }) => {
    return (
        <Tooltip id={tooltipId} content={NEEDS_SHUTDOWN_MESSAGE}>
            <Icon status="info">
                <PendingIcon id={iconId} />
            </Icon>
        </Tooltip>
    );
};

export const NeedsShutdownAlert = ({ idPrefix }) =>
    <Alert isInline variant='warning' id={`${idPrefix}-idle-message`} title={NEEDS_SHUTDOWN_MESSAGE} />;
