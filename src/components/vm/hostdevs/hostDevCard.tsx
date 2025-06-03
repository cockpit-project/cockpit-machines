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

import type { optString, VM, VMHostDevice, VMHostDevicePci, NodeDevice } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { useDialogs } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { vmId, findMatchingNodeDevices, getHostDevSourceObject } from "../../../helpers.js";
import { ListingTable } from "cockpit-components-table.jsx";
import AddHostDev from "./hostDevAdd.jsx";
import { domainGet, domainDetachHostDevice } from '../../../libvirtApi/domain.js';
import { nodeDeviceGetAll } from '../../../libvirtApi/nodeDevice.js';
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

const _ = cockpit.gettext;

function getClass(hostDev: VMHostDevice, nodeDevices: NodeDevice[]): optString {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (nodeDev && (["usb_device", "pci"].includes(nodeDev.capability.type)))
        return nodeDev.class;
}

function getProduct(hostDev: VMHostDevice, nodeDevices: NodeDevice[]): optString {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (["usb", "pci"].includes(hostDev.type)) {
        if (nodeDev)
            return nodeDev.capability.product?._value;
        else if (hostDev.type === "usb")
            return hostDev.source.product.id;
    }
}

function getPciSlot(hostDev: VMHostDevicePci): string {
    function hexdigits(str: optString) {
        return str ? str.split('x')[1] : "";
    }

    let domain = hexdigits(hostDev.source.address.domain);
    let bus = hexdigits(hostDev.source.address.bus);
    let slot = hexdigits(hostDev.source.address.slot);
    let func = hexdigits(hostDev.source.address.func);

    domain = String(domain).padStart(4, '0');
    bus = String(bus).padStart(2, '0');
    slot = String(slot).padStart(2, '0');
    func = String(func).padStart(1, '0');

    return `${domain}:${bus}:${slot}.${func}`;
}

function getVendor(hostDev: VMHostDevice, nodeDevices: NodeDevice[]): optString {
    const nodeDev = findMatchingNodeDevices(hostDev, nodeDevices)[0];

    if (["usb", "pci"].includes(hostDev.type)) {
        if (nodeDev)
            return nodeDev.capability.vendor?._value;
        else if (hostDev.type === "usb")
            return hostDev.source.vendor.id;
    }
}

function getSource(hostDev: VMHostDevice, nodeDevices: NodeDevice[], hostdevId: number): React.ReactNode {
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
        cells.push(getOptionalValue(device, `device-${hostdevId}`, _("Device")));
        cells.push(getOptionalValue(bus, `bus-${hostdevId}`, _("Bus")));
    } else if (hostDev.type === "pci") {
        cells.push(getOptionalValue(getPciSlot(hostDev), `slot-${hostdevId}`, _("Slot")));
    } else if (hostDev.type === "scsi") {
        const bus = hostDev.source.address.bus;
        const target = hostDev.source.address.target;
        const unit = hostDev.source.address.unit;

        cells.push(getOptionalValue(bus, `bus-${hostdevId}`, _("Bus")));
        cells.push(getOptionalValue(unit, `unit-${hostdevId}`, _("Slot")));
        cells.push(getOptionalValue(target, `target-${hostdevId}`, _("Target")));
    } else if (hostDev.type === "scsi_host") {
        const protocol = hostDev.source.protocol;
        const wwpn = hostDev.source.wwpn;

        cells.push(getOptionalValue(protocol, `protocol-${hostdevId}`, _("Protocol")));
        cells.push(getOptionalValue(wwpn, `wwpn-${hostdevId}`, _("WWPN")));
    } else if (hostDev.type === "mdev") {
        const uuid = hostDev.source.address.uuid;

        cells.push(getOptionalValue(uuid, `uuid-${hostdevId}`, _("UUID")));
    } else if (hostDev.type === "storage") {
        const block = hostDev.source.block;

        cells.push(getOptionalValue(block, `block-${hostdevId}`, _("Path")));
    } else if (hostDev.type === "misc") {
        const ch = hostDev.source.char;

        cells.push(getOptionalValue(ch, `char-${hostdevId}`, _("Path")));
    } else if (hostDev.type === "net") {
        const iface = hostDev.source.interface;

        cells.push(getOptionalValue(iface, `interface-${hostdevId}`, _("Interface")));
    }

    return <DescriptionList isHorizontal>{cells}</DescriptionList>;
}

export const VmHostDevActions = ({ vm } : { vm: VM }) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vm.name)}-hostdevs`;

    function open() {
        Dialogs.show(<AddHostDev idPrefix={idPrefix} vm={vm} />);
    }

    return (
        <Button id={`${idPrefix}-add`} variant='secondary' onClick={open}>
            {_("Add host device")}
        </Button>
    );
};

/* Adds an optional description-value pair to an array which represents multiple values of a table cell
 */
export function getOptionalValue(value: optString, id: string, descr: string) {
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

export const VmHostDevCard = ({
    vm,
    nodeDevices
} : {
    vm: VM,
    nodeDevices: NodeDevice[]
}) => {
    const id = vmId(vm.name);

    interface Detail {
        name: string,
        value: (hostdev: VMHostDevice, hostdevId: number) => React.ReactNode,
    }

    // Hostdev data mapping to rows
    const detailMap: Detail[] = [
        {
            name: _("Type"),
            value: (hostdev, hostdevId) => {
                return (
                    <span id={`${id}-hostdev-${hostdevId}-type`}>
                        {hostdev.type}
                    </span>
                );
            }
        },
        {
            name: _("Class"),
            value: (hostdev, hostdevId) => {
                return (
                    <span id={`${id}-hostdev-${hostdevId}-class`}>
                        {getClass(hostdev, nodeDevices)}
                    </span>
                );
            }
        },
        {
            name: _("Model"),
            value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-product`}>
                        {getProduct(hostdev, nodeDevices)}
                    </div>
                );
            }
        },
        {
            name: _("Vendor"),
            value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-vendor`}>
                        {getVendor(hostdev, nodeDevices)}
                    </div>
                );
            }
        },
        {
            name: _("Source"),
            value: (hostdev, hostdevId) => {
                return (
                    <div id={`${id}-hostdev-${hostdevId}-source`}>
                        {getSource(hostdev, nodeDevices, hostdevId)}
                    </div>
                );
            }
        },
        {
            name: "",
            value: (hostdev, hostdevId) => {
                const source = getHostDevSourceObject(hostdev);

                interface Description {
                    name: string,
                    value: optString,
                }

                let objectDescription: Description[] = [];
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
                                          }}
                                          isSecondary />
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

    const sortHostDevices = (a: VMHostDevice, b: VMHostDevice) => {
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
            return { title: d.value(target, hostdevId) };
        });
        hostdevId++;
        return { columns, props: { key: hostdevId } };
    });

    return (
        <ListingTable aria-label={cockpit.format(_("VM $0 Host Devices"), vm.name)}
                      gridBreakPoint='grid-lg'
                      variant='compact'
                      emptyCaption={_("No host devices assigned to this VM")}
                      rows={rows}
                      columns={columnTitles} />
    );
};
