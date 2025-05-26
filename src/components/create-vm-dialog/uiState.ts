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
    updateVm,
    updateUiVm,
    deleteUiVm,
} from '../../actions/store-actions.js';

import VMS_CONFIG from "../../config.js";

import type { ConnectionName, UIVM } from '../../types';

const CREATE_TIMEOUT = 'CREATE_TIMEOUT';

const timeouts: Record<ConnectionName, Record<string, Record<string, number>>> = {
    session: {},
    system: {}
};

export function setVmCreateInProgress(
    name: string,
    connectionName: ConnectionName,
    settings?: Partial<UIVM>,
): void {
    const vm: UIVM = {
        name,
        connectionName,
        isUi: true,
        expanded: true,
        openConsoleTab: true,
        createInProgress: true,
        ...settings
    };

    store.dispatch(addUiVm(vm));
    setupCleanupTimeout(name, connectionName, CREATE_TIMEOUT);
}

export function setVmInstallInProgress(
    original_vm: { name: string, connectionName: ConnectionName },
    installInProgress: boolean = true
): void {
    const vm = {
        ...original_vm,
        expanded: installInProgress,
        openConsoleTab: installInProgress,
        installInProgress,
    };

    store.dispatch(updateVm(vm));
}

export function updateImageDownloadProgress(
    name: string,
    connectionName: ConnectionName,
    downloadProgress: string | undefined,
    settings?: Partial<UIVM>,
): void {
    const vm = {
        name,
        connectionName,
        downloadProgress,
        ...settings
    };
    store.dispatch(updateUiVm(vm));
}

export function clearVmUiState(
    name: string,
    connectionName: ConnectionName,
): void {
    // clear timeouts
    clearTimeout(name, connectionName, CREATE_TIMEOUT);
    clearSettings(name, connectionName);

    // clear store state
    store.dispatch(deleteUiVm({
        name,
        connectionName,
    }));
}

function setupCleanupTimeout(
    name: string,
    connectionName: ConnectionName,
    TIMEOUT_ID: string,
): void {
    const vmTimeouts = getSettings(name, connectionName);

    vmTimeouts[TIMEOUT_ID] = window.setTimeout(() => {
        clearVmUiState(name, connectionName);
    }, VMS_CONFIG.DummyVmsWaitInterval);// 10 * 1000
}

function clearTimeout(
    name: string,
    connectionName: ConnectionName,
    TIMEOUT_ID: string,
): number | null {
    const vm = timeouts[connectionName][name];
    let timeout: number | null = null;
    if (vm) {
        timeout = vm[TIMEOUT_ID];
        if (timeout) {
            window.clearTimeout(timeout);
            delete vm[TIMEOUT_ID];
        }
    }
    return timeout;
}

function getSettings(
    name: string,
    connectionName: ConnectionName,
): Record<string, number> {
    if (!timeouts[connectionName][name]) {
        timeouts[connectionName][name] = {};
    }
    return timeouts[connectionName][name];
}

function clearSettings(
    name: string,
    connectionName: ConnectionName,
): void {
    delete timeouts[connectionName][name];
}
