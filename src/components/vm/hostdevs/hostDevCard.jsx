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
import React from 'react';
import PropTypes from 'prop-types';

import {
    DescriptionList,
    DescriptionListTerm,
    DescriptionListGroup,
    DescriptionListDescription,
} from '@patternfly/react-core';

import cockpit from 'cockpit';
import { vmId, findHostNodeDevice } from "../../../helpers.js";
import { ListingTable } from "cockpit-components-table.jsx";

const _ = cockpit.gettext;

/* Adds an optional description-value pair to an array which represents multiple values of a table cell
 *
 * @param value a value of the descr-value pair
 * @param descr a description of the descr-value pair
 * @param id
 */
export function getOptionalValue(value, id, descr) {
    return (
        <DescriptionListGroup key={descr}>
            <DescriptionListTerm>
                {descr}
            </DescriptionListTerm>
            <DescriptionListDescription id={id}>
                {value}
            </DescriptionListDescription>
        </DescriptionListGroup>
    );
}

export const VmHostDevCard = ({ vm, nodeDevices, config }) => {
    function getClass(hostDev, hostdevId) {
        const nodeDev = findHostNodeDevice(hostDev, nodeDevices);

        if (nodeDev && (["usb_device", "pci"].includes(nodeDev.capability.type)))
            return nodeDev.class;
    }

    function getProduct(hostDev, hostdevId) {
        const nodeDev = findHostNodeDevice(hostDev, nodeDevices);

        if (["usb", "pci"].includes(hostDev.type)) {
            if (nodeDev)
                return nodeDev.capability.product._value;
            else if (hostDev.type === "usb")
                return hostDev.source.product.id;
        }
    }

    function getVendor(hostDev, hostdevId) {
        const nodeDev = findHostNodeDevice(hostDev, nodeDevices);

        if (["usb", "pci"].includes(hostDev.type)) {
            if (nodeDev)
                return nodeDev.capability.vendor._value;
            else if (hostDev.type === "usb")
                return hostDev.source.vendor.id;
        }
    }

    function getSource(hostDev, hostdevId) {
        const cells = [];
        const nodeDev = findHostNodeDevice(hostDev, nodeDevices);
        if (hostDev.type === "usb" && nodeDev) {
            const device = nodeDev.devnum;
            const bus = nodeDev.busnum;

            cells.push(getOptionalValue(device, `${hostdevId}-device`, _("Device")));
            cells.push(getOptionalValue(bus, `${hostdevId}-bus`, _("Bus")));
        } else if (hostDev.type === "pci") {
            let domain = hostDev.source.address.domain.split('x')[1];
            let bus = hostDev.source.address.bus.split('x')[1];
            let slot = hostDev.source.address.slot.split('x')[1];
            let func = hostDev.source.address.func.split('x')[1];

            domain = String(domain).padStart(4, '0');
            bus = String(bus).padStart(2, '0');
            slot = String(slot).padStart(2, '0');
            func = String(func).padStart(1, '0');

            cells.push(getOptionalValue(`${domain}:${bus}:${slot}.${func}`, `${hostdevId}-slot`, _("Slot")));
        } else if (hostDev.type === "scsi") {
            const bus = hostDev.source.address.bus;
            const target = hostDev.source.address.target;
            const unit = hostDev.source.address.lun;

            cells.push(getOptionalValue(bus, `${hostdevId}-bus`, _("Bus")));
            cells.push(getOptionalValue(unit, `${hostdevId}-unit`, _("Slot")));
            cells.push(getOptionalValue(target, `${hostdevId}-target`, _("Target")));
        } else if (hostDev.type === "scsi_host") {
            const protocol = hostDev.source.protocol;
            const wwpn = hostDev.source.wwpn;

            cells.push(getOptionalValue(protocol, `${hostdevId}-protocol`, _("Protocol")));
            cells.push(getOptionalValue(wwpn, `${hostdevId}-wwpn`, _("WWPN")));
        } else if (hostDev.type === "mdev") {
            const uuid = hostDev.source.address.uuid;

            cells.push(getOptionalValue(uuid, `${hostdevId}-uuid`, _("UUID")));
        } else if (hostDev.type === "storage") {
            const block = hostDev.source.block;

            cells.push(getOptionalValue(block, `${hostdevId}-block`, _("Path")));
        } else if (hostDev.type === "misc") {
            const ch = hostDev.source.char;

            cells.push(getOptionalValue(ch, `${hostdevId}-char`, _("Path")));
        } else if (hostDev.type === "net") {
            const iface = hostDev.source.interface;

            cells.push(getOptionalValue(iface, `${hostdevId}-interface`, _("Interface")));
        }

        return <DescriptionList isHorizontal>{cells}</DescriptionList>;
    }

    const id = vmId(vm.name);

    // Hostdev data mapping to rows
    const detailMap = [
        {
            name: _("Type"), value: (hostdev, hostdevId) => {
                return (
                    <span id={`${id}-hostdev-${hostdevId}-type`}>
                        {hostdev.type}
                    </span>
                );
            }
        },
        {
            name: _("Class"), value: (hostdev, hostdevId) => {
                return (
                    <span id={`${id}-hostdev-${hostdevId}-class`}>
                        {getClass(hostdev, hostdevId)}
                    </span>
                );
            }
        },
        {
            name: _("Model"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-product`}>
                        {getProduct(hostdev, hostdevId)}
                    </div>
                );
            }
        },
        {
            name: _("Vendor"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-vendor`}>
                        {getVendor(hostdev, hostdevId)}
                    </div>
                );
            }
        },
        {
            name: _("Source"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-source`}>
                        {getSource(hostdev, hostdevId)}
                    </div>
                );
            }
        },
    ];

    let hostdevId = 1;

    const columnTitles = detailMap.map(target => target.name);
    const rows = vm.hostDevices.sort((a, b) => a.type < b.type && -1).map(target => {
        const columns = detailMap.map(d => {
            return { title: d.value(target, hostdevId, vm.connectionName) };
        });
        hostdevId++;
        return { columns, props: { key: hostdevId } };
    });

    return (
        <ListingTable aria-label={_(`VM ${vm.name} Host Devices`)}
            gridBreakPoint='grid-xl'
            variant='compact'
            emptyCaption={_("No host devices assigned to this VM")}
            rows={rows}
            columns={columnTitles} />
    );
};

VmHostDevCard.propTypes = {
    vm: PropTypes.object.isRequired,
    config: PropTypes.object.isRequired,
    nodeDevices: PropTypes.array.isRequired,
};
