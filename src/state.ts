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

import cockpit from 'cockpit';
import { EventEmitter } from 'cockpit/event';
import { superuser } from "superuser.js";

import type { ConnectionName, VM } from './types';
import {
    getApiData,
    getLibvirtVersion,
    getLoggedInUser,
    getVirtInstallCapabilities,
    getVirtXmlCapabilities,
} from "./libvirtApi/common.js";
import { domainGetAll, domainGetByName } from './libvirtApi/domain';
import {
    nodeDeviceGetAll,
} from "./libvirtApi/nodeDevice.js";
import { addNotification } from "./helpers.js";

const _ = cockpit.gettext;

async function getConnectionNames(): Promise<ConnectionName[]> {
    const loggedUser = await cockpit.user();
    // The 'root' user does not have its own qemu:///session just qemu:///system
    // https://bugzilla.redhat.com/show_bug.cgi?id=1045069
    if (loggedUser.name == "root")
        return ["system"];
    else
        return ["system", "session"];
}

interface AppStateEvents {
    changed: () => void,
}

interface VMKey {
    connectionName: ConnectionName;
    id?: string;
    name?: string;
}

function updateAtIndex<T>(input: T[], index: number, update: Partial<T>): T[] {
    return [
        ...input.slice(0, index),
        { ...input[index], ...update },
        ...input.slice(index + 1)
    ];
}

export class AppState extends EventEmitter<AppStateEvents> {
    loadingResources: boolean = true;
    systemSocketInactive: boolean = false;

    // VMs

    vms: VM[] = [];

    #findVmIndex(key: VMKey): number {
        if (key.id)
            return this.vms.findIndex(vm => vm.connectionName == key.connectionName && vm.id == key.id);
        else
            return this.vms.findIndex(vm => vm.connectionName == key.connectionName && vm.name == key.name);
    }

    updateOrAddVm(props: VM) {
        const index = this.#findVmIndex(props);
        if (index >= 0) {
            this.vms = updateAtIndex(this.vms, index, props);
        } else {
            this.vms = [...this.vms, props];
        }
        this.#update();
    }

    updateVm(key: VMKey, props: Partial<VM>) {
        const index = this.#findVmIndex(key);
        if (index >= 0) {
            this.vms = updateAtIndex(this.vms, index, props);
            this.#update();
        } else {
            console.debug(`vm ('${key.id}/${key.name}', connectionName='${key.connectionName}') not found, skipping`);
        }
    }

    undefineVm(connectionName: ConnectionName, id: string) {
        this.vms = this.vms.filter(vm => connectionName !== vm.connectionName || id != vm.id);
        this.#update();
    }

    deleteUnlistedVMs(connectionName: ConnectionName, ids: string[]) {
        this.vms = this.vms.filter(vm => (connectionName !== vm.connectionName || ids.indexOf(vm.id) >= 0));
        this.#update();
    }

    // Initialization

    #commonDataInited: boolean = false;
    #vmsInited: boolean = true;

    #update() {
        this.loadingResources = !(this.#commonDataInited && this.#vmsInited);
        console.log("UPDATE");
        this.emit("changed");
    }

    #initPromise: Promise<void> | null = null;

    init(): Promise<void> {
        if (this.#initPromise)
            return this.#initPromise;

        const doit = async () => {
            await getLoggedInUser();

            // get these in the background, it takes quite long
            getVirtInstallCapabilities();
            getVirtXmlCapabilities();

            const connectionNames = await getConnectionNames();

            await Promise.allSettled(connectionNames.map(async connectionName => {
                try {
                    await getLibvirtVersion({ connectionName });
                    const promises = await getApiData({ connectionName });
                    const errorMsgs = promises
                            .filter(promise => promise.status === 'rejected')
                            .map(promise => promise.reason.message);
                    if (errorMsgs.length > 0) {
                        addNotification({
                            text: _("Failed to fetch some resources"),
                            detail: errorMsgs.join(', ')
                        });
                    }
                    // Get the node devices in the background since
                    // they are expensive to get and not important for
                    // displaying VMs.
                    nodeDeviceGetAll({ connectionName }).catch(exc => {
                        addNotification({
                            text: "Failed to retrieve node devices",
                            detail: String(exc),
                        });
                    });
                } catch (ex) {
                    // access denied is expected for unprivileged session
                    if (connectionName !== 'system' || superuser.allowed ||
                        !(ex && typeof ex === 'object' && 'name' in ex && ex.name == 'org.freedesktop.DBus.Error.AccessDenied'))
                        console.error("Failed to get libvirt version from the dbus API:", ex);
                    /* If the API call failed on system connection and the user has superuser privileges then show the Empty state screen */
                    if (connectionName == "system")
                        this.systemSocketInactive = true;
                }
            }));

            this.#commonDataInited = true;
            this.#update();
        };

        this.#initPromise = doit();
        return this.#initPromise;
    }

    #allVmsPromise: Promise<void> | null = null;

    initAllVMs(quiet: boolean = false): Promise<void> {
        if (this.#allVmsPromise)
            return this.#allVmsPromise;

        const doit = async () => {
            const connectionNames = await getConnectionNames();
            if (!quiet)
                this.#vmsInited = false;
            this.#update();
            await Promise.allSettled(connectionNames.map(async connectionName => {
                await domainGetAll({ connectionName }); // never fails
            }));
            this.#vmsInited = true;
            this.#update();
        };

        this.#allVmsPromise = doit();
        return this.#allVmsPromise;
    }

    #vmRequested: string = "";

    async initVM(name: string, connectionName: ConnectionName) {
        const key = name + ":" + connectionName;
        if (this.#allVmsPromise || this.#vmRequested == key)
            return;
        this.#vmRequested = key;

        this.#vmsInited = false;
        this.#update();
        await domainGetByName({ connectionName, name }); // never fails
        if (this.#vmRequested == key) {
            this.#vmsInited = true;
            this.#update();
        }
    }

    // Asynchronously wait until the list of VMs has been loaded, and
    // then return it.

    async getVms(): Promise<VM[]> {
        await this.initAllVMs(true);
        return this.vms;
    }
}

export const appState = new AppState();
