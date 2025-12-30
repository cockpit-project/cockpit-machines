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
import React, { useState, useContext } from 'react';
import { EventEmitter } from 'cockpit/event';

import type { ConnectionName, VM } from './types';

import { AlertGroup, type AlertProps } from "@patternfly/react-core/dist/esm/components/Alert";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody, EmptyStateActions, EmptyStateFooter } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Page, PageSection, } from "@patternfly/react-core/dist/esm/components/Page";
import { Progress, ProgressMeasureLocation } from "@patternfly/react-core/dist/esm/components/Progress";
import { Content, } from "@patternfly/react-core/dist/esm/components/Content";
import { ExclamationCircleIcon, VirtualMachineIcon } from '@patternfly/react-icons';
import { superuser } from "superuser.js";
import cockpit from 'cockpit';

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { HostVmsList } from "./components/vms/hostvmslist.jsx";
import { StoragePoolList } from "./components/storagePools/storagePoolList.jsx";
import { NetworkList } from "./components/networks/networkList.jsx";
import { VmDetailsPage } from './components/vm/vmDetailsPage.jsx';
import { ConsoleCardStates } from './components/vm/consoles/consoles.jsx';
import { CreateVmAction } from "./components/create-vm-dialog/createVmDialog.jsx";
import { dummyVmsFilter, vmId, addNotification, dismissNotification } from "./helpers.js";
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';
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
import { useEvent, useOn, usePageLocation, useInit } from "hooks";
import { store } from './store.js';

const _ = cockpit.gettext;

superuser.reload_page_on_change();

async function getConnectionNames(): Promise<ConnectionName[]> {
    const loggedUser = await cockpit.user();
    // The 'root' user does not have its own qemu:///session just qemu:///system
    // https://bugzilla.redhat.com/show_bug.cgi?id=1045069
    if (loggedUser.name == "root")
        return ["system"];
    else
        return ["system", "session"];
}

export interface Notification {
    text: string;
    detail: string;
    type?: AlertProps["variant"];
    resourceId?: string;
}

function getInlineNotifications(resourceId?: string) {
    const notes = store.getState().ui.notifications.map((notification, index) => {
        if (!resourceId || notification.resourceId == resourceId) {
            return (
                <InlineNotification
                    key={index}
                    type={notification.type || 'danger'}
                    isLiveRegion
                    isInline={false}
                    onDismiss={() => dismissNotification(index)}
                    text={notification.text}
                    detail={notification.detail}
                />
            );
        } else
            return null;
    }).filter(Boolean);
    if (notes.length > 0) {
        return (
            <AlertGroup isToast>
                {notes}
            </AlertGroup>
        );
    } else
        return null;
}

interface AppStateEvents {
    changed: () => void,
}

export class AppState extends EventEmitter<AppStateEvents> {
    loadingResources: boolean = true;
    systemSocketInactive: boolean = false;
    hardwareVirtEnabled: boolean = true;

    #commonDataInited: boolean = false;
    #vmsInited: boolean = true;

    #update() {
        const loading = !(this.#commonDataInited && this.#vmsInited);
        if (loading != this.loadingResources) {
            this.loadingResources = loading;
            this.emit("changed");
        }
    }

    #initPromise: Promise<void> | null = null;

    init(): Promise<void> {
        if (this.#initPromise)
            return this.#initPromise;

        const init_connection = async (connectionName: ConnectionName) => {
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
        };

        const init_hwvirt = async () => {
            try {
                const hardwareVirtCheck = await cockpit.script(
                    "LANG=C.UTF-8 virt-host-validate qemu | grep 'Checking for hardware virtualization'");
                this.hardwareVirtEnabled = hardwareVirtCheck.includes('PASS');
            } catch (ex) {
                // That line doesn't exist on some architectures, so the grep may fail
                console.debug("Failed to check for hardware virtualization:", ex);
            }
        };

        const doit = async () => {
            await getLoggedInUser();

            // get these in the background, it takes quite long
            getVirtInstallCapabilities();
            getVirtXmlCapabilities();

            await Promise.allSettled(
                [
                    ...(await getConnectionNames()).map(init_connection),
                    init_hwvirt(),
                ]
            );

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
        return store.getState().vms;
    }
}

export const AppStateContext = React.createContext<AppState | null>(null);
export const useAppState = () => {
    const state = useContext(AppStateContext);
    cockpit.assert(state);
    return state;
};

export const App = () => {
    const state = useInit(() => new AppState());
    useOn(state, "changed");

    const [ignoreDisabledVirtualization, setIgnoreDisabledVirtualization] = useState(() => {
        const ignored = localStorage.getItem('virtualization-disabled-ignored');
        const defaultValue = false;

        return ignored !== null ? JSON.parse(ignored) : defaultValue;
    });

    useEvent(superuser, "changed");
    const { path } = usePageLocation();

    const consoleCardStates = useInit(() => new ConsoleCardStates());

    // Trigger global initializations.  When we are on the details page for a
    // single VM, only that VM is loaded.  Otherwise, all VMs are
    // loaded.  We load all VMs even when we are on the page for
    // storage pools etc, since that way we don't have to worry
    // whether or not they use the list of global VMs.

    let showVM: false | { name: string, connection: ConnectionName } = false;

    state.init();
    if (path.length > 0 && path[0] == 'vm') {
        const { name, connection } = cockpit.location.options;
        if (typeof name == "string" && (connection == "system" || connection == "session")) {
            showVM = { name, connection };
            state.initVM(name, connection);
        }
    } else {
        state.initAllVMs();
    }

    let body = null;
    if (state.loadingResources) {
        body = <AppLoading />;
    } else if (!state.hardwareVirtEnabled && !ignoreDisabledVirtualization) {
        body = <AppVirtDisabled setIgnored={setIgnoreDisabledVirtualization} />;
    } else if (superuser.allowed && state.systemSocketInactive) {
        body = <AppServiceNotRunning />;
    } else if (path.length == 0 || (path.length > 0 && path[0] == 'vms')) {
        body = <AppVMs />;
    } else if (showVM) {
        body = <AppVM consoleCardStates={consoleCardStates} {...showVM} />;
    } else if (path.length > 0 && path[0] == 'storages') {
        body = <AppStoragePools />;
    } else if (path.length > 0 && path[0] == 'networks') {
        body = <AppNetworks />;
    }

    return (
        <AppStateContext.Provider value={state}>
            {body}
        </AppStateContext.Provider>
    );
};

const AppVirtDisabled = ({
    setIgnored,
} : {
    setIgnored: (val: boolean) => void,
}) => {
    return (
        <Page className="pf-m-no-sidebar">
            <PageSection hasBodyWrapper={false}>
                <EmptyState headingLevel="h4" icon={VirtualMachineIcon} titleText={_("Hardware virtualization is disabled")} className="virtualization-disabled-empty-state">
                    <EmptyStateBody>
                        <Content>
                            <Content component="p">{_("Enable virtualization support in BIOS/EFI settings.")}</Content>
                            <Content component="p">
                                {_("Changing BIOS/EFI settings is specific to each manufacturer. It involves pressing a hotkey during boot (ESC, F1, F12, Del). Enable a setting called \"virtualization\", \"VM\", \"VMX\", \"SVM\", \"VTX\", \"VTD\". Consult your computer's manual for details.")}
                            </Content>
                        </Content>
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button id="ignore-hw-virtualization-disabled-btn" variant="secondary" onClick={() => {
                                setIgnored(true);
                                localStorage.setItem('virtualization-disabled-ignored', "true");
                            }}>{_("Ignore")}</Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            </PageSection>
        </Page>
    );
};

const AppLoading = () => {
    return (
        <Page className="pf-m-no-sidebar">
            <PageSection hasBodyWrapper={false}>
                <EmptyStatePanel title={ _("Loading resources") } loading />
            </PageSection>
        </Page>
    );
};

const AppServiceNotRunning = () => {
    return (
        <Page className="pf-m-no-sidebar">
            <PageSection hasBodyWrapper={false}>
                <EmptyStatePanel
                    icon={ ExclamationCircleIcon }
                    title={ _("Virtualization service (libvirt) is not active") }
                    action={_("Troubleshoot")}
                    actionVariant="link"
                    onAction={() => cockpit.jump("/system/services")}
                />
            </PageSection>
        </Page>
    );
};

const AppVMs = () => {
    const { vms, config, storagePools, systemInfo, ui, networks } = store.getState();

    const properties = {
        nodeMaxMemory: config.nodeMaxMemory,
        systemInfo,
        vms,
    };
    const createVmAction = <CreateVmAction {...properties} mode='create' />;
    const importDiskAction = <CreateVmAction {...properties} mode='import' />;
    const vmActions = <> {importDiskAction} {createVmAction} </>;

    return (
        <>
            {getInlineNotifications()}
            <HostVmsList
                vms={vms}
                ui={ui}
                storagePools={storagePools}
                networks={networks}
                actions={vmActions}
            />
        </>
    );
};

const AppVM = ({
    consoleCardStates,
    name,
    connection,
} : {
    consoleCardStates: ConsoleCardStates,
    name: string,
    connection: ConnectionName,
}) => {
    const { vms, config, storagePools, systemInfo, ui, networks, nodeDevices } = store.getState();
    const combinedVms = [...vms, ...dummyVmsFilter(vms, ui.vms)];

    const vm = combinedVms.find(vm => vm.name == name && vm.connectionName == connection);
    if (!vm) {
        return (
            <>
                {getInlineNotifications()}
                <EmptyStatePanel title={ cockpit.format(_("VM $0 does not exist on $1 connection"), name, connection) }
                    action={_("Go to VMs list")}
                    actionVariant="link"
                    onAction={() => cockpit.location.go(["vms"])}
                    icon={ExclamationCircleIcon} />
            </>
        );
    } else if (vm.isUi && vm.createInProgress) {
        return (
            <>
                {getInlineNotifications()}
                <EmptyStatePanel
                    title={cockpit.format(vm.downloadProgress ? _("Downloading image for VM $0") : _("Creating VM $0"), name)}
                    action={_("Go to VMs list")}
                    actionVariant="link"
                    onAction={() => cockpit.location.go(["vms"])}
                    paragraph={vm.downloadProgress && <Progress aria-label={_("Download progress")}
                                                          value={Number(vm.downloadProgress)}
                                                          measureLocation={ProgressMeasureLocation.outside} />}
                    loading={!vm.downloadProgress}
                />
            </>
        );
    }

    const connectionName = vm.connectionName;

    // If vm.isUi is set we show a dummy placeholder until libvirt gets a real domain object for newly created V
    const expandedContent = vm.isUi
        ? null
        : (
            <>
                {getInlineNotifications(vm.id)}
                <VmDetailsPage
                    vm={vm}
                    config={config}
                    consoleCardState={consoleCardStates.get(vm)}
                    libvirtVersion={systemInfo.libvirtVersion}
                    storagePools={(storagePools || []).filter(pool => pool && pool.connectionName == connectionName)}
                    networks={(networks || []).filter(network => network && network.connectionName == connectionName)}
                    nodeDevices={(nodeDevices || []).filter(device => device && device.connectionName == connectionName)}
                    key={vmId(vm.name)}
                />
            </>
        );
    return expandedContent;
};

const AppStoragePools = () => {
    const { vms, storagePools, systemInfo } = store.getState();
    cockpit.assert(systemInfo.loggedUser);

    return (
        <>
            {getInlineNotifications()}
            <StoragePoolList
                storagePools={storagePools}
                vms={vms}
                loggedUser={systemInfo.loggedUser}
                libvirtVersion={systemInfo.libvirtVersion}
            />
        </>
    );
};

const AppNetworks = () => {
    const { networks } = store.getState();

    return (
        <>
            {getInlineNotifications()}
            <NetworkList networks={networks} />;
        </>
    );
};
