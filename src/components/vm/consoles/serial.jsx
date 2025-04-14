/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { StateObject } from './state';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import {
    EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions
} from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Terminal, TerminalState } from "cockpit-components-terminal.jsx";
import { PendingIcon } from "@patternfly/react-icons";
import { KebabDropdown } from 'cockpit-components-dropdown.jsx';
import { DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";

import { domainAttachSerialConsole } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export class SerialState extends StateObject {
    constructor (spawnArgs, connectionName) {
        super();
        this.connected = true;

        function createChannel() {
            const opts = {
                payload: "stream",
                spawn: spawnArgs,
                pty: true,
            };
            if (connectionName == "system")
                opts.superuser = "try";
            return cockpit.channel(opts);
        }

        this.terminal_state = new TerminalState(createChannel);
    }

    updateChannel() {
        if (this.connected)
            this.terminal_state.connectChannel();
        else
            this.terminal_state.disconnectChannel();
    }

    close() {
        this.terminal_state.close();
    }

    setConnected(val) {
        this.connected = val;
        this.update();
    }
}

export const SerialActiveActions = ({ state }) => {
    const dropdownItems = [
        <DropdownItem
            key="disconnect"
            onClick={() => state.setConnected(false)}
            isDisabled={!state.connected}
        >
            {_("Disconnect")}
        </DropdownItem>,
    ];

    return (
        <KebabDropdown
            position='right'
            dropdownItems={dropdownItems}
        />
    );
};

export const SerialActive = ({ vmName, state }) => {
    state.updateChannel();

    const pid = vmName + "-terminal";
    let t;
    if (!state.connected) {
        t = (
            <EmptyState>
                <EmptyStateBody>{_("Disconnected")}</EmptyStateBody>
                <EmptyStateFooter>
                    <Button variant="primary" onClick={() => state.setConnected(true)}>
                        {_("Connect")}
                    </Button>
                </EmptyStateFooter>
            </EmptyState>
        );
    } else {
        t = (
            <Terminal
                state={state.terminal_state}
                refName={vmName}
                parentId={pid}
            />
        );
    }

    return (
        <div id={pid} className="vm-terminal vm-console-serial">
            {t}
        </div>
    );
}

export const SerialInactive = ({ vm }) => {
    return (
        <EmptyState>
            <EmptyStateBody>
                {_("Start the virtual machine to access the console")}
            </EmptyStateBody>
        </EmptyState>
    );
};

export const SerialMissing = ({ vm, onAddErrorNotification }) => {
    const [inProgress, setInProgress] = useState(false);

    function add_serial() {
        setInProgress(true);
        domainAttachSerialConsole(vm)
                .catch(ex => onAddErrorNotification({
                    text: cockpit.format(_("Failed to add text console to VM $0"), vm.name),
                    detail: ex.message,
                    resourceId: vm.id,
                }))
                .finally(() => setInProgress(false));
    }

    return (
        <EmptyState>
            <EmptyStateBody>
                {_("Text console support not enabled")}
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button
                        variant="secondary"
                        onClick={add_serial}
                        isLoading={inProgress}
                        disabled={inProgress}
                    >
                        {_("Add text console")}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        </EmptyState>
    );
};

export const SerialPending = ({ vm }) => {
    return (
        <EmptyState icon={PendingIcon} status="custom">
            <EmptyStateBody>
                {_("Restart this virtual machine to access its text console")}
            </EmptyStateBody>
        </EmptyState>
    );
};
