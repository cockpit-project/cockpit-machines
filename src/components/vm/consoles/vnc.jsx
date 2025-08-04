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

import React, { useState } from 'react';
import cockpit from 'cockpit';

import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { EyeIcon, EyeSlashIcon, PendingIcon } from "@patternfly/react-icons";

import {
    EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions
} from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Dropdown, DropdownList, DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";

import { Modal, ModalVariant } from '@patternfly/react-core/dist/esm/deprecated/components/Modal';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { SimpleSelect } from 'cockpit-components-simple-select';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';
import { useDialogs } from 'dialogs';

import { logDebug } from '../../../helpers.js';
import { LaunchViewerButton, connection_address, ConsoleState } from './common';
import { domainSendKey, domainAttachVnc, domainChangeVncSettings, domainGet } from '../../../libvirtApi/domain.js';

import { VncConsole } from './VncConsole';

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

export class VncState extends ConsoleState {
    constructor() {
        super();
        this.sizeMode = "none";
    }

    setSizeMode(val) {
        this.sizeMode = val;
        this.update();
    }
}

const VncEditModal = ({ vm, inactive_vnc }) => {
    const config_port = (inactive_vnc.port == -1) ? "" : (inactive_vnc.port || "");
    const config_password = inactive_vnc.password || "";

    const Dialogs = useDialogs();
    const [port, setPort] = useState(config_port);
    const [password, setPassword] = useState(config_password);
    const [showPassword, setShowPassword] = useState(false);
    const [portError, setPortError] = useState(null);
    const [passwordError, setPasswordError] = useState(null);
    const [applyError, setApplyError] = useState(null);
    const [applyErrorDetail, setApplyErrorDetail] = useState(null);

    function validate() {
        let field_errors = 0;
        if (port != "") {
            if (!port.match("^[0-9]+$")) {
                setPortError(_("Port must be a number."));
                field_errors += 1;
            } else if (Number(port) < 5900) {
                setPortError(_("Port must be 5900 or larger."));
                field_errors += 1;
            }
        }

        if (password.length > 8) {
            setPasswordError(_("Password must be at most 8 characters."));
            field_errors += 1;
        }

        return field_errors == 0;
    }

    async function apply() {
        if (!validate())
            return;

        setPortError(null);
        setPasswordError(null);

        const vncParams = {
            listen: inactive_vnc.address || "",
            port,
            password,
        };

        try {
            await domainChangeVncSettings(vm, vncParams);
            domainGet({ connectionName: vm.connectionName, id: vm.id });
            Dialogs.close();
        } catch (ex) {
            setApplyError(_("VNC settings could not be saved"));
            setApplyErrorDetail(ex.message);
        }
    }

    return (
        <Modal
            id="vnc-edit-dialog"
            position="top"
            variant={ModalVariant.medium}
            title={_("Edit VNC settings")}
            isOpen
            onClose={Dialogs.close}
            footer={
                <>
                    <Button
                         id="vnc-edit-save"
                         isDisabled={!!(portError || passwordError)}
                         variant='primary'
                         onClick={apply}
                    >
                        {_("Save")}
                    </Button>
                    <Button id="vnc-edit-cancel" variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </>
            }
        >
            { vm.state === 'running' && !applyError &&
                <NeedsShutdownAlert idPrefix="vnc-edit" />
            }
            { applyError &&
                <ModalError dialogError={applyError} dialogErrorDetail={applyErrorDetail} />
            }
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <FormGroup label={_("Port")}>
                    <TextInput
                        id="vnc-edit-port"
                        type="text"
                        value={port}
                        onChange={(_ev, val) => { setPortError(null); setPort(val) }}
                        onBlur={validate}
                    />
                    <FormHelperText>
                        <HelperText>
                            { portError
                                ? <HelperTextItem variant='error'>{portError}</HelperTextItem>
                                : <HelperTextItem>
                                    {_("Port must be a number that is at least 5900. Leave empty to automatically assign a free port when the machine starts.")}
                                </HelperTextItem>
                            }
                        </HelperText>
                    </FormHelperText>
                </FormGroup>
                <FormGroup label={_("Password")}>
                    <InputGroup>
                        <TextInput
                            id="vnc-edit-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(_ev, val) => { setPasswordError(null); setPassword(val) }}
                            onBlur={validate}
                        />
                        <Button
                            variant="control"
                            onClick={() => setShowPassword(!showPassword)}>
                            { showPassword ? <EyeSlashIcon /> : <EyeIcon /> }
                        </Button>
                    </InputGroup>
                    <FormHelperText>
                        <HelperText>
                            { passwordError
                                ? <HelperTextItem variant='error'>{passwordError}</HelperTextItem>
                                : <HelperTextItem>
                                    {_("Password must be 8 characters or less. VNC passwords do not provide encryption and are generally cryptographically weak. They can not be used to secure connections in untrusted networks.")}
                                </HelperTextItem>
                            }
                        </HelperText>
                    </FormHelperText>
                </FormGroup>
            </Form>
        </Modal>
    );
};

export const VncActiveActions = ({ state, vm, vnc, isExpanded, onAddErrorNotification }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!state.connected)
        return null;

    let scale_resize_dropdown = null;
    if (isExpanded) {
        scale_resize_dropdown = (
            <SimpleSelect
                toggleProps={{ id: "vm-console-vnc-scaling" }}
                options={
                    [
                        { value: "none", content: _("No scaling or resizing") },
                        { value: "local", content: _("Local scaling") },
                        { value: "remote", content: _("Remote resizing") },
                    ]
                }
                selected={state.sizeMode}
                onSelect={val => state.setSizeMode(val)}
            />
        );
    }

    const renderDropdownItem = keyName => {
        return (
            <DropdownItem
                id={cockpit.format("ctrl-alt-$0", keyName)}
                key={cockpit.format("ctrl-alt-$0", keyName)}
                isDisabled={!state.connected}
                onClick={() => {
                    return domainSendKey({
                        connectionName: vm.connectionName,
                        id: vm.id,
                        keyCodes: [
                            Enum.KEY_LEFTCTRL,
                            Enum.KEY_LEFTALT,
                            Enum[cockpit.format("KEY_$0", keyName.toUpperCase())]
                        ]
                    })
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
    ];

    return (
        <>
            {scale_resize_dropdown}
            <Dropdown
                onOpenChange={setIsOpen}
                onSelect={() => setIsOpen(false)}
                toggle={(toggleRef) => (
                    <MenuToggle
                        id="vnc-actions"
                        ref={toggleRef}
                        onClick={() => setIsOpen(!isOpen)}
                        isExpanded={isOpen}
                    >
                        {_("Send key")}
                    </MenuToggle>
                )}
                isOpen={isOpen}
            >
                <DropdownList>
                    {dropdownItems}
                </DropdownList>
            </Dropdown>
        </>
    );
};

const VncFooter = ({ vm, vnc, inactive_vnc, onAddErrorNotification }) => {
    const Dialogs = useDialogs();

    return (
        <div className="vm-console-footer">
            <Split>
                <SplitItem isFilled />
                <SplitItem>
                    <LaunchViewerButton
                        vm={vm}
                        console={vnc}
                        url={vnc && cockpit.format("vnc://$0:$1", connection_address(), vnc.port)}
                        onEdit={() => Dialogs.show(<VncEditModal vm={vm} inactive_vnc={inactive_vnc} />)}
                        editLabel={_("Edit VNC settings")}
                    />
                </SplitItem>
            </Split>
        </div>
    );
};

export class VncActive extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            path: undefined,
        };

        this.credentials = null;

        this.connect = this.connect.bind(this);
        this.onConnected = this.onConnected.bind(this);
        this.onDisconnected = this.onDisconnected.bind(this);
        this.onInitFailed = this.onInitFailed.bind(this);
        this.onSecurityFailure = this.onSecurityFailure.bind(this);

        this.observer = new MutationObserver(entries => {
            if (entries.length > 0)
                this.report_remote_size(entries[0].target);
        });
    }

    report_remote_size(canvas) {
        const width = canvas.getAttribute("width");
        const height = canvas.getAttribute("height");
        if (width && height && Number(width) > 0 && Number(height) > 0) {
            this.props.onRemoteSizeChanged(Number(width), Number(height), this.props.state.sizeMode);
        }
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

    onConnected(vnc_element) {
        let canvas = null;
        if (this.props.onRemoteSizeChanged)
            canvas = vnc_element.querySelector("canvas");
        if (canvas) {
            this.observer.observe(canvas, { attributes: true });
            this.report_remote_size(canvas);
        } else
            this.observer.disconnect();
    }

    onDisconnected(detail) { // server disconnected
        console.info('Connection lost: ', detail);
        this.props.state.setConnected(false);
    }

    onInitFailed(detail) {
        console.error('VncConsole failed to init: ', detail, this);
    }

    onSecurityFailure(event) {
        console.info('Security failure:', event?.detail?.reason || "unknown reason");
    }

    render() {
        const {
            consoleDetail, inactiveConsoleDetail, vm, onAddErrorNotification, isExpanded,
            state,
        } = this.props;
        const { path } = this.state;

        if (!path) {
            // postpone rendering until consoleDetail is known and channel ready
            return null;
        }

        // We must pass the very same object to VncConsole.credentials
        // on every render. Otherwise VncConsole thinks credentials
        // have changed and will reconnect.
        if (!this.credentials || this.credentials.password != consoleDetail.password)
            this.credentials = { password: consoleDetail.password };

        const encrypt = this.getEncrypt();

        const footer = !isExpanded && (
            <VncFooter
                vm={vm}
                vnc={consoleDetail}
                inactive_vnc={inactiveConsoleDetail}
                onAddErrorNotification={onAddErrorNotification}
            />
        );

        return (
            <>
                { state.connected
                    ? <VncConsole
                          host={window.location.hostname}
                          port={window.location.port || (encrypt ? '443' : '80')}
                          path={path}
                          encrypt={encrypt}
                          shared
                          credentials={this.credentials}
                          vncLogging={ window.debugging?.includes("vnc") ? 'debug' : 'warn' }
                          onConnected={this.onConnected}
                          onDisconnected={this.onDisconnected}
                          onInitFailed={this.onInitFailed}
                          onSecurityFailure={this.onSecurityFailure}
                          consoleContainerId={isExpanded ? "vnc-display-container-expanded" : "vnc-display-container-minimized"}
                          scaleViewport={!isExpanded || state.sizeMode == "local"}
                          resizeSession={!!isExpanded && state.sizeMode == "remote"}
                    />
                    : <div className="vm-console-vnc">
                        <EmptyState>
                            <EmptyStateBody>{_("Disconnected")}</EmptyStateBody>
                            <EmptyStateFooter>
                                <Button variant="primary" onClick={() => state.setConnected(true)}>
                                    {_("Connect")}
                                </Button>
                            </EmptyStateFooter>
                        </EmptyState>
                    </div>
                }
                {footer}
            </>
        );
    }
}

export const VncInactive = ({ vm, inactive_vnc, isExpanded, onAddErrorNotification }) => {
    return (
        <>
            <EmptyState>
                <EmptyStateBody>
                    {_("Start the virtual machine to access the console")}
                </EmptyStateBody>
            </EmptyState>
            { !isExpanded &&
                <VncFooter
                    vm={vm}
                    inactive_vnc={inactive_vnc}
                    onAddErrorNotification={onAddErrorNotification} />
            }
        </>
    );
};

export const VncMissing = ({ vm, onAddErrorNotification }) => {
    const [inProgress, setInProgress] = useState(false);

    function add_vnc() {
        setInProgress(true);
        domainAttachVnc(vm, { })
                .catch(ex => onAddErrorNotification({
                    text: cockpit.format(_("Failed to add VNC to VM $0"), vm.name),
                    detail: ex.message,
                    resourceId: vm.id,
                }))
                .finally(() => setInProgress(false));
    }

    return (
        <EmptyState>
            <EmptyStateBody>
                {_("Graphical console support not enabled")}
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button
                        variant="secondary"
                        onClick={add_vnc}
                        isLoading={inProgress}
                        disabled={inProgress}
                    >
                        {_("Add VNC")}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        </EmptyState>
    );
};

export const VncPending = ({ vm, inactive_vnc, isExpanded, onAddErrorNotification }) => {
    return (
        <>
            <EmptyState icon={PendingIcon} status="custom">
                <EmptyStateBody>
                    {_("Restart this virtual machine to access its graphical console")}
                </EmptyStateBody>
            </EmptyState>
            { !isExpanded &&
                <VncFooter
                    vm={vm}
                    inactive_vnc={inactive_vnc}
                    onAddErrorNotification={onAddErrorNotification} />
            }
        </>
    );
};
