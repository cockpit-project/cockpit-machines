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

import VmActions from '../vm/vmActions.jsx';
import { updateVm } from '../../actions/store-actions.js';

import { vmId, rephraseUI, dummyVmsFilter, DOMAINSTATE } from "../../helpers.js";

import { ListingTable, type ListingTableColumnProps } from "cockpit-components-table.jsx";
import StateIcon from '../common/stateIcon.jsx';
import { VmNeedsShutdown } from '../common/needsShutdown.jsx';
import { VmUsesSpice } from '../vm/usesSpice.jsx';
import { AggregateStatusCards } from "../aggregateStatusCards.jsx";
import store from "../../store.js";
import { ensureUsagePolling } from '../../libvirtApi/common';

import VMS_CONFIG from "../../config.js";

import type {
    VM,
    UIVM,
    StoragePool,
    Network,
} from '../../types';

import type { Notification } from '../../app';

import "./hostvmslist.scss";

const VmState = ({
    vm,
    vms,
    dismissError
} : {
    vm: VM | UIVM,
    vms: VM[],
    dismissError: () => void,
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
    if (vm.isUi || vm.state != "running")
        return null;

    const memTotal = vm.currentMemory ? vm.currentMemory * 1024 : 0;
    const rssMem = vm.rssMemory ? vm.rssMemory * 1024 : 0;

    return (
        <Progress value={rssMem}
            aria-label={_("Memory")}
            className="pf-m-bg ct-simple-percentage-progress"
            min={0} max={memTotal}
            variant={rssMem / memTotal > 0.9 ? ProgressVariant.danger : undefined}
        />
    );
};

const _ = cockpit.gettext;

/**
 * List of all VMs defined on this host
 */
interface HostVmsListProps {
    vms: VM[],
    ui: ReturnType<typeof store.getState>["ui"],
    storagePools: StoragePool[],
    actions: React.ReactNode,
    networks: Network[],
    onAddErrorNotification: (notification: Notification) => void,
}

const HostVmsList = ({
    vms,
    ui,
    storagePools,
    actions,
    networks,
    onAddErrorNotification
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
    const combinedVms = [...vms, ...dummyVmsFilter(vms, ui.vms)];
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
            <Page className="no-masthead-sidebar">
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
                                                        onAddErrorNotification={onAddErrorNotification}
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
                                                            <VmState vm={vm}
                                                                 vms={vms}
                                                                 dismissError={() => store.dispatch(updateVm({
                                                                     connectionName: vm.connectionName,
                                                                     name: vm.name,
                                                                     error: null
                                                                 }))} />
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

export default HostVmsList;
