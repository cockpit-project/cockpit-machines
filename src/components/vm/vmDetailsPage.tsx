/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2016 Red Hat, Inc.
 */

import React, { useEffect } from 'react';
import cockpit from 'cockpit';

import type { VM, StoragePool, Network, NodeDevice } from '../../types';

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
import { VmOverviewCard } from './overview/vmOverviewCard.jsx';
import { VmUsageTab } from './vmUsageCard.jsx';
import { VmSnapshotsCard, VmSnapshotsActions } from './snapshots/vmSnapshotsCard.jsx';
import { VmActions } from './vmActions.jsx';
import { VmNeedsShutdown } from '../common/needsShutdown.jsx';
import { InfoPopover } from '../common/infoPopover.jsx';
import { VmUsesSpice } from './usesSpice.jsx';
import { ensureUsagePolling } from './../../libvirtApi/common';
import { appState } from '../../state';

import './vmDetailsPage.scss';

const _ = cockpit.gettext;

export const VmDetailsPage = ({
    vm,
    storagePools,
    networks,
    nodeDevices,
    consoleCardState,
} : {
    vm: VM,
    storagePools: StoragePool[],
    networks: Network[],
    nodeDevices: NodeDevice[],
    consoleCardState: ConsoleCardState,
}) => {
    useEffect(() => {
        // Anything in here is fired on component mount.
        ensureUsagePolling(vm.uuid);
        return () => {
            // Anything in here is fired on component unmount.
            ensureUsagePolling(false);
        };
    }, [vm.uuid]);

    // We want to autoconnect the VNC console when a machine starts (or is resumed).
    useEffect(() => {
        return appState.on("vmStateEvent", (id, connectionName, state) => {
            if (vm.id == id && vm.connectionName == connectionName && state == "running")
                consoleCardState.vncState.setConnected(true);
        });
    }, [consoleCardState, vm.id, vm.connectionName]);

    const vmActionsPageSection = (
        <PageSection hasBodyWrapper className="actions-pagesection" isWidthLimited>
            <div className="vm-top-panel" data-vm-transient={!vm.persistent}>
                <h2 className="vm-name">{vm.name}</h2>
                <VmActions vm={vm}
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
                      className="consoles-page-expanded pf-m-no-sidebar">
                    <PageSection hasBodyWrapper={false}>
                        <ConsoleCard
                            state={consoleCardState}
                            vm={vm}
                            isExpanded />
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }

    if (cockpit.location.path[1] == "vnc") {
        document.title = cockpit.format(_("$0 console"), vm.name);
        return (
            <WithDialogs key="vm-details">
                <div
                    id={"vm-" + vm.name + "-consoles-page"}
                    className="consoles-page-standalone"
                >
                    <ConsoleCard
                        state={consoleCardState}
                        vm={vm}
                        isStandalone
                    />
                </div>
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
                                  maxVcpu={vm.capabilities.maxVcpu}
                                  cpuModels={vm.capabilities.cpuModels} />,
        },
        {
            id: `${vmId(vm.name)}-usage`,
            className: 'usage-card',
            title: _("Usage"),
            body: <VmUsageTab vm={vm} />,
        },
        {
            card: <ConsoleCard
                      state={consoleCardState}
                      key={`${vmId(vm.name)}-consoles`}
                      vm={vm} />
        },
        {
            id: `${vmId(vm.name)}-disks`,
            className: "disks-card",
            title: _("Disks"),
            actions: <VmDisksActions vm={vm} supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
            body: <VmDisksCardLibvirt vm={vm} storagePools={storagePools}
                                      supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
        },
        {
            id: `${vmId(vm.name)}-networks`,
            className: "networks-card",
            title: _("Network interfaces"),
            actions: <VmNetworkActions vm={vm} networks={networks} />,
            body: <VmNetworkTab vm={vm}
                                networks={networks} />,
        },
        {
            id: `${vmId(vm.name)}-hostdevs`,
            className: "hostdevs-card",
            title: _("Host devices"),
            actions: <VmHostDevActions vm={vm} />,
            body: <VmHostDevCard vm={vm} nodeDevices={nodeDevices} />,
        }
    ];
    if (vm.snapshots !== false) {
        cardContents.push({
            id: cockpit.format("$0-snapshots", vmId(vm.name)),
            className: "snapshots-card",
            title: _("Snapshots"),
            actions: <VmSnapshotsActions vm={vm} />,
            body: <VmSnapshotsCard vm={vm} />
        });
    }
    if ((appState.libvirtVersion >= 6008000 && vm.connectionName == "system") ||
        (appState.libvirtVersion >= 10000000 && vm.connectionName == "session")) {
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
                actions: <VmFilesystemActions vm={vm} />,
                body: <VmFilesystemsCard vm={vm} />
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
                  className="vm-details pf-m-no-sidebar"
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
