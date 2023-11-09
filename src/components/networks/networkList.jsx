/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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
import React from 'react';
import PropTypes from 'prop-types';
import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core/dist/esm/components/Breadcrumb";
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { Page, PageBreadcrumb, PageSection, PageSectionVariants } from "@patternfly/react-core/dist/esm/components/Page";
import { WithDialogs } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { superuser } from 'superuser';
import { ListingTable } from 'cockpit-components-table.jsx';
import { getNetworkRow } from './network.jsx';
import { CreateNetworkAction } from './createNetworkDialog.jsx';

const _ = cockpit.gettext;

export class NetworkList extends React.Component {
    shouldComponentUpdate(nextProps, _) {
        const networks = nextProps.networks;
        return !networks.find(network => !network.name);
    }

    render() {
        const { networks, resourceHasError } = this.props;
        const sortFunction = (networkA, networkB) => networkA.name.localeCompare(networkB.name);
        const unlocked = superuser.allowed;

        return (
            <WithDialogs key="network-list">
                <Page>
                    <PageBreadcrumb stickyOnBreakpoint={{ default: "top" }}>
                        <Breadcrumb variant={PageSectionVariants.light} className='machines-listing-breadcrumb'>
                            <BreadcrumbItem to='#'>
                                {_("Virtual machines")}
                            </BreadcrumbItem>
                            <BreadcrumbItem isActive>
                                {_("Networks")}
                            </BreadcrumbItem>
                        </Breadcrumb>
                    </PageBreadcrumb>
                    <PageSection id='networks-listing'>
                        <Card isSelectable isClickable>
                            <CardHeader actions={{ actions: unlocked && <CreateNetworkAction /> }}>
                                <CardTitle component="h2">{_("Networks")}</CardTitle>
                            </CardHeader>
                            <CardBody className="contains-list">
                                <ListingTable aria-label={_("Networks")}
                                variant='compact'
                                columns={[
                                    { title: _("Name"), header: true, props: { width: 15 } },
                                    { title: _("Device"), props: { width: 15 } },
                                    { title: _("Connection"), props: { width: 15 } },
                                    { title: _("Forwarding mode"), props: { width: 15 } },
                                    { title: _("State"), props: { width: 20 } },
                                    { title: "", props: { width: 20 } },
                                ]}
                                emptyCaption={_("No network is defined on this host")}
                                rows={networks
                                        .sort(sortFunction)
                                        .map(network => getNetworkRow({ network, resourceHasError }))
                                } />
                            </CardBody>
                        </Card>
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }
}
NetworkList.propTypes = {
    networks: PropTypes.array.isRequired,
    resourceHasError: PropTypes.object.isRequired,
};
