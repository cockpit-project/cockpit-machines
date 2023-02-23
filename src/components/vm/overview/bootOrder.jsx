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
import React from 'react';
import PropTypes from 'prop-types';
import cockpit from 'cockpit';

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { DataList, DataListAction, DataListCell, DataListCheck, DataListControl, DataListItem, DataListItemCells, DataListItemRow } from "@patternfly/react-core/dist/esm/components/DataList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";

import {
    AngleDownIcon,
    AngleUpIcon
} from '@patternfly/react-icons';

import { useDialogs, DialogsContext } from 'dialogs.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import {
    findMatchingNodeDevices,
    getNodeDevSource,
    getSortedBootOrderDevices,
    rephraseUI,
    vmId
} from '../../../helpers.js';
import { domainGet, domainChangeBootOrder } from '../../../libvirtApi/domain.js';
import store from "../../../store.js";

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
        // Sometimes we can't identify unique node devices, so a list of all matching devices is returned
        const nodeDevs = findMatchingNodeDevices(device.device, nodeDevices);
        if (nodeDevs.length > 0) {
            const nodeDev = nodeDevs[0];
            switch (device.device.type) {
            case "usb": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, nodeDev.capability.vendor._value, _("Vendor"));
                addOptional(additionalInfo, nodeDev.capability.product._value, _("Product"));
                if (nodeDevs.length > 1) {
                    // If there are 2 usb devices without specified bus/device and same vendor/product,
                    // it's impossible to identify which one is the one referred in VM's XML
                    addOptional(additionalInfo, _("Unspecified"), _("Bus"));
                    addOptional(additionalInfo, _("Unspecified"), _("Device"));
                } else {
                    addOptional(additionalInfo, nodeDev.capability.bus, _("Bus"));
                    addOptional(additionalInfo, nodeDev.capability.device, _("Device"));
                }
                break;
            }
            case "pci": {
                addOptional(additionalInfo, device.device.type, _("Type"));
                addOptional(additionalInfo, nodeDev.capability.vendor._value, _("Vendor"));
                addOptional(additionalInfo, nodeDev.capability.product._value, _("Product"));
                addOptional(additionalInfo, getNodeDevSource(nodeDev), _("Slot"));
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

    const upArrow = <Button isSmall isDisabled={upDisabled} onClick={moveUp} icon={<AngleUpIcon />} id={`${idPrefix}-up`} />;
    const downArrow = <Button isSmall isDisabled={downDisabled} onClick={moveDown} icon={<AngleDownIcon />} id={`${idPrefix}-down`} />;

    return (
        <DataListItem
            id={`${idPrefix}-device-row-${index}`}
            className={ device.checked ? "is-checked" : "" }
        >
            <DataListItemRow>
                <DataListControl>
                    <DataListCheck id={`${idPrefix}-device-${index}-checkbox`}
                                       name={`${idPrefix}-device-${index}-checkbox`}
                                       otherControls
                                       onChange={onToggle}
                                       isChecked={!!device.checked} />
                </DataListControl>
                <DataListItemCells dataListCells={[
                    <DataListCell className="boot-order-modal-cell" key="item1">
                        <span className="boot-order-description">{heading}</span>
                        <span className="boot-order-additional-info">
                            <DescriptionList isHorizontal>{additionalInfo}</DescriptionList>
                        </span>
                    </DataListCell>
                ]} />
                <DataListAction>
                    {upArrow}
                </DataListAction>
                <DataListAction>
                    {downArrow}
                </DataListAction>
            </DataListItemRow>
        </DataListItem>
    );
};

class BootOrderModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {
            devices: getUIBootOrderDevices(props.vm),
        };
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.save = this.save.bind(this);
        this.onToggleDevice = this.onToggleDevice.bind(this);
        this.moveUp = this.moveUp.bind(this);
        this.moveDown = this.moveDown.bind(this);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    save() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const devices = this.state.devices.filter((device) => device.checked);

        domainChangeBootOrder({
            id: vm.id,
            connectionName: vm.connectionName,
            devices,
        })
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch(exc => this.dialogErrorSet(_("Boot order settings could not be saved"), exc.message));
    }

    onToggleDevice(device) {
        // create new array so we don't edit state
        const devices = [...this.state.devices];

        devices[devices.indexOf(device)].checked = !devices[devices.indexOf(device)].checked;

        this.setState({ devices: devices });
    }

    moveUp(device) {
        const direction = -1;
        // create new array so we don't edit state
        const devices = [...this.state.devices];

        const index = devices.indexOf(device);
        const tmp = devices[index + direction];
        devices[index + direction] = devices[index];
        devices[index] = tmp;

        this.setState({ devices: devices });
    }

    moveDown(device) {
        const direction = 1;
        // create new array so we don't edit state
        const devices = [...this.state.devices];

        const index = devices.indexOf(device);
        const tmp = devices[index + direction];
        devices[index + direction] = devices[index];
        devices[index] = tmp;

        this.setState({ devices: devices });
    }

    render() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const { nodeDevices } = store.getState();
        const idPrefix = vmId(vm.name) + '-order-modal';
        const defaultBody = (
            <DataList isCompact
                          className="boot-order-list-view">
                {this.state.devices.map((device, index) => {
                    const nextDevice = this.state.devices[index + 1];
                    return <DeviceRow
                                    key={index}
                                    idPrefix={idPrefix}
                                    index={index}
                                    device={device}
                                    onClick={() => this.onToggleDevice(device)}
                                    onToggle={() => this.onToggleDevice(device)}
                                    upDisabled={!index || !device.checked}
                                    downDisabled={index + 1 == this.state.devices.length || !nextDevice.checked}
                                    moveUp={() => this.moveUp(device)}
                                    moveDown={() => this.moveDown(device)}
                                    nodeDevices={nodeDevices}
                    />;
                })}
            </DataList>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-window`} isOpen onClose={Dialogs.close} className='boot-order'
                   title={_("Change boot order")}
                   footer={
                       <>
                           <Button id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    {defaultBody}
                </>
            </Modal>
        );
    }
}

BootOrderModal.propTypes = {
    vm: PropTypes.object.isRequired,
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

export const BootOrderLink = ({ vm, idPrefix, nodeDevices }) => {
    const Dialogs = useDialogs();

    function open() {
        Dialogs.show(<BootOrderModal vm={vm} />);
    }

    const modalButton = (
        <Button variant="link" isInline isAriaDisabled={vm.state != 'shut off'} onClick={open}>
            {_("edit")}
        </Button>
    );

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>{getBootOrder(vm)}</FlexItem>
            {vm.state == 'shut off' ? modalButton : <Tooltip content={_("Only editable when the guest is shut off")}>{modalButton}</Tooltip>}
        </Flex>
    );
};
