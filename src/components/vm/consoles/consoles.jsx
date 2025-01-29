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
import { ExpandIcon, HelpIcon } from '@patternfly/react-icons';
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';

import SerialConsole from './serialConsole.jsx';
import Vnc, { VncState } from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';

import {
    domainCanConsole,
    domainDesktopConsole,
    domainSerialConsoleCommand
} from '../../../libvirtApi/domain.js';
import { vmId } from "../../../helpers.js";

import './consoles.css';

const _ = cockpit.gettext;

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
        const vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');
        const spice = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'spice');
        return <VncState vm={vm} vnc={vnc} spice={spice} />;
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

export const ConsoleCard = ({ vm, config, type, setType, onAddErrorNotification }) => {
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');

    if (!type)
        type = console_default(vm);

    const actions = [];
    const tabs = [];
    let body;

    if (vm.state == "running") {
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
                   isExpanded={false} />
    } else {
        const vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');
        const spice = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'spice');
        body = <VncState vm={vm} vnc={vnc} spice={spice} />;
    }

    return (
        <Card
            className="consoles-card"
            id={`${vmId(vm.name)}-consoles`}
            isSelectable
            isClickable>
            <CardHeader actions={{ actions }}>
                <CardTitle component="h2">{_("Console")}</CardTitle>
                <ToggleGroup>{tabs}</ToggleGroup>
            </CardHeader>
            <CardBody>
                {body}
            </CardBody>
            <CardFooter />
        </Card>
    );
};
