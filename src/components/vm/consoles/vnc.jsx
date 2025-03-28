/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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

import { VncConsole } from '@patternfly/react-console';
import { Dropdown, DropdownItem, DropdownList } from "@patternfly/react-core/dist/esm/components/Dropdown";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";

import { logDebug } from '../../../helpers.js';
import { domainSendKey } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;
// https://github.com/torvalds/linux/blob/master/include/uapi/linux/input-event-codes.h
const Enum = {
    KEY_BACKSPACE: 14,
    KEY_LEFTCTRL: 29,
    KEY_LEFTALT: 56,
    KEY_F1: 59,
    KEY_F2: 60,
    KEY_F3: 61,
    KEY_F4: 62,
    KEY_F5: 63,
    KEY_F6: 64,
    KEY_F7: 65,
    KEY_F8: 66,
    KEY_F9: 67,
    KEY_F10: 68,
    KEY_F11: 87,
    KEY_F12: 88,
    KEY_DELETE: 111,
};

class Vnc extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            path: undefined,
            isActionOpen: false,
        };

        this.credentials = null;

        this.connect = this.connect.bind(this);
        this.onDisconnected = this.onDisconnected.bind(this);
        this.onInitFailed = this.onInitFailed.bind(this);
        this.onSecurityFailure = this.onSecurityFailure.bind(this);
        this.onExtraKeysDropdownToggle = this.onExtraKeysDropdownToggle.bind(this);
    }

    connect(props) {
        if (this.state.path) { // already initialized
            return;
        }

        const { consoleDetail } = props;
        if (!consoleDetail || consoleDetail.port == -1 || !consoleDetail.address) {
            logDebug('Vnc component: console detail not yet provided');
            return;
        }

        cockpit.transport.wait(() => {
            const prefix = (new URL(cockpit.transport.uri("channel/" + cockpit.transport.csrf_token))).pathname;
            const query = JSON.stringify({
                payload: "stream",
                binary: "raw",
                address: consoleDetail.address,
                port: parseInt(consoleDetail.tlsPort || consoleDetail.port, 10),
                // https://issues.redhat.com/browse/COCKPIT-870
                // https://issues.redhat.com/browse/RHEL-3959
                host: cockpit.transport.host,
            });
            this.setState({
                path: `${prefix.slice(1)}?${window.btoa(query)}`,
            });
        });
    }

    componentDidMount() {
        this.connect(this.props);
    }

    componentDidUpdate() {
        this.connect(this.props);
    }

    getEncrypt() {
        return window.location.protocol === 'https:';
    }

    onDisconnected(detail) { // server disconnected
        console.info('Connection lost: ', detail);
    }

    onInitFailed(detail) {
        console.error('VncConsole failed to init: ', detail, this);
    }

    onSecurityFailure(event) {
        console.info('Security failure:', event?.detail?.reason || "unknown reason");
    }

    onExtraKeysDropdownToggle() {
        this.setState({ isActionOpen: false });
    }

    render() {
        const { consoleDetail, connectionName, vmName, vmId, onAddErrorNotification, isExpanded } = this.props;
        const { path, isActionOpen } = this.state;
        if (!consoleDetail || !path) {
            // postpone rendering until consoleDetail is known and channel ready
            return null;
        }

        // We must pass the very same object to VncConsole.credentials
        // on every render. Otherwise VncConsole thinks credentials
        // have changed and will reconnect.
        if (!this.credentials || this.credentials.password != consoleDetail.password)
            this.credentials = { password: consoleDetail.password };

        const encrypt = this.getEncrypt();
        const renderDropdownItem = keyName => {
            return (
                <DropdownItem
                    id={cockpit.format("ctrl-alt-$0", keyName)}
                    key={cockpit.format("ctrl-alt-$0", keyName)}
                    onClick={() => {
                        return domainSendKey({ connectionName, id: vmId, keyCodes: [Enum.KEY_LEFTCTRL, Enum.KEY_LEFTALT, Enum[cockpit.format("KEY_$0", keyName.toUpperCase())]] })
                                .catch(ex => onAddErrorNotification({
                                    text: cockpit.format(_("Failed to send key Ctrl+Alt+$0 to VM $1"), keyName, vmName),
                                    detail: ex.message,
                                    resourceId: vmId,
                                }));
                    }}>
                    {cockpit.format(_("Ctrl+Alt+$0"), keyName)}
                </DropdownItem>
            );
        };
        const dropdownItems = [
            ...['Delete', 'Backspace'].map(key => renderDropdownItem(key)),
            <Divider key="separator" />,
            ...[...Array(12).keys()].map(key => renderDropdownItem(cockpit.format("F$0", key + 1))),
        ];
        const additionalButtons = [
            <Dropdown onSelect={this.onExtraKeysDropdownToggle}
                key={cockpit.format("$0-$1-vnc-sendkey", vmName, connectionName)}
                toggle={(toggleRef) => (
                    <MenuToggle
                        id={cockpit.format("$0-$1-vnc-sendkey", vmName, connectionName)}
                        ref={toggleRef}
                        onClick={(_event) => this.setState({ isActionOpen: !isActionOpen })}>
                        {_("Send key")}
                    </MenuToggle>
                )}
                isOpen={isActionOpen}
            >
                <DropdownList>
                    {dropdownItems}
                </DropdownList>
            </Dropdown>
        ];

        return (
            <VncConsole host={window.location.hostname}
                        port={window.location.port || (encrypt ? '443' : '80')}
                        path={path}
                        encrypt={encrypt}
                        shared
                        credentials={this.credentials}
                        vncLogging={ window.debugging?.includes("vnc") ? 'debug' : 'warn' }
                        onDisconnected={this.onDisconnected}
                        onInitFailed={this.onInitFailed}
                        onSecurityFailure={this.onSecurityFailure}
                        additionalButtons={additionalButtons}
                        textConnecting={_("Connecting")}
                        textDisconnected={_("Disconnected")}
                        textDisconnect={_("Disconnect")}
                        consoleContainerId={isExpanded ? "vnc-display-container-expanded" : "vnc-display-container-minimized"}
                        resizeSession
                        scaleViewport
            />
        );
    }
}

// TODO: define propTypes

export default Vnc;
