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
import {
    ADD_UI_VM,
    DELETE_UI_VM,
    DELETE_UNLISTED_VMS,
    SET_CAPABILITIES,
    SET_NODE_MAX_MEMORY,
    SET_LOGGED_IN_USER,
    UNDEFINE_NETWORK,
    UNDEFINE_STORAGE_POOL,
    UNDEFINE_VM,
    UPDATE_ADD_INTERFACE,
    UPDATE_ADD_NETWORK,
    UPDATE_ADD_NODE_DEVICE,
    UPDATE_ADD_STORAGE_POOL,
    UPDATE_ADD_VM,
    UPDATE_LIBVIRT_VERSION,
    UPDATE_DOMAIN_SNAPSHOTS,
    UPDATE_OS_INFO_LIST,
    UPDATE_UI_VM,
    UPDATE_VM,
} from '../constants/store-action-types.js';

import type cockpit from "cockpit";
import type {
    ConnectionName,
    VM,
    UIVM,
    VMSnapshot,
    StoragePool,
    Network,
    NodeInterface,
    NodeDevice,
    HypervisorCapabilities,
    OSInfo,
} from '../types';

/**
 * All actions dispatchable by in the application
 */

/** --- Store action creators -----------------------------------------
 *
 *  The naming convention for action creator names is: <verb><Noun>
 *  with the present tense.
 */
export function addUiVm(vm: UIVM) {
    return {
        type: ADD_UI_VM,
        vm,
    };
}

export function deleteUiVm(vm: { connectionName: ConnectionName, name: string }) {
    return {
        type: DELETE_UI_VM,
        vm,
    };
}

export function deleteUnlistedVMs(
    connectionName: ConnectionName,
    vmNames: string[],
    vmIds: string[]
) {
    return {
        type: DELETE_UNLISTED_VMS,
        vmNames,
        vmIds,
        connectionName,
    };
}

export function setNodeMaxMemory({
    memory
} : {
    memory: number
}) {
    return {
        type: SET_NODE_MAX_MEMORY,
        payload: { memory }
    };
}

export function setCapabilities({
    capabilities
} : {
    capabilities: HypervisorCapabilities
}) {
    return {
        type: SET_CAPABILITIES,
        payload: { capabilities }
    };
}

export function setLoggedInUser({
    loggedUser
} : {
    loggedUser: cockpit.UserInfo
}) {
    return {
        type: SET_LOGGED_IN_USER,
        payload: {
            loggedUser
        }
    };
}

export function undefineNetwork({
    connectionName,
    id
} : {
    connectionName: ConnectionName,
    id: string,
}) {
    return {
        type: UNDEFINE_NETWORK,
        payload: {
            connectionName,
            id,
        }
    };
}

export function undefineStoragePool({
    connectionName,
    id
} : {
    connectionName: ConnectionName,
    id: string,
}) {
    return {
        type: UNDEFINE_STORAGE_POOL,
        payload: {
            connectionName,
            id,
        }
    };
}

export function undefineVm({
    connectionName,
    name,
    id,
    transientOnly
} : {
    connectionName: ConnectionName,
    name?: string,
    id?: string,
    transientOnly?: boolean,
}) {
    return {
        type: UNDEFINE_VM,
        name,
        id,
        connectionName,
        transientOnly,
    };
}

export function updateLibvirtVersion({
    libvirtVersion
} : {
    libvirtVersion: number
}) {
    return {
        type: UPDATE_LIBVIRT_VERSION,
        libvirtVersion,
    };
}

export function updateDomainSnapshots({
    connectionName,
    domainPath,
    snaps
} : {
    connectionName: ConnectionName,
    domainPath: string,
    snaps: VMSnapshot[] | undefined,
}) {
    return {
        type: UPDATE_DOMAIN_SNAPSHOTS,
        payload: {
            connectionName,
            domainPath,
            snaps,
        },
    };
}

export function updateOrAddInterface(props: NodeInterface) {
    return {
        type: UPDATE_ADD_INTERFACE,
        payload: { iface: props },
    };
}

export function updateOrAddNetwork(props: Partial<Network>, updateOnly?: boolean) {
    return {
        type: UPDATE_ADD_NETWORK,
        payload: { network: props, updateOnly },
    };
}

export function updateOrAddNodeDevice(props: NodeDevice) {
    return {
        type: UPDATE_ADD_NODE_DEVICE,
        payload: { nodedev: props },
    };
}

export function updateOrAddStoragePool(props: Partial<StoragePool>, updateOnly?: boolean) {
    return {
        type: UPDATE_ADD_STORAGE_POOL,
        payload: { storagePool: props, updateOnly },
    };
}

export function updateOrAddVm(props: VM) {
    return {
        type: UPDATE_ADD_VM,
        vm: props,
    };
}

export function updateOsInfoList(osInfoList: OSInfo[]) {
    return {
        type: UPDATE_OS_INFO_LIST,
        osInfoList,
    };
}

export function updateUiVm(vm: Partial<UIVM>) {
    return {
        type: UPDATE_UI_VM,
        vm,
    };
}

export function updateVm(props: Partial<VM>) {
    return {
        type: UPDATE_VM,
        vm: props,
    };
}
