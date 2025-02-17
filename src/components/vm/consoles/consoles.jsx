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
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { ExpandIcon, CompressIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import {
    SerialState, SerialActive, SerialActiveActions, SerialInactive, SerialMissing, SerialPending
} from './serial';
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
            const state = new SerialState();
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

export class ConsoleState extends StateObject {
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
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
    const inactive_serials = vm.inactiveXML.displays && vm.inactiveXML.displays.filter(display => display.type == 'pty');
    const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');
    const inactive_vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');
    const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
    const inactive_spice = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'spice');

    let type = state.type;
    if (!type) {
        if (vnc || serials.length == 0)
            type = "graphical";
        else
            type = "text0";
    }

    const actions = [];
    const tabs = [];
    let body = null;
    let body_actions = null;

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
                        onAddErrorNotification={onAddErrorNotification} />
                );
            } else {
                body = <SpiceInactive vm={vm} />;
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
                body_actions = (
                    <VncActiveActions
                        state={state.vncState}
                        vm={vm}
                        vnc={vnc}
                    />
                );
            } else if (inactive_vnc) {
                body = (
                    <VncPending
                           vm={vm}
                           inactive_vnc={inactive_vnc}
                           onAddErrorNotification={onAddErrorNotification} />
                );
            } else if (spice) {
                body = <SpiceActive vm={vm} spice={spice} />;
            } else {
                body = <VncMissing vm={vm} onAddErrorNotification={onAddErrorNotification} />;
            }
        }
    }

    if (serials.length > 0) {
        serials.forEach((pty, idx) => {
            const t = "text" + idx;
            tabs.push(<ToggleGroupItem
                          key={t}
                          text={serials.length == 1 ? _("Text") : cockpit.format(_("Text ($0)"), pty.alias || idx)}
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
                    body_actions = (
                        <SerialActiveActions
                            state={serial_state}
                        />
                    );
                }
            }
        });
    } else {
        tabs.push(<ToggleGroupItem
                      key="text0"
                      text={_("Text")}
                      isSelected={type == "text0"}
                      onChange={() => state.setType("text0")} />);

        if (type == "text0") {
            if (inactive_serials.length > 0) {
                body = <SerialPending vm={vm} />;
            } else {
                body = <SerialMissing vm={vm} onAddErrorNotification={onAddErrorNotification} />;
            }
        }
    }

    return (
        <Card
            className="ct-card consoles-card"
            id={`${vmId(vm.name)}-consoles`}
            isSelectable
            isClickable>
            <CardHeader actions={{ actions }}>
                <Split hasGutter>
                    <SplitItem>
                        <CardTitle component="h2">{isExpanded ? vm.name : _("Console")}</CardTitle>
                    </SplitItem>
                    <SplitItem>
                        <ToggleGroup>{tabs}</ToggleGroup>
                    </SplitItem>
                    <SplitItem>
                        {body_actions}
                    </SplitItem>
                </Split>
            </CardHeader>
            <CardBody>
                <div className="pf-v5-c-console">
                    {body}
                </div>
            </CardBody>
            <CardFooter />
        </Card>
    );
};
