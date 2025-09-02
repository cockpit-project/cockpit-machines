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
import cockpit from 'cockpit';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import {
    EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions
} from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Terminal, TerminalState } from "cockpit-components-terminal.jsx";
import { PendingIcon } from "@patternfly/react-icons";

import { domainSerialConsoleCommand, domainAttachSerialConsole } from '../../../libvirtApi/domain.js';
import { ConsoleState } from './common';

const _ = cockpit.gettext;

export class SerialState extends ConsoleState {
    vm;
    alias;
    terminal_state = null;

    constructor(vm, alias) {
        super();
        this.vm = vm;
        this.alias = alias;
    }

    getTerminalState() {
        if (!this.terminal_state) {
            const opts = {
                payload: "stream",
                spawn: domainSerialConsoleCommand({ vm: this.vm, alias: this.alias }),
                pty: true,
            };
            if (this.vm.connectionName == "system")
                opts.superuser = "try";
            const channel = cockpit.channel(opts);
            this.terminal_state = new TerminalState(channel);
        }
        return this.terminal_state;
    }

    setConnected(val) {
        if (!val && this.terminal_state) {
            this.terminal_state.close();
            this.terminal_state = null;
        }

        super.setConnected(val);
    }

    close() {
        if (this.terminal_state)
            this.terminal_state.close();
    }
}

export const SerialActive = ({ state, vm }) => {
    const pid = vm.name + "-terminal";

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
                state={state.getTerminalState()}
                parentId={pid}
            />
        );
    }
    return (
        <div id={pid} className="vm-terminal vm-console-serial">
            {t}
        </div>
    );
};

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
                    text: cockpit.format(_("Failed to add serial console to VM $0"), vm.name),
                    detail: ex.message,
                    resourceId: vm.id,
                }))
                .finally(() => setInProgress(false));
    }

    return (
        <EmptyState>
            <EmptyStateBody>
                {_("Serial console support not enabled")}
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button
                        variant="secondary"
                        onClick={add_serial}
                        isLoading={inProgress}
                        disabled={inProgress}
                    >
                        {_("Add serial console")}
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
                {_("Restart this virtual machine to access its serial console")}
            </EmptyStateBody>
        </EmptyState>
    );
};
