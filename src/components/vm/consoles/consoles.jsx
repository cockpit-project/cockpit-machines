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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@patternfly/react-core/dist/esm/components/Card';
import { ExpandIcon, CompressIcon } from "@patternfly/react-icons";
import { ToggleGroup, ToggleGroupItem } from '@patternfly/react-core/dist/esm/components/ToggleGroup';

import { SerialActive, SerialInactive, SerialMissing, SerialPending } from './serial';
import { VncActive, VncInactive, VncMissing, VncPending } from './vnc';
import { SpiceActive, SpiceInactive } from './spice';

import { domainSerialConsoleCommand } from '../../../libvirtApi/domain.js';
import { vmId } from "../../../helpers.js";

import './consoles.css';

const _ = cockpit.gettext;

export const ConsoleCard = ({ vm, config, type, setType, onAddErrorNotification, isExpanded }) => {
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
    const inactive_serials = vm.inactiveXML.displays && vm.inactiveXML.displays.filter(display => display.type == 'pty');
    const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');
    const inactive_vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');
    const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
    const inactive_spice = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'spice');

    if (!type) {
        if (vnc || serials.length == 0)
            type = "graphical";
        else
            type = "text0";
    }

    const actions = [];
    const tabs = [];
    let body = null;

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
                  onChange={() => setType("graphical")} />);

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
                           type="VncConsole"
                           vm={vm}
                           consoleDetail={vnc}
                           inactiveConsoleDetail={inactive_vnc}
                           spiceDetail={spice}
                           onAddErrorNotification={onAddErrorNotification}
                           isExpanded={isExpanded} />
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
                          onChange={() => setType(t)} />);

            if (type == t) {
                if (vm.state != "running") {
                    body = <SerialInactive vm={vm} />;
                } else {
                    body = (
                        <SerialActive
                               connectionName={vm.connectionName}
                               vmName={vm.name}
                               spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })} />
                    );
                }
            }
        });
    } else {
        tabs.push(<ToggleGroupItem
                      key="text0"
                      text={_("Text")}
                      isSelected={type == "text0"}
                      onChange={() => setType("text0")} />);

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
            className="consoles-card"
            id={`${vmId(vm.name)}-consoles`}
            isSelectable
            isClickable>
            <CardHeader actions={{ actions }}>
                <CardTitle component="h2">{isExpanded ? vm.name : _("Console")}</CardTitle>
                <ToggleGroup>{tabs}</ToggleGroup>
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
