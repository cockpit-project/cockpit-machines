/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import { appState } from '../../state';

import { VMS_CONFIG } from "../../config.js";

import type { ConnectionName, UIVM } from '../../types';

const CREATE_TIMEOUT = 'CREATE_TIMEOUT';

const timeouts: Record<ConnectionName, Record<string, Record<string, number>>> = {
    session: {},
    system: {}
};

export function setVmCreateInProgress(
    name: string,
    connectionName: ConnectionName,
): void {
    appState.setUiVm(connectionName, name, { createInProgress: true });
    setupCleanupTimeout(name, connectionName, CREATE_TIMEOUT);
}

export function updateImageDownloadProgress(
    name: string,
    connectionName: ConnectionName,
    downloadProgress: string | undefined,
    settings?: Partial<UIVM>,
): void {
    appState.setUiVm(connectionName, name, { downloadProgress, ...settings });
}

export function clearVmUiState(
    name: string,
    connectionName: ConnectionName,
): void {
    // clear timeouts
    clearTimeout(name, connectionName, CREATE_TIMEOUT);
    clearSettings(name, connectionName);

    // clear state
    appState.deleteUiVm(connectionName, name);
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
