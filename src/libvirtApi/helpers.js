/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2021 Red Hat, Inc.
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

import cockpit from 'cockpit';
import store from '../store.js';

import {
    removeVmCreateInProgress,
    clearVmUiState,
} from '../components/create-vm-dialog/uiState.js';

/* Default timeout for libvirt-dbus method calls */
export const timeout = 30000;

export const Enum = {
    VIR_DOMAIN_AFFECT_CURRENT: 0,
    VIR_DOMAIN_AFFECT_LIVE: 1,
    VIR_DOMAIN_AFFECT_CONFIG: 2,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE: 0,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT: 1,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP: 2,
    VIR_DOMAIN_UNDEFINE_MANAGED_SAVE: 1,
    VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA: 2,
    VIR_DOMAIN_UNDEFINE_NVRAM: 4,
    VIR_DOMAIN_SNAPSHOT_LIST_INTERNAL : 256,
    VIR_DOMAIN_STATS_BALLOON: 4,
    VIR_DOMAIN_SHUTOFF: 5,
    VIR_DOMAIN_STATS_VCPU: 8,
    VIR_DOMAIN_STATS_BLOCK: 32,
    VIR_DOMAIN_STATS_STATE: 1,
    VIR_DOMAIN_XML_SECURE: 1,
    VIR_DOMAIN_XML_INACTIVE: 2,
    VIR_CONNECT_LIST_DOMAINS_PERSISTENT: 4,
    VIR_CONNECT_LIST_DOMAINS_TRANSIENT: 8,
    VIR_CONNECT_LIST_INTERFACES_INACTIVE: 1,
    VIR_CONNECT_LIST_INTERFACES_ACTIVE: 2,
    VIR_CONNECT_LIST_NETWORKS_ACTIVE: 2,
    VIR_CONNECT_LIST_STORAGE_POOLS_ACTIVE: 2,
    VIR_CONNECT_LIST_STORAGE_POOLS_DIR: 64,
    VIR_STORAGE_POOL_CREATE_NORMAL: 0,
    VIR_STORAGE_POOL_DELETE_NORMAL: 0,
    // Storage Pools Event Lifecycle Type
    VIR_STORAGE_POOL_EVENT_DEFINED: 0,
    VIR_STORAGE_POOL_EVENT_UNDEFINED: 1,
    VIR_STORAGE_POOL_EVENT_STARTED: 2,
    VIR_STORAGE_POOL_EVENT_STOPPED: 3,
    VIR_STORAGE_POOL_EVENT_CREATED: 4,
    VIR_STORAGE_POOL_EVENT_DELETED: 5,
    VIR_STORAGE_POOL_EVENT_LAST: 6,
    VIR_STORAGE_VOL_DELETE_NORMAL: 0,
    VIR_STORAGE_VOL_DELETE_WITH_SNAPSHOTS: 2,
    // Networks Event Lifecycle Type
    VIR_NETWORK_EVENT_DEFINED: 0,
    VIR_NETWORK_EVENT_UNDEFINED: 1,
    VIR_NETWORK_EVENT_STARTED: 2,
    VIR_NETWORK_EVENT_STOPPED: 3,
    VIR_NETWORK_EVENT_LAST: 4,
    // Keycodes
    VIR_KEYCODE_SET_LINUX: 0,
    // Migrate
    // https://libvirt.org/html/libvirt-libvirt-domain.html#virDomainMigrateFlags
    VIR_MIGRATE_LIVE: 1,
    VIR_MIGRATE_PEER2PEER: 2,
    VIR_MIGRATE_PERSIST_DEST: 8,
    VIR_MIGRATE_UNDEFINE_SOURCE: 16,
    VIR_MIGRATE_NON_SHARED_DISK: 64,
    VIR_MIGRATE_OFFLINE: 1024,
};

/**
 * Call a Libvirt method
 */
export function call(connectionName, objectPath, iface, method, args, opts) {
    return dbusClient(connectionName).call(objectPath, iface, method, args, opts);
}

/**
 * Get Libvirt D-Bus client
 */
export function dbusClient(connectionName) {
    const clientLibvirt = {};

    if (!(connectionName in clientLibvirt) || clientLibvirt[connectionName] === null) {
        const opts = { bus: connectionName };
        if (connectionName === 'system')
            opts.superuser = 'try';
        clientLibvirt[connectionName] = cockpit.dbus("org.libvirt", opts);
    }

    return clientLibvirt[connectionName];
}

export function resolveUiState(name, connectionName) {
    const result = {
        // used just the first time vm is shown
        initiallyExpanded: false,
        initiallyOpenedConsoleTab: false,
    };

    const uiState = store.getState().ui.vms.find(vm => vm.name == name && vm.connectionName == connectionName);

    if (uiState) {
        result.initiallyExpanded = uiState.expanded;
        result.initiallyOpenedConsoleTab = uiState.openConsoleTab;

        if (uiState.installInProgress) {
            removeVmCreateInProgress(name, connectionName);
        } else {
            clearVmUiState(name, connectionName);
        }
    }

    return result;
}
