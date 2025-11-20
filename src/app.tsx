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
import React, { useState, useEffect } from 'react';

import type { ConnectionName } from './types';

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
import HostVmsList from "./components/vms/hostvmslist.jsx";
import { StoragePoolList } from "./components/storagePools/storagePoolList.jsx";
import { NetworkList } from "./components/networks/networkList.jsx";
import { VmDetailsPage } from './components/vm/vmDetailsPage.jsx';
import { ConsoleCardStates } from './components/vm/consoles/consoles.jsx';
import { CreateVmAction } from "./components/create-vm-dialog/createVmDialog.jsx";
import LibvirtSlate from "./components/libvirtSlate.jsx";
import { dummyVmsFilter, vmId, addNotification, dismissNotification } from "./helpers.js";
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';
import {
    getApiData,
    getLibvirtVersion,
    getLoggedInUser,
    getVirtXmlCapabilities,
} from "./libvirtApi/common.js";
import {
    nodeDeviceGetAll,
} from "./libvirtApi/nodeDevice.js";
import { useEvent } from "hooks";
import store from './store.js';

const _ = cockpit.gettext;

superuser.reload_page_on_change();

async function unknownConnectionName(): Promise<ConnectionName[]> {
    const loggedUser = await cockpit.user();
    // The 'root' user does not have its own qemu:///session just qemu:///system
    // https://bugzilla.redhat.com/show_bug.cgi?id=1045069
    if (loggedUser.name == "root")
        return ["system"];
    else
        return ["system", "session"];
}

export const App = () => {
    const [loadingResources, setLoadingResources] = useState(true);
    const [error, setError] = useState('');
    const [systemSocketInactive, setSystemSocketInactive] = useState(false);
    const [systemSocketAvailable, setSystemSocketAvailable] = useState(false);
    const [virtualizationEnabled, setVirtualizationEnabled] = useState(true);
    const [emptyStateIgnored, setEmptyStateIgnored] = useState(() => {
        const ignored = localStorage.getItem('virtualization-disabled-ignored');
        const defaultValue = false;

        return ignored !== null ? JSON.parse(ignored) : defaultValue;
    });

    useEvent(superuser, "changed");
    useEffect(() => {
        (async () => {
            await getLoggedInUser();
            getVirtXmlCapabilities(); // get these in the background, it takes quite long
            const connectionNames = await unknownConnectionName();

            await Promise.allSettled(connectionNames.map(async connectionName => {
                try {
                    await getLibvirtVersion({ connectionName });
                    const promises = await getApiData({ connectionName });
                    const errorMsgs = promises
                            .filter(promise => promise.status === 'rejected')
                            .map(promise => promise.reason.message);
                    setError(errorMsgs.join(', '));
                    // Get the node devices in the background since
                    // they are expensive to get and not important for
                    // displaying VMs.
                    nodeDeviceGetAll({ connectionName }).catch(exc => {
                        addNotification({
                            text: "Failed to retrieve node devices",
                            detail: String(exc),
                        });
                    });
                    if (connectionName == "system")
                        setSystemSocketAvailable(true);
                } catch (ex) {
                    // access denied is expected for unprivileged session
                    if (connectionName !== 'system' || superuser.allowed ||
                        !(ex && typeof ex === 'object' && 'name' in ex && ex.name == 'org.freedesktop.DBus.Error.AccessDenied'))
                        console.error("Failed to get libvirt version from the dbus API:", ex);
                    /* If the API call failed on system connection and the user has superuser privileges then show the Empty state screen */
                    if (connectionName == "system")
                        setSystemSocketInactive(true);
                }
            }));
            setLoadingResources(false);
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const hardwareVirtCheck = await cockpit.script(
                    "LANG=C.UTF-8 virt-host-validate qemu | grep 'Checking for hardware virtualization'");
                setVirtualizationEnabled(hardwareVirtCheck.includes('PASS'));
            } catch (ex) {
                // That line doesn't exist on some architectures, so the grep may fail
                console.debug("Failed to check for hardware virtualization:", ex);
            }
        })();
    }, []);

    if (!virtualizationEnabled && !emptyStateIgnored) {
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
                                    setEmptyStateIgnored(true);
                                    localStorage.setItem('virtualization-disabled-ignored', "true");
                                }}>{_("Ignore")}</Button>
                            </EmptyStateActions>
                        </EmptyStateFooter>
                    </EmptyState>
                </PageSection>
            </Page>
        );
    } else if ((superuser.allowed && systemSocketInactive) || loadingResources) {
        return (
            <Page className="pf-m-no-sidebar">
                <PageSection hasBodyWrapper={false}>
                    <LibvirtSlate loadingResources={loadingResources} />
                </PageSection>
            </Page>
        );
    } else return (
        <AppActive error={error} systemSocketAvailable={systemSocketAvailable} />
    );
};

export interface Notification {
    text: string;
    detail: string;
    type?: AlertProps["variant"];
    resourceId?: string;
}

interface AppActiveProps {
    error: string;
    systemSocketAvailable: boolean;
}

interface AppActiveState {
    path: string[],
    /* virt-install feature support checks */
    cloudInitSupported: boolean | undefined,
    downloadOSSupported: boolean | undefined,
    unattendedSupported: boolean | undefined,
    unattendedUserLogin: boolean | undefined,
    virtInstallAvailable: boolean | undefined,
}

class AppActive extends React.Component<AppActiveProps, AppActiveState> {
    onNavigate: () => void;
    consoleCardStates: ConsoleCardStates;

    constructor(props: AppActiveProps) {
        super(props);
        this.state = {
            path: cockpit.location.path,
            /* virt-install feature support checks */
            cloudInitSupported: undefined,
            downloadOSSupported: undefined,
            unattendedSupported: undefined,
            unattendedUserLogin: undefined,
            virtInstallAvailable: undefined,
        };
        this.getInlineNotifications = this.getInlineNotifications.bind(this);
        this.onNavigate = () => this.setState({ path: cockpit.location.path });

        this.consoleCardStates = new ConsoleCardStates();
    }

    async componentDidMount() {
        cockpit.addEventListener("locationchanged", this.onNavigate);

        if (this.props.error)
            addNotification({ text: _("Failed to fetch some resources"), detail: this.props.error });

        const check_exec = (argv: string[]): Promise<string | false> => cockpit.spawn(argv, { err: 'ignore' })
                .catch(() => false);

        const virtInstallAvailable = !!await check_exec(['sh', '-c', 'type virt-install']);
        this.setState({ virtInstallAvailable });
        if (virtInstallAvailable) {
            const downloadOSSupported = !!await check_exec(['virt-install', '--install=?']);
            const cloudInitSupported = !!await check_exec(['virt-install', '--cloud-init=?']);
            const unattended_out = await check_exec(['virt-install', '--unattended=?']);
            const unattendedSupported = !!unattended_out;
            const unattendedUserLogin = unattendedSupported && unattended_out.includes('user-login');
            this.setState({ cloudInitSupported, downloadOSSupported, unattendedSupported, unattendedUserLogin });
        }
    }

    componentWillUnmount() {
        cockpit.removeEventListener("locationchanged", this.onNavigate);
    }

    getInlineNotifications(resourceId?: string) {
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

    render() {
        const { vms, config, storagePools, systemInfo, ui, networks, nodeDevices } = store.getState();
        const { path, cloudInitSupported, downloadOSSupported, unattendedSupported, unattendedUserLogin, virtInstallAvailable } = this.state;
        const combinedVms = [...vms, ...dummyVmsFilter(vms, ui.vms)];
        const properties = {
            nodeMaxMemory: config.nodeMaxMemory,
            systemInfo,
            vms,
            cloudInitSupported,
            downloadOSSupported,
            unattendedSupported,
            unattendedUserLogin,
            virtInstallAvailable,
            systemSocketAvailable: this.props.systemSocketAvailable,
        };
        const createVmAction = <CreateVmAction {...properties} mode='create' />;
        const importDiskAction = <CreateVmAction {...properties} mode='import' />;
        const vmActions = <> {importDiskAction} {createVmAction} </>;
        const pathVms = path.length == 0 || (path.length > 0 && path[0] == 'vms');

        if (path.length > 0 && path[0] == 'vm') {
            const vm = combinedVms.find(vm => vm.name == cockpit.location.options.name && vm.connectionName == cockpit.location.options.connection);
            if (!vm) {
                return (
                    <>
                        {this.getInlineNotifications()}
                        <EmptyStatePanel title={ cockpit.format(_("VM $0 does not exist on $1 connection"), cockpit.location.options.name, cockpit.location.options.connection) }
                                         action={_("Go to VMs list")}
                                         actionVariant="link"
                                         onAction={() => cockpit.location.go(["vms"])}
                                         icon={ExclamationCircleIcon} />
                    </>
                );
            } else if (vm.isUi && vm.createInProgress) {
                return (
                    <>
                        {this.getInlineNotifications()}
                        <EmptyStatePanel title={cockpit.format(vm.downloadProgress ? _("Downloading image for VM $0") : _("Creating VM $0"), cockpit.location.options.name)}
                                         action={_("Go to VMs list")}
                                         actionVariant="link"
                                         onAction={() => cockpit.location.go(["vms"])}
                                         paragraph={vm.downloadProgress && <Progress aria-label={_("Download progress")}
                                                                                     value={Number(vm.downloadProgress)}
                                                                                     measureLocation={ProgressMeasureLocation.outside} />}
                                         loading />
                    </>
                );
            }

            const connectionName = vm.connectionName;

            // If vm.isUi is set we show a dummy placeholder until libvirt gets a real domain object for newly created V
            const expandedContent = vm.isUi
                ? null
                : (
                    <>
                        {this.getInlineNotifications(vm.id)}
                        <VmDetailsPage vm={vm} vms={vms} config={config}
                            consoleCardState={this.consoleCardStates.get(vm)}
                            libvirtVersion={systemInfo.libvirtVersion}
                            storagePools={(storagePools || []).filter(pool => pool && pool.connectionName == connectionName)}
                            networks={(networks || []).filter(network => network && network.connectionName == connectionName)}
                            nodeDevices={(nodeDevices || []).filter(device => device && device.connectionName == connectionName)}
                            key={vmId(vm.name)}
                        />
                    </>
                );
            return expandedContent;
        }

        const loggedUser = systemInfo.loggedUser;

        return (
            <>
                {this.getInlineNotifications()}
                {pathVms && <HostVmsList vms={vms}
                    ui={ui}
                    storagePools={storagePools}
                    networks={networks}
                    actions={vmActions} />
                }
                {path.length > 0 && path[0] == 'storages' && loggedUser &&
                <StoragePoolList storagePools={storagePools}
                    vms={vms}
                    loggedUser={loggedUser}
                    libvirtVersion={systemInfo.libvirtVersion} />
                }
                {path.length > 0 && path[0] == 'networks' &&
                <NetworkList networks={networks} />
                }
            </>
        );
    }
}

export default App;
