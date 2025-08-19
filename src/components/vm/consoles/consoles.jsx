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
import React, { useRef, useEffect } from 'react';
import cockpit from 'cockpit';
import { useOn } from 'hooks';
import { StateObject } from './state';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { ExpandIcon, CompressIcon, ExternalLinkAltIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { SerialState, SerialActive, SerialInactive, SerialMissing, SerialPending } from './serial';
import { VncState, VncActive, VncActiveActions, VncInactive, VncMissing, VncPending } from './vnc';
import { SpiceActive, SpiceInactive } from './spice';

import { vmId } from "../../../helpers.js";
import VMS_CONFIG from '../../../config.ts';

import './consoles.css';

const _ = cockpit.gettext;

class SerialStates extends StateObject {
    states = [];

    ensure(vm, serials) {
        if (serials.length != this.states.length || serials.some((pty, i) => pty.alias != this.states[i].alias)) {
            this.close();
            this.states = serials.map(pty => {
                const st = new SerialState(vm, pty.alias);
                this.follow(st);
                return st;
            });
        }
        return this.states;
    }

    close() {
        this.states.forEach(s => s.close());
        this.states = [];
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

export class ConsoleCardStates {
    states = {};
    accessTimes = {};
    time = 0;

    get(vm) {
        const key = `${vm.connectionName}:${vm.name}`;

        if (!this.states[key]) {
            this.#makeRoom(Math.max(0, VMS_CONFIG.MaxConsoleCardStates - 1));
            this.states[key] = new ConsoleCardState();
        }

        this.accessTimes[key] = this.time++;
        return this.states[key];
    }

    #makeRoom(max) {
        const keys = Object.keys(this.states);
        if (keys.length > max) {
            const sortedKeys = keys.sort((a, b) => (this.accessTimes[a] || 0) - (this.accessTimes[b] || 0));
            const keysToRemove = sortedKeys.slice(0, keys.length - max);

            keysToRemove.forEach(key => {
                this.states[key].close();
                delete this.states[key];
                delete this.accessTimes[key];
            });
        }
    }
}

export const ConsoleCard = ({
    state,
    vm,
    config,
    onAddErrorNotification,
    isExpanded = false,
    isStandalone = false,
}) => {
    useOn(state, "render");

    const serials = vm.displays.filter(display => display.type == 'pty');
    const inactive_serials = vm.inactiveXML.displays.filter(display => display.type == 'pty');
    const vnc = vm.displays.find(display => display.type == 'vnc');
    const inactive_vnc = vm.inactiveXML.displays.find(display => display.type == 'vnc');
    const spice = vm.displays.find(display => display.type == 'spice');
    const inactive_spice = vm.inactiveXML.displays.find(display => display.type == 'spice');
    const serial_states = state.serialStates.ensure(vm, serials);

    const lastVncRemoteSize = useRef([1024, 768]);

    useEffect(() => {
        if (isStandalone) {
            const watchdog = cockpit.channel({ payload: "null" });
            watchdog.addEventListener("close", () => {
                console.debug("Closing detached VNC");
                window.close();
            });
            return () => watchdog.close();
        }
    }, [isStandalone]);

    let type = isStandalone ? "graphical" : state.type;
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
                        isExpanded={isExpanded || isStandalone}
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
                        isExpanded={isExpanded || isStandalone}
                        onRemoteSizeChanged={(w, h, mode) => {
                            if (lastVncRemoteSize.current[0] == w &&
                                lastVncRemoteSize.current[1] == h)
                                return;
                            lastVncRemoteSize.current = [w, h];
                            if (isStandalone && mode == "none") {
                                // First we guess the height of the
                                // header (53px), and then we measure
                                // it.
                                let header_height = 53;
                                const title = document.querySelector(`#${vmId(vm.name)}-consoles .pf-v6-c-card__header`);
                                if (title)
                                    header_height = title.offsetHeight;
                                const delta_width = window.outerWidth - window.innerWidth;
                                const delta_height = window.outerHeight - window.innerHeight;
                                window.resizeTo(w + delta_width, h + header_height + delta_height);
                            }
                        }}
                    />
                );
                actions.push(
                    <VncActiveActions
                        key="vnc-actions"
                        state={state.vncState}
                        vm={vm}
                        vnc={vnc}
                        isExpanded={isExpanded || isStandalone} />
                );
                body_state = state.vncState;
            } else if (inactive_vnc) {
                body = (
                    <VncPending
                        vm={vm}
                        inactive_vnc={inactive_vnc}
                        isExpanded={isExpanded || isStandalone}
                        onAddErrorNotification={onAddErrorNotification} />
                );
            } else if (spice) {
                body = <SpiceActive vm={vm} isExpanded={isExpanded || isStandalone} spice={spice} />;
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
                    const serial_state = serial_states[idx];
                    body = (
                        <SerialActive
                            state={serial_state}
                            vm={vm}
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

    if (!isStandalone && body_state && body_state.connected) {
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

    if (!isStandalone) {
        actions.push(
            <Button
                key="expand-compress"
                variant="link"
                onClick={() => {
                    const urlOptions = { name: vm.name, connection: vm.connectionName };
                    const path = isExpanded ? ["vm"] : ["vm", "console"];
                    return cockpit.location.go(path, { ...cockpit.location.options, ...urlOptions });
                }}
                icon={isExpanded ? <CompressIcon /> : <ExpandIcon />}
                iconPosition="right">{isExpanded ? _("Compress") : _("Expand")}
            </Button>
        );
    }

    if (!isStandalone && type == "graphical") {
        const urlOptions = { name: vm.name, connection: vm.connectionName };
        const path = ["vm", "vnc"];
        const href = "#" + cockpit.location.encode(path, { ...cockpit.location.options, ...urlOptions });

        actions.push(
            <Button
                key="detach"
                variant="link"
                component="a"
                href={href}
                onClick={(event) => {
                    let header_height = 53;
                    const title = document.querySelector(`#${vmId(vm.name)}-consoles .pf-v6-c-card__header-main`);
                    if (title) {
                        // The 8 below is the padding of the expanded version and fixed in consoles.css
                        header_height = 8 + title.offsetHeight + 8;
                    }
                    const sz = lastVncRemoteSize.current;
                    const options = `popup,width=${sz[0]},height=${sz[1] + header_height}`;
                    console.debug("Detaching VNC:", href, options);
                    window.open(href, "vnc-" + vm.name, options);

                    if (body_state)
                        body_state.setConnected(false);

                    event.preventDefault();
                }}
                icon={<ExternalLinkAltIcon />}
                iconPosition="right">{_("Detach")}
            </Button>
        );
    }

    const title = (
        <CardTitle component="h2">{(isExpanded || isStandalone) ? vm.name : _("Console")}</CardTitle>
    );

    return (
        <Card
            isPlain={isExpanded || isStandalone}
            className="ct-card consoles-card"
            id={`${vmId(vm.name)}-consoles`}>
            <CardHeader actions={{ actions }}>
                { isStandalone
                    ? title
                    : (
                        <Split hasGutter>
                            <SplitItem>
                                {title}
                            </SplitItem>
                            <SplitItem>
                                <ToggleGroup>{tabs}</ToggleGroup>
                            </SplitItem>
                        </Split>
                    )
                }
            </CardHeader>
            <CardBody>
                <div className="vm-console">
                    {body}
                </div>
            </CardBody>
        </Card>
    );
};
