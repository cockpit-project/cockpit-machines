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
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { Dropdown, DropdownItem, DropdownList } from "@patternfly/react-core/dist/esm/components/Dropdown";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { EmptyState, EmptyStateBody, EmptyStateFooter } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";
import { DescriptionList, DescriptionListTerm, DescriptionListGroup, DescriptionListDescription } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Text, TextContent, TextVariants, TextList, TextListItem, TextListItemVariants, TextListVariants } from "@patternfly/react-core/dist/esm/components/Text";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";

import { useDialogs, DialogsContext } from 'dialogs.jsx';
import { KebabDropdown } from 'cockpit-components-dropdown.jsx';
import { fmt_to_fragments } from 'utils.jsx';

import { logDebug } from '../../../helpers.js';
import { domainSendKey } from '../../../libvirtApi/domain.js';
import { AddVNC } from './vncAdd.jsx';
import { EditVNCModal } from './vncEdit.jsx';
import { ReplaceSpiceDialog } from '../vmReplaceSpiceDialog.jsx';

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

export const VncState = ({ vm, vnc, spice }) => {
    const Dialogs = useDialogs();

    function add_vnc() {
        Dialogs.show(<AddVNC idPrefix="add-vnc" vm={vm} />);
    }

    function edit_vnc() {
        Dialogs.show(<EditVNCModal idPrefix="edit-vnc" vm={vm} consoleDetail={vnc} />);
    }

    function replace_spice() {
        Dialogs.show(<ReplaceSpiceDialog vm={vm} vms={[vm]} />);
    }

    if (vm.state == "running" && !vnc) {
        if (!spice) {
            return (
                <EmptyState>
                    <EmptyStateBody>
                        {_("Graphical support not enabled.")}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <Button variant="secondary" onClick={add_vnc}>
                            {_("Add VNC")}
                        </Button>
                    </EmptyStateFooter>
                </EmptyState>
            );
        } else {
            return (
                <EmptyState>
                    <EmptyStateBody>
                        {_("SPICE graphical console can not be shown here.")}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <Button variant="secondary" onClick={replace_spice}>
                            {_("Convert to VNC")}
                        </Button>
                    </EmptyStateFooter>
                </EmptyState>
            );
        }
    }

    let vnc_info;
    let vnc_action;

    if (!vnc) {
        if (!spice) {
            vnc_info = _("not supported");
            vnc_action = (
                <Button variant="link" isInline onClick={add_vnc}>
                    {_("Add support")}
                </Button>
            );
        } else {
            vnc_info = _("SPICE, can not be shown here");
            vnc_action = (
                <Button variant="link" isInline onClick={replace_spice}>
                    {_("Convert to VNC")}
                </Button>
            );
        }
    } else {
        if (vnc.port == -1)
            vnc_info = _("VNC, dynamic port");
        else
            vnc_info = cockpit.format(_("VNC, port $0"), vnc.port);

        vnc_action = (
            <Button variant="link" isInline onClick={edit_vnc}>
                {_("Edit")}
            </Button>
        );
    }

    return (
        <>
            <p>
                {
                    vm.state == "running"
                        ? _("Shut down and restart the virtual machine to access the graphical console.")
                        : _("Please start the virtual machine to access its console.")
                }
            </p>
            <br />
            <div>
                <Split hasGutter>
                    <SplitItem isFilled>
                        <span><b>{_("Graphical console:")}</b> {vnc_info}</span>
                    </SplitItem>
                    <SplitItem>
                        {vnc_action}
                    </SplitItem>
                </Split>
            </div>
        </>
    );
};

const VncConnectInfo = ({ vm, connection_address, vnc, spice }) => {
    function TLI(term, description) {
        // What is this? Java?
        return (
            <>
                <TextListItem component={TextListItemVariants.dt}>{term}</TextListItem>
                <TextListItem component={TextListItemVariants.dd}>{description}</TextListItem>
            </>
        );
    }

    return (
        <>
            <TextContent>
                <Text component={TextVariants.p}>
                    {fmt_to_fragments(_('Clicking "Launch viewer" will download a $0 file and launch the Remote Viewer application on your system.'), <code>.vv</code>)}
                </Text>
                <Text component={TextVariants.p}>
                    {_('Remote Viewer is available for most operating systems. To install it, search for "Remote Viewer" in GNOME Software, KDE Discover, or run the following:')}
                </Text>
                <TextList component={TextListVariants.dl}>
                    {TLI(_("RHEL, CentOS"), <code>sudo yum install virt-viewer</code>)}
                    {TLI(_("Fedora"), <code>sudo dnf install virt-viewer</code>)}
                    {TLI(_("Ubuntu, Debian"), <code>sudo apt-get install virt-viewer</code>)}
                    {TLI(_("Windows"),
                        fmt_to_fragments(
                            _("Download the MSI from $0"),
                            <a href="https://virt-manager.org/download" target="_blank" rel="noopener noreferrer">
                                {"virt-manager.org"}
                            </a>))}
                </TextList>
                { (vnc || spice) &&
                    <>
                        <Text component={TextVariants.p}>
                            {_('Other remote viewer applications can connect to the following address:')}
                        </Text>
                        <Text component={TextVariants.p}>
                            <ClipboardCopy
                                hoverTip={_("Copy to clipboard")}
                                clickTip={_("Successfully copied to clipboard!")}
                                variant="inline-compact"
                                isCode>
                                {vnc
                                    ? cockpit.format("vnc://$0:$1", connection_address, vnc.port)
                                    : cockpit.format("spice://$0:$1", connection_address, spice.port)
                                }
                            </ClipboardCopy>
                        </Text>
                    </>
                }
            </TextContent>
        </>
    );
};

class Vnc extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {
            path: undefined,
            connected: true,
        };

        this.connect = this.connect.bind(this);
        this.onDisconnected = this.onDisconnected.bind(this);
        this.onInitFailed = this.onInitFailed.bind(this);
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
        this.setState({ connected: false });
    }

    onInitFailed(detail) {
        console.error('VncConsole failed to init: ', detail, this);
    }

    render() {
        const Dialogs = this.context;
        const {
            consoleDetail, inactiveConsoleDetail, vm, onAddErrorNotification, isExpanded, connectionAddress,
            spiceDetail,
        } = this.props;
        const { path, connected } = this.state;

        function edit_vnc() {
            Dialogs.show(<EditVNCModal
                             idPrefix="edit-vnc"
                             consoleDetail={inactiveConsoleDetail}
                             vm={vm} />);
        }

        const renderDropdownItem = keyName => {
            return (
                <DropdownItem
                    id={cockpit.format("ctrl-alt-$0", keyName)}
                    key={cockpit.format("ctrl-alt-$0", keyName)}
                    onClick={() => {
                        return domainSendKey({ connectionName: vm.connectionName, id: vm.id, keyCodes: [Enum.KEY_LEFTCTRL, Enum.KEY_LEFTALT, Enum[cockpit.format("KEY_$0", keyName.toUpperCase())]] })
                                .catch(ex => onAddErrorNotification({
                                    text: cockpit.format(_("Failed to send key Ctrl+Alt+$0 to VM $1"), keyName, vm.name),
                                    detail: ex.message,
                                    resourceId: vm.id,
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
            <Divider key="separator2" />,
            <DropdownItem
                id="vnc-edit"
                key="edit"
                onClick={edit_vnc}>
                {_("Edit VNC server settings")}
            </DropdownItem>,
            <DropdownItem
                id="vnc-disconnect"
                key="disconnect"
                onClick={() => this.setState({ connected: false })}>
                {_("Disconnect")}
            </DropdownItem>,
        ];

        const detail = (
            <Split>
                <SplitItem isFilled>
                    <Button variant="secondary" onClick={this.props.onLaunch}>{_("Launch viewer")}</Button>
                    <Popover
                        className="ct-remote-viewer-popover"
                        headerContent={_("Remote viewer")}
                        hasAutoWidth
                        bodyContent={<VncConnectInfo
                                         vm={vm}
                                         vnc={consoleDetail}
                                         spice={spiceDetail}
                                         connection_address={connectionAddress} />}>
                        <Button variant="plain">
                            {_("How to connect")}
                        </Button>
                    </Popover>
                </SplitItem>
                <SplitItem>
                    { (connected && consoleDetail) &&
                        <KebabDropdown
                            toggleButtonId={"vnc-actions"}
                            position='right'
                            dropdownItems={dropdownItems}
                        />
                    }
                </SplitItem>
            </Split>
        );

        if (!consoleDetail) {
            return (
                <>
                    <div className="pf-v5-c-console__vnc">
                        <VncState vm={vm} vnc={inactiveConsoleDetail} spice={spiceDetail} />
                    </div>
                    { spiceDetail && <div className="vm-console-footer">{detail}</div> }
                </>
            );
        }

        if (!path) {
            // postpone rendering until consoleDetail is known and channel ready
            return null;
        }

        const credentials = consoleDetail.password ? { password: consoleDetail.password } : undefined;
        const encrypt = this.getEncrypt();

        return (
            <>
                { connected
                    ? <VncConsole
                          host={window.location.hostname}
                          port={window.location.port || (encrypt ? '443' : '80')}
                          path={path}
                          encrypt={encrypt}
                          shared
                          credentials={credentials}
                          vncLogging={ window.debugging?.includes("vnc") ? 'debug' : 'warn' }
                          onDisconnected={this.onDisconnected}
                          onInitFailed={this.onInitFailed}
                          textConnecting={_("Connecting")}
                          consoleContainerId={isExpanded ? "vnc-display-container-expanded" : "vnc-display-container-minimized"}
                          resizeSession
                          scaleViewport
                    />
                    : <div className="pf-v5-c-console__vnc">
                          <EmptyState>
                              <EmptyStateBody>{_("Disconnected")}</EmptyStateBody>
                              <EmptyStateFooter>
                                  <Button variant="primary" onClick={() => this.setState({ connected: true })}>
                                      {_("Connect")}
                                  </Button>
                              </EmptyStateFooter>
                          </EmptyState>
                      </div>
                }
                <div className="vm-console-footer">{detail}</div>
            </>
        );
    }
}

// TODO: define propTypes

export default Vnc;
