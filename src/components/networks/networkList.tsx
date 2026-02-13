/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */
import React from 'react';

import type { Network } from '../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core/dist/esm/components/Breadcrumb";
import { Card, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { EmptyState, EmptyStateBody, EmptyStateFooter } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Page, PageBreadcrumb, PageSection } from "@patternfly/react-core/dist/esm/components/Page";
import { WithDialogs } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { superuser } from 'superuser';
import { ListingTable } from 'cockpit-components-table.jsx';
import { getNetworkRow } from './network.jsx';
import { CreateNetworkAction } from './createNetworkDialog.jsx';

import { appState } from '../../state';
import { networkCreateDefault } from '../../libvirtApi/network';

const _ = cockpit.gettext;

export interface NetworkListProps {
    networks: Network[];
}

export class NetworkList extends React.Component<NetworkListProps> {
    shouldComponentUpdate(nextProps: NetworkListProps) {
        const networks = nextProps.networks;
        return !networks.find(network => !network.name);
    }

    render() {
        const { networks } = this.props;
        const sortFunction = (networkA: Network, networkB: Network) => networkA.name.localeCompare(networkB.name);
        const unlocked = superuser.allowed;

        async function createDefaultNetwork() {
            try {
                await networkCreateDefault();
            } catch (ex) {
                appState.addNotification({
                    text: _("Failed to create \"default\" network"),
                    detail: String(ex),
                });
            }
        }

        return (
            <WithDialogs key="network-list">
                <Page className="pf-m-no-sidebar">
                    <PageBreadcrumb hasBodyWrapper={false} stickyOnBreakpoint={{ default: "top" }}>
                        <Breadcrumb className='machines-listing-breadcrumb'>
                            <BreadcrumbItem to='#'>
                                {_("Virtual machines")}
                            </BreadcrumbItem>
                            <BreadcrumbItem isActive>
                                {_("Networks")}
                            </BreadcrumbItem>
                        </Breadcrumb>
                    </PageBreadcrumb>
                    <PageSection hasBodyWrapper={false} id='networks-listing'>
                        <Card isPlain>
                            <CardHeader actions={{ actions: unlocked && <CreateNetworkAction /> }}>
                                <CardTitle component="h2">{_("Networks")}</CardTitle>
                            </CardHeader>
                            <ListingTable aria-label={_("Networks")}
                                variant='compact'
                                columns={[
                                    { title: _("Name"), header: true, props: { width: 15 } },
                                    { title: _("Device"), props: { width: 15 } },
                                    { title: _("Connection"), props: { width: 15 } },
                                    { title: _("Forwarding mode"), props: { width: 15 } },
                                    { title: _("State"), props: { width: 20 } },
                                    { title: "", props: { width: 20, "aria-label": _("Actions") } },
                                ]}
                                emptyComponent={
                                    <EmptyState>
                                        <EmptyStateBody>
                                            {_("No network is defined on this host")}
                                        </EmptyStateBody>
                                        {
                                            /* The "default" network is pretty much assumed
                                               to exist always, so give the user an easy
                                               way to re-create it if it every gets lost.
                                             */
                                            !appState.systemSocketInactive &&
                                                <EmptyStateFooter>
                                                    <Button
                                                        variant="secondary"
                                                        onClick={createDefaultNetwork}
                                                    >
                                                        {_("Create the \"default\" virtual network")}
                                                    </Button>
                                                </EmptyStateFooter>
                                        }
                                    </EmptyState>
                                }
                                rows={networks
                                        .sort(sortFunction)
                                        .map(network => getNetworkRow({ network }))
                                } />
                        </Card>
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }
}
