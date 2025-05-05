/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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

/*
 * Provider for Libvirt using libvirt-dbus API.
 * See https://github.com/libvirt/libvirt-dbus
 */
import cockpit from "cockpit";
import store from "../store.js";
import * as python from "python.js";

import getOSListScript from "../getOSList.py";

import {
    undefineNetwork,
    undefineStoragePool,
    updateLibvirtVersion,
    updateOsInfoList,
    updateVm,
    setLoggedInUser,
    setCapabilities,
    setNodeMaxMemory,
} from "../actions/store-actions.js";

import {
    getRefreshInterval,
    usagePollingEnabled
} from "../selectors.js";
import VMS_CONFIG from "../config.js";
import {
    logDebug,
} from "../helpers.js";

import {
    domainGet,
    domainGetAll,
} from "../libvirtApi/domain.js";
import {
    DBusProps,
    get_number_prop,
    get_string_prop,
    get_variant_number,
    call,
    dbusClient,
    Enum,
    timeout,
} from "../libvirtApi/helpers.js";
import {
    interfaceGetAll,
} from "../libvirtApi/interface.js";
import {
    networkGet,
    networkGetAll,
} from "../libvirtApi/network.js";
import {
    nodeDeviceGetAll,
} from "../libvirtApi/nodeDevice.js";
import {
    storagePoolGet,
    storagePoolGetAll,
} from "../libvirtApi/storagePool.js";
import {
    parseDumpxmlForCapabilities
} from "../libvirt-xml-parse.js";

import type { ConnectionName, VM } from '../types';

/**
 * Calculates disk statistics.
 * @param  {object} info - Object returned by GetStats method call.
 * @return {object}
 */
function calculateDiskStats(info: DBusProps): VM["disksStats"] {
    const disksStats: VM["disksStats"] = {};

    if (!("block.count" in info))
        return;
    const count = get_number_prop(info, "block.count");
    if (!count)
        return;

    /* Note 1: Libvirt reports disk capacity since version 1.2.18 (year 2015)
       TODO: If disk stats is required for old systems, find a way how to get
       it when 'block.X.capacity' is not present, consider various options for
       'sources'

       Note 2: Casting to string happens for return types to be same with
       results from libvirt.js file.
     */

    function get_stat(name: string): string | number {
        return info[name] === undefined ? NaN : get_number_prop(info, name).toString();
    }

    for (let i = 0; i < count; i++) {
        const target = get_string_prop(info, `block.${i}.name`);
        const physical = get_stat(`block.${i}.physical`);
        const capacity = get_stat(`block.${i}.capacity`);
        const allocation = get_stat(`block.${i}.allocation`);

        if (target) {
            disksStats[target] = {
                physical,
                capacity,
                allocation,
            };
        } else {
            console.warn(`calculateDiskStats(): mandatory property is missing in info (block.${i}.name)`);
        }
    }
    return disksStats;
}

function delayPollingHelper(action: () => void, timeout: number): void {
    window.setTimeout(() => {
        logDebug('Executing delayed action');
        action();
    }, timeout);
}

/**
 * Delay call of polling action.
 *
 * To avoid execution overlap, the setTimeout() is used instead of setInterval().
 *
 * The delayPolling() function is called after previous execution is finished so
 * the refresh interval starts counting since that moment.
 *
 * If the application is not visible, the polling action execution is skipped
 * and scheduled on later.
 *
 * @param action I.e. domainGetAll()
 * @param timeout Non-default timeout
 */
function delayPolling(action: () => void, timeout: number | null): void {
    timeout = timeout || getRefreshInterval(store.getState());

    if (timeout > 0 && !cockpit.hidden) {
        logDebug(`Scheduling ${timeout} ms delayed action`);
        delayPollingHelper(action, timeout);
    } else {
        // logDebug(`Skipping delayed action since refreshing is switched off`);
        window.setTimeout(() => delayPolling(action, timeout), VMS_CONFIG.DefaultRefreshInterval);
    }
}

/**
 * Dispatch an action to initialize usage polling for Domain statistics.
 * @param  {String} name           Domain name.
 * @param  {String} connectionName D-Bus connection type; one of session/system.
 * @param  {String} objPath        D-Bus object path of the Domain we need to poll.
 * @return {Promise<void>}
 */
async function doUsagePolling(
    name: string,
    connectionName: ConnectionName,
    objPath: string,
): Promise<void> {
    logDebug(`doUsagePolling(${name}, ${connectionName}, ${objPath})`);

    if (!usagePollingEnabled(store.getState(), name, connectionName)) {
        logDebug(`doUsagePolling(${name}, ${connectionName}): usage polling disabled, stopping loop`);
        return;
    }
    const flags = Enum.VIR_DOMAIN_STATS_BALLOON | Enum.VIR_DOMAIN_STATS_VCPU | Enum.VIR_DOMAIN_STATS_BLOCK | Enum.VIR_DOMAIN_STATS_STATE;

    try {
        const [info] = await call<[DBusProps]>(connectionName, objPath, "org.libvirt.Domain", "GetStats", [flags, 0], { timeout: 5000, type: "uu" });
        if (Object.getOwnPropertyNames(info).length > 0) {
            const props: Partial<VM> = { name, connectionName, id: objPath };
            let avgvCpuTime = 0;

            if ("balloon.rss" in info)
                props.rssMemory = get_number_prop(info, "balloon.rss");
            else if ("state.state" in info && get_number_prop(info, "state.state") == Enum.VIR_DOMAIN_SHUTOFF)
                props.rssMemory = 0.0;
            for (let i = 0; i < get_number_prop(info, "vcpu.maximum"); i++) {
                if (!(`vcpu.${i}.time` in info))
                    continue;
                avgvCpuTime += get_number_prop(info, `vcpu.${i}.time`);
            }
            avgvCpuTime /= get_number_prop(info, "vcpu.current");
            if (get_number_prop(info, "vcpu.current") > 0) {
                props.actualTimeInMs = Date.now();
                props.cpuTime = avgvCpuTime;
            }
            props.disksStats = calculateDiskStats(info);

            logDebug(`doUsagePolling: ${JSON.stringify(props)}`);
            store.dispatch(updateVm(props));
        }
    } catch (ex) {
        console.warn(`GetStats(${name}, ${connectionName}) failed: ${String(ex)}`);
    }
    delayPolling(() => doUsagePolling(name, connectionName, objPath), null);
}

async function getLoggedInUser(): Promise<void> {
    const loggedUser = await cockpit.user();
    logDebug(`GET_LOGGED_IN_USER:`, loggedUser);
    store.dispatch(setLoggedInUser({ loggedUser }));
}

export async function getLibvirtVersion({
    connectionName
} : {
    connectionName: ConnectionName
}): Promise<void> {
    const [version] = await call<[cockpit.Variant]>(connectionName, "/org/libvirt/QEMU", "org.freedesktop.DBus.Properties", "Get", ["org.libvirt.Connect", "LibVersion"], { timeout, type: "ss" });
    store.dispatch(updateLibvirtVersion({ libvirtVersion: get_variant_number(version) }));
}

async function getCapabilities({
    connectionName
} : {
    connectionName: ConnectionName
}): Promise<void> {
    try {
        const [capabilitiesXML] = await call<[string]>(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "GetCapabilities", [],
                                                       { timeout, type: "" });
        const capabilities = parseDumpxmlForCapabilities(capabilitiesXML);
        store.dispatch(setCapabilities({ capabilities }));
    } catch (ex) {
        console.warn("NodeGetMemoryStats failed:", String(ex));
        throw ex;
    }
}

async function getNodeMaxMemory({
    connectionName
} : {
    connectionName: ConnectionName
}): Promise<void> {
    // Some nodes don't return all memory in just one cell.
    // Using -1 == VIR_NODE_MEMORY_STATS_ALL_CELLS will return memory across all cells
    try {
        const [stats] = await call<[{ total: number }]>(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "NodeGetMemoryStats", [-1, 0], { timeout, type: "iu" });
        store.dispatch(setNodeMaxMemory({ memory: stats.total }));
    } catch (ex) {
        console.warn("NodeGetMemoryStats failed:", String(ex));
        throw ex;
    }
}

async function getOsInfoList(): Promise<void> {
    logDebug(`GET_OS_INFO_LIST():`);
    try {
        const osList = await python.spawn(getOSListScript, undefined, { err: "message", environ: ['LC_ALL=C.UTF-8'] });
        parseOsInfoList(osList);
    } catch (ex) {
        console.error(`get os list returned error: "${JSON.stringify(ex)}"`);
        parseOsInfoList('[]');
    }
}

async function networkUpdateOrDelete(
    connectionName: ConnectionName,
    netPath: string,
): Promise<void> {
    try {
        const [objPaths] = await call<[string[]]>(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListNetworks", [0],
                                                  { timeout, type: "u" });
        if (objPaths.includes(netPath))
            return networkGet({ connectionName, id: netPath, updateOnly: true });
        else // Transient network which got undefined when stopped
            store.dispatch(undefineNetwork({ connectionName, id: netPath }));
    } catch (ex) {
        console.warn("networkUpdateOrDelete action failed:", String(ex));
    }
}

function parseOsInfoList(osList: string): void {
    const osinfodata = JSON.parse(osList);

    store.dispatch(updateOsInfoList(osinfodata.filter((os: { shortId?: string }) => os.shortId)));
}

/**
 * Subscribe to D-Bus signals and defines the handlers to be invoked in each occasion.
 * @param  {String} connectionName D-Bus connection type; one of session/system.
 */
function startEventMonitor({
    connectionName
} : {
    connectionName: ConnectionName,
}): void {
    if (connectionName !== "session" && connectionName !== "system")
        return;

    /* Handlers for domain events */
    startEventMonitorDomains(connectionName);

    /* Handlers for network events */
    startEventMonitorNetworks(connectionName);

    /* Handlers for storage pool events */
    startEventMonitorStoragePools(connectionName);
}

function startEventMonitorDomains(connectionName: ConnectionName): void {
    /* Subscribe to Domain Lifecycle signals on Connect Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "DomainEvent" },
        (path, iface, signal, args) => {
            const objPath = args[0] as string;
            const eventType = args[1] as number;

            logDebug(`signal on ${path}: ${iface}.${signal}(${JSON.stringify(args)})`);

            switch (eventType) {
            case Enum.VIR_DOMAIN_EVENT_DEFINED:
            case Enum.VIR_DOMAIN_EVENT_UNDEFINED:
            case Enum.VIR_DOMAIN_EVENT_STARTED:
            case Enum.VIR_DOMAIN_EVENT_STOPPED:
                domainGet({ connectionName, id: objPath });
                break;

            case Enum.VIR_DOMAIN_EVENT_SUSPENDED:
                store.dispatch(updateVm({
                    connectionName,
                    id: objPath,
                    state: "paused"
                }));
                break;

            case Enum.VIR_DOMAIN_EVENT_RESUMED:
                store.dispatch(updateVm({
                    connectionName,
                    id: objPath,
                    state: "running"
                }));
                break;

            default:
                logDebug(`Unhandled lifecycle event type ${eventType}`);
                break;
            }
        }
    );

    /* Subscribe to signals on Domain Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Domain" },
        (path, iface, signal, args) => {
            logDebug(`signal on ${path}: ${iface}.${signal}(${JSON.stringify(args)})`);

            switch (signal) {
            case "BalloonChange":
            case "ControlError":
            case "DeviceAdded":
            case "DeviceRemoved":
            case "DiskChange":
            case "MetadataChanged":
            case "TrayChange":
            /* These signals imply possible changes in what we display, so re-read the state */
                domainGet({ connectionName, id: path });
                break;

            default:
                logDebug(`handle DomainEvent on ${connectionName}: ignoring event ${signal}`);
            }
        });
}

function startEventMonitorNetworks(connectionName: ConnectionName): void {
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "NetworkEvent" },
        (_path, _iface, signal, args) => {
            const objPath = args[0] as string;
            const eventType = args[1] as number;

            switch (eventType) {
            case Enum.VIR_NETWORK_EVENT_DEFINED:
            case Enum.VIR_NETWORK_EVENT_STARTED:
                networkGet({ connectionName, id: objPath });
                break;
            case Enum.VIR_NETWORK_EVENT_STOPPED:
                networkUpdateOrDelete(connectionName, objPath);
                break;
            case Enum.VIR_NETWORK_EVENT_UNDEFINED:
                store.dispatch(undefineNetwork({ connectionName, id: objPath }));
                break;
            default:
                logDebug(`handle Network on ${connectionName}: ignoring event ${signal}`);
            }
        }
    );

    /* Subscribe to signals on Network Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Network" },
        (path, _iface, signal) => {
            switch (signal) {
            case "Refresh":
            /* These signals imply possible changes in what we display, so re-read the state */
                networkGet({ connectionName, id: path });
                break;
            default:
                logDebug(`handleEvent Network on ${connectionName} : ignoring event ${signal}`);
            }
        });
}

function startEventMonitorStoragePools(connectionName: ConnectionName): void {
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "StoragePoolEvent" },
        (_path, _iface, _signal, args) => {
            const objPath = args[0] as string;
            const eventType = args[1] as number;

            switch (eventType) {
            case Enum.VIR_STORAGE_POOL_EVENT_DEFINED:
            case Enum.VIR_STORAGE_POOL_EVENT_CREATED:
                logDebug(`StoragePoolEvent on ${connectionName} ${objPath}: DEFINED|CREATED`);
                storagePoolGet({ connectionName, id: objPath });
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_STOPPED:
                logDebug(`StoragePoolEvent on ${connectionName} ${objPath}: STOPPED`);
                storagePoolStopOrUndefine(connectionName, objPath);
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_STARTED:
                logDebug(`StoragePoolEvent on ${connectionName} ${objPath}: STARTED`);
                storagePoolGet({ connectionName, id: objPath, updateOnly: true });
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_UNDEFINED:
                logDebug(`StoragePoolEvent on ${connectionName} ${objPath}: UNDEFINED`);
                store.dispatch(undefineStoragePool({ connectionName, id: objPath }));
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_DELETED:
                logDebug(`StoragePoolEvent on ${connectionName} ${objPath}: DELETED`);
                // no need to handle
                break;
            default:
                logDebug(`handle StoragePoolEvent on ${connectionName}: ignoring event ${eventType}`);
            }
        }
    );

    /* Subscribe to signals on StoragePool Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.StoragePool" },
        (path, _iface, signal) => {
            switch (signal) {
            case "Refresh":
            /* These signals imply possible changes in what we display, so re-read the state */
                logDebug(`StoragePool.Refresh on ${connectionName}`);
                storagePoolGet({ connectionName, id: path });
                break;
            default:
                logDebug(`handleEvent StoragePoolEvent on ${connectionName} : ignoring event ${signal}`);
            }
        });
}

async function storagePoolStopOrUndefine(connectionName: ConnectionName, poolPath: string): Promise<void> {
    try {
        const [objPaths] = await call<[string[]]>(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListStoragePools", [0], { timeout, type: "u" });
        if (objPaths.includes(poolPath))
            await storagePoolGet({ connectionName, id: poolPath, updateOnly: true });
        else // Transient pool which got undefined when stopped
            store.dispatch(undefineStoragePool({ connectionName, id: poolPath }));
    } catch (ex) {
        console.warn("storagePoolStopOrUndefine action failed:", String(ex));
    }
}

export function getApiData({
    connectionName
} : {
    connectionName: ConnectionName
}): Promise<PromiseSettledResult<unknown>[]> {
    dbusClient(connectionName);
    startEventMonitor({ connectionName });
    return Promise.allSettled([
        domainGetAll({ connectionName }),
        storagePoolGetAll({ connectionName }),
        interfaceGetAll(),
        networkGetAll({ connectionName }),
        nodeDeviceGetAll({ connectionName }),
        getNodeMaxMemory({ connectionName }),
        getCapabilities({ connectionName }),
    ]);
}

export const initState = (): Promise<[void, void]> => Promise.all([
    getLoggedInUser(),
    getOsInfoList(),
]);

export function usageStartPolling({
    name,
    connectionName,
    id: objPath
} : {
    name: string,
    connectionName: ConnectionName,
    id: string,
}): void {
    store.dispatch(updateVm({ connectionName, name, usagePolling: true }));
    doUsagePolling(name, connectionName, objPath);
}

export function usageStopPolling({
    name,
    connectionName
} : {
    name: string,
    connectionName: ConnectionName,
}): void {
    store.dispatch(updateVm({
        connectionName,
        name,
        usagePolling: false
    }));
}
