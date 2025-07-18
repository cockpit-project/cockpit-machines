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

import React, { useEffect } from 'react';
import cockpit from 'cockpit';
import { useStateObject } from './consoles/state';

import type { VM, StoragePool, Network, NodeDevice } from '../../types';
import type { Config } from '../../reducers';
import type { Notification } from '../../app';

import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core/dist/esm/components/Breadcrumb";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { Page, PageGroup, PageBreadcrumb, PageSection } from "@patternfly/react-core/dist/esm/components/Page";
import { WithDialogs } from 'dialogs.jsx';

import { vmId } from "../../helpers.js";
import { VmFilesystemsCard, VmFilesystemActions } from './filesystems/vmFilesystemsCard.jsx';
import { VmDisksCardLibvirt, VmDisksActions } from './disks/vmDisksCard.jsx';
import { VmNetworkTab, VmNetworkActions } from './nics/vmNicsCard.jsx';
import { VmHostDevCard, VmHostDevActions } from './hostdevs/hostDevCard.jsx';
import { ConsoleCardState, ConsoleCard } from './consoles/consoles.jsx';
import VmOverviewCard from './overview/vmOverviewCard.jsx';
import VmUsageTab from './vmUsageCard.jsx';
import { VmSnapshotsCard, VmSnapshotsActions } from './snapshots/vmSnapshotsCard.jsx';
import VmActions from './vmActions.jsx';
import { VmNeedsShutdown } from '../common/needsShutdown.jsx';
import { InfoPopover } from '../common/infoPopover.jsx';
import { VmUsesSpice } from './usesSpice.jsx';

import './vmDetailsPage.scss';

const _ = cockpit.gettext;

export const VmDetailsPage = ({
    vm,
    vms,
    config,
    libvirtVersion,
    storagePools,
    onUsageStartPolling,
    onUsageStopPolling,
    networks,
    nodeDevices,
    onAddErrorNotification
} : {
    vm: VM,
    vms: VM[],
    config: Config,
    libvirtVersion: number,
    storagePools: StoragePool[],
    onUsageStartPolling: () => void,
    onUsageStopPolling: () => void,
    networks: Network[],
    nodeDevices: NodeDevice[],
    onAddErrorNotification: (n: Notification) => void,
}) => {
    useEffect(() => {
        // Anything in here is fired on component mount.
        onUsageStartPolling();
        return () => {
            // Anything in here is fired on component unmount.
            onUsageStopPolling();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // We want to reset the ConsoleCardState when a machine starts or shuts down.
    const consoleState = useStateObject(() => new ConsoleCardState(), [vm.state]);

    const vmActionsPageSection = (
        <PageSection hasBodyWrapper className="actions-pagesection" isWidthLimited>
            <div className="vm-top-panel" data-vm-transient={!vm.persistent}>
                <h2 className="vm-name">{vm.name}</h2>
                <VmActions vm={vm}
                           onAddErrorNotification={onAddErrorNotification}
                           isDetailsPage />
                <VmNeedsShutdown vm={vm} />
                <VmUsesSpice vm={vm} />
            </div>
            {
                vm.inactiveXML.description &&
                    <p className="vm-description">
                        {vm.inactiveXML.description}
                    </p>
            }
        </PageSection>
    );

    if (cockpit.location.path[1] == "console") {
        return (
            <WithDialogs key="vm-details">
                <Page id={"vm-" + vm.name + "-consoles-page"}
                      className="consoles-page-expanded no-masthead-sidebar">
                    <PageSection hasBodyWrapper={false}>
                        <ConsoleCard
                            state={consoleState}
                            vm={vm}
                            config={config}
                            onAddErrorNotification={onAddErrorNotification}
                            isExpanded />
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }

    interface CardContentCard {
        card: NonNullable<React.ReactNode>;
    }

    interface CardContentDetailed {
        card?: undefined;
        id: string;
        className?: string;
        title: React.ReactNode;
        actions?: React.ReactNode;
        body: React.ReactNode;
    }

    type CardContent = CardContentCard | CardContentDetailed;

    const cardContents: CardContent[] = [
        {
            id: `${vmId(vm.name)}-overview`,
            title: _("Overview"),
            body: <VmOverviewCard vm={vm}
                                  vms={vms}
                                  config={config}
                                  loaderElems={vm.capabilities.loaderElems}
                                  maxVcpu={vm.capabilities.maxVcpu}
                                  cpuModels={vm.capabilities.cpuModels}
                                  libvirtVersion={libvirtVersion} />,
        },
        {
            id: `${vmId(vm.name)}-usage`,
            className: 'usage-card',
            title: _("Usage"),
            body: <VmUsageTab vm={vm} />,
        },
        {
            card: <ConsoleCard
                      state={consoleState}
                      key={`${vmId(vm.name)}-consoles`}
                      vm={vm}
                      config={config}
                      isExpanded={false}
                      onAddErrorNotification={onAddErrorNotification} />
        },
        {
            id: `${vmId(vm.name)}-disks`,
            className: "disks-card",
            title: _("Disks"),
            actions: <VmDisksActions vm={vm} vms={vms} supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
            body: <VmDisksCardLibvirt vm={vm} vms={vms} storagePools={storagePools}
                                      onAddErrorNotification={onAddErrorNotification}
                                      supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
        },
        {
            id: `${vmId(vm.name)}-networks`,
            className: "networks-card",
            title: _("Network interfaces"),
            actions: <VmNetworkActions vm={vm} vms={vms} networks={networks} />,
            body: <VmNetworkTab vm={vm}
                                networks={networks}
                                onAddErrorNotification={onAddErrorNotification} />,
        },
        {
            id: `${vmId(vm.name)}-hostdevs`,
            className: "hostdevs-card",
            title: _("Host devices"),
            actions: <VmHostDevActions vm={vm} />,
            body: <VmHostDevCard vm={vm} nodeDevices={nodeDevices} />,
        }
    ];
    if (vm.snapshots) {
        cardContents.push({
            id: cockpit.format("$0-snapshots", vmId(vm.name)),
            className: "snapshots-card",
            title: _("Snapshots"),
            actions: <VmSnapshotsActions vm={vm} config={config} />,
            body: <VmSnapshotsCard vm={vm} />
        });
    }
    if (libvirtVersion && libvirtVersion >= 6008000 && vm.connectionName == "system") {
        cardContents.push(
            {
                id: `${vmId(vm.name)}-filesystems`,
                className: "filesystems-card",
                title: (
                    <>
                        {_("Shared directories")}
                        <InfoPopover
                            headerContent={_("Shared host directories need to be manually mounted inside the VM")}
                            bodyContent={
                                <CodeBlock>
                                    <CodeBlockCode>mount -t virtiofs [mount tag] [mount point]</CodeBlockCode>
                                </CodeBlock>
                            }
                            footerContent={
                                <List>
                                    <ListItem>{_("mount tag: The tag associated to the exported mount point")}</ListItem>
                                    <ListItem>{_("mount point: The mount point inside the guest")}</ListItem>
                                </List>
                            }
                            hasAutoWidth
                        />
                    </>
                ),
                actions: <VmFilesystemActions connectionName={vm.connectionName}
                                              vmName={vm.name}
                                              vmState={vm.state} />,
                body: <VmFilesystemsCard connectionName={vm.connectionName}
                                         filesystems={vm.filesystems}
                                         vmName={vm.name}
                                         vmState={vm.state} />
            }
        );
    }

    const cards = cardContents.map(card => {
        if (card.card !== undefined)
            return card.card;

        return (
            <Card key={card.id}
                {...card.className && { className: card.className }}
                id={card.id}
            >
                <CardHeader actions={{ actions: card.actions }}>
                    <CardTitle component="h2">{card.title}</CardTitle>
                </CardHeader>
                {card.className && ["disks-card", "hostdevs-card", "networks-card", "snapshots-card", "filesystems-card"].includes(card.className) ? card.body : <CardBody>{card.body}</CardBody>}
                <CardFooter />
            </Card>
        );
    });

    return (
        <WithDialogs>
            <Page id="vm-details"
                  className="vm-details no-masthead-sidebar"
                  data-pools-count={storagePools.length}>
                <PageGroup>
                    <PageBreadcrumb hasBodyWrapper={false}>
                        <Breadcrumb className='machines-listing-breadcrumb'>
                            <BreadcrumbItem to='#'>
                                {_("Virtual machines")}
                            </BreadcrumbItem>
                            <BreadcrumbItem isActive>
                                {vm.name}
                            </BreadcrumbItem>
                        </Breadcrumb>
                    </PageBreadcrumb>
                    {vmActionsPageSection}
                </PageGroup>
                <PageSection hasBodyWrapper={false}>
                    <Gallery className='ct-vm-overview' hasGutter>
                        {cards}
                    </Gallery>
                </PageSection>
            </Page>
        </WithDialogs>
    );
};
