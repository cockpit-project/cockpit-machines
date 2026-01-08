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

// @cockpit-ts-relaxed

import { combineReducers } from 'redux';
import { VMS_CONFIG } from "./config.js";
import { isObjectEmpty } from './helpers.js';
import {
    SET_CAPABILITIES,
    SET_VIRT_INSTALL_CAPABILITIES,
    SET_VIRT_XML_CAPABILITIES,
    SET_NODE_MAX_MEMORY,
    SET_LOGGED_IN_USER,
    UNDEFINE_NETWORK,
    UNDEFINE_STORAGE_POOL,
    UPDATE_ADD_INTERFACE,
    UPDATE_ADD_NETWORK,
    UPDATE_ADD_NODE_DEVICE,
    UPDATE_ADD_STORAGE_POOL,
} from './constants/store-action-types.js';

import type cockpit from 'cockpit';
import type {
    NodeDevice,
    NodeInterface,
    StoragePool,
    Network,
    HypervisorCapabilities,
    VirtInstallCapabilities,
    VirtXmlCapabilities,
} from './types';

// --- helpers -------------------
function getFirstIndexOfResource(state, field, value, connectionName) {
    return state.findIndex(e => {
        return e && e.connectionName === connectionName && e[field] === value;
    });
}

function replaceResource({ state, updatedResource, index }) {
    return state.slice(0, index)
            .concat(updatedResource)
            .concat(state.slice(index + 1));
}

// --- reducers ------------------
export interface Config {
    refreshInterval: number;
    nodeMaxMemory?: number;
    capabilities?: HypervisorCapabilities;
}

function config(state: Config | undefined, action): Config {
    state = state || {
        refreshInterval: VMS_CONFIG.DefaultRefreshInterval,
    };

    switch (action.type) {
    case SET_NODE_MAX_MEMORY: {
        const newState = Object.assign({}, state);
        newState.nodeMaxMemory = action.payload.memory;
        return newState;
    }
    case SET_CAPABILITIES: {
        const newState = Object.assign({}, state);
        newState.capabilities = action.payload.capabilities;
        return newState;
    }
    default:
        return state;
    }
}

function interfaces(state: NodeInterface[] | undefined, action): NodeInterface[] {
    state = state || [];

    switch (action.type) {
    case UPDATE_ADD_INTERFACE: {
        const { iface } = action.payload;

        if (isObjectEmpty(iface))
            return [...state, iface]; // initialize iface to empty object

        const connectionName = iface.connectionName;
        const index = getFirstIndexOfResource(state, 'name', iface.name, connectionName);
        if (index < 0) { // add
            const initObjIndex = state.findIndex(obj => isObjectEmpty(obj));
            if (initObjIndex >= 0)
                state.splice(initObjIndex, 1); // remove empty initial object
            return [...state, iface];
        }

        const updatedIface = Object.assign({}, state[index], iface);
        return replaceResource({ state, updatedResource: updatedIface, index });
    }
    default:
        return state;
    }
}

function networks(state: Network[] | undefined, action): Network[] {
    state = state || [];

    switch (action.type) {
    case UNDEFINE_NETWORK: {
        const { connectionName, id } = action.payload;

        return state
                .filter(network => (connectionName !== network.connectionName || id != network.id));
    }
    case UPDATE_ADD_NETWORK: {
        const { network, updateOnly } = action.payload;

        if (isObjectEmpty(network))
            return [...state, network]; // initialize network to empty object

        const connectionName = network.connectionName;
        const index = network.id
            ? getFirstIndexOfResource(state, 'id', network.id, connectionName)
            : getFirstIndexOfResource(state, 'name', network.name, connectionName);
        if (index < 0) {
            if (!updateOnly) {
                const initObjIndex = state.findIndex(obj => isObjectEmpty(obj));
                if (initObjIndex >= 0)
                    state.splice(initObjIndex, 1); // remove empty initial object
                return [...state, network];
            } else {
                return state;
            }
        }

        const updatedNetwork = Object.assign({}, state[index], network);
        return replaceResource({ state, updatedResource: updatedNetwork, index });
    }
    default:
        return state;
    }
}

function nodeDevices(state: NodeDevice[] | undefined, action): NodeDevice[] {
    state = state || [];

    switch (action.type) {
    case UPDATE_ADD_NODE_DEVICE: {
        const { nodedev } = action.payload;

        if (isObjectEmpty(nodedev))
            return [...state, nodedev]; // initialize nodedev to empty object

        const connectionName = nodedev.connectionName;
        const index = getFirstIndexOfResource(state, 'name', nodedev.name, connectionName);
        if (index < 0) { // add
            const initObjIndex = state.findIndex(obj => isObjectEmpty(obj));
            if (initObjIndex >= 0)
                state.splice(initObjIndex, 1); // remove empty initial object
            return [...state, nodedev];
        }

        const updatedNodedev = Object.assign({}, state[index], nodedev);
        return replaceResource({ state, updatedResource: updatedNodedev, index });
    }
    default:
        return state;
    }
}

interface SystemInfo {
    libvirtService: {
        name: string;
        activeState: string;
        unitState: string;
    };
    loggedUser: cockpit.UserInfo | null;
    virt_install_capabilities?: VirtInstallCapabilities;
    virt_xml_capabilities?: VirtXmlCapabilities;
}

function systemInfo(state: SystemInfo | undefined, action): SystemInfo {
    state = state || {
        libvirtService: {
            name: 'unknown',
            activeState: 'unknown',
            unitState: 'unknown',
        },
        loggedUser: null,
    };

    switch (action.type) {
    case SET_LOGGED_IN_USER: {
        return Object.assign({}, state, { loggedUser: action.payload.loggedUser });
    }
    case SET_VIRT_INSTALL_CAPABILITIES: {
        const newState = Object.assign({}, state);
        newState.virt_install_capabilities = action.payload.capabilities;
        return newState;
    }
    case SET_VIRT_XML_CAPABILITIES: {
        const newState = Object.assign({}, state);
        newState.virt_xml_capabilities = action.payload.capabilities;
        return newState;
    }
    default: // by default all reducers should return initial state on unknown actions
        return state;
    }
}

function storagePools(state: StoragePool[] | undefined, action): StoragePool[] {
    state = state || [];

    switch (action.type) {
    case UNDEFINE_STORAGE_POOL: {
        const { connectionName, id } = action.payload;

        return state
                .filter(storagePool => (connectionName !== storagePool.connectionName || id != storagePool.id));
    }
    case UPDATE_ADD_STORAGE_POOL: {
        const { storagePool, updateOnly, } = action.payload;

        if (isObjectEmpty(storagePool))
            return [...state, storagePool]; // initialize pool to empty object

        const connectionName = storagePool.connectionName;
        const index = storagePool.id
            ? getFirstIndexOfResource(state, 'id', storagePool.id, connectionName)
            : getFirstIndexOfResource(state, 'name', storagePool.name, connectionName);
        if (index < 0) {
            if (!updateOnly) {
                const initObjIndex = state.findIndex(obj => isObjectEmpty(obj));
                if (initObjIndex >= 0)
                    state.splice(initObjIndex, 1); // remove empty initial object
                return [...state, storagePool];
            } else {
                return state;
            }
        }

        const updatedStoragePool = Object.assign({}, state[index], storagePool);
        return replaceResource({ state, updatedResource: updatedStoragePool, index });
    }
    default:
        return state;
    }
}

export default combineReducers({
    config,
    interfaces,
    networks,
    nodeDevices,
    systemInfo,
    storagePools,
});
