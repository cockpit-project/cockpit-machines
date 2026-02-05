/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2016 Red Hat, Inc.
 */

import React, { useState, useEffect } from 'react';
import cockpit from 'cockpit';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar";
import { Select, SelectList, SelectOption } from "@patternfly/react-core/dist/esm/components/Select";
import { MenuToggle, MenuToggleElement } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page";
import { WithDialogs } from 'dialogs.jsx';

import { Progress, ProgressVariant } from "@patternfly/react-core/dist/esm/components/Progress";

import { CreateVmModal } from '../create-vm-dialog/createVmDialog.jsx';

import { VmActions } from '../vm/vmActions.jsx';

import { vmId, rephraseUI, dummyVmsFilter, DOMAINSTATE } from "../../helpers.js";

import { ListingTable, type ListingTableColumnProps } from "cockpit-components-table.jsx";
import { StateIcon } from '../common/stateIcon.jsx';
import { VmNeedsShutdown } from '../common/needsShutdown.jsx';
import { VmUsesSpice } from '../vm/usesSpice.jsx';
import { AggregateStatusCards } from "../aggregateStatusCards.jsx";
import { appState } from "../../state";
import { ensureUsagePolling } from '../../libvirtApi/common';
import { useOn, usePageLocation } from "hooks";

import { VMS_CONFIG } from "../../config.js";

import type {
    VM,
    UIVM,
    StoragePool,
    Network,
} from '../../types';

import "./hostvmslist.scss";

const VmState = ({
    vm,
    vms,
} : {
    vm: VM | UIVM,
    vms: VM[],
}) => {
    let state = "";

    if (vm.isUi) {
        if (vm.downloadProgress) {
            state = cockpit.format(_("Downloading: $0%"), vm.downloadProgress);
        } else if (vm.createInProgress) {
            state = _("Creating VM");
        }
    } else {
        state = vm.state;
    }

    const dismissError = () => {
        if (vm.isUi)
            appState.setUiVm(vm.connectionName, vm.name, { error: undefined });
        else
            appState.updateVm(vm, { error: null });
    };

    return (
        <StateIcon dismissError={dismissError}
            error={vm.error}
            state={state}
            valueId={`${vmId(vm.name)}-${vm.connectionName}-state`}
            additionalState={!vm.isUi && <><VmNeedsShutdown vm={vm} /><VmUsesSpice vm={vm} vms={vms} /></>} />
    );
};

const VmUsageCpu = ({ vm } : {vm: VM | UIVM, }) => {
    if (vm.isUi || vm.state != "running")
        return null;

    const vmCpuUsage: number = vm.cpuUsage ? vm.cpuUsage : 0;
    const cpuUsage = vm.cpuUsage && isNaN(vmCpuUsage) ? 0 : parseFloat(vmCpuUsage.toFixed(1));

    return (
        <Progress value={cpuUsage}
            aria-label={_("CPU")}
            className="pf-m-bg ct-simple-percentage-progress"
            min={0} max={100}
            variant={cpuUsage > 90 ? ProgressVariant.danger : undefined}

        />
    );
};

const VmUsageMem = ({ vm } : {vm: VM | UIVM, }) => {
    if (vm.isUi || vm.state != "running" || vm.memoryUsed === undefined)
        return null;

    const memTotal = vm.currentMemory ? vm.currentMemory * 1024 : 0;
    const memUsed = vm.memoryUsed * 1024;

    return (
        <Progress value={memUsed}
            aria-label={_("Memory")}
            className="pf-m-bg ct-simple-percentage-progress"
            min={0} max={memTotal}
            variant={memUsed / memTotal > 0.9 ? ProgressVariant.danger : undefined}
        />
    );
};

const _ = cockpit.gettext;

/**
 * Component that renders the Create/Import VM dialog when URL parameters are present.
 * Uses declarative rendering based on URL state (the URL is the single source of truth).
 *
 * Supported URL formats:
 * - Import VM: /machines#?action=import&source=/path/to/disk.qcow2&os=fedora40&name=my-vm
 * - Create VM: /machines#?action=create&name=my-vm&type=url&source=http://example.com/install.iso&os=fedora40
 *
 * Parameters:
 * - action: 'import' or 'create' (required)
 * - name: VM name (optional)
 * - os: OS shortId like 'fedora40', 'rhel9.4' (optional)
 * - source: disk image path (import) or installation source URL/path (create)
 * - type: source type - 'os', 'url', 'file', 'cloud', 'pxe' (create only)
 */
const CreateVmDialogOpener = ({ vms }: { vms: VM[] }) => {
    // Subscribe to appState changes (for virtInstallCapabilities)
    useOn(appState, "changed");

    // Subscribe to URL changes - re-renders when location changes
    const { options } = usePageLocation();

    const vi_caps = appState.virtInstallCapabilities;
    const action = options.action;

    // Determine if dialog should be shown
    const showDialog = (action === 'import' || action === 'create') &&
                       vi_caps?.virtInstallAvailable;

    if (!showDialog) return null;

    // Parse URL parameters
    const mode = action === 'import' ? 'import' : 'create';
    const initialName = typeof options.name === 'string' ? options.name : undefined;
    const initialOS = typeof options.os === 'string' ? options.os : undefined;
    const initialSource = typeof options.source === 'string' ? options.source : undefined;
    const initialSourceType = action === 'create' && typeof options.type === 'string'
        ? options.type
        : undefined;

    // Close handler clears URL parameters
    const handleClose = () => {
        cockpit.location.replace(cockpit.location.path, {});
    };

    // Generate key from URL params to force re-mount when params change
    const dialogKey = `${action}-${options.name}-${options.os}-${options.source}-${options.type}`;

    return (
        <CreateVmModal
            key={dialogKey}
            mode={mode}
            onClose={handleClose}
            nodeMaxMemory={appState.nodeMaxMemory}
            vms={vms}
            cloudInitSupported={vi_caps.cloudInitSupported}
            downloadOSSupported={vi_caps.downloadOSSupported}
            unattendedSupported={vi_caps.unattendedSupported}
            unattendedUserLogin={vi_caps.unattendedUserLogin}
            initialSource={initialSource}
            initialOS={initialOS}
            initialName={initialName}
            initialSourceType={initialSourceType}
        />
    );
};

/**
 * List of all VMs defined on this host
 */
interface HostVmsListProps {
    vms: VM[],
    uivms: UIVM[],
    storagePools: StoragePool[],
    actions: React.ReactNode,
    networks: Network[],
}

export const HostVmsList = ({
    vms,
    uivms,
    storagePools,
    actions,
    networks,
}: HostVmsListProps) => {
    interface StateFilter {
        value: string;
        apiState?: string;
    }

    const showUsage = vms.length <= VMS_CONFIG.MaxPolledVMs;

    useEffect(() => {
        if (showUsage)
            ensureUsagePolling(true);
        return () => {
            ensureUsagePolling(false);
        };
    }, [showUsage]);

    const [statusSelected, setStatusSelected] = useState<StateFilter>({ value: _("All") });
    const [currentTextFilter, setCurrentTextFilter] = useState("");
    const [statusIsExpanded, setStatusIsExpanded] = useState(false);
    const combinedVms = [...vms, ...dummyVmsFilter(vms, uivms)];
    const combinedVmsFiltered = combinedVms
            // searching VM should be case insensitive
            .filter(vm => vm.name && vm.name.toUpperCase().indexOf(currentTextFilter.toUpperCase()) != -1 && (!statusSelected.apiState || (!vm.isUi && statusSelected.apiState == vm.state)));

    const sortFunction = (vmA: VM | UIVM, vmB: VM | UIVM) => vmA.name.localeCompare(vmB.name);

    let domainStates: string[] = DOMAINSTATE.filter(state => vms.some(vm => vm.state === state));
    const prioritySorting: Record<string, number | undefined> = { // Put running, shut off and divider at top of the list. The lower the value, the bigger priority it has
        running: -3,
        "shut off": -2,
        _divider: -1,
    };
    if (domainStates.some(e => ["running", "shut off"].includes(e)) && domainStates.some(e => !["running", "shut off"].includes(e)))
        domainStates = domainStates.concat(["_divider"]);
    const sortOptions: StateFilter[] = [{ value: _("All") }]
            .concat(domainStates
                    .map(state => { return { value: rephraseUI('resourceStates', state), apiState: state } })
                    .sort((a, b) => (prioritySorting[a.apiState] || 0) - (prioritySorting[b.apiState] || 0) || a.value.localeCompare(b.value)));

    const toggle = (toggleRef: React.LegacyRef<MenuToggleElement>) => (
        <MenuToggle
            ref={toggleRef}
            id="vm-state-select-toggle"
            onClick={() => setStatusIsExpanded(!statusIsExpanded)}
            isExpanded={statusIsExpanded}
            isFullWidth
        >
            {statusSelected.value}
        </MenuToggle>);

    const toolBar = (
        <Toolbar>
            <ToolbarContent>
                <ToolbarItem alignSelf="baseline">
                    <TextInput name="text-search" id="text-search" type="search"
                    value={currentTextFilter}
                    onChange={(_, currentTextFilter) => setCurrentTextFilter(currentTextFilter)}
                    placeholder={_("Filter by name")} />
                </ToolbarItem>
                {domainStates.length > 1 && <>
                    <ToolbarItem alignSelf="baseline" variant="label" id="vm-state-select">
                        {_("State")}
                    </ToolbarItem>
                    <ToolbarItem alignSelf="baseline">
                        <Select
                          id="vm-state-menu"
                          isOpen={statusIsExpanded}
                          selected={statusSelected}
                          toggle={toggle}
                          onOpenChange={isOpen => setStatusIsExpanded(isOpen)}
                          onSelect={(_, selection) => {
                              setStatusIsExpanded(false);
                              // HACK - https://github.com/patternfly/patternfly-react/issues/11361
                              setStatusSelected(selection as unknown as StateFilter);
                          }}
                          aria-labelledby="vm-state-select"
                        >
                            <SelectList>
                                {sortOptions.map((option, index) => (
                                    option.apiState === "_divider"
                                        ? <Divider component="li" key={index} />
                                        : <SelectOption key={index} value={option}>{option.value}</SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                </>}
                <ToolbarItem alignSelf="baseline" variant="separator" />
                <ToolbarItem alignSelf="baseline">{actions}</ToolbarItem>
            </ToolbarContent>
        </Toolbar>
    );

    const usageColumns: ListingTableColumnProps[] =
          showUsage
              ? [
                  { title: _("CPU"), props: { width: 15 } },
                  { title: _("Memory"), props: { width: 15 } },
              ]
              : [];

    return (
        <WithDialogs key="vms-list">
            <CreateVmDialogOpener vms={vms} />
            <Page className="pf-m-no-sidebar">
                <PageSection hasBodyWrapper={false}>
                    <Gallery className="ct-cards-grid" hasGutter>
                        <AggregateStatusCards networks={networks} storagePools={storagePools} />
                        <Card isPlain id='virtual-machines-listing'>
                            <CardHeader actions={{ actions: toolBar }}>
                                <CardTitle component="h2">{_("Virtual machines")}</CardTitle>
                            </CardHeader>
                            <ListingTable aria-label={_("Virtual machines")}
                                variant='compact'
                                columns={[
                                    { title: _("Name"), header: true, props: { width: 20 } },
                                    { title: _("Connection"), props: { width: 20 } },
                                    { title: _("State"), props: { width: 15 } },
                                    ...usageColumns,
                                    { title: "", props: { width: 15, "aria-label": _("Actions") } },
                                ]}
                                emptyCaption={_("No VM is running or defined on this host")}
                                rows={ combinedVmsFiltered
                                        .sort(sortFunction)
                                        .map(vm => {
                                            let vmActions = null;
                                            if (!vm.isUi)
                                                vmActions = (
                                                    <VmActions
                                                        vm={vm}
                                                        vms={vms}
                                                    />
                                                );

                                            return {
                                                columns: [
                                                    {
                                                        title: <Button id={`${vmId(vm.name)}-${vm.connectionName}-name`}
                                                              variant="link"
                                                              isInline
                                                              isDisabled={!!vm.isUi && !vm.createInProgress}
                                                              component="a"
                                                              href={'#' + cockpit.format("vm?name=$0&connection=$1", encodeURIComponent(vm.name), vm.connectionName)}
                                                              className="vm-list-item-name">{vm.name}</Button>
                                                    },
                                                    { title: rephraseUI('connections', vm.connectionName) },
                                                    {
                                                        title: (
                                                            <VmState vm={vm} vms={vms} />
                                                        ),
                                                    },
                                                    ...(showUsage
                                                        ? [
                                                            { title: (<VmUsageCpu vm={vm} />) },
                                                            { title: (<VmUsageMem vm={vm} />) },
                                                        ]
                                                        : []),
                                                    { title: vmActions },
                                                ],
                                                props: {
                                                    key: cockpit.format("$0-$1-row", vmId(vm.name), vm.connectionName),
                                                    'data-row-id': cockpit.format("$0-$1", vmId(vm.name), vm.connectionName),
                                                    'data-vm-transient': !vm.isUi && !vm.persistent,
                                                },
                                            };
                                        }) }
                            />
                        </Card>
                    </Gallery>
                </PageSection>
            </Page>
        </WithDialogs>
    );
};
