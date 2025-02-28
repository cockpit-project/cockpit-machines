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
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";
import {
    EmptyState, EmptyStateHeader, EmptyStateIcon, EmptyStateBody, EmptyStateFooter, EmptyStateActions
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

        this.createChannel = this.createChannel.bind(this);
        this.onDisconnect = this.onDisconnect.bind(this);
    }

    componentDidMount() {
        this.createChannel(this.props.spawnArgs);
    }

    componentDidUpdate(prevProps) {
        const oldSpawnArgs = prevProps.spawnArgs;
        const newSpawnArgs = this.props.spawnArgs;

        if (newSpawnArgs.length !== oldSpawnArgs.length || oldSpawnArgs.some((arg, index) => arg !== newSpawnArgs[index]))
            this.createChannel(this.props.spawnArgs);
    }

    createChannel (spawnArgs) {
        const opts = {
            payload: "stream",
            spawn: spawnArgs,
            pty: true,
        };
        if (this.props.connectionName == "system")
            opts.superuser = "try";
        const channel = cockpit.channel(opts);
        this.setState({ channel });
    }

    onDisconnect () {
        const channel = this.state.channel;

        if (channel) {
            channel.close();
            channel.removeEventListener('message', this.onChannelMessage);
            channel.removeEventListener('close', this.onChannelClose);
            this.setState({ channel: null });
        }
    }

    render () {
        const pid = this.props.vmName + "-terminal";
        let t = <span>{_("Loading...")}</span>;
        if (this.state.channel) {
            t = (
                <Terminal
                    refName={this.props.vmName}
                    channel={this.state.channel}
                    parentId={pid}
                />
            );
        } else if (this.state.channel === null) {
            t = <span>{_("Disconnected from serial console. Click the connect button.")}</span>;
        }

        return (
            <>
                <div id={pid} className="vm-terminal pf-v5-c-console__serial">
                    {t}
                </div>
                <div className="vm-console-footer">
                    <Split>
                        <SplitItem isFilled />
                        <SplitItem>
                            {this.state.channel
                                ? <Button id={this.props.vmName + "-serialconsole-disconnect"} variant="secondary" onClick={this.onDisconnect}>{_("Disconnect")}</Button>
                                : <Button id={this.props.vmName + "-serialconsole-connect"} variant="secondary" onClick={() => this.createChannel(this.props.spawnArgs)}>{_("Connect")}</Button>
                            }
                        </SplitItem>
                    </Split>
                </div>
            </>
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
        <EmptyState>
            <EmptyStateHeader icon={<EmptyStateIcon icon={PendingIcon} />} />
            <EmptyStateBody>
                {_("Restart this virtual machine to access its text console")}
            </EmptyStateBody>
        </EmptyState>
    );
};
