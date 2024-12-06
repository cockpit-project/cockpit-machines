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
import { vmId } from "../../../helpers.js";
import { Button, Text, TextContent, TextVariants } from '@patternfly/react-core';
import { DialogsContext } from 'dialogs.jsx';
import { AddVNC } from './vncAdd.jsx';
import { EditVNCModal } from './vncEdit.jsx';

import SerialConsole from './serialConsole.jsx';
import Vnc from './vnc.jsx';
import DesktopConsole from './desktopConsole.jsx';
import {
    domainAttachVnc,
    domainCanConsole,
    domainDesktopConsole,
    domainGet,
    domainSerialConsoleCommand
} from '../../../libvirtApi/domain.js';

import './consoles.css';

const _ = cockpit.gettext;

const VmNotRunning = () => {
    return (
        <div id="vm-not-running-message">
            {_("Please start the virtual machine to access its console.")}
        </div>
    );
};

class Consoles extends React.Component {
    static contextType = DialogsContext;

    constructor (props) {
        super(props);

        this.state = {
            serial: props.vm.displays && props.vm.displays.filter(display => display.type == 'pty'),
            selectedConsole: this.getDefaultConsole(props.vm),
            addVncInProgress: false,
            vncAddress: "",
            vncPort: "",
            vncPassword: "",
        };

        this.getDefaultConsole = this.getDefaultConsole.bind(this);
        this.onDesktopConsoleDownload = this.onDesktopConsoleDownload.bind(this);
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const oldSerial = prevState.serial;
        const newSerial = nextProps.vm.displays && nextProps.vm.displays.filter(display => display.type == 'pty');

        if (newSerial.length !== oldSerial.length || oldSerial.some((pty, index) => pty.alias !== newSerial[index].alias))
            return { serial: newSerial };

        if (nextProps.selectedConsole !== prevState.selectedConsole) {
            return { selectedConsole: nextProps.selectedConsole };
        }

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

    add() {
        const Dialogs = this.context;
        const { vm } = this.props;

        this.setState({ addVncInProgress: true });
        const vncParams = {
            connectionName: vm.connectionName,
            vmName: vm.name,
            vncAddress: this.state.vncAddress || "",
            vncPort: this.state.vncPort || "",
            vncPassword: this.state.vncPassword || "",
        };

        domainAttachVnc(vncParams)
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch(exc => this.dialogErrorSet(_("Video device settings could not be saved"), exc.message))
                .finally(() => this.setState({ addVncInProgress: false }));
    }

    render () {
        const Dialogs = this.context;
        const { vm, onAddErrorNotification, isExpanded } = this.props;
        const { serial, selectedConsole } = this.state;
        const spice = vm.displays && vm.displays.find(display => display.type == 'spice');
        const vnc = vm.displays && vm.displays.find(display => display.type == 'vnc');
        const id = vmId(vm.name);

        const openVncAdd = () => {
            Dialogs.show(<AddVNC idPrefix={`${id}-add-vnc`}
                                 vm={vm} />);
        };

        const openVncEdit = () => {
            Dialogs.show(<EditVNCModal idPrefix={`${id}-edit-vnc`}
                                 vmName={vm.name}
                                 vmId={id}
                                 connectionName={vm.connectionName}
                                 consoleDetail={vnc} />);
        };

        if (!domainCanConsole || !domainCanConsole(vm.state)) {
            return (
                <>
                    <VmNotRunning />
                    {selectedConsole === 'VncConsole' && !vnc && (
                        <Button variant="secondary" size="sm"
                                        onClick={openVncAdd}>
                            {_("Add VNC")}
                        </Button>
                    )}
                    {selectedConsole === 'VncConsole' && vnc && (
                        <TextContent>
                            <Text component={TextVariants.p}>
                                {`VNC ${vnc.address}:${vnc.port}  `}
                                <Button variant="link"
                                    onClick={openVncEdit}>
                                    {_("Edit")}
                                </Button>
                            </Text>
                        </TextContent>
                    )}
                </>
            );
        }

        const onDesktopConsole = () => { // prefer spice over vnc
            this.onDesktopConsoleDownload(spice ? 'spice' : 'vnc');
        };

        return (
            <>
                {selectedConsole === 'SerialConsole' && serial.map((pty, idx) => (
                    <SerialConsole type={serial.length == 1 ? "SerialConsole" : cockpit.format(_("Serial console ($0)"), pty.alias || idx)}
                                   key={"pty-" + idx}
                                   connectionName={vm.connectionName}
                                   vmName={vm.name}
                                   spawnArgs={domainSerialConsoleCommand({ vm, alias: pty.alias })} />
                ))}
                {selectedConsole === 'VncConsole' && !vnc && (
                    <Button variant="secondary" size="sm"
                            onClick={openVncAdd}>
                        {_("Add VNC")}
                    </Button>
                )}
                {selectedConsole === 'VncConsole' && vnc && (
                    <Vnc type="VncConsole"
                         vmName={vm.name}
                         vmId={vm.id}
                         connectionName={vm.connectionName}
                         consoleDetail={vnc}
                         onAddErrorNotification={onAddErrorNotification}
                         isExpanded={isExpanded} />
                )}
                {selectedConsole === 'DesktopViewer' && (vnc || spice) && (
                    <DesktopConsole type="DesktopViewer"
                                    onDesktopConsole={onDesktopConsole}
                                    vnc={vnc}
                                    spice={spice} />
                )}
            </>
        );
    }
}
Consoles.propTypes = {
    vm: PropTypes.object.isRequired,
    onAddErrorNotification: PropTypes.func.isRequired,
    selectedConsole: PropTypes.string.isRequired,
};

export default Consoles;
