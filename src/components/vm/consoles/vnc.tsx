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

import type { VM, VMGraphics } from '../../../types';
import type { Notification } from '../../../app';

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

import { logDebug, readQemuConf } from '../../../helpers.js';
import { LaunchViewerButton, connection_address, ConsoleState } from './common';
import { domainSendKey, domainAttachVnc, domainChangeVncSettings, domainGet } from '../../../libvirtApi/domain.js';

import { VncConsole, VncCredentials } from './VncConsole';

const _ = cockpit.gettext;

export type VncSizeMode = "none" | "local" | "remote";

export class VncState extends ConsoleState {
    sizeMode: VncSizeMode = "none";

    setSizeMode(val: VncSizeMode) {
        this.sizeMode = val;
        this.update();
    }
}

const VncEditModal = ({
    vm,
    inactive_vnc
} : {
    vm: VM,
    inactive_vnc: VMGraphics,
}) => {
    const config_port = (Number(inactive_vnc.port) == -1) ? "" : (inactive_vnc.port || "");
    const config_password = inactive_vnc.password || "";

    const Dialogs = useDialogs();
    const [port, setPort] = useState(config_port);
    const [password, setPassword] = useState(config_password);
    const [showPassword, setShowPassword] = useState(false);
    const [portError, setPortError] = useState<null | string>(null);
    const [passwordError, setPasswordError] = useState<null | string>(null);
    const [applyError, setApplyError] = useState<null | string>(null);
    const [applyErrorDetail, setApplyErrorDetail] = useState<string>("");

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
            setApplyErrorDetail(String(ex));
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

// https://github.com/torvalds/linux/blob/master/include/uapi/linux/input-event-codes.h
const ResetKeys = {
    Backspace: 14,
    Delete: 111,
};

const FunctionKeys = {
    F1: 59,
    F2: 60,
    F3: 61,
    F4: 62,
    F5: 63,
    F6: 64,
    F7: 65,
    F8: 66,
    F9: 67,
    F10: 68,
    F11: 87,
    F12: 88,
};

const Modifiers = {
    LEFTCTRL: 29,
    LEFTALT: 56,
};

export const VncActiveActions = ({
    state,
    vm,
    onAddErrorNotification,
    isExpanded,
} : {
    state: VncState,
    vm: VM,
    onAddErrorNotification: (notification: Notification) => void,
    isExpanded: boolean,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!state.connected)
        return null;

    let scale_resize_dropdown = null;
    if (isExpanded) {
        scale_resize_dropdown = (
            <SimpleSelect<VncSizeMode>
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
                popperProps={{ position: "end" }}
            />
        );
    }

    const renderDropdownItem = ([keyName, keyCode] : [string, number]) => {
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
                            Modifiers.LEFTCTRL,
                            Modifiers.LEFTALT,
                            keyCode,
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
        ...Object.entries(ResetKeys).map(renderDropdownItem),
        <Divider key="separator" />,
        ...Object.entries(FunctionKeys).map(renderDropdownItem),
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
                popperProps={{ position: "end" }}
            >
                <DropdownList>
                    {dropdownItems}
                </DropdownList>
            </Dropdown>
        </>
    );
};

const VncFooter = ({
    vm,
    vnc,
    inactive_vnc,
} : {
    vm: VM,
    vnc: null | VMGraphics,
    inactive_vnc: undefined | VMGraphics,
}) => {
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
                        onEdit={
                            inactive_vnc
                                ? () => Dialogs.show(<VncEditModal vm={vm} inactive_vnc={inactive_vnc} />)
                                : null
                        }
                        editLabel={_("Edit VNC settings")}
                    />
                </SplitItem>
            </Split>
        </div>
    );
};

interface VncActiveProps {
    vm: VM,
    consoleDetail: VMGraphics;
    inactiveConsoleDetail: VMGraphics | undefined;
    isExpanded: boolean;
    state: VncState;
    onRemoteSizeChanged?: (width: number, height: number, mode: VncSizeMode) => void,
}

interface VncActiveState {
    path: undefined | string;
}

export class VncActive extends React.Component<VncActiveProps, VncActiveState> {
    credentials: null | VncCredentials = null;
    observer: MutationObserver;

    constructor(props: VncActiveProps) {
        super(props);
        this.state = {
            path: undefined,
        };

        this.connect = this.connect.bind(this);
        this.onConnected = this.onConnected.bind(this);
        this.onDisconnected = this.onDisconnected.bind(this);
        this.getCredentials = this.getCredentials.bind(this);
        this.onInitFailed = this.onInitFailed.bind(this);
        this.onSecurityFailure = this.onSecurityFailure.bind(this);

        this.observer = new MutationObserver(entries => {
            if (entries.length > 0 && entries[0].target instanceof HTMLElement)
                this.report_remote_size(entries[0].target);
        });
    }

    report_remote_size(canvas: HTMLElement) {
        const width = canvas.getAttribute("width");
        const height = canvas.getAttribute("height");
        if (this.props.onRemoteSizeChanged && width && height && Number(width) > 0 && Number(height) > 0) {
            this.props.onRemoteSizeChanged(Number(width), Number(height), this.props.state.sizeMode);
        }
    }

    connect(props: VncActiveProps) {
        if (this.state.path) { // already initialized
            return;
        }

        const { consoleDetail } = props;
        if (!consoleDetail || Number(consoleDetail.port) == -1 || !consoleDetail.address) {
            logDebug('Vnc component: console detail not yet provided');
            return;
        }

        cockpit.transport.wait(() => {
            const portStr = consoleDetail.tlsPort || consoleDetail.port;
            if (!portStr)
                return;

            const prefix = (new URL(cockpit.transport.uri("channel/" + cockpit.transport.csrf_token))).pathname;
            const query = JSON.stringify({
                payload: "stream",
                binary: "raw",
                address: consoleDetail.address,
                port: parseInt(portStr, 10),
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

    getEncrypt(): boolean {
        return window.location.protocol === 'https:';
    }

    async getCredentials() {
        let password = this.props.consoleDetail.password || "";
        if (!password) {
            const qemu_conf = await readQemuConf();
            if (qemu_conf.vnc_password)
                password = qemu_conf.vnc_password;
        }
        return { password };
    }

    onConnected(vnc_element: HTMLElement | null) {
        let canvas = null;
        if (vnc_element && this.props.onRemoteSizeChanged)
            canvas = vnc_element.querySelector("canvas");
        if (canvas) {
            this.observer.observe(canvas, { attributes: true });
            this.report_remote_size(canvas);
        } else
            this.observer.disconnect();
    }

    onDisconnected(clean: boolean) { // server disconnected
        console.info('Connection lost: ', clean ? "clean" : "unclean");
        this.props.state.setConnected(false);
    }

    onInitFailed(detail: unknown) {
        console.error('VncConsole failed to init: ', detail, this);
    }

    onSecurityFailure(reason: string | undefined) {
        console.info('Security failure:', reason || "unknown reason");
    }

    render() {
        const {
            consoleDetail, inactiveConsoleDetail, vm, isExpanded,
            state,
        } = this.props;
        const { path } = this.state;

        if (!path) {
            // postpone rendering until consoleDetail is known and channel ready
            return null;
        }

        const encrypt = this.getEncrypt();

        const footer = !isExpanded && (
            <VncFooter
                vm={vm}
                vnc={consoleDetail}
                inactive_vnc={inactiveConsoleDetail}
            />
        );

        let scaleViewport = true;
        let resizeSession = false;
        if (isExpanded) {
            scaleViewport = (state.sizeMode == "local");
            resizeSession = (state.sizeMode == "remote");
        }

        // Older versions of Cockpit would erroneously never close the
        // remote end of a external channel when the local end was
        // closed by the browser.  When this bug is present, all
        // connections to the VNC server that we make here will stay
        // open forever.  This is especially bad with non-shared
        // connections: As long as it is open, no other connections
        // can be made, not even other non-shared ones.
        //
        // Thus, we only make non-shared connections when this bug is
        // fixed, which cockpit-ws will tell us via the transport
        // capabilities.

        const caps = cockpit.transport.options.capabilities;
        const bug_is_fixed = Array.isArray(caps) && caps.includes("websocket-channel-close-fix");
        const shared = !(resizeSession && bug_is_fixed);

        return (
            <>
                { state.connected
                    ? <VncConsole
                          host={window.location.hostname}
                          port={window.location.port || (encrypt ? '443' : '80')}
                          path={path}
                          encrypt={encrypt}
                          onConnected={this.onConnected}
                          onDisconnected={this.onDisconnected}
                          getCredentials={this.getCredentials}
                          onInitFailed={this.onInitFailed}
                          onSecurityFailure={this.onSecurityFailure}
                          consoleContainerId={isExpanded ? "vnc-display-container-expanded" : "vnc-display-container-minimized"}
                          scaleViewport={scaleViewport}
                          resizeSession={resizeSession}
                          shared={shared}
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

export const VncInactive = ({
    vm,
    inactive_vnc,
    isExpanded,
} : {
    vm: VM,
    inactive_vnc: VMGraphics,
    isExpanded: boolean,
}) => {
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
                    vnc={null}
                    inactive_vnc={inactive_vnc}
                />
            }
        </>
    );
};

export const VncMissing = ({
    vm,
    onAddErrorNotification
} : {
    vm: VM,
    onAddErrorNotification: (notification: Notification) => void,
}) => {
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

export const VncPending = ({
    vm,
    inactive_vnc,
    isExpanded,
} : {
    vm: VM,
    inactive_vnc: VMGraphics,
    isExpanded: boolean,
}) => {
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
                    vnc={null}
                    inactive_vnc={inactive_vnc}
                />
            }
        </>
    );
};
