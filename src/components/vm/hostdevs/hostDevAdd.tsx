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

import type { VM, NodeDevice } from '../../../types';

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
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from "cockpit-components-inline-notification.jsx";
import { domainAttachHostDevices, domainGet } from "../../../libvirtApi/domain.js";
import { findMatchingNodeDevices } from "../../../helpers.js";
import { getOptionalValue } from "./hostDevCard.jsx";
import store from "../../../store.js";

const _ = cockpit.gettext;

const TypeRow = ({
    type,
    setType
} : {
    type: string,
    setType: (val: string) => void,
}) => {
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

interface NodeDevice2 extends NodeDevice {
    hasChildren: boolean,
}

function devicesHaveAChild(selectableDevices: NodeDevice[]): NodeDevice2[] {
    const all: Record<string, NodeDevice2> = {};

    selectableDevices.forEach(item => {
        if (item.name) {
            all[item.name] = { ...item, hasChildren: false };
        }
    });

    Object.values(all).forEach(item => {
        if (item.parent && all[item.parent] && item.parent !== "computer" && (item.capability.type === "usb_device" || item.capability.type === "pci")) {
            all[item.parent].hasChildren = true;
        }
    });

    return Object.values(all).sort(a => a.hasChildren ? 1 : -1);
}

interface SelectableDevice {
    selected: boolean,
    nodeDev: NodeDevice2,
}

const DevRow = ({
    idPrefix,
    selectableDevices,
    setSelectableDevices
} : {
    idPrefix: string,
    selectableDevices: SelectableDevice[],
    setSelectableDevices: (val: SelectableDevice[]) => void,
}) => {
    function getSource(nodeDev: NodeDevice, id: number): React.ReactNode {
        const cells = [];
        if (nodeDev.capability.type === "usb_device") {
            const device = nodeDev.devnum;
            const bus = nodeDev.busnum;

            cells.push(getOptionalValue(device, `${id}-device`, _("Device")));
            cells.push(getOptionalValue(bus, `${id}-bus`, _("Bus")));
        } else if (nodeDev.capability.type === "pci") {
            const domain_num = Number(nodeDev.capability.domain);
            const bus_num = Number(nodeDev.capability.bus);
            const slot_num = Number(nodeDev.capability.slot);
            const func_num = Number(nodeDev.capability.function);

            const domain = domain_num.toString(16).padStart(4, '0');
            const bus = bus_num.toString(16).padStart(2, '0');
            const slot = slot_num.toString(16).padStart(2, '0');
            const func = func_num.toString(16).padStart(1, '0');

            cells.push(getOptionalValue(`${domain}:${bus}:${slot}.${func}`, `${id}-slot`, _("Slot")));
        }

        return cells;
    }

    function onSelect(isSelected: boolean, rowId: number) {
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
                                        onSelect: (_event, isSelecting) => onSelect(isSelecting, rowIndex),
                                        isSelected: dev.selected,
                                        isDisabled: dev.nodeDev.hasChildren
                                    }}
                                />
                                <Td>{dev.nodeDev.capability.product?._value || "(" + _("Undefined") + ")"}</Td>
                                <Td>{dev.nodeDev.capability.vendor?._value}</Td>
                                <Td><DescriptionList key='source' isHorizontal>{getSource(dev.nodeDev, rowIndex)}</DescriptionList></Td>
                            </Tr>
                        );
                    })}
                </Tbody>
            </Table>
        </FormGroup>
    );
};

function getSelectableDevices(nodeDevices: NodeDevice2[], vm: VM, type: string): SelectableDevice[] {
    const devicesNotAlreadyAttached: SelectableDevice[] = [];

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

const AddHostDev = ({
    idPrefix,
    vm
} : {
    idPrefix: string,
    vm: VM,
}) => {
    const Dialogs = useDialogs();
    const [type, setType] = useState("usb_device");
    const [selectableDevices, setSelectableDevices] = useState<SelectableDevice[]>([]);
    const [dialogError, setDialogError] = useState("");
    const [dialogErrorDetail, setDialogErrorDetail] = useState("");
    const [addHostDevInProgress, setAddHostDevInProgress] = useState(false);

    const { nodeDevices } = useMemo(() => store.getState(), []);
    const allDevices = useMemo(() => devicesHaveAChild([...nodeDevices]), [nodeDevices]);

    useEffect(() => {
        setSelectableDevices(getSelectableDevices(allDevices, vm, type));
    }, [allDevices, vm, type]);

    const setTypeWrapper = (newType: string) => {
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
            <div style={{ overflowX: "auto" }}>
                <DevRow idPrefix={idPrefix} selectableDevices={selectableDevices} setSelectableDevices={setSelectableDevices} />
            </div>
        </Form>
    );

    const footer = (
        <ModalFooter>
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
        </ModalFooter>
    );

    return (
        <Modal position="top"
               variant="medium"
               id={`${idPrefix}-dialog`}
               onClose={Dialogs.close}
               isOpen>

            <ModalHeader title={_("Add host device")} />
            <ModalBody>
                {dialogError &&
                    <ModalError dialogError={dialogError}
                                dialogErrorDetail={dialogErrorDetail} />}
                {body}
            </ModalBody>
            {footer}
        </Modal>
    );
};

export default AddHostDev;
