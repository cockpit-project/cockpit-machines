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
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { useDialogs } from 'dialogs.jsx';
import SerialConsole from './serialConsole.jsx';
import Vnc from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';
import { AddVNC } from './vncAdd.jsx';
import { EditVNCModal } from './vncEdit.jsx';

import {
    domainCanConsole,
    domainDesktopConsole,
    domainSerialConsoleCommand
} from '../../../libvirtApi/domain.js';

import './consoles.css';

const _ = cockpit.gettext;

const VmNotRunning = ({ vm, vnc }) => {
    const Dialogs = useDialogs();

    function add_vnc() {
        Dialogs.show(<AddVNC
                         idPrefix="add-vnc"
                         vm={vm} />);
    }

    function edit_vnc() {
        Dialogs.show(<EditVNCModal
                         idPrefix="edit-vnc"
                         consoleDetail={vnc}
                         vmName={vm.name}
                         vmId={vm.id}
                         connectionName={vm.connectionName} />);
    }

    let vnc_info;
    let vnc_action;

    if (!vnc) {
        vnc_info = _("not supported");
        vnc_action = (
            <Button variant="link" isInline onClick={add_vnc}>
                {_("Add support")}
            </Button>
        );
    } else {
        if (vnc.port == -1)
            vnc_info = _("supported");
        else
            vnc_info = cockpit.format(_("supported, port $0"), vnc.port);

        vnc_action = (
            <Button variant="link" isInline onClick={edit_vnc}>
                {_("Edit")}
            </Button>
        );
    }

    return (
        <div id="vm-not-running-message">
            <p>{_("Please start the virtual machine to access its console.")}</p>
            <br />
            <Split hasGutter>
                <SplitItem isFilled>
                    <span><b>{_("Graphical console:")}</b> {vnc_info}</span>
                </SplitItem>
                <SplitItem>
                    {vnc_action}
                </SplitItem>
            </Split>
        </div>
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

        // no console defined
        return null;
    }

    onDesktopConsoleDownload (type) {
        const { vm } = this.props;
        // fire download of the .vv file
        const consoleDetail = vm.displays.find(display => display.type == type);

        let address;
        if (cockpit.transport.host == "localhost") {
            const app = cockpit.transport.application();
            if (app.startsWith("cockpit+="))
                address = app.substr(9);
            else
                address = window.location.hostname;
        } else {
            address = cockpit.transport.host;
            const pos = address.indexOf("@");
            if (pos >= 0)
                address = address.substr(pos+1);
        }

        domainDesktopConsole({ name: vm.name, consoleDetail: Object.assign({}, consoleDetail, { address }) });
    }

    render () {
        const { vm, onAddErrorNotification, isExpanded } = this.props;
        const { serial } = this.state;
        const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
        const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');

        if (!domainCanConsole || !domainCanConsole(vm.state)) {
            return (<VmNotRunning vm={vm} vnc={vnc} />);
        }

        const onDesktopConsole = () => { // prefer spice over vnc
            this.onDesktopConsoleDownload(spice ? 'spice' : 'vnc');
        };

        return (
            <AccessConsoles preselectedType={this.getDefaultConsole()}
                            textSelectConsoleType={_("Select console type")}
                            textSerialConsole={_("Serial console")}
                            textVncConsole={_("Graphical console (VNC)")}
                            textDesktopViewerConsole={_("Desktop viewer")}>
                {serial.map((pty, idx) => (<SerialConsole type={serial.length == 1 ? "SerialConsole" : cockpit.format(_("Serial console ($0)"), pty.alias || idx)}
                                                  key={"pty-" + idx}
                                                  connectionName={vm.connectionName}
                                                  vmName={vm.name}
                                                  spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })} />))}
                <Vnc type="VncConsole"
                     vmName={vm.name}
                     vmId={vm.id}
                     connectionName={vm.connectionName}
                     consoleDetail={vnc}
                     onAddErrorNotification={onAddErrorNotification}
                     isExpanded={isExpanded} />
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
