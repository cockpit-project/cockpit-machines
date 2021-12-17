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

import getOSListScript from "raw-loader!../getOSList.py";

import {
    undefineNetwork,
    undefineStoragePool,
    undefineVm,
    updateLibvirtVersion,
    updateOsInfoList,
    updateVm,
    setLoggedInUser,
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
    getPythonPath,
} from "../libvirtApi/domain.js";
import {
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

/**
 * Calculates disk statistics.
 * @param  {info} Object returned by GetStats method call.
 * @return {Dictionary Object}
 */
function calculateDiskStats(info) {
    const disksStats = {};

    if (!("block.count" in info))
        return;
    const count = info["block.count"].v.v;
    if (!count)
        return;

    /* Note 1: Libvirt reports disk capacity since version 1.2.18 (year 2015)
       TODO: If disk stats is required for old systems, find a way how to get
       it when 'block.X.capacity' is not present, consider various options for
       'sources'

       Note 2: Casting to string happens for return types to be same with
       results from libvirt.js file.
     */
    for (let i = 0; i < count; i++) {
        const target = info[`block.${i}.name`].v.v;
        const physical = info[`block.${i}.physical`] === undefined ? NaN : info[`block.${i}.physical`].v.v.toString();
        const capacity = info[`block.${i}.capacity`] === undefined ? NaN : info[`block.${i}.capacity`].v.v.toString();
        const allocation = info[`block.${i}.allocation`] === undefined ? NaN : info[`block.${i}.allocation`].v.v.toString();

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

function delayPollingHelper(action, timeout) {
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
function delayPolling(action, timeout) {
    timeout = timeout || getRefreshInterval(store.getState());

    if (timeout > 0 && !cockpit.hidden) {
        logDebug(`Scheduling ${timeout} ms delayed action`);
        delayPollingHelper(action, timeout);
    } else {
        // logDebug(`Skipping delayed action since refreshing is switched off`);
        window.setTimeout(() => delayPolling(action, timeout), VMS_CONFIG.DefaultRefreshInterval);
    }
}

// Undefined the VM from Redux store only if it's not transient
function domainEventUndefined(connectionName, domPath) {
    call(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListDomains", [Enum.VIR_CONNECT_LIST_DOMAINS_TRANSIENT], { timeout, type: "u" })
            .then(objPaths => {
                if (!objPaths[0].includes(domPath))
                    store.dispatch(undefineVm({ connectionName, id: domPath }));
                else
                    domainGet({ connectionName, id:domPath, updateOnly: true });
            })
            .catch(ex => console.warn("ListDomains action failed:", ex.toString()));
}

function domainEventStopped(connectionName, domPath) {
    // Transient VMs cease to exists once they are stopped. Check if VM was transient and update or undefined it
    call(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListDomains", [0], { timeout, type: "u" })
            .then(objPaths => {
                if (objPaths[0].includes(domPath))
                    domainGet({ connectionName, id:domPath, updateOnly: true });
                else // Transient vm will get undefined when stopped
                    store.dispatch(undefineVm({ connectionName, id:domPath, transientOnly: true }));
            })
            .catch(ex => console.warn("domainEventStopped action failed:", ex.toString()));
}

/**
 * Dispatch an action to initialize usage polling for Domain statistics.
 * @param  {String} name           Domain name.
 * @param  {String} connectionName D-Bus connection type; one of session/system.
 * @param  {String} objPath        D-Bus object path of the Domain we need to poll.
 * @return {Function}
 */
function doUsagePolling(name, connectionName, objPath) {
    logDebug(`doUsagePolling(${name}, ${connectionName}, ${objPath})`);

    if (!usagePollingEnabled(store.getState(), name, connectionName)) {
        logDebug(`doUsagePolling(${name}, ${connectionName}): usage polling disabled, stopping loop`);
        return;
    }
    const flags = Enum.VIR_DOMAIN_STATS_BALLOON | Enum.VIR_DOMAIN_STATS_VCPU | Enum.VIR_DOMAIN_STATS_BLOCK | Enum.VIR_DOMAIN_STATS_STATE;

    return call(connectionName, objPath, "org.libvirt.Domain", "GetStats", [flags, 0], { timeout: 5000, type: "uu" })
            .then(info => {
                if (Object.getOwnPropertyNames(info[0]).length > 0) {
                    info = info[0];
                    const props = { name, connectionName, id: objPath };
                    let avgvCpuTime = 0;

                    if ("balloon.rss" in info)
                        props.rssMemory = info["balloon.rss"].v.v;
                    else if ("state.state" in info && info["state.state"].v.v == Enum.VIR_DOMAIN_SHUTOFF)
                        props.rssMemory = 0.0;
                    for (let i = 0; i < info["vcpu.maximum"].v.v; i++) {
                        if (!(`vcpu.${i}.time` in info))
                            continue;
                        avgvCpuTime += info[`vcpu.${i}.time`].v.v;
                    }
                    avgvCpuTime /= info["vcpu.current"].v.v;
                    if (info["vcpu.current"].v.v > 0)
                        Object.assign(props, {
                            actualTimeInMs: Date.now(),
                            cpuTime: avgvCpuTime
                        });
                    Object.assign(props, {
                        disksStats: calculateDiskStats(info)
                    });

                    logDebug(`doUsagePolling: ${JSON.stringify(props)}`);
                    store.dispatch(updateVm(props));
                }
            })
            .catch(ex => console.warn(`GetStats(${name}, ${connectionName}) failed: ${ex.toString()}`))
            .finally(() => delayPolling(() => doUsagePolling(name, connectionName, objPath), null, name, connectionName));
}

function getLoggedInUser() {
    logDebug(`GET_LOGGED_IN_USER:`);
    return cockpit.user().then(loggedUser => {
        store.dispatch(setLoggedInUser({ loggedUser }));
    });
}

export function getLibvirtVersion({ connectionName }) {
    return call(connectionName, "/org/libvirt/QEMU", "org.freedesktop.DBus.Properties", "Get", ["org.libvirt.Connect", "LibVersion"], { timeout, type: "ss" })
            .then(version => store.dispatch(updateLibvirtVersion({ libvirtVersion: version[0].v })));
}

function getNodeMaxMemory({ connectionName }) {
    // Some nodes don"t return all memory in just one cell.
    // Using -1 == VIR_NODE_MEMORY_STATS_ALL_CELLS will return memory across all cells
    return call(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "NodeGetMemoryStats", [-1, 0], { timeout, type: "iu" })
            .then(stats => store.dispatch(setNodeMaxMemory({ memory: stats[0].total })))
            .catch(ex => {
                console.warn("NodeGetMemoryStats failed: %s", ex);
                return Promise.reject(ex);
            });
}

function getOsInfoList () {
    logDebug(`GET_OS_INFO_LIST():`);
    return python.spawn(getOSListScript, null, { err: "message", environ: ['LC_ALL=C.UTF-8'] })
            .then(osList => {
                parseOsInfoList(osList);
            })
            .catch(ex => {
                console.error(`get os list returned error: "${JSON.stringify(ex)}"`);
                parseOsInfoList('[]');
            });
}

function networkUpdateOrDelete(connectionName, netPath) {
    call(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListNetworks", [0], { timeout, type: "u" })
            .then(objPaths => {
                if (objPaths[0].includes(netPath))
                    networkGet({ connectionName, id:netPath, updateOnly: true });
                else // Transient network which got undefined when stopped
                    store.dispatch(undefineNetwork({ connectionName, id:netPath }));
            })
            .catch(ex => console.warn("networkUpdateOrDelete action failed:", ex.toString()));
}

function parseOsInfoList(osList) {
    const osinfodata = JSON.parse(osList);

    store.dispatch(updateOsInfoList(osinfodata.filter(os => os.shortId)));
}

/**
 * Subscribe to D-Bus signals and defines the handlers to be invoked in each occasion.
 * @param  {String} connectionName D-Bus connection type; one of session/system.
 */
function startEventMonitor({ connectionName }) {
    if (connectionName !== "session" && connectionName !== "system")
        return;

    /* Handlers for domain events */
    startEventMonitorDomains(connectionName);

    /* Handlers for network events */
    startEventMonitorNetworks(connectionName);

    /* Handlers for storage pool events */
    startEventMonitorStoragePools(connectionName);
}

function startEventMonitorDomains(connectionName) {
    /* Subscribe to Domain Lifecycle signals on Connect Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "DomainEvent" },
        (path, iface, signal, args) => {
            const domainEvent = {
                Defined: 0,
                Undefined: 1,
                Started: 2,
                Suspended: 3,
                Resumed: 4,
                Stopped: 5,
                Shutdown: 6,
                PMsuspended: 7,
                Crashed: 8
            };
            const objPath = args[0];
            const eventType = args[1];

            logDebug(`signal on ${path}: ${iface}.${signal}(${JSON.stringify(args)})`);

            switch (eventType) {
            case domainEvent.Defined:
                domainGet({ connectionName, id:objPath });
                break;

            case domainEvent.Undefined:
                domainEventUndefined(connectionName, objPath);
                break;

            case domainEvent.Started:
                domainGet({ connectionName, id:objPath });
                break;

            case domainEvent.Suspended:
                store.dispatch(updateVm({
                    connectionName,
                    id: objPath,
                    state: "paused"
                }));
                break;

            case domainEvent.Resumed:
                store.dispatch(updateVm({
                    connectionName,
                    id: objPath,
                    state: "running"
                }));
                break;

            case domainEvent.Stopped:
                domainEventStopped(connectionName, objPath);
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
                domainGet({ connectionName, id:path, updateOnly: true });
                break;

            default:
                logDebug(`handle DomainEvent on ${connectionName}: ignoring event ${signal}`);
            }
        });
}

function startEventMonitorNetworks(connectionName) {
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "NetworkEvent" },
        (path, iface, signal, args) => {
            const objPath = args[0];
            const eventType = args[1];

            switch (eventType) {
            case Enum.VIR_NETWORK_EVENT_DEFINED:
            case Enum.VIR_NETWORK_EVENT_STARTED:
                networkGet({ connectionName, id:objPath });
                break;
            case Enum.VIR_NETWORK_EVENT_STOPPED:
                networkUpdateOrDelete(connectionName, objPath);
                break;
            case Enum.VIR_NETWORK_EVENT_UNDEFINED:
                store.dispatch(undefineNetwork({ connectionName, id:objPath }));
                break;
            default:
                logDebug(`handle Network on ${connectionName}: ignoring event ${signal}`);
            }
        }
    );

    /* Subscribe to signals on Network Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Network" },
        (path, iface, signal, args) => {
            switch (signal) {
            case "Refresh":
            /* These signals imply possible changes in what we display, so re-read the state */
                networkGet({ connectionName, id:path });
                break;
            default:
                logDebug(`handleEvent Network on ${connectionName} : ignoring event ${signal}`);
            }
        });
}

function startEventMonitorStoragePools(connectionName) {
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.Connect", member: "StoragePoolEvent" },
        (path, iface, signal, args) => {
            const objPath = args[0];
            const eventType = args[1];

            switch (eventType) {
            case Enum.VIR_STORAGE_POOL_EVENT_DEFINED:
            case Enum.VIR_STORAGE_POOL_EVENT_CREATED:
                storagePoolGet({ connectionName, id:objPath });
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_STOPPED:
                storagePoolUpdateOrDelete(connectionName, objPath);
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_STARTED:
                storagePoolGet({ connectionName, id:objPath, updateOnly: true });
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_UNDEFINED:
                store.dispatch(undefineStoragePool({ connectionName, id:objPath }));
                break;
            case Enum.VIR_STORAGE_POOL_EVENT_DELETED:
            default:
                logDebug(`handle StoragePoolEvent on ${connectionName}: ignoring event ${signal}`);
            }
        }
    );

    /* Subscribe to signals on StoragePool Interface */
    dbusClient(connectionName).subscribe(
        { interface: "org.libvirt.StoragePool" },
        (path, iface, signal, args) => {
            switch (signal) {
            case "Refresh":
            /* These signals imply possible changes in what we display, so re-read the state */
                storagePoolGet({ connectionName, id:path });
                break;
            default:
                logDebug(`handleEvent StoragePoolEvent on ${connectionName} : ignoring event ${signal}`);
            }
        });
}

function storagePoolUpdateOrDelete(connectionName, poolPath) {
    call(connectionName, "/org/libvirt/QEMU", "org.libvirt.Connect", "ListStoragePools", [0], { timeout, type: "u" })
            .then(objPaths => {
                if (objPaths[0].includes(poolPath))
                    storagePoolGet({ connectionName, id:poolPath, updateOnly: true });
                else // Transient pool which got undefined when stopped
                    store.dispatch(undefineStoragePool({ connectionName, id:poolPath }));
            })
            .catch(ex => console.warn("storagePoolUpdateOrDelete action failed:", ex.toString()));
}

export function getApiData({ connectionName }) {
    dbusClient(connectionName);
    startEventMonitor({ connectionName });
    return Promise.allSettled([
        domainGetAll({ connectionName }),
        storagePoolGetAll({ connectionName }),
        interfaceGetAll({ connectionName }),
        networkGetAll({ connectionName }),
        nodeDeviceGetAll({ connectionName }),
        getNodeMaxMemory({ connectionName }),
    ]);
}

export function initState() {
    getPythonPath();
    getLoggedInUser();
    getOsInfoList();
}

export function usageStartPolling({
    name,
    connectionName,
    id: objPath
}) {
    store.dispatch(updateVm({ connectionName, name, usagePolling: true }));
    doUsagePolling(name, connectionName, objPath);
}

export function usageStopPolling({
    name,
    connectionName
}) {
    return store.dispatch(updateVm({
        connectionName,
        name,
        usagePolling: false
    }));
}
