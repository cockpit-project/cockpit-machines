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
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { AccessConsoles } from "@patternfly/react-console";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions } from "@patternfly/react-core/dist/esm/components/EmptyState";

import SerialConsole from './serialConsole.jsx';
import Vnc from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';
import {
    domainCanConsole,
    domainDesktopConsole,
    domainSerialConsoleCommand,
    domainAddVnc,
} from '../../../libvirtApi/domain.js';

import './consoles.css';

const _ = cockpit.gettext;

const ConsoleEmptyState = ({ vm, onAddErrorNotification }) => {
    const serials = vm.displays && vm.displays.filter(display => display.type == 'pty');
    const inactive_vnc = vm.inactiveXML.displays && vm.inactiveXML.displays.find(display => display.type == 'vnc');

    const [inProgress, setInProgress] = useState(false);

    function add_vnc() {
        setInProgress(true);
        domainAddVnc(vm)
                .catch(ex => onAddErrorNotification({
                    text: cockpit.format(_("Failed to add VNC to VM $0"), vm.name),
                    detail: ex.message,
                    resourceId: vm.id,
                }))
                .finally(() => setInProgress(false));
    }

    let top_message = null;
    let bot_message = _("Graphical support not enabled.");

    if (serials.length == 0 && !inactive_vnc) {
        bot_message = _("Console support not enabled.");
    } else {
        if (vm.state != "running") {
            if (serials.length > 0 && !inactive_vnc) {
                top_message = _("Please start the virtual machine to access its serial console.");
            } else {
                top_message = _("Please start the virtual machine to access its console.");
            }
        } else if (inactive_vnc) {
            if (serials.length > 0) {
                top_message = _("Please shut down and restart the virtual machine to access its graphical console.");
            } else {
                top_message = _("Please shut down and restart the virtual machine to access its console.");
            }
        }
    }

    return (
        <EmptyState>
            { top_message &&
                <EmptyStateBody>
                    {top_message}
                </EmptyStateBody>
            }
            { !inactive_vnc &&
                <>
                    <EmptyStateBody>
                        {bot_message}
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
                </>
            }
        </EmptyState>
    );
};

class Consoles extends React.Component {
    constructor (props) {
        super(props);

        this.state = {
            serial: props.vm.displays && props.vm.displays.filter(display => display.type == 'pty'),
        };

        this.getDefaultConsole = this.getDefaultConsole.bind(this);
        this.onDesktopConsoleDownload = this.onDesktopConsoleDownload.bind(this);
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const oldSerial = prevState.serial;
        const newSerial = nextProps.vm.displays && nextProps.vm.displays.filter(display => display.type == 'pty');

        if (newSerial.length !== oldSerial.length || oldSerial.some((pty, index) => pty.alias !== newSerial[index].alias))
            return { serial: newSerial };

        return null;
    }

    getDefaultConsole () {
        const { vm } = this.props;

        if (vm.displays) {
            if (vm.displays.find(display => display.type == "vnc")) {
                return 'VncConsole';
            }
            if (vm.displays.find(display => display.type == "spice")) {
                return 'DesktopViewer';
            }
        }

        const serialConsoleCommand = domainSerialConsoleCommand({ vm });
        if (serialConsoleCommand) {
            return 'SerialConsole';
        }

        // no console defined, but the VncConsole is always there and
        // will instruct people how to enable it for real.
        return 'VncConsole';
    }

    onDesktopConsoleDownload (type) {
        const { vm } = this.props;
        // fire download of the .vv file
        const consoleDetail = vm.displays.find(display => display.type == type);

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

        domainDesktopConsole({ name: vm.name, consoleDetail: { ...consoleDetail, address } });
    }

    render () {
        const { vm, onAddErrorNotification, isExpanded } = this.props;
        const { serial } = this.state;
        const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
        const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');

        if (!domainCanConsole || !domainCanConsole(vm.state)) {
            return (
                <div id="vm-not-running-message">
                    <ConsoleEmptyState vm={vm} onAddErrorNotification={onAddErrorNotification} />
                </div>
            );
        }

        const onDesktopConsole = () => { // prefer spice over vnc
            this.onDesktopConsoleDownload(spice ? 'spice' : 'vnc');
        };

        return (
            <AccessConsoles preselectedType={this.getDefaultConsole()}
                            textSelectConsoleType={_("Select console type")}
                            textSerialConsole={_("Serial console")}
                            textVncConsole={_("VNC console")}
                            textDesktopViewerConsole={_("Desktop viewer")}>
                {serial.map((pty, idx) => (<SerialConsole type={serial.length == 1 ? "SerialConsole" : cockpit.format(_("Serial console ($0)"), pty.alias || idx)}
                                                  key={"pty-" + idx}
                                                  connectionName={vm.connectionName}
                                                  vmName={vm.name}
                                                  spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })} />))}
                {vnc
                    ? <Vnc
                          type="VncConsole"
                          vmName={vm.name}
                          vmId={vm.id}
                          connectionName={vm.connectionName}
                          consoleDetail={vnc}
                          onAddErrorNotification={onAddErrorNotification}
                          isExpanded={isExpanded} />
                    : <div type="VncConsole" className="pf-v5-c-console__vnc">
                        <ConsoleEmptyState
                              vm={vm}
                              onAddErrorNotification={onAddErrorNotification} />
                    </div>
                }
                {(vnc || spice) &&
                <DesktopConsole type="DesktopViewer"
                                onDesktopConsole={onDesktopConsole}
                                vnc={vnc}
                                spice={spice} />}
            </AccessConsoles>
        );
    }
}
Consoles.propTypes = {
    vm: PropTypes.object.isRequired,
    onAddErrorNotification: PropTypes.func.isRequired,
};

export default Consoles;
