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
import React, { useState } from 'react';
import { Button, DropdownItem, Dropdown, KebabToggle, Tooltip } from '@patternfly/react-core';

import {
    rephraseUI,
    networkId
} from '../../helpers.js';
import StateIcon from '../common/stateIcon.jsx';
import { updateOrAddNetwork } from '../../actions/store-actions.js';
import { NetworkOverviewTab } from './networkOverviewTab.jsx';
import { DeleteResourceModal } from '../common/deleteResource.jsx';
import {
    networkActivate,
    networkDeactivate,
    networkUndefine
} from '../../libvirtApi/network.js';
import store from '../../store.js';

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const getNetworkRow = ({ network, onAddErrorNotification }) => {
    const idPrefix = `${networkId(network.name, network.connectionName)}`;
    const name = (
        <span id={`${idPrefix}-name`}>
            { network.name }
        </span>);
    const device = (
        <span id={`${idPrefix}-device`}>
            { network.bridge && network.bridge.name }
        </span>);
    const forwarding = (
        <span id={`${idPrefix}-forwarding`}>
            { rephraseUI('networkForward', network.forward ? network.forward.mode : "none") }
        </span>);
    const state = (
        <StateIcon error={network.error} state={network.active ? _("active") : "inactive" }
                   valueId={`${idPrefix}-state`}
                   dismissError={() => store.dispatch(updateOrAddNetwork({
                       connectionName: network.connectionName,
                       name: network.name,
                       error: null
                   }))} />
    );
    const cols = [
        { title: name, header: true },
        { title: device },
        { title: rephraseUI('connections', network.connectionName) },
        { title: forwarding },
        { title: state },
        { title: <NetworkActions network={network} /> }
    ];

    const expandedContent = <NetworkOverviewTab network={network} />;

    return {
        columns: cols,
        props: { key: network.uuid, 'data-row-id': idPrefix },
        expandedContent: expandedContent,
        hasPadding: true,
    };
};

const NetworkActions = ({ network }) => {
    const [isActionOpen, setIsActionOpen] = useState(false);
    const [deleteDialogProps, setDeleteDialogProps] = useState();
    const [operationInProgress, setOperationInProgress] = useState(false);

    const onActivate = () => {
        setOperationInProgress(true);
        networkActivate({ connectionName: network.connectionName, objPath: network.id })
                .finally(() => setOperationInProgress(false))
                .catch(exc => {
                    store.dispatch(
                        updateOrAddNetwork({
                            connectionName: network.connectionName,
                            name: network.name,
                            error: {
                                text: cockpit.format(_("Network $0 failed to get activated"), network.name),
                                detail: exc.message,
                            }
                        }, true)
                    );
                });
    };

    const onDeactivate = () => {
        setOperationInProgress(true);
        networkDeactivate({ connectionName: network.connectionName, objPath: network.id })
                .finally(() => setOperationInProgress(false))
                .catch(exc => {
                    store.dispatch(
                        updateOrAddNetwork({
                            connectionName: network.connectionName,
                            name: network.name,
                            error: {
                                text: cockpit.format(_("Network $0 failed to get deactivated"), network.name),
                                detail: exc.message,
                            }
                        }, true)
                    );
                });
    };

    const id = networkId(network.name, network.connectionName);
    const deleteHandler = (network) => {
        if (network.active) {
            return networkDeactivate({ connectionName: network.connectionName, objPath: network.id })
                    .then(() => networkUndefine({ connectionName: network.connectionName, objPath: network.id }));
        } else {
            return networkUndefine({ connectionName: network.connectionName, objPath: network.id });
        }
    };
    const dialogProps = {
        objectType: "Network",
        objectName: network.name,
        onClose: () => setDeleteDialogProps(undefined),
        deleteHandler: () => deleteHandler(network),
    };

    const dropdownItemContent = (
        !network.persistent
            ? <Tooltip content={_("Non-persistent network cannot be deleted. It ceases to exists when it's deactivated.")}>
                <span>{_("Delete")}</span>
            </Tooltip>
            : _("Delete")
    );
    const dropdownItems = [
        <DropdownItem key={`delete-${id}`}
                      id={`delete-${id}`}
                      className="pf-m-danger"
                      isAriaDisabled={!network.persistent}
                      onClick={() => setDeleteDialogProps(dialogProps)}>
            {dropdownItemContent}
        </DropdownItem>
    ];

    return (
        <div className="btn-group">
            { network.active &&
            <Button id={`deactivate-${id}`} variant="secondary" isLoading={operationInProgress} isDisabled={operationInProgress} onClick={onDeactivate}>
                {_("Deactivate")}
            </Button> }
            { !network.active &&
            <Button id={`activate-${id}`} variant="secondary" isLoading={operationInProgress} isDisabled={operationInProgress} onClick={onActivate}>
                {_("Activate")}
            </Button>
            }
            {deleteDialogProps && <DeleteResourceModal {...deleteDialogProps} />}
            <Dropdown onSelect={() => setIsActionOpen(!isActionOpen)}
                      id={`${id}-action-kebab`}
                      toggle={<KebabToggle onToggle={isOpen => setIsActionOpen(isOpen)} />}
                      isPlain
                      isOpen={isActionOpen}
                      position='right'
                      dropdownItems={dropdownItems} />
        </div>
    );
};
