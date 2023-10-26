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
import PropTypes from 'prop-types';
import React, { useEffect } from 'react';
import cockpit from 'cockpit';

import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core/dist/esm/components/Breadcrumb";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { Page, PageGroup, PageBreadcrumb, PageSection, PageSectionVariants } from "@patternfly/react-core/dist/esm/components/Page";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { ExpandIcon, HelpIcon } from '@patternfly/react-icons';
import { WithDialogs } from 'dialogs.jsx';

import { vmId } from "../../helpers.js";

import { VmFilesystemsCard, VmFilesystemActions } from './filesystems/vmFilesystemsCard.jsx';
import { VmDisksCardLibvirt, VmDisksActions } from './disks/vmDisksCard.jsx';
import { VmNetworkTab, VmNetworkActions } from './nics/vmNicsCard.jsx';
import { VmHostDevCard, VmHostDevActions } from './hostdevs/hostDevCard.jsx';
import Consoles from './consoles/consoles.jsx';
import VmOverviewCard from './overview/vmOverviewCard.jsx';
import VmUsageTab from './vmUsageCard.jsx';
import { VmSnapshotsCard, VmSnapshotsActions } from './snapshots/vmSnapshotsCard.jsx';
import VmActions from './vmActions.jsx';
import { VmNeedsShutdown } from '../common/needsShutdown.jsx';
import { VmUsesSpice } from './usesSpice.jsx';

import './vmDetailsPage.scss';

const _ = cockpit.gettext;

export const VmDetailsPage = ({
    vm, vms, config, libvirtVersion, storagePools,
    onUsageStartPolling, onUsageStopPolling, networks,
    nodeDevices, onAddErrorNotification
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

    const vmActionsPageSection = (
        <PageSection className="actions-pagesection" variant={PageSectionVariants.light} isWidthLimited>
            <div className="vm-top-panel" data-vm-transient={!vm.persistent}>
                <h2 className="vm-name">{vm.name}</h2>
                <VmActions vm={vm}
                           config={config}
                           onAddErrorNotification={onAddErrorNotification}
                           isDetailsPage />
                <VmNeedsShutdown vm={vm} />
                <VmUsesSpice vm={vm} />
            </div>
        </PageSection>
    );

    if (cockpit.location.path[1] == "console") {
        return (
            <WithDialogs key="vm-details">
                <Page id={"vm-" + vm.name + "-consoles-page"}
                      className="consoles-page-expanded">
                    <PageBreadcrumb stickyOnBreakpoint={{ default: "top" }}>
                        <Breadcrumb className='machines-listing-breadcrumb'>
                            <BreadcrumbItem to='#'>
                                {_("Virtual machines")}
                            </BreadcrumbItem>
                            <BreadcrumbItem to={'#' + cockpit.format("vm?name=$0&connection=$1", encodeURIComponent(vm.name), vm.connectionName)}>
                                {vm.name}
                            </BreadcrumbItem>
                            <BreadcrumbItem isActive>
                                {_("Console")}
                            </BreadcrumbItem>
                        </Breadcrumb>
                    </PageBreadcrumb>
                    {vmActionsPageSection}
                    <PageSection variant={PageSectionVariants.light}>
                        <Consoles vm={vm} config={config}
                            onAddErrorNotification={onAddErrorNotification}
                            isExpanded />
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }

    const cardContents = [
        {
            id: `${vmId(vm.name)}-overview`,
            title: _("Overview"),
            body: <VmOverviewCard vm={vm}
                                  vms={vms}
                                  config={config}
                                  loaderElems={vm.capabilities.loaderElems}
                                  maxVcpu={vm.capabilities.maxVcpu}
                                  cpuModels={vm.capabilities.cpuModels}
                                  cpuHostModel={vm.capabilities.cpuHostModel}
                                  nodeDevices={nodeDevices} libvirtVersion={libvirtVersion} />,
        },
        {
            id: `${vmId(vm.name)}-usage`,
            className: 'usage-card',
            title: _("Usage"),
            body: <VmUsageTab vm={vm} />,
        },
        ...(vm.displays.length
            ? [{
                id: `${vmId(vm.name)}-consoles`,
                className: "consoles-card",
                title: _("Console"),
                actions: vm.state != "shut off"
                    ? <Button variant="link"
                          onClick={() => {
                              const urlOptions = { name: vm.name, connection: vm.connectionName };
                              return cockpit.location.go(["vm", "console"], { ...cockpit.location.options, ...urlOptions });
                          }}
                          icon={<ExpandIcon />}
                          iconPosition="right">{_("Expand")}</Button>
                    : null,
                body: <Consoles vm={vm} config={config}
                            onAddErrorNotification={onAddErrorNotification} />,
            }]
            : []),
        {
            id: `${vmId(vm.name)}-disks`,
            className: "disks-card",
            title: _("Disks"),
            actions: <VmDisksActions vm={vm} vms={vms} supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
            body: <VmDisksCardLibvirt vm={vm} vms={vms} config={config} storagePools={storagePools}
                                      onAddErrorNotification={onAddErrorNotification}
                                      supportedDiskBusTypes={vm.capabilities.supportedDiskBusTypes} />,
        },
        {
            id: `${vmId(vm.name)}-networks`,
            className: "networks-card",
            title: _("Network interfaces"),
            actions: <VmNetworkActions vm={vm} vms={vms} networks={networks} />,
            body: <VmNetworkTab vm={vm} config={config}
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
    if (vm.snapshots !== -1 && vm.snapshots !== undefined) {
        cardContents.push({
            id: cockpit.format("$0-snapshots", vmId(vm.name)),
            className: "snapshots-card",
            title: _("Snapshots"),
            actions: <VmSnapshotsActions vm={vm} config={config} storagePools={storagePools} />,
            body: <VmSnapshotsCard vm={vm} config={config} />
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
                        <Popover
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
                            hasAutoWidth>
                            <Button variant="plain" aria-label={_("more info")}>
                                <HelpIcon />
                            </Button>
                        </Popover>
                    </>
                ),
                actions: <VmFilesystemActions connectionName={vm.connectionName}
                                              objPath={vm.id}
                                              vmName={vm.name}
                                              memory={vm.memory}
                                              vmState={vm.state} />,
                body: <VmFilesystemsCard connectionName={vm.connectionName}
                                         filesystems={vm.filesystems}
                                         objPath={vm.id}
                                         vmName={vm.name}
                                         vmState={vm.state} />
            }
        );
    }

    const cards = cardContents.map(card => {
        return (
            <Card key={card.id}
                  className={card.className}
                  id={card.id}
                  isSelectable
                  isClickable>
                <CardHeader actions={{ actions: card.actions }}>
                    <CardTitle component="h2">{card.title}</CardTitle>
                </CardHeader>
                <CardBody className={["disks-card", "hostdevs-card", "networks-card", "snapshots-card", "filesystems-card"].includes(card.className) ? "contains-list" : ""}>
                    {card.body}
                </CardBody>
                <CardFooter />
            </Card>
        );
    });

    return (
        <WithDialogs>
            <Page id="vm-details"
                  className="vm-details"
                  data-pools-count={storagePools.length}>
                <PageGroup>
                    <PageBreadcrumb>
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
                <PageSection>
                    <Gallery className='ct-vm-overview' hasGutter>
                        {cards}
                    </Gallery>
                </PageSection>
            </Page>
        </WithDialogs>
    );
};

VmDetailsPage.propTypes = {
    vm: PropTypes.object.isRequired,
    vms: PropTypes.array.isRequired,
    config: PropTypes.object.isRequired,
    libvirtVersion: PropTypes.number.isRequired,
    storagePools: PropTypes.array.isRequired,
    networks: PropTypes.array.isRequired,
    onAddErrorNotification: PropTypes.func.isRequired,
    nodeDevices: PropTypes.array.isRequired,
};
