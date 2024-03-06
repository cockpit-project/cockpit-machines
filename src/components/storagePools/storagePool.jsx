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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Progress } from "@patternfly/react-core/dist/esm/components/Progress";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { ListingPanel } from 'cockpit-components-listing-panel.jsx';
import { KebabDropdown } from "cockpit-components-dropdown";
import {
    convertToUnit,
    rephraseUI,
    storagePoolId,
    units
} from '../../helpers.js';
import StateIcon from '../common/stateIcon.jsx';
import { updateOrAddStoragePool } from '../../actions/store-actions.js';
import { StoragePoolOverviewTab } from './storagePoolOverviewTab.jsx';
import { StoragePoolVolumesTab } from './storagePoolVolumesTab.jsx';
import { StoragePoolDeleteAction } from './storagePoolDelete.jsx';
import { storagePoolActivate, storagePoolDeactivate } from '../../libvirtApi/storagePool.js';
import store from '../../store.js';

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const getStoragePoolRow = ({ storagePool, vms, onAddErrorNotification }) => {
    const idPrefix = `${storagePoolId(storagePool.name, storagePool.connectionName)}`;
    const name = (
        <span id={`${idPrefix}-name`}>
            { storagePool.name }
        </span>
    );
    const allocation = parseFloat(convertToUnit(storagePool.allocation, units.B, units.GiB).toFixed(2));
    const capacity = parseFloat(convertToUnit(storagePool.capacity, units.B, units.GiB).toFixed(2));
    const sizeLabel = String(cockpit.format("$0 / $1 GiB", allocation, capacity));
    const size = (
        <Progress value={Number(storagePool.allocation)}
                  min={0}
                  max={Number(storagePool.capacity)}
                  label={sizeLabel}
                  valueText={sizeLabel} />
    );

    const state = (
        <StateIcon error={storagePool.error} state={storagePool.active ? _("active") : _("inactive") }
                   valueId={`${idPrefix}-state`}
                   dismissError={() => store.dispatch(updateOrAddStoragePool({
                       connectionName: storagePool.connectionName,
                       name: storagePool.name,
                       error: null
                   }))} />
    );

    const tabRenderers = [
        {
            name: _("Overview"),
            renderer: StoragePoolOverviewTab,
            data: { storagePool },
            id: `${idPrefix}-overview`
        },
        {
            name: _("Storage volumes"),
            renderer: StoragePoolVolumesTab,
            data: { storagePool, vms },
            id: `${idPrefix}-storage-volumes`
        },
    ];

    return {
        columns: [
            { title: name, header: true },
            { title: size },
            { title: rephraseUI('connections', storagePool.connectionName) },
            { title: state },
            { title: <StoragePoolActions storagePool={storagePool} vms={vms} /> },
        ],
        props: { key: storagePool.uuid, 'data-row-id': idPrefix },
        expandedContent: <ListingPanel tabRenderers={tabRenderers} />
    };
};

class StoragePoolActions extends React.Component {
    constructor() {
        super();
        this.state = {
            isActionOpen: false,
            operationInProgress: false,
        };
        this.onActivate = this.onActivate.bind(this);
        this.onDeactivate = this.onDeactivate.bind(this);
    }

    onActivate() {
        const storagePool = this.props.storagePool;

        this.setState({ operationInProgress: true });
        storagePoolActivate({ connectionName: storagePool.connectionName, objPath: storagePool.id })
                .catch(exc => {
                    store.dispatch(
                        updateOrAddStoragePool({
                            connectionName: storagePool.connectionName,
                            name: storagePool.name,
                            error: {
                                text: cockpit.format(_("Storage pool $0 failed to get activated"), storagePool.name),
                                detail: exc.message,
                            }
                        }, true)
                    );
                })
                .finally(() => this.setState({ operationInProgress: false }));
    }

    onDeactivate() {
        const storagePool = this.props.storagePool;

        this.setState({ operationInProgress: true });
        storagePoolDeactivate({ connectionName: storagePool.connectionName, objPath: storagePool.id })
                .catch(exc => {
                    store.dispatch(
                        updateOrAddStoragePool({
                            connectionName: storagePool.connectionName,
                            name: storagePool.name,
                            error: {
                                text: cockpit.format(_("Storage pool $0 failed to get deactivated"), storagePool.name),
                                detail: exc.message,
                            }
                        }, true)
                    );
                })
                .finally(() => this.setState({ operationInProgress: false }));
    }

    render() {
        const { storagePool, vms } = this.props;
        const id = storagePoolId(storagePool.name, storagePool.connectionName);
        let deactivateButton = (
            <Button id={`deactivate-${id}`}
                variant='secondary'
                isLoading={this.state.operationInProgress}
                isDisabled={this.state.operationInProgress}
                onClick={this.onDeactivate}>
                {_("Deactivate")}
            </Button>
        );
        let activateButton = (
            <Button id={`activate-${id}`}
                variant='secondary'
                isLoading={this.state.operationInProgress}
                isDisabled={this.state.operationInProgress}
                onClick={this.onActivate}>
                {_("Activate")}
            </Button>
        );
        if (this.state.operationInProgress) {
            deactivateButton = (
                <Tooltip id="tip-in-progress" content={_("Operation is in progress")}>
                    <span>
                        {deactivateButton}
                    </span>
                </Tooltip>
            );
            activateButton = (
                <Tooltip id="tip-in-progress" content={_("Operation is in progress")}>
                    <span>
                        {activateButton}
                    </span>
                </Tooltip>
            );
        }

        const dropdownItems = [
            <StoragePoolDeleteAction key="storage-pool-delete-action"
                                     storagePool={storagePool}
                                     vms={vms} />
        ];

        return (
            <div className="btn-group">
                { storagePool.active && deactivateButton }
                { !storagePool.active && activateButton }
                <KebabDropdown toggleButtonId={`${id}-action-kebab`} position='right' dropdownItems={dropdownItems} />
            </div>
        );
    }
}
