/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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

import store from '../../store.js';
import {
    addUiVm,
    updateUiVm,
    deleteUiVm,
} from '../../actions/store-actions.js';

import VMS_CONFIG from "../../config.js";

const INSTALL_TIMEOUT = 'INSTALL_TIMEOUT';
const CREATE_TIMEOUT = 'CREATE_TIMEOUT';

const timeouts = { session: {}, system: {} };

export function setVmCreateInProgress(name, connectionName, settings) {
    const vm = Object.assign({}, {
        name,
        connectionName,
        isUi: true,
        expanded: true,
        openConsoleTab: true,
        createInProgress: true,
    }, settings);

    store.dispatch(addUiVm(vm));
    setupCleanupTimeout(name, connectionName, CREATE_TIMEOUT);
}

export function setVmInstallInProgress(original_vm, settings) {
    const vm = Object.assign({}, {
        ...original_vm,
        isUi: true,
        expanded: true,
        openConsoleTab: true,
        installInProgress: true,
    }, settings);

    store.dispatch(addUiVm(vm));
    setupCleanupTimeout(original_vm.name, original_vm.connectionName, INSTALL_TIMEOUT);
}

export function updateImageDownloadProgress(name, connectionName, downloadProgress, settings) {
    const vm = Object.assign({}, {
        name,
        connectionName,
        downloadProgress,
    }, settings);
    store.dispatch(updateUiVm(vm));
}

export function finishVmCreateInProgress(name, connectionName, settings) {
    const vm = Object.assign({}, {
        name,
        connectionName,
        downloadProgress: undefined,
        createInProgress: false,
    }, settings);
    store.dispatch(updateUiVm(vm));
}

export function removeVmCreateInProgress(name, connectionName, settings) {
    if (clearTimeout(name, connectionName, CREATE_TIMEOUT)) {
        finishVmCreateInProgress(name, connectionName, settings);
    }
}

export function clearVmUiState(name, connectionName) {
    // clear timeouts
    clearTimeout(name, connectionName, CREATE_TIMEOUT);
    clearTimeout(name, connectionName, INSTALL_TIMEOUT);
    clearSettings(name, connectionName);

    // clear store state
    store.dispatch(deleteUiVm({
        name,
        connectionName,
    }));
}

function setupCleanupTimeout(name, connectionName, TIMEOUT_ID) {
    const vmTimeouts = getSettings(name, connectionName);

    vmTimeouts[TIMEOUT_ID] = window.setTimeout(() => {
        clearVmUiState(name, connectionName);
    }, VMS_CONFIG.DummyVmsWaitInterval);// 10 * 1000
}

function clearTimeout(name, connectionName, TIMEOUT_ID) {
    const vm = timeouts[connectionName][name];
    let timeout = null;
    if (vm) {
        timeout = vm[TIMEOUT_ID];
        if (timeout) {
            window.clearTimeout(timeout);
            delete vm[TIMEOUT_ID];
        }
    }
    return timeout;
}

function getSettings(name, connectionName) {
    if (!timeouts[connectionName][name]) {
        timeouts[connectionName][name] = {};
    }
    return timeouts[connectionName][name];
}

function clearSettings(name, connectionName) {
    delete timeouts[connectionName][name];
}
