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
import { StateObject } from './state';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { ExpandIcon, CompressIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { ConsoleState } from './common';
import { SerialActive, SerialInactive, SerialMissing, SerialPending } from './serial';
import { VncState, VncActive, VncActiveActions, VncInactive, VncMissing, VncPending } from './vnc';
import { SpiceActive, SpiceInactive } from './spice';

import { domainSerialConsoleCommand } from '../../../libvirtApi/domain.js';
import { vmId } from "../../../helpers.js";

import './consoles.css';

const _ = cockpit.gettext;

class SerialStates extends StateObject {
    constructor() {
        super();
        this.states = { };
    }

    get(key) {
        if (!(key in this.states)) {
            const state = new ConsoleState();
            this.follow(state);
            this.states[key] = state;
        }
        return this.states[key];
    }

    close() {
        for (const k in this.states) {
            this.states[k].close();
        }
    }
}

export class ConsoleCardState extends StateObject {
    constructor () {
        super();
        this.type = null;
        this.vncState = new VncState();
        this.serialStates = new SerialStates();

        this.follow(this.vncState);
        this.follow(this.serialStates);
    }

    close() {
        this.vncState.close();
        this.serialStates.close();
    }

    setType(val) {
        this.type = val;
        this.update();
    }
}

export const ConsoleCard = ({ state, vm, config, onAddErrorNotification, isExpanded }) => {
    const serials = vm.displays.filter(display => display.type == 'pty');
    const inactive_serials = vm.inactiveXML.displays.filter(display => display.type == 'pty');
    const vnc = vm.displays.find(display => display.type == 'vnc');
    const inactive_vnc = vm.inactiveXML.displays.find(display => display.type == 'vnc');
    const spice = vm.displays.find(display => display.type == 'spice');
    const inactive_spice = vm.inactiveXML.displays.find(display => display.type == 'spice');

    let type = state.type;
    if (!type) {
        if (vnc || serials.length == 0)
            type = "graphical";
        else
            type = "serial0";
    }

    const actions = [];
    const tabs = [];
    let body = null;
    let body_state = null;

    tabs.push(<ToggleGroupItem
                  key="graphical"
                  text={_("Graphical")}
                  isSelected={type == "graphical"}
                  onChange={() => state.setType("graphical")} />);

    if (type == "graphical") {
        if (vm.state != "running") {
            if (!inactive_vnc && !inactive_spice) {
                body = <VncMissing vm={vm} />;
            } else if (inactive_vnc) {
                body = (
                    <VncInactive
                        vm={vm}
                        inactive_vnc={inactive_vnc}
                        isExpanded={isExpanded}
                        onAddErrorNotification={onAddErrorNotification} />
                );
            } else {
                body = <SpiceInactive vm={vm} isExpanded={isExpanded} />;
            }
        } else {
            if (vnc) {
                body = (
                    <VncActive
                        state={state.vncState}
                        vm={vm}
                        consoleDetail={vnc}
                        inactiveConsoleDetail={inactive_vnc}
                        spiceDetail={spice}
                        onAddErrorNotification={onAddErrorNotification}
                        isExpanded={isExpanded} />
                );
                actions.push(
                    <VncActiveActions
                        state={state.vncState}
                        vm={vm}
                        vnc={vnc}
                        isExpanded={isExpanded} />
                );
                body_state = state.vncState;
            } else if (inactive_vnc) {
                body = (
                    <VncPending
                        vm={vm}
                        inactive_vnc={inactive_vnc}
                        isExpanded={isExpanded}
                        onAddErrorNotification={onAddErrorNotification} />
                );
            } else if (spice) {
                body = <SpiceActive vm={vm} isExpanded={isExpanded} spice={spice} />;
            } else {
                body = <VncMissing vm={vm} onAddErrorNotification={onAddErrorNotification} />;
            }
        }
    }

    if (serials.length > 0) {
        serials.forEach((pty, idx) => {
            const t = "serial" + idx;
            tabs.push(<ToggleGroupItem
                          key={t}
                          text={serials.length == 1 ? _("Serial") : cockpit.format(_("Serial ($0)"), pty.alias || idx)}
                          isSelected={type == t}
                          onChange={() => state.setType(t)} />);

            if (type == t) {
                if (vm.state != "running") {
                    body = <SerialInactive vm={vm} />;
                } else {
                    const serial_state = state.serialStates.get(pty.alias || idx);
                    body = (
                        <SerialActive
                            state={serial_state}
                            connectionName={vm.connectionName}
                            vmName={vm.name}
                            spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })}
                        />
                    );
                    body_state = serial_state;
                }
            }
        });
    } else {
        tabs.push(<ToggleGroupItem
                      key="serial0"
                      text={_("Serial")}
                      isSelected={type == "serial0"}
                      onChange={() => state.setType("serial0")} />);

        if (type == "serial0") {
            if (inactive_serials.length > 0) {
                body = <SerialPending vm={vm} />;
            } else {
                body = <SerialMissing vm={vm} onAddErrorNotification={onAddErrorNotification} />;
            }
        }
    }

    if (body_state && body_state.connected) {
        actions.push(
            <Button
                key="disconnect"
                variant="secondary"
                onClick={() => body_state.setConnected(false)}
            >
                {_("Disconnect")}
            </Button>
        );
    }

    const urlOptions = { name: vm.name, connection: vm.connectionName };
    const path = isExpanded ? ["vm"] : ["vm", "console"];
    const href = cockpit.location.encode(path, { ...cockpit.location.options, ...urlOptions });
    const name_parts = window.name.split("/");
    const parent_pathname = name_parts.length > 0 ? "/" + name_parts[name_parts.length - 1] : "";

    actions.push(
        <Button
            key="expand-compress"
            variant="link"
            component="a"
            href={parent_pathname + "#" + href}
            target="_parent"
            icon={isExpanded ? <CompressIcon /> : <ExpandIcon />}
            iconPosition="right">{isExpanded ? _("Compress") : _("Expand")}
        </Button>
    );

    return (
        <Card
            isPlain={isExpanded}
            className="ct-card consoles-card"
            id={`${vmId(vm.name)}-consoles`}>
            <CardHeader actions={{ actions }}>
                <Split hasGutter>
                    <SplitItem>
                        <CardTitle component="h2">{isExpanded ? vm.name : _("Console")}</CardTitle>
                    </SplitItem>
                    <SplitItem>
                        <ToggleGroup>{tabs}</ToggleGroup>
                    </SplitItem>
                </Split>
            </CardHeader>
            <CardBody>
                <div className="vm-console">
                    {body}
                </div>
            </CardBody>
        </Card>
    );
};
