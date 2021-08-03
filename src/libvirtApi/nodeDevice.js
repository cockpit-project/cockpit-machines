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

/*
 * Provider for Libvirt using libvirt-dbus API.
 * See https://github.com/libvirt/libvirt-dbus
 */
import cockpit from 'cockpit';
import store from '../store.js';

import { updateOrAddNodeDevice } from '../actions/store-actions.js';
import { parseNodeDeviceDumpxml } from '../libvirt-xml-parse.js';
import { call, timeout } from './helpers.js';

/*
 * Read properties of a single NodeDevice
 *
 * @param NodeDevice object path
 */
export function nodeDeviceGet({
    id: objPath,
    connectionName,
}) {
    let deviceXmlObject;
    return call(connectionName, objPath, 'org.libvirt.NodeDevice', 'GetXMLDesc', [0], { timeout, type: 'u' })
            .then(deviceXml => {
                deviceXmlObject = parseNodeDeviceDumpxml(deviceXml);
                deviceXmlObject.connectionName = connectionName;

                if (deviceXmlObject.path && ["pci", "usb_device"].includes(deviceXmlObject.capability.type)) {
                    return cockpit.spawn(["udevadm", "info", "--path", deviceXmlObject.path], { err: "message" })
                            .then(output => {
                                const nodeDev = parseUdevDB(output);
                                if (nodeDev && nodeDev.SUBSYSTEM === "pci") {
                                    deviceXmlObject.pciSlotName = nodeDev.PCI_SLOT_NAME;
                                    deviceXmlObject.class = nodeDev.ID_PCI_CLASS_FROM_DATABASE;
                                } else if (nodeDev && nodeDev.SUBSYSTEM === "usb") {
                                    deviceXmlObject.class = nodeDev.ID_USB_CLASS_FROM_DATABASE;
                                    deviceXmlObject.busnum = nodeDev.BUSNUM;
                                    deviceXmlObject.devnum = nodeDev.DEVNUM;
                                }

                                return store.dispatch(updateOrAddNodeDevice(deviceXmlObject));
                            });
                } else {
                    return store.dispatch(updateOrAddNodeDevice(deviceXmlObject));
                }
            })
            .catch(ex => console.warn('GET_NODE_DEVICE action failed for path', objPath, ex.toString()));
}

export function nodeDeviceGetAll({
    connectionName,
}) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListNodeDevices', [0], { timeout, type: 'u' })
            .then(objPaths => Promise.all(objPaths[0].map(path => nodeDeviceGet({ connectionName, id:path }))))
            .catch(ex => {
                console.warn('GET_ALL_NODE_DEVICES action failed:', ex.toString());
                return Promise.reject(ex);
            });
}

/**
 * Parses output of "udevadm info --path [devicePath]" into a node device object
 * Inspired by parseUdevDB() from cockpit's pkg/lib/machine-info.js
 *
 * @param {string} text output of "udevadm" commdn
 * @returns {object}
 */
function parseUdevDB(text) {
    const udevPropertyRE = /^E: (\w+)=(.*)$/;
    const device = {};

    if (!(text = text.trim()))
        return;

    text.split("\n").forEach(line => {
        const match = line.match(udevPropertyRE);
        if (match)
            device[match[1]] = match[2];
    });

    return device;
}
