/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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
import {
    Alert,
    Button,
    DataList,
    DataListCell,
    DataListCheck,
    DataListControl,
    DataListDragButton,
    DataListItem,
    DataListItemCells,
    DataListItemRow,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    Modal,
    Tooltip,
} from '@patternfly/react-core';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import {
    findHostNodeDevice,
    getSortedBootOrderDevices,
    rephraseUI,
    vmId
} from '../../../helpers.js';
import {
    changeBootOrder,
    getVm
} from '../../../actions/provider-actions.js';

import './bootOrder.css';

const _ = cockpit.gettext;

/**
 * Return an array of devices, which can assigned boot order, with added properties needed for UI.
 *
 * @param {object} vm
 * @returns {array}
 */
function getUIBootOrderDevices(vm) {
    const devices = getSortedBootOrderDevices(vm.inactiveXML);

    devices.forEach(dev => {
        dev.checked = typeof dev.bootOrder !== 'undefined';
        dev.initialOrder = parseInt(dev.bootOrder);
    });

    return devices;
}

const DeviceInfo = ({ descr, value }) => {
    return (
        <DescriptionListGroup>
            <DescriptionListTerm>
                {descr}
            </DescriptionListTerm>
            <DescriptionListDescription id={value}>
                {value}
            </DescriptionListDescription>
        </DescriptionListGroup>
    );
};

const DeviceRow = ({ idPrefix, device, index, onToggle, upDisabled, downDisabled, moveUp, moveDown, nodeDevices }) => {
    let heading;
    const additionalInfo = [];

    const addOptional = (additionalInfo, value, descr) => {
        if (value) {
            additionalInfo.push(
                <DeviceInfo descr={descr} value={value} key={index + descr} />
            );
        }
    };

    switch (device.type) {
    case "disk": {
        heading = rephraseUI("bootableDisk", "disk");
        addOptional(additionalInfo, device.device.source.file, _("File"));
        addOptional(additionalInfo, device.device.source.dev, _("Device"));
        addOptional(additionalInfo, device.device.source.protocol, _("Protocol"));
        addOptional(additionalInfo, device.device.source.pool, _("Pool"));
        addOptional(additionalInfo, device.device.source.volume, _("Volume"));
        addOptional(additionalInfo, device.device.source.host.name, _("Host"));
        addOptional(additionalInfo, device.device.source.host.port, _("Port"));
        if (device.device.device === "cdrom") {
            addOptional(additionalInfo, device.device.device, _("Device"));
            addOptional(additionalInfo, device.device.bus, _("Bus"));
        }
        break;
    }
    case "network": {
        heading = rephraseUI("bootableDisk", "network");
        addOptional(additionalInfo, device.device.mac, _("MAC"));
        break;
    }
    case "redirdev": {
        heading = rephraseUI("bootableDisk", "redirdev");
        addOptional(additionalInfo, device.device.type, _("Type"));
        addOptional(additionalInfo, device.device.bus, _("Bus"));
        addOptional(additionalInfo, device.device.address.port, _("Port"));
        break;
    }
    case "hostdev": {
        heading = rephraseUI("bootableDisk", "hostdev");
        const nodeDev = findHostNodeDevice(device.device, nodeDevices);
        if (nodeDev) {
            switch (device.device.type) {
            case "usb": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, nodeDev.capability.vendor._value, _("Vendor"));
                addOptional(additionalInfo, nodeDev.capability.product._value, _("Product"));
                break;
            }
            case "pci": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, nodeDev.capability.vendor._value, _("Vendor"));
                addOptional(additionalInfo, nodeDev.capability.product._value, _("Product"));
                break;
            }
            case "scsi": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, device.device.source.address.bus, _("Bus"));
                addOptional(additionalInfo, device.device.source.address.target, _("Target"));
                addOptional(additionalInfo, device.device.source.address.unit, _("Unit"));
                break;
            }
            case "scsi_host": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, device.device.source.protocol, _("Protocol"));
                addOptional(additionalInfo, device.device.source.wwpn, _("WWPN"));
                break;
            }
            case "mdev": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, nodeDev.capability.type.id, _("Type ID"));
                break;
            }
            }
        }
        break;
    }
    }

    return (
        <DataListItem id={`device-${index}`}>
            <DataListItemRow>
                <DataListControl>
                    <DataListDragButton aria-label={_("Reorder")}
                                        aria-describedby={_("Press space or enter to begin dragging, and use the arrow keys to navigate up or down. Press enter to confirm the drag, or any other key to cancel the drag operation.")}
                                        isDisabled={!device.checked} />
                    <DataListCheck id={`${idPrefix}-device-${index}-checkbox`}
                                   name={`${idPrefix}-device-${index}-checkbox`}
                                   otherControls
                                   onChange={onToggle}
                                   isChecked={device.checked} />
                </DataListControl>
                <DataListItemCells dataListCells={[
                    <DataListCell className="boot-order-modal-cell" key="item1">
                        <span className="boot-order-description">{heading}</span>
                        <span className="boot-order-additional-info">
                            <DescriptionList isHorizontal>{additionalInfo}</DescriptionList>
                        </span>
                    </DataListCell>
                ]} />
            </DataListItemRow>
        </DataListItem>
    );
};

class BootOrderModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            devices: getUIBootOrderDevices(props.vm),
        };
        this.state.itemOrder = this.state.devices.map((dev, index) => `device-${index}`);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.close = props.close;
        this.save = this.save.bind(this);
        this.onToggleDevice = this.onToggleDevice.bind(this);
        this.onDragStart = this.onDragStart.bind(this);
        this.onDragMove = this.onDragMove.bind(this);
        this.onDragFinish = this.onDragFinish.bind(this);
        this.onDragCancel = this.onDragCancel.bind(this);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    save() {
        const { dispatch, vm } = this.props;
        const devices = this.state.itemOrder
                .map(dataItem => this.state.devices[dataItem.split("device-")[1]])
                .filter(device => device.checked);

        dispatch(changeBootOrder({
            vm,
            devices,
        }))
                .fail(exc => this.dialogErrorSet(_("Boot order settings could not be saved"), exc.message))
                .then(() => {
                    dispatch(getVm({ connectionName: vm.connectionName, id: vm.id }));
                    this.close();
                });
    }

    onToggleDevice(index) {
        // create new array so we don't edit state
        const devices = [...this.state.devices];

        devices[index].checked = !devices[index].checked;

        this.setState({ devices });
    }

    onDragStart(id) {
        this.setState({
            id: id,
            liveText: `Dragging started for item id: ${id}.`
        });
    }

    onDragMove(oldIndex, newIndex) {
        const { id } = this.state;
        this.setState({
            liveText: `Dragging item ${id}.`
        });
    }

    onDragCancel() {
        this.setState({
            liveText: `Dragging cancelled. List is unchanged.`
        });
    }

    onDragFinish(itemOrder) {
        this.setState({
            liveText: `Dragging finished`,
            itemOrder
        });
    }

    render() {
        const { nodeDevices, vm } = this.props;
        const { liveText } = this.state;
        const idPrefix = vmId(vm.name) + '-order-modal';

        /**
         * Returns whetever state of device represented in UI has changed
         *
         * @param {object} device
         * @param {number} index order of device in list
         * @returns {boolean}
         */
        function deviceStateHasChanged(device, index) {
            // device was selected
            if (device.checked && !device.initialOrder)
                return true;

            // device was unselected
            if (!device.checked && device.initialOrder)
                return true;

            // device was moved in boot order list
            if (device.initialOrder && device.initialOrder !== index + 1)
                return true;

            return false;
        }

        const showWarning = () => {
            if (vm.state === "running" &&
                this.state.devices.some((device, index) => deviceStateHasChanged(device, index))) {
                return <Alert isInline variant='warning' id={`${idPrefix}-min-message`} title={_("Changes will take effect after shutting down the VM")} />;
            }
        };

        const defaultBody = (
            <>
                <DataList isCompact
                          onDragFinish={this.onDragFinish}
                          onDragStart={this.onDragStart}
                          onDragMove={this.onDragMove}
                          onDragCancel={this.onDragCancel}
                          itemOrder={this.state.itemOrder}
                          className="boot-order-list-view">
                    {this.state.devices.map((device, index) => {
                        return <DeviceRow onToggle={() => this.onToggleDevice(index)}
                                          key={index}
                                          idPrefix={idPrefix}
                                          index={index}
                                          device={device}
                                          nodeDevices={nodeDevices}
                        />;
                    })}
                </DataList>
                <div className="pf-screen-reader" aria-live="assertive">
                    {liveText}
                </div>
            </>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-window`} isOpen onClose={this.close} className='boot-order'
                   title={_("Change boot order")}
                   footer={
                       <>
                           {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                           <Button id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={this.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    {showWarning()}
                    {defaultBody}
                </>
            </Modal>
        );
    }
}

BootOrderModal.propTypes = {
    close: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    vm: PropTypes.object.isRequired,
    nodeDevices: PropTypes.array.isRequired,
};

/**
 * Returns a sorted array of all devices with boot order
 *
 * @param {object} vm
 * @returns {array}
 */
function getBootOrder(vm) {
    let bootOrder = _("No boot device found");
    const devices = getSortedBootOrderDevices(vm).filter(d => d.bootOrder);

    if (devices && devices.length > 0) {
        bootOrder = devices.map(bootDevice => rephraseUI("bootableDisk", bootDevice.type)).join(); // Example: network,disk,disk
    }

    return bootOrder;
}

export const BootOrderLink = ({ vm, idPrefix, close, dispatch, nodeDevices }) => {
    const [bootOrderShow, setBootOrderShow] = useState(false);
    const modalButton = (
        <Button variant="link" className="edit-inline" isInline isAriaDisabled={vm.state != 'shut off'} onClick={setBootOrderShow}>
            {_("edit")}
        </Button>
    );

    return (
        <>
            {bootOrderShow && <BootOrderModal close={() => setBootOrderShow(false)} vm={vm} dispatch={dispatch} nodeDevices={nodeDevices} />}
            {getBootOrder(vm)}
            {vm.state == 'shut off' ? modalButton : <Tooltip content={_("Only editable when the guest is shut off")}>{modalButton}</Tooltip>}
        </>
    );
};
