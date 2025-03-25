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
import { AlertGroup } from "@patternfly/react-core/dist/esm/components/Alert";
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
import { CreateVmAction } from "./components/create-vm-dialog/createVmDialog.jsx";
import LibvirtSlate from "./components/libvirtSlate.jsx";
import { dummyVmsFilter, vmId } from "./helpers.js";
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';
import {
    getApiData,
    getLibvirtVersion,
    initState,
    usageStartPolling,
    usageStopPolling,
} from "./libvirtApi/common.js";
import { useEvent } from "hooks";
import store from './store.js';
import VMS_CONFIG from "./config.js";

const _ = cockpit.gettext;

superuser.reload_page_on_change();

function canLoggedUserConnectSession (connectionName, loggedUser) {
    return connectionName !== 'session' || loggedUser.name !== 'root';
}

async function unknownConnectionName() {
    const loggedUser = await cockpit.user();
    return Object.getOwnPropertyNames(VMS_CONFIG.Virsh.connections).filter(
        // The 'root' user does not have its own qemu:///session just qemu:///system
        // https://bugzilla.redhat.com/show_bug.cgi?id=1045069
        connectionName => canLoggedUserConnectSession(connectionName, loggedUser));
}

export const App = () => {
    const [loadingResources, setLoadingResources] = useState(true);
    const [error, setError] = useState('');
    const [systemSocketInactive, setSystemSocketInactive] = useState(false);
    const [virtualizationEnabled, setVirtualizationEnabled] = useState(true);
    const [emptyStateIgnored, setEmptyStateIgnored] = useState(() => {
        const ignored = localStorage.getItem('virtualization-disabled-ignored');
        const defaultValue = false;

        return ignored !== null ? JSON.parse(ignored) : defaultValue;
    });

    useEvent(superuser, "changed");
    useEffect(() => {
        (async () => {
            await initState();
            const connectionNames = await unknownConnectionName();

            await Promise.allSettled(connectionNames.map(async connectionName => {
                try {
                    await getLibvirtVersion({ connectionName });
                    const promises = await getApiData({ connectionName });
                    const errorMsgs = promises
                            .filter(promise => promise.status === 'rejected')
                            .map(promise => promise.reason.message);
                    setError(errorMsgs.join(', '));
                } catch (ex) {
                    // access denied is expected for unprivileged session
                    if (connectionName !== 'system' || superuser.allowed || ex.name !== 'org.freedesktop.DBus.Error.AccessDenied')
                        console.error("Failed to get libvirt version from the dbus API:", ex);
                    /* If the API call failed on system connection and the user has superuser privileges then show the Empty state screen */
                    if (connectionName == "system")
                        setSystemSocketInactive(true);
                }
                setLoadingResources(false);
            }));
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const hardwareVirtCheck = await cockpit.script(
                    "virt-host-validate qemu | grep 'Checking for hardware virtualization'");
                setVirtualizationEnabled(hardwareVirtCheck.includes('PASS'));
            } catch (ex) {
                // That line doesn't exist on some architectures, so the grep may fail
                console.debug("Failed to check for hardware virtualization:", ex);
            }
        })();
    }, []);

    if (!virtualizationEnabled && !emptyStateIgnored) {
        return (
            <Page className="no-masthead-sidebar">
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
                                    localStorage.setItem('virtualization-disabled-ignored', true);
                                }}>{_("Ignore")}</Button>
                            </EmptyStateActions>
                        </EmptyStateFooter>
                    </EmptyState>
                </PageSection>
            </Page>
        );
    } else if ((superuser.allowed && systemSocketInactive) || loadingResources) {
        return (
            <Page className="no-masthead-sidebar">
                <PageSection hasBodyWrapper={false}>
                    <LibvirtSlate loadingResources={loadingResources} />
                </PageSection>
            </Page>
        );
    } else return (
        <AppActive error={error} />
    );
};

class AppActive extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            notifications: [],
            /* Dictionary with keys being a resource's UUID and values the number of active error notifications for that resource */
            resourceHasError: {},
            path: cockpit.location.path,
            /* virt-install feature support checks */
            cloudInitSupported: undefined,
            downloadOSSupported: undefined,
            unattendedSupported: undefined,
            unattendedUserLogin: undefined,
            virtInstallAvailable: undefined,
        };
        this.onAddErrorNotification = this.onAddErrorNotification.bind(this);
        this.onDismissErrorNotification = this.onDismissErrorNotification.bind(this);
        this.getInlineNotifications = this.getInlineNotifications.bind(this);
        this.onNavigate = () => this.setState({ path: cockpit.location.path });
    }

    async componentDidMount() {
        cockpit.addEventListener("locationchanged", this.onNavigate);

        if (this.props.error)
            this.onAddErrorNotification({ text: _("Failed to fetch some resources"), detail: this.props.error });

        const check_exec = argv => cockpit.spawn(argv, { err: 'ignore' })
                .catch(() => false);

        const virtInstallAvailable = !!await check_exec(['sh', '-c', 'type virt-install']);
        this.setState({ virtInstallAvailable });
        if (virtInstallAvailable) {
            const downloadOSSupported = !!await check_exec(['virt-install', '--install=?']);
            const cloudInitSupported = !!await check_exec(['virt-install', '--cloud-init=?']);
            const unattended_out = await check_exec(['virt-install', '--unattended=?']);
            const unattendedSupported = !!unattended_out;
            const unattendedUserLogin = unattended_out?.includes('user-login');
            this.setState({ cloudInitSupported, downloadOSSupported, unattendedSupported, unattendedUserLogin });
        }
    }

    componentWillUnmount() {
        cockpit.removeEventListener("locationchanged", this.onNavigate);
    }

    /*
     * Adds a new notification object to the notifications array. It also updates
     * the error count for a specific resource.
     * @param {object} notification - The notification object to be added to the array.
     */
    onAddErrorNotification(notification) {
        const resourceHasError = Object.assign({}, this.state.resourceHasError);

        if (resourceHasError[notification.resourceId])
            resourceHasError[notification.resourceId]++;
        else
            resourceHasError[notification.resourceId] = 1;

        this.setState(prevState => ({
            notifications: prevState.notifications.concat([notification]), // append new notification to the end of array
            resourceHasError,
        }));
    }

    /*
     * Removes the notification with index notificationIndex from the notifications array.
     * It also updates the error count for a specific resource.
     * @param {int} notificationIndex - Index of the notification to be removed.
     */
    onDismissErrorNotification(notificationIndex) {
        const notifications = [...this.state.notifications];

        const resourceHasError = { ...this.state.resourceHasError };
        resourceHasError[notifications[notificationIndex].resourceId]--;

        notifications.splice(notificationIndex, 1);

        this.setState({ notifications, resourceHasError });
    }

    getInlineNotifications(notifications) {
        return notifications.map((notification, index) => (
            <InlineNotification type={notification.type || 'danger'} key={index}
                isLiveRegion
                isInline={false}
                onDismiss={() => this.onDismissErrorNotification(index)}
                text={notification.text}
                detail={notification.detail} />
        ));
    }

    render() {
        const { vms, config, storagePools, systemInfo, ui, networks, nodeDevices, interfaces } = store.getState();
        const { path, cloudInitSupported, downloadOSSupported, unattendedSupported, unattendedUserLogin, virtInstallAvailable } = this.state;
        const combinedVms = [...vms, ...dummyVmsFilter(vms, ui.vms)];
        const properties = {
            nodeMaxMemory: config.nodeMaxMemory,
            onAddErrorNotification: this.onAddErrorNotification,
            systemInfo,
            vms: combinedVms,
            cloudInitSupported,
            downloadOSSupported,
            unattendedSupported,
            unattendedUserLogin,
            virtInstallAvailable,
        };
        const createVmAction = <CreateVmAction {...properties} mode='create' />;
        const importDiskAction = <CreateVmAction {...properties} mode='import' />;
        const vmActions = <> {importDiskAction} {createVmAction} </>;
        const pathVms = path.length == 0 || (path.length > 0 && path[0] == 'vms');

        const allNotifications = this.state.notifications.length > 0 &&
            <AlertGroup isToast>
                {this.getInlineNotifications(this.state.notifications)}
            </AlertGroup>;

        if (path.length > 0 && path[0] == 'vm') {
            const vm = combinedVms.find(vm => vm.name == cockpit.location.options.name && vm.connectionName == cockpit.location.options.connection);
            if (!vm) {
                return (
                    <>
                        {allNotifications}
                        <EmptyStatePanel title={ cockpit.format(_("VM $0 does not exist on $1 connection"), cockpit.location.options.name, cockpit.location.options.connection) }
                                         action={_("Go to VMs list")}
                                         actionVariant="link"
                                         onAction={() => cockpit.location.go(["vms"])}
                                         icon={ExclamationCircleIcon} />
                    </>
                );
            } else if (vm.createInProgress) {
                return (
                    <>
                        {allNotifications}
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
            const vmNotifications = this.state.resourceHasError[vm.id]
                ? (
                    <AlertGroup isToast>
                        {this.getInlineNotifications(this.state.notifications.filter(notification => notification.resourceId == vm.id))}
                    </AlertGroup>
                )
                : undefined;
            // If vm.isUi is set we show a dummy placeholder until libvirt gets a real domain object for newly created V
            const expandedContent = (vm.isUi && !vm.id)
                ? null
                : (
                    <>
                        {vmNotifications}
                        <VmDetailsPage vm={vm} vms={combinedVms} config={config}
                            libvirtVersion={systemInfo.libvirtVersion}
                            onAddErrorNotification={this.onAddErrorNotification}
                            storagePools={(storagePools || []).filter(pool => pool && pool.connectionName == connectionName)}
                            onUsageStartPolling={() => usageStartPolling({ name: vm.name, id: vm.id, connectionName: vm.connectionName })}
                            onUsageStopPolling={() => usageStopPolling({ name: vm.name, id: vm.id, connectionName: vm.connectionName })}
                            networks={(networks || []).filter(network => network && network.connectionName == connectionName)}
                            nodeDevices={(nodeDevices || []).filter(device => device && device.connectionName == connectionName)}
                            key={vmId(vm.name)}
                        />
                    </>
                );
            return expandedContent;
        }

        return (
            <>
                {allNotifications}
                {pathVms && <HostVmsList vms={vms}
                    config={config}
                    ui={ui}
                    libvirtVersion={systemInfo.libvirtVersion}
                    storagePools={storagePools}
                    interfaces={interfaces}
                    networks={networks}
                    actions={vmActions}
                    resourceHasError={this.state.resourceHasError}
                    onAddErrorNotification={this.onAddErrorNotification} />
                }
                {path.length > 0 && path[0] == 'storages' &&
                <StoragePoolList storagePools={storagePools}
                    vms={vms}
                    loggedUser={systemInfo.loggedUser}
                    libvirtVersion={systemInfo.libvirtVersion} />
                }
                {path.length > 0 && path[0] == 'networks' &&
                <NetworkList networks={networks}
                             resourceHasError={this.state.resourceHasError} />
                }
            </>
        );
    }
}

export default App;
