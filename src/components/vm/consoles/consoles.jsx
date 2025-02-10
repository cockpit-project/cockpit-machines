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
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { AccessConsoles } from "@patternfly/react-console";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import {
    EmptyState, EmptyStateHeader, EmptyStateBody, EmptyStateFooter, EmptyStateActions, EmptyStateIcon
} from "@patternfly/react-core/dist/esm/components/EmptyState";
import { PendingIcon, ExpandIcon, CompressIcon, HelpIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';

import { useDialogs } from 'dialogs.jsx';

import SerialConsole from './serialConsole.jsx';
import Vnc from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';
import { AddEditVNCModal } from './vncAddEdit.jsx';

import {
    domainCanConsole,
    domainDesktopConsole,
    domainSerialConsoleCommand
} from '../../../libvirtApi/domain.js';
import { vmId } from "../../../helpers.js";

import './consoles.css';

const _ = cockpit.gettext;

export const ConsoleEmptyState = ({ vm, type }) => {
    const Dialogs = useDialogs();
    const inactive_vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');

    if (type != "vnc") {
        return (
            <EmptyState>
                <EmptyStateBody>
                    {_("Start the virtual machine to access this console")}
                </EmptyStateBody>
            </EmptyState>
        );
    }

    function add_vnc() {
        Dialogs.show(<AddEditVNCModal idPrefix="add-vnc" vm={vm} consoleDetail={null} />);
    }

    function edit_vnc() {
        Dialogs.show(<AddEditVNCModal idPrefix="edit-vnc" vm={vm} consoleDetail={inactive_vnc} />);
    }

    if (inactive_vnc) {
        if (vm.state == "running") {
            // Running and VNC defined?  Changes are pending.
            return (
                <EmptyState>
                    <EmptyStateHeader icon={<EmptyStateIcon icon={PendingIcon} />} />
                    <EmptyStateBody>
                        {_("Restart this virtual machine to access its graphical console")}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="link" onClick={edit_vnc}>
                                {_("VNC settings")}
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );
        } else {
            // Not running and VNC defined?  Just start it.
            return (
                <EmptyState>
                    <EmptyStateBody>
                        {_("Start the virtual machine to access this console")}
                    </EmptyStateBody>
                </EmptyState>
            );
        }
    } else  {
        // No VNC defined?  Add it.
        return (
            <EmptyState>
                <EmptyStateBody>
                    {_("Graphical support not enabled")}
                </EmptyStateBody>
                <EmptyStateFooter>
                    <EmptyStateActions>
                        <Button variant="secondary" onClick={add_vnc}>
                            {_("Add VNC")}
                        </Button>
                    </EmptyStateActions>
                </EmptyStateFooter>
            </EmptyState>
        );
    }
};

export function console_default(vm) {
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
    const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');

    if (vnc || serials.length == 0)
        return "vnc";
    else
        return "serial0";
}

export function console_name(vm, type) {
    if (!type)
        type = console_default(vm);

    if (type.startsWith("serial")) {
        const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
        if (serials.length == 1)
            return _("Serial console");
        const idx = Number(type.substr(6));
        return cockpit.format(_("Serial console ($0)"), serials[idx]?.alias || idx);
    } else if (type == "vnc") {
        return _("Graphical console");
    } else {
        return _("Console");
    }
}

function connection_address() {
    let address;
    if (cockpit.transport.host == "localhost") {
        const app = cockpit.transport.application();
        if (app.startsWith("cockpit+=")) {
            address = app.substr(9);
        } else {
            address = window.location.hostname;
        }
    } else {
        address = cockpit.transport.host;
        const pos = address.indexOf("@");
        if (pos >= 0) {
            address = address.substr(pos + 1);
        }
    }
    return address;
}

function console_launch(vm, consoleDetail) {
    // fire download of the .vv file
    domainDesktopConsole({ name: vm.name, consoleDetail: { ...consoleDetail, address: connection_address() } });
}

export const Console = ({ vm, config, type, onAddErrorNotification, isExpanded }) => {
    let con = null;

    if (!type)
        type = console_default(vm);

    if (vm.state != "running") {
        return (
            <div className="pf-v5-c-console">
                <ConsoleEmptyState vm={vm} type={type} />
            </div>
        );
    }

    if (type.startsWith("serial")) {
        const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
        const idx = Number(type.substr(6));
        if (serials.length > idx)
            con = <SerialConsole
                          type={type}
                          connectionName={vm.connectionName}
                          vmName={vm.name}
                          spawnArgs={domainSerialConsoleCommand({ vm, alias: serials[idx].alias })} />;
    } else if (type == "vnc") {
        const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');
        const inactive_vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');
        const spice = vm.displays && vm.displays.find(display => display.type == 'spice');

        con = <Vnc
                  type="VncConsole"
                  vm={vm}
                  consoleDetail={vnc}
                  spiceDetail={spice}
                  inactiveConsoleDetail={inactive_vnc}
                  onAddErrorNotification={onAddErrorNotification}
                  onLaunch={() => console_launch(vm, vnc || spice)}
                  connectionAddress={connection_address()}
                  isExpanded={isExpanded} />;
    }

    if (con) {
        return (
            <div className="pf-v5-c-console">
                {con}
            </div>
        );
    }
};

export const ConsoleCard = ({ vm, config, type, setType, onAddErrorNotification, isExpanded }) => {
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');

    if (!type)
        type = console_default(vm);

    const actions = [];
    const tabs = [];
    let body;

    if (!isExpanded) {
        actions.push(
            <Button
                key="expand"
                variant="link"
                onClick={() => {
                    const urlOptions = { name: vm.name, connection: vm.connectionName };
                    return cockpit.location.go(["vm", "console"], { ...cockpit.location.options, ...urlOptions });
                }}
                icon={<ExpandIcon />}
                iconPosition="right">{_("Expand")}
            </Button>
        );
    } else {
        actions.push(
            <Button
                key="compress"
                variant="link"
                onClick={() => {
                    const urlOptions = { name: vm.name, connection: vm.connectionName };
                    return cockpit.location.go(["vm"], { ...cockpit.location.options, ...urlOptions });
                }}
                icon={<CompressIcon />}
                iconPosition="right">{_("Compress")}
            </Button>
        );
    }

    if (serials.length > 0)
        tabs.push(<ToggleGroupItem
                      key="vnc"
                      text={_("Graphical")}
                      isSelected={type == "vnc"}
                      onChange={() => setType("vnc")} />);

    serials.forEach((pty, idx) => {
        const t = "serial" + idx;
        tabs.push(<ToggleGroupItem
                      key={t}
                      text={serials.length == 1 ? _("Serial") : cockpit.format(_("Serial ($0)"), pty.alias || idx)}
                      isSelected={type == t}
                      onChange={() => setType(t)} />);
    })

    body = <Console
               vm={vm}
               config={config}
               onAddErrorNotification={onAddErrorNotification}
               type={type}
               isExpanded={isExpanded} />

    return (
        <Card
            className="consoles-card"
            id={`${vmId(vm.name)}-consoles`}
            isSelectable
            isClickable>
            <CardHeader actions={{ actions }}>
                <CardTitle component="h2">{isExpanded ? vm.name : _("Console")}</CardTitle>
                <ToggleGroup>{tabs}</ToggleGroup>
            </CardHeader>
            <CardBody>
                {body}
            </CardBody>
            <CardFooter />
        </Card>
    );
};
