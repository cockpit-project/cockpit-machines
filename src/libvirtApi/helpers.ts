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

import cockpit, { Variant } from 'cockpit';
import store from '../store.js';

import { logDebug } from '../helpers.js';

import {
    optString,
    ConnectionName,
    VM,
} from '../types';

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
    VIR_DOMAIN_DEVICE_MODIFY_FORCE: 4,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE: 0,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT: 1,
    VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP: 2,
    VIR_DOMAIN_UNDEFINE_MANAGED_SAVE: 1,
    VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA: 2,
    VIR_DOMAIN_UNDEFINE_NVRAM: 4,
    // https://libvirt.org/html/libvirt-libvirt-domain-snapshot.html
    VIR_DOMAIN_SNAPSHOT_REVERT_RUNNING: 1,
    VIR_DOMAIN_SNAPSHOT_REVERT_PAUSED: 2,
    VIR_DOMAIN_SNAPSHOT_REVERT_FORCE: 4,
    VIR_DOMAIN_SNAPSHOT_REVERT_RESET_NVRAM: 8,
    VIR_DOMAIN_SNAPSHOT_CREATE_DISK_ONLY: 16,
    VIR_DOMAIN_STATS_BALLOON: 4,
    VIR_DOMAIN_SHUTOFF: 5,
    VIR_DOMAIN_STATS_VCPU: 8,
    VIR_DOMAIN_STATS_BLOCK: 32,
    VIR_DOMAIN_STATS_STATE: 1,
    VIR_DOMAIN_XML_SECURE: 1,
    VIR_DOMAIN_XML_INACTIVE: 2,
    // https://libvirt.org/html/libvirt-libvirt-domain.html#virDomainEventType
    VIR_DOMAIN_EVENT_DEFINED: 0,
    VIR_DOMAIN_EVENT_UNDEFINED: 1,
    VIR_DOMAIN_EVENT_STARTED: 2,
    VIR_DOMAIN_EVENT_SUSPENDED: 3,
    VIR_DOMAIN_EVENT_RESUMED: 4,
    VIR_DOMAIN_EVENT_STOPPED: 5,
    VIR_DOMAIN_EVENT_SHUTDOWN: 6,
    VIR_DOMAIN_EVENT_PMSUSPENDED: 7,
    VIR_DOMAIN_EVENT_CRASHED: 8,
    VIR_DOMAIN_EVENT_LAST: 9,
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
    // Network update command
    VIR_NETWORK_UPDATE_AFFECT_CURRENT: 0,
    VIR_NETWORK_UPDATE_AFFECT_LIVE: 1,
    VIR_NETWORK_UPDATE_AFFECT_CONFIG: 2,
    VIR_NETWORK_UPDATE_COMMAND_DELETE: 2,
    VIR_NETWORK_UPDATE_COMMAND_ADD_LAST: 3,
    VIR_NETWORK_SECTION_IP_DHCP_HOST: 4,
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

/* Utilities for accessing DBus variants.  These throw errors when the
   variant does not have the exepcted signature.

   DBus variants with unexpected signatures can only result from
   programming errors and thus we don't need to provide a lot of
   context in the error messages.

   https://dbus.freedesktop.org/doc/dbus-specification.html#type-system
 */

function assert_signature(val: Variant, expected: string[]): void {
    if (!expected.includes(val.t))
        throw new Error(`Unexpected signature ${val.t}`);
}

export function get_variant_string(val: Variant): string {
    assert_signature(val, ["s"]);
    return val.v as string;
}

export function get_variant_number(val: Variant): number {
    assert_signature(val, ["y", "n", "q", "i", "u", "x", "t", "d"]);
    return val.v as number;
}

export function get_variant_boolean(val: Variant): boolean {
    assert_signature(val, ["b"]);
    return val.v as boolean;
}

export function get_variant_variant(val: Variant): Variant {
    assert_signature(val, ["v"]);
    return val.v as unknown as Variant;
}

export interface DBusProps {
    [_: string]: Variant;
}

function get_prop(props: DBusProps, name: string): Variant {
    const p = props[name];
    if (!p)
        throw new Error(`Property ${name} is missing`);
    return p;
}

export function get_string_prop(props: DBusProps, name: string): string {
    return get_variant_string(get_variant_variant(get_prop(props, name)));
}

export function get_number_prop(props: DBusProps, name: string): number {
    return get_variant_number(get_variant_variant(get_prop(props, name)));
}

export function get_boolean_prop(props: DBusProps, name: string): boolean {
    return get_variant_boolean(get_variant_variant(get_prop(props, name)));
}

/**
 * Call a Libvirt method
 */
export function call<R = void>(
    connectionName: ConnectionName,
    objectPath: string,
    iface: string,
    method: string,
    args: unknown[],
    opts: cockpit.DBusCallOptions
): Promise<R> {
    logDebug("libvirt call:", connectionName, objectPath, iface, method, JSON.stringify(args), JSON.stringify(opts));
    return dbusClient(connectionName).call(objectPath, iface, method, args, opts) as Promise<R>;
}

/**
 * Get Libvirt D-Bus client
 */
export function dbusClient(connectionName: ConnectionName): cockpit.DBusClient {
    const clientLibvirt: Record<string, cockpit.DBusClient> = {};

    if (!(connectionName in clientLibvirt) || clientLibvirt[connectionName] === null) {
        clientLibvirt[connectionName] = cockpit.dbus("org.libvirt",
                                                     {
                                                         bus: connectionName,
                                                         ...(connectionName === 'system' ? { superuser: "try" } : {})
                                                     });
    }

    return clientLibvirt[connectionName];
}

export function resolveUiState(name: optString, connectionName: ConnectionName): VM["ui"] {
    const result: VM["ui"] = {
        // used just the first time vm is shown
        initiallyExpanded: false,
        initiallyOpenedConsoleTab: false,
    };

    const uiState = store.getState().ui.vms.find(vm => vm.name == name && vm.connectionName == connectionName);

    if (uiState && name) {
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
