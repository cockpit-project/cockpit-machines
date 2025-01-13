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

import { useDialogs } from 'dialogs.jsx';
import SerialConsole from './serialConsole.jsx';
import Vnc from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';
import { ReplaceSpiceDialog } from '../vmReplaceSpiceDialog.jsx';
import { AddVNC } from './vncAdd.jsx';
import { EditVNCModal } from './vncEdit.jsx';

import {
    domainCanConsole,
    domainDesktopConsole,
    domainSerialConsoleCommand
} from '../../../libvirtApi/domain.js';

import './consoles.css';

const _ = cockpit.gettext;

const VmNotRunning = ({ vm, vnc, spice }) => {
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

    return (
        <div id="vm-not-running-message">
            <div>{_("Please start the virtual machine to access its console.")}</div>
            { vnc
                ? <div>
                      <b>{_("VNC")}</b> {vnc.address}:{vnc.port}
                      <Button variant="link" onClick={edit_vnc}>
                          {_("Edit")}
                      </Button>
                  </div>
                : <div>
                      <b>{_("VNC")}</b> {_("not supported.")}
                      <Button variant="link" onClick={add_vnc}>
                          {_("Add support")}
                      </Button>
                  </div>
            }
            { spice
                ? <div>
                      <b>{_("Spice")}</b> {spice.address}:{spice.port}
                      <Button variant="link" onClick={() => Dialogs.show(<ReplaceSpiceDialog vm={vm} vms={[vm]} />)}>
                          {_("Replace SPICE devices")}
                      </Button>
                  </div>
                : null
            }
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
        domainDesktopConsole({ name: vm.name, id: vm.id, connectionName: vm.connectionName, consoleDetail: vm.displays.find(display => display.type == type) });
    }

    render () {
        const { vm, onAddErrorNotification, isExpanded } = this.props;
        const { serial } = this.state;
        const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
        const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');

        if (!domainCanConsole || !domainCanConsole(vm.state)) {
            return (<VmNotRunning vm={vm} vnc={vnc} spice={spice} />);
        }

        const onDesktopConsole = () => { // prefer spice over vnc
            this.onDesktopConsoleDownload(spice ? 'spice' : 'vnc');
        };

        return (
            <AccessConsoles preselectedType={this.getDefaultConsole()}
                            textSelectConsoleType={_("Select console type")}
                            textSerialConsole={_("Serial console")}
                            textVncConsole={_("VNC console")}
                            textDesktopViewerConsole={_("Spice console")}>
                {serial.map((pty, idx) => (<SerialConsole type={serial.length == 1 ? "SerialConsole" : cockpit.format(_("Serial console ($0)"), pty.alias || idx)}
                                                  key={"pty-" + idx}
                                                  connectionName={vm.connectionName}
                                                  vmName={vm.name}
                                                  spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })} />))}
                <Vnc type="VncConsole"
                     vm={vm}
                     consoleDetail={vnc}
                     onLaunch={() => this.onDesktopConsoleDownload('vnc')}
                     onAddErrorNotification={onAddErrorNotification}
                     isExpanded={isExpanded} />
                {spice &&
                 <DesktopConsole type="DesktopViewer"
                                 vm={vm}
                                 onDesktopConsole={() => this.onDesktopConsoleDownload('spice')}
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
