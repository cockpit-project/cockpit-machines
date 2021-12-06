/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2021 Red Hat, Inc.
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
import React, { useState, useEffect } from "react";
import cockpit from "cockpit";
import {
    Table,
    TableBody,
    TableHeader,
    TableVariant,
} from '@patternfly/react-table';
import {
    Button,
    DescriptionList,
    Form,
    FormGroup,
    Modal,
    Radio
} from "@patternfly/react-core";

import { ModalError } from "cockpit-components-inline-notification.jsx";
import { domainAttachHostDevices, domainGet } from "../../../libvirtApi/domain.js";
import { findHostNodeDevice } from "../../../helpers.js";
import { getOptionalValue } from "./hostDevCard.jsx";
import "./hostDevAdd.scss";

const _ = cockpit.gettext;

const TypeRow = ({ idPrefix, type, setType }) => {
    return (
        <FormGroup fieldId="usb_device"
                   label={_("Type")}
                   isInline
                   hasNoPaddingTop>
            <Radio id="usb_device"
                   name="type"
                   label={_("USB")}
                   isChecked={type === "usb_device"}
                   onChange={() => setType("usb_device")} />
            <Radio id="pci"
                   name="type"
                   label={_("PCI")}
                   isChecked={type === "pci"}
                   onChange={() => setType("pci")} />
        </FormGroup>
    );
};

function devicesHaveAChild(selectableDevices) {
    const all = {};

    selectableDevices.forEach(item => {
        all[item.name] = { ...item };
        all[item.name].hasChildren = false;
    });

    Object.values(all).forEach(item => {
        if (item.parent && item.parent !== "computer" && (item.capability.type === "usb_device" || item.capability.type === "pci")) {
            all[item.parent].hasChildren = true;
        }
    });

    return Object.values(all).sort(a => a.hasChildren ? 1 : -1);
}

const DevRow = ({ idPrefix, type, selectableDevices, setSelectableDevices }) => {
    function getSource(nodeDev, id) {
        const cells = [];
        if (nodeDev.capability.type === "usb_device") {
            const device = nodeDev.devnum;
            const bus = nodeDev.busnum;

            cells.push(getOptionalValue(device, `${id}-device`, _("Device")));
            cells.push(getOptionalValue(bus, `${id}-bus`, _("Bus")));
        } else if (nodeDev.capability.type === "pci") {
            let domain = Number(nodeDev.capability.domain);
            let bus = Number(nodeDev.capability.bus);
            let slot = Number(nodeDev.capability.slot);
            let func = Number(nodeDev.capability.function);

            domain = domain.toString(16).padStart(4, '0');
            bus = bus.toString(16).padStart(2, '0');
            slot = slot.toString(16).padStart(2, '0');
            func = func.toString(16).padStart(1, '0');

            cells.push(getOptionalValue(`${domain}:${bus}:${slot}.${func}`, `${id}-slot`, _("Slot")));
        }

        return cells;
    }

    function onSelect(event, isSelected, rowId) {
        let newDevs;
        if (rowId === -1) {
            newDevs = selectableDevices.map(oneRow => {
                oneRow.selected = isSelected;
                return oneRow;
            });
        } else {
            newDevs = [...selectableDevices];
            newDevs[rowId].selected = isSelected;
        }

        setSelectableDevices(newDevs);
    }

    return (
        <FormGroup fieldId={`${idPrefix}-dev`} label={_("Device")} hasNoPaddingTop isInline>
            <Table onSelect={onSelect}
                   variant={TableVariant.compact}
                   canSelectAll={false}
                   className="vm-device-table"
                   aria-label={_("Table of selectable host devices")}
                   cells={[_("Product"), _("Vendor"), _("Location")]}
                   rows={selectableDevices.map((dev, idx) => {
                       return {
                           selected: dev.selected, disableSelection: dev.nodeDev.hasChildren, cells: [
                               dev.nodeDev.capability.product._value || "(" + _("Undefined") + ")",
                               dev.nodeDev.capability.vendor._value,
                               { title: <DescriptionList key='source' isHorizontal>{getSource(dev.nodeDev, idx)}</DescriptionList> }
                           ]
                       };
                   })}>
                <TableHeader />
                <TableBody />
            </Table>
        </FormGroup>
    );
};

function getSelectableDevices(nodeDevices, vm, type) {
    const devicesNotAlreadyAttached = [];

    const devicesWithCorrectType = nodeDevices.filter(dev => dev.capability && dev.capability.type === type);
    devicesWithCorrectType.filter(dev => dev.capability && dev.capability.type === type).forEach(nodeDev => {
        let deviceIsAlreadyAttached = false;

        vm.hostDevices.forEach(hostDev => {
            const foundNodeDevice = findHostNodeDevice(hostDev, nodeDevices);

            if (foundNodeDevice && nodeDev.path === foundNodeDevice.path)
                deviceIsAlreadyAttached = true;
        });

        if (!deviceIsAlreadyAttached)
            devicesNotAlreadyAttached.push({ selected: false, nodeDev });
    });

    return devicesNotAlreadyAttached;
}

const AddHostDev = ({ idPrefix, vm, nodeDevices, close }) => {
    const [type, setType] = useState("usb_device");
    const [selectableDevices, setSelectableDevices] = useState([]);
    const [dialogError, setDialogError] = useState("");
    const [dialogErrorDetail, setDialogErrorDetail] = useState("");

    const allDevices = devicesHaveAChild([...nodeDevices]);

    useEffect(() => {
        setSelectableDevices(getSelectableDevices(allDevices, vm, type));
    }, []);

    const setTypeWrapper = (newType) => {
        setSelectableDevices(getSelectableDevices(allDevices, vm, newType));
        setType(newType);
    };

    const attach = () => {
        const devicesToAttach = selectableDevices.flatMap(device => device.selected ? [device.nodeDev] : []);

        if (devicesToAttach.length > 0) {
            return domainAttachHostDevices({ connectionName: vm.connectionName, vmName: vm.name, live: vm.state !== "shut off", devices: devicesToAttach })
                    .then(() => {
                        domainGet({ connectionName: vm.connectionName, id: vm.id });
                        close();
                    })
                    .catch(exc => {
                        setDialogError(_("Host device could not be attached"));
                        setDialogErrorDetail(exc.message);
                    });
        } else {
            setDialogError(_("No host device selected"));
        }
    };

    const body = (
        <Form isHorizontal>
            <TypeRow idPrefix={idPrefix} type={type} setType={setTypeWrapper} />
            <DevRow idPrefix={idPrefix} type={type} selectableDevices={selectableDevices} setSelectableDevices={setSelectableDevices} />
        </Form>
    );

    const footer = (
        <>
            {dialogError &&
                <ModalError dialogError={dialogError}
                            dialogErrorDetail={dialogErrorDetail} />}
            <Button id={`${idPrefix}-attach`}
                    variant="primary"
                    onClick={attach}>
                {_("Add")}
            </Button>
            <Button id={`${idPrefix}-cancel`}
                    variant="link"
                    className="btn-cancel"
                    onClick={close}>
                {_("Cancel")}
            </Button>
        </>
    );

    return (
        <Modal position="top"
               variant="medium"
               id={`${idPrefix}-dialog`}
               onClose={close}
               title={_("Add host device")}
               footer={footer}
               isOpen>
            {body}
        </Modal>
    );
};

export default AddHostDev;
