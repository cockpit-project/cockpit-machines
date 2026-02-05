/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */
import React from 'react';

import type { VM, StoragePool } from '../../types';

import { Breadcrumb, BreadcrumbItem } from "@patternfly/react-core/dist/esm/components/Breadcrumb";
import { Card, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { Page, PageBreadcrumb, PageSection } from "@patternfly/react-core/dist/esm/components/Page";
import { WithDialogs } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { ListingTable } from 'cockpit-components-table.jsx';
import { getStoragePoolRow } from './storagePool.jsx';
import { CreateStoragePoolAction } from './createStoragePoolDialog.jsx';

import './storagePoolList.scss';

const _ = cockpit.gettext;

interface StoragePoolListProps {
    storagePools: StoragePool[],
    vms: VM[],
}

export class StoragePoolList extends React.Component<StoragePoolListProps> {
    shouldComponentUpdate(nextProps: StoragePoolListProps) {
        const storagePools = nextProps.storagePools;
        return !storagePools.find(pool => !pool.name);
    }

    render() {
        const { storagePools, vms } = this.props;
        const sortFunction = (storagePoolA: StoragePool, storagePoolB: StoragePool) => storagePoolA.name.localeCompare(storagePoolB.name);
        const actions = (<CreateStoragePoolAction />);

        return (
            <WithDialogs key="storage-pool-list">
                <Page className="pf-m-no-sidebar">
                    <PageBreadcrumb hasBodyWrapper={false} stickyOnBreakpoint={{ default: "top" }}>
                        <Breadcrumb className='machines-listing-breadcrumb'>
                            <BreadcrumbItem to='#'>
                                {_("Virtual machines")}
                            </BreadcrumbItem>
                            <BreadcrumbItem isActive>
                                {_("Storage pools")}
                            </BreadcrumbItem>
                        </Breadcrumb>
                    </PageBreadcrumb>
                    <PageSection hasBodyWrapper={false} id='storage-pools-listing'>
                        <Card isPlain>
                            <CardHeader actions={{ actions }}>
                                <CardTitle component="h2">{_("Storage pools")}</CardTitle>
                            </CardHeader>
                            <ListingTable aria-label={_("Storage pools")}
                                variant='compact'
                                columns={[
                                    { title: _("Name"), header: true, props: { width: 15 } },
                                    { title: _("Size"), props: { width: 40 } },
                                    { title: _("Connection"), props: { width: 15 } },
                                    { title: _("State"), props: { width: 15 } },
                                    { title: "", props: { width: 15, "aria-label": _("Actions") } },
                                ]}
                                emptyCaption={_("No storage pool is defined on this host")}
                                rows={storagePools
                                        .sort(sortFunction)
                                        .map(storagePool => {
                                            const filterVmsByConnection = vms.filter(vm => vm.connectionName == storagePool.connectionName);

                                            return getStoragePoolRow({ storagePool, vms: filterVmsByConnection });
                                        })
                                }
                            />
                        </Card>
                    </PageSection>
                </Page>
            </WithDialogs>
        );
    }
}
