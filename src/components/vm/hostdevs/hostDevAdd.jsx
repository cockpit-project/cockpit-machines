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
import React, { useMemo, useState, useEffect } from "react";
import cockpit from "cockpit";
import {
    Table,
    Tbody,
    Thead, Th, Td, Tr,
    TableVariant,
} from '@patternfly/react-table';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal
} from '@patternfly/react-core/dist/esm/deprecated/components/Modal';
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from "cockpit-components-inline-notification.jsx";
import { domainAttachHostDevices, domainGet } from "../../../libvirtApi/domain.js";
import { findMatchingNodeDevices } from "../../../helpers.js";
import { getOptionalValue } from "./hostDevCard.jsx";
import store from "../../../store.js";

const _ = cockpit.gettext;

const TypeRow = ({ type, setType }) => {
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
        if (item.parent && all[item.parent] && item.parent !== "computer" && (item.capability.type === "usb_device" || item.capability.type === "pci")) {
            all[item.parent].hasChildren = true;
        }
    });

    return Object.values(all).sort(a => a.hasChildren ? 1 : -1);
}

const DevRow = ({ idPrefix, selectableDevices, setSelectableDevices }) => {
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

    function onSelect(_event, isSelected, rowId) {
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
            <Table variant={TableVariant.compact}
                   className="vm-device-table"
                   aria-label={_("Table of selectable host devices")}>
                <Thead>
                    <Tr>
                        <Th aria-label={_("Row select")} />
                        {[_("Product"), _("Vendor"), _("Location")].map(col => <Th key={col}>{col}</Th>)}
                    </Tr>
                </Thead>
                <Tbody>
                    {selectableDevices.map((dev, rowIndex) => {
                        return (
                            <Tr key={"row-" + rowIndex}>
                                <Td
                                    select={{
                                        rowIndex,
                                        onSelect: (_event, isSelecting) => onSelect(event, isSelecting, rowIndex),
                                        isSelected: dev.selected,
                                        isDisabled: dev.nodeDev.hasChildren
                                    }}
                                />
                                <Td>{dev.nodeDev.capability.product._value || "(" + _("Undefined") + ")"}</Td>
                                <Td>{dev.nodeDev.capability.vendor._value}</Td>
                                <Td><DescriptionList key='source' isHorizontal>{getSource(dev.nodeDev, rowIndex)}</DescriptionList></Td>
                            </Tr>
                        );
                    })}
                </Tbody>
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
            const foundNodeDevices = findMatchingNodeDevices(hostDev, nodeDevices);

            if (foundNodeDevices.length === 1 && nodeDev.path === foundNodeDevices[0].path)
                deviceIsAlreadyAttached = true;
        });

        if (!deviceIsAlreadyAttached)
            devicesNotAlreadyAttached.push({ selected: false, nodeDev });
    });

    return devicesNotAlreadyAttached;
}

const AddHostDev = ({ idPrefix, vm }) => {
    const Dialogs = useDialogs();
    const [type, setType] = useState("usb_device");
    const [selectableDevices, setSelectableDevices] = useState([]);
    const [dialogError, setDialogError] = useState("");
    const [dialogErrorDetail, setDialogErrorDetail] = useState("");
    const [addHostDevInProgress, setAddHostDevInProgress] = useState(false);

    const { nodeDevices } = useMemo(() => store.getState(), []);
    const allDevices = useMemo(() => devicesHaveAChild([...nodeDevices]), [nodeDevices]);

    useEffect(() => {
        setSelectableDevices(getSelectableDevices(allDevices, vm, type));
    }, [allDevices, vm, type]);

    const setTypeWrapper = (newType) => {
        setSelectableDevices(getSelectableDevices(allDevices, vm, newType));
        setType(newType);
    };

    const attach = () => {
        const devicesToAttach = selectableDevices.flatMap(device => device.selected ? [device.nodeDev] : []);

        if (devicesToAttach.length > 0) {
            setAddHostDevInProgress(true);
            return domainAttachHostDevices({ connectionName: vm.connectionName, vmName: vm.name, live: vm.state !== "shut off", devices: devicesToAttach })
                    .then(() => {
                        domainGet({ connectionName: vm.connectionName, id: vm.id });
                        Dialogs.close();
                    })
                    .catch(exc => {
                        setDialogError(_("Host device could not be attached"));
                        setDialogErrorDetail(exc.message);
                    })
                    .finally(() => setAddHostDevInProgress(false));
        } else {
            setDialogError(_("No host device selected"));
        }
    };

    const body = (
        <Form isHorizontal>
            <TypeRow type={type} setType={setTypeWrapper} />
            <DevRow idPrefix={idPrefix} selectableDevices={selectableDevices} setSelectableDevices={setSelectableDevices} />
        </Form>
    );

    const footer = (
        <>
            <Button id={`${idPrefix}-attach`}
                    isLoading={addHostDevInProgress}
                    isDisabled={addHostDevInProgress}
                    variant="primary"
                    onClick={attach}>
                {_("Add")}
            </Button>
            <Button id={`${idPrefix}-cancel`}
                    variant="link"
                    onClick={Dialogs.close}>
                {_("Cancel")}
            </Button>
        </>
    );

    return (
        <Modal position="top"
               variant="medium"
               id={`${idPrefix}-dialog`}
               onClose={Dialogs.close}
               title={_("Add host device")}
               footer={footer}
               isOpen>

            {dialogError &&
                <ModalError dialogError={dialogError}
                            dialogErrorDetail={dialogErrorDetail} />}
            {body}
        </Modal>
    );
};

export default AddHostDev;
