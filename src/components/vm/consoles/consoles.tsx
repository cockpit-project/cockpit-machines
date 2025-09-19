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

import type { VM, VMConsole, VMGraphics, VMPty } from '../../../types';
import type { Notification } from '../../../app';

import { StateObject } from './state';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { ExpandIcon, CompressIcon, ExternalLinkAltIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { SimpleSelect, SimpleSelectOption } from 'cockpit-components-simple-select';
import { SerialState, SerialActive, SerialInactive, SerialMissing, SerialPending } from './serial';
import { VncState, VncActive, VncActiveActions, VncInactive, VncMissing, VncPending } from './vnc';
import { SpiceActive, SpiceInactive } from './spice';
import { ConsoleState } from './common';

import { vmId } from "../../../helpers.js";
import VMS_CONFIG from '../../../config.ts';

import './consoles.css';

const _ = cockpit.gettext;

class SerialStates extends StateObject {
    states: SerialState[] = [];

    ensure(vm: VM, serials: VMPty[]): SerialState[] {
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
    type: null | string;
    vncState: VncState;
    serialStates: SerialStates;

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

    setType(val: string) {
        this.type = val;
        this.update();
    }
}

export class ConsoleCardStates {
    states: Record<string, ConsoleCardState> = {};
    accessTimes: Record<string, number> = {};
    time: number = 0;

    get(vm: VM) {
        const key = `${vm.connectionName}:${vm.name}`;

        if (!this.states[key]) {
            this.#makeRoom(Math.max(0, VMS_CONFIG.MaxConsoleCardStates - 1));
            this.states[key] = new ConsoleCardState();
        }

        this.accessTimes[key] = this.time++;
        return this.states[key];
    }

    #makeRoom(max: number) {
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
    onAddErrorNotification,
    isExpanded = false,
    isStandalone = false,
} : {
    state: ConsoleCardState,
    vm: VM,
    onAddErrorNotification: (notification: Notification) => void,
    isExpanded?: boolean,
    isStandalone?: boolean,
}) => {
    useOn(state, "render");

    const is_pty = (display: VMConsole): display is VMPty => display.type == 'pty';
    const is_vnc = (display: VMConsole): display is VMGraphics => display.type == 'vnc';
    const is_spice = (display: VMConsole): display is VMGraphics => display.type == 'spice';

    const serials = vm.displays.filter(is_pty);
    const inactive_serials = vm.inactiveXML.displays.filter(is_pty);
    const vnc = vm.displays.find(is_vnc);
    const inactive_vnc = vm.inactiveXML.displays.find(is_vnc);
    const spice = vm.displays.find(is_spice);
    const inactive_spice = vm.inactiveXML.displays.find(is_spice);
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

    // We either make a TabGroup or a SimpleSelect, depending on how
    // many consoles there are.

    const use_tab_group = serials.length <= 1;
    const tabs: React.ReactNode[] = [];
    const select_options: SimpleSelectOption<string>[] = [];

    function add_console_selector(console_type: string, text: string): void {
        if (use_tab_group)
            tabs.push(<ToggleGroupItem
                          key={console_type}
                          text={text}
                          isSelected={type == console_type}
                          onChange={() => state.setType(console_type)} />);
        else
            select_options.push({
                value: console_type,
                content: text,
            });
    }

    const actions = [];
    let body = null;
    let body_state: ConsoleState | null = null;

    add_console_selector("graphical", _("Graphical"));

    function get_card_element(selector: string) {
        let element;

        try {
            element = document.getElementById(`${vmId(vm.name)}-consoles`)?.querySelector(selector);
            if (!element)
                console.error("Can't find card element:", selector);
        } catch (e) {
            element = null;
            console.error("Error looking for card element:", selector, String(e));
        }

        return element;
    }

    if (type == "graphical") {
        if (vm.state != "running") {
            if (!inactive_vnc && !inactive_spice) {
                body = (
                    <VncMissing
                        vm={vm}
                        onAddErrorNotification={onAddErrorNotification} />
                );
            } else if (inactive_vnc) {
                body = (
                    <VncInactive
                        vm={vm}
                        inactive_vnc={inactive_vnc}
                        isExpanded={isExpanded || isStandalone}
                    />
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
                        isExpanded={isExpanded || isStandalone}
                        onRemoteSizeChanged={(w, h, mode) => {
                            if (lastVncRemoteSize.current[0] == w &&
                                lastVncRemoteSize.current[1] == h)
                                return;
                            lastVncRemoteSize.current = [w, h];
                            if (isStandalone && mode == "none") {
                                // If we can't measure the height, we
                                // guess it to be 53px, which is what
                                // it currently is.
                                let header_height;
                                const title = get_card_element(".pf-v6-c-card__header");
                                if (title && title instanceof HTMLElement)
                                    header_height = title.offsetHeight;
                                else
                                    header_height = 53;
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
                        isExpanded={isExpanded || isStandalone}
                        onAddErrorNotification={onAddErrorNotification} />
                );
                body_state = state.vncState;
            } else if (inactive_vnc) {
                body = (
                    <VncPending
                        vm={vm}
                        inactive_vnc={inactive_vnc}
                        isExpanded={isExpanded || isStandalone}
                    />
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
            add_console_selector(t, serials.length == 1 ? _("Serial") : cockpit.format(_("Serial ($0)"), pty.alias || idx));
            if (type == t) {
                if (vm.state != "running") {
                    body = <SerialInactive />;
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
        add_console_selector("serial0", _("Serial"));
        if (type == "serial0") {
            if (inactive_serials.length > 0) {
                body = <SerialPending />;
            } else {
                body = <SerialMissing vm={vm} onAddErrorNotification={onAddErrorNotification} />;
            }
        }
    }

    if (!isStandalone && body_state && body_state.connected) {
        const bs = body_state;
        actions.push(
            <Button
                key="disconnect"
                variant="secondary"
                onClick={() => bs.setConnected(false)}
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
                    event.preventDefault();

                    let header_height;
                    const title = get_card_element(".pf-v6-c-card__header-main");
                    if (title && title instanceof HTMLElement) {
                        // The 8 below is the padding of the expanded version and fixed in consoles.css
                        header_height = 8 + title.offsetHeight + 8;
                    } else
                        header_height = 53;
                    const sz = lastVncRemoteSize.current;
                    const options = `popup,width=${sz[0]},height=${sz[1] + header_height}`;
                    console.debug("Detaching VNC:", href, options);
                    window.open(href, "vnc-" + vm.name, options);

                    if (body_state)
                        body_state.setConnected(false);
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
                                { use_tab_group
                                    ? <ToggleGroup>{tabs}</ToggleGroup>
                                    : <SimpleSelect
                                          options={select_options}
                                          selected={type}
                                          onSelect={t => state.setType(t)}
                                    />
                                }
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
