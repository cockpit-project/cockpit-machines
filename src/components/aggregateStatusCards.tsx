/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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
import cockpit from 'cockpit';

import type { StoragePool, Network } from '../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardHeader } from "@patternfly/react-core/dist/esm/components/Card";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { ServerIcon, NetworkIcon, ArrowCircleUpIcon, ArrowCircleDownIcon } from '@patternfly/react-icons';

import './aggregateStatusCards.css';

export const AggregateStatusCards = ({
    storagePools,
    networks,
} : {
    storagePools: StoragePool[],
    networks: Network[],
}) => {
    return (
        <>
            <Card id='card-pf-storage-pools'
                className='ct-card-info'>
                <CardHeader>
                    <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <ServerIcon />
                        <Button onClick={() => cockpit.location.go(['storages'])} variant="link">
                            {cockpit.format(cockpit.ngettext("$0 Storage pool", "$0 Storage pools", storagePools.length), storagePools.length)}
                        </Button>
                    </Flex>
                    <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem className="active-resources">
                            <ArrowCircleUpIcon />
                            { storagePools.filter(pool => pool && pool.active).length }
                        </FlexItem>
                        <Divider orientation={{ default: "vertical" }} />
                        <FlexItem className="active-resources">
                            <ArrowCircleDownIcon />
                            { storagePools.filter(pool => pool && !pool.active).length }
                        </FlexItem>
                    </Flex>
                </CardHeader>
            </Card>
            <Card id='card-pf-networks'
                className='ct-card-info'>
                <CardHeader>
                    <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <NetworkIcon />
                        <Button onClick={() => cockpit.location.go(['networks'])} variant="link">
                            {cockpit.format(cockpit.ngettext("$0 Network", "$0 Networks", networks.length), networks.length)}
                        </Button>
                    </Flex>
                    <Flex alignItems={{ default: 'alignItemsCenter' }}>
                        <FlexItem className="active-resources">
                            <ArrowCircleUpIcon />
                            { networks.filter(network => network && network.active).length }
                        </FlexItem>
                        <Divider orientation={{ default: "vertical" }} />
                        <FlexItem className="active-resources">
                            <ArrowCircleDownIcon />
                            { networks.filter(network => network && !network.active).length }
                        </FlexItem>
                    </Flex>
                </CardHeader>
            </Card>
        </>
    );
};
