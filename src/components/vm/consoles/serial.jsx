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

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import {
    EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions
} from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Terminal } from "cockpit-components-terminal.jsx";
import { PendingIcon } from "@patternfly/react-icons";

import { domainAttachSerialConsole } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export class SerialActive extends React.Component {
    constructor (props) {
        super(props);

        this.state = {
            channel: undefined,
        };
    }

    componentDidMount() {
        this.updateChannel(this.props.spawnArgs);
    }

    componentDidUpdate(prevProps) {
        const oldSpawnArgs = prevProps.spawnArgs;
        const newSpawnArgs = this.props.spawnArgs;

        const channel_needs_update = () => {
            if (newSpawnArgs.length !== oldSpawnArgs.length ||
                oldSpawnArgs.some((arg, index) => arg !== newSpawnArgs[index]))
                return true;
            if (this.props.state.connected && !this.state.channel)
                return true;
            if (!this.props.state.connected && this.state.channel)
                return true;
            return false;
        };

        if (channel_needs_update())
            this.updateChannel(this.props.spawnArgs);
    }

    updateChannel() {
        if (this.state.channel)
            this.state.channel.close();

        if (this.props.state.connected) {
            const opts = {
                payload: "stream",
                spawn: this.props.spawnArgs,
                pty: true,
            };
            if (this.props.connectionName == "system")
                opts.superuser = "try";
            const channel = cockpit.channel(opts);
            this.setState({ channel });
        } else {
            this.setState({ channel: null });
        }
    }

    render () {
        const { state } = this.props;

        const pid = this.props.vmName + "-terminal";
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
        } else if (!this.state.channel) {
            t = <span>{_("Loading...")}</span>;
        } else {
            t = (
                <Terminal
                    refName={this.props.vmName}
                    channel={this.state.channel}
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
}

SerialActive.propTypes = {
    connectionName: PropTypes.string.isRequired,
    vmName: PropTypes.string.isRequired,
    spawnArgs: PropTypes.array.isRequired,
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
