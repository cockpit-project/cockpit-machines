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
    Button,
    DescriptionList,
    DescriptionListTerm,
    DescriptionListGroup,
    DescriptionListDescription,
} from '@patternfly/react-core';
import { useDialogs } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { vmId, findMatchingNodeDevices, getHostDevSourceObject } from "../../../helpers.js";
import { ListingTable } from "cockpit-components-table.jsx";
import AddHostDev from "./hostDevAdd.jsx";
import { domainGet, domainDetachHostDevice } from '../../../libvirtApi/domain.js';
import { nodeDeviceGetAll } from '../../../libvirtApi/nodeDevice.js';
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

const _ = cockpit.gettext;

function getClass(hostDev, nodeDevices) {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (nodeDev && (["usb_device", "pci"].includes(nodeDev.capability.type)))
        return nodeDev.class;
}

function getProduct(hostDev, nodeDevices) {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (["usb", "pci"].includes(hostDev.type)) {
        if (nodeDev)
            return nodeDev.capability.product._value;
        else if (hostDev.type === "usb")
            return hostDev.source.product.id;
    }
}

function getPciSlot(hostDev) {
    let domain = hostDev.source.address.domain.split('x')[1];
    let bus = hostDev.source.address.bus.split('x')[1];
    let slot = hostDev.source.address.slot.split('x')[1];
    let func = hostDev.source.address.func.split('x')[1];

    domain = String(domain).padStart(4, '0');
    bus = String(bus).padStart(2, '0');
    slot = String(slot).padStart(2, '0');
    func = String(func).padStart(1, '0');

    return `${domain}:${bus}:${slot}.${func}`;
}

function getVendor(hostDev, nodeDevices) {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (["usb", "pci"].includes(hostDev.type)) {
        if (nodeDev)
            return nodeDev.capability.vendor._value;
        else if (hostDev.type === "usb")
            return hostDev.source.vendor.id;
    }
}

function getSource(hostDev, nodeDevices, hostdevId) {
    const cells = [];
    if (hostDev.type === "usb") {
        const nodeDevs = findMatchingNodeDevices(hostDev, nodeDevices);
        let device;
        let bus;

        if (nodeDevs.length === 1) {
            device = nodeDevs[0].devnum;
            bus = nodeDevs[0].busnum;
        } else {
            // If there are multiple usb devices without specified bus/device and same vendor/product,
            // it's impossible to identify which one is the one referred in VM's XML
            device = _("Unspecified");
            bus = _("Unspecified");
        }

        // If there are 2 usb devices without specified bus/device and same vendor/product,
        // it's impossible to identify which one is the one referred in VM's XML
        cells.push(getOptionalValue(device, `${hostdevId}-device`, _("Device")));
        cells.push(getOptionalValue(bus, `${hostdevId}-bus`, _("Bus")));
    } else if (hostDev.type === "pci") {
        cells.push(getOptionalValue(getPciSlot(hostDev), `${hostdevId}-slot`, _("Slot")));
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

export const VmHostDevActions = ({ vm }) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vm.name)}-hostdevs`;

    function open() {
        Dialogs.show(<AddHostDev idPrefix={idPrefix} vm={vm} />);
    }

    return (
        <>
            <Button id={`${idPrefix}-add`} variant='secondary' onClick={open}>
                {_("Add host device")}
            </Button>
        </>
    );
};

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
                        {getClass(hostdev, nodeDevices)}
                    </span>
                );
            }
        },
        {
            name: _("Model"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-product`}>
                        {getProduct(hostdev, nodeDevices)}
                    </div>
                );
            }
        },
        {
            name: _("Vendor"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-vendor`}>
                        {getVendor(hostdev, nodeDevices)}
                    </div>
                );
            }
        },
        {
            name: _("Source"), value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-source`}>
                        {getSource(hostdev, nodeDevices, hostdevId)}
                    </div>
                );
            }
        },
        {
            name: "", value: (hostdev, hostdevId) => {
                const source = getHostDevSourceObject(hostdev);

                let objectDescription = [];
                if (hostdev.type === "pci") {
                    objectDescription = [
                        { name: _("Vendor"), value: getVendor(hostdev, nodeDevices) },
                        { name: _("Product"), value: getProduct(hostdev, nodeDevices) },
                        { name: _("Slot"), value: getPciSlot(hostdev) },
                    ];
                } else if (hostdev.type == "usb") {
                    objectDescription = [
                        { name: _("Vendor"), value: getVendor(hostdev, nodeDevices) },
                        { name: _("Product"), value: getProduct(hostdev, nodeDevices) },
                    ];
                    if (source) {
                        objectDescription.push({ name: _("Device"), value: source.device });
                        objectDescription.push({ name: _("Bus"), value: source.bus });
                    }
                }

                const deleteNICAction = (
                    <DeleteResourceButton objectId={`${id}-hostdev-${hostdevId}`}
                                          actionName={_("Remove")}
                                          dialogProps={{
                                              title: _("Remove host device from VM?"),
                                              errorMessage: ("Host device could not be removed"),
                                              actionDescription: cockpit.format(_("Host device will be removed from $0:"), vm.name),
                                              objectDescription,
                                              actionName: _("Remove"),
                                              deleteHandler: () => {
                                                  // refresh nodeDevice since usb number may be changed
                                                  return domainDetachHostDevice({ connectionName: vm.connectionName, vmId: vm.id, live: vm.state !== 'shut off', dev: hostdev })
                                                          .then(() => nodeDeviceGetAll({ connectionName: vm.connectionName }))
                                                          .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }));
                                              }
                                          }} />
                );

                return ["usb", "pci"].includes(hostdev.type)
                    ? <div className='machines-listing-actions'>
                        {deleteNICAction}
                    </div>
                    : null;
            }
        },
    ];

    let hostdevId = 1;

    const sortHostDevices = (a, b) => {
        if (a.type !== b.type)
            return a.type > b.type ? 1 : -1;

        const aSource = getHostDevSourceObject(a);
        const bSource = getHostDevSourceObject(b);
        if (aSource && bSource) {
            if (a.type === "pci") {
                const aSlot = `${aSource.domain}:${aSource.bus}:${aSource.slot}.${aSource.func}`;
                const bSlot = `${bSource.domain}:${bSource.bus}:${bSource.slot}.${bSource.func}`;
                if (aSlot !== bSlot)
                    return aSlot > bSlot ? 1 : -1;
            } else if (a.type === "usb") {
                const aVendorAndProduct = `${aSource.vendor}-${aSource.product}`;
                const bVendorAndProduct = `${bSource.vendor}-${bSource.product}`;
                if (aVendorAndProduct !== bVendorAndProduct)
                    return aVendorAndProduct > bVendorAndProduct ? 1 : -1;
            }
        }

        return 0;
    };
    const columnTitles = detailMap.map(target => target.name);
    const rows = vm.hostDevices.sort(sortHostDevices).map(target => {
        const columns = detailMap.map(d => {
            return { title: d.value(target, hostdevId, vm.connectionName) };
        });
        hostdevId++;
        return { columns, props: { key: hostdevId } };
    });

    return (
        <ListingTable aria-label={cockpit.format(_("VM $0 Host Devices"), vm.name)}
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
