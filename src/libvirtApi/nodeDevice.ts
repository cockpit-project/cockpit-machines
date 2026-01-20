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
import { basename } from 'cockpit-path';
import { appState } from '../state';

import type { optString, ConnectionName, NodeDevice } from '../types';

import { parseNodeDeviceDumpxml } from '../libvirt-xml-parse.js';
import { call, timeout } from './helpers.js';

const _ = cockpit.gettext;

// From https://wiki.osdev.org/PCI

// TODO: Consider showing the subclass instead of the class. It is
// much more informative ("RAID controller" vs just "Mass Storage
// Controller"), and there aren't very many of those either.

const pciClasses: string[] = [
    _("Unclassified"),
    _("Mass Storage Controller"),
    _("Network Controller"),
    _("Display Controller"),
    _("Multimedia Controller"),
    _("Memory Controller"),
    _("Bridge"),
    _("Simple Communication Controller"),
    _("Base System Peripheral"),
    _("Input Device Controller"),
    _("Docking Station"),
    _("Processor"),
    _("Serial Bus Controller"),
    _("Wireless Controller"),
    _("Intelligent Controller"),
    _("Satellite Communication Controller"),
    _("Encryption Controller"),
    _("Signal Processing Controller"),
    _("Processing Accelerator"),
    _("Non-Essential Instrumentation"),
];

function getPciClassString(classString: optString): optString {
    if (!classString)
        return undefined;
    const classNumber = parseInt(classString);
    if (isNaN(classNumber))
        return undefined;
    const topClass = classNumber >> 16;
    if (topClass == 0x40)
        return _("Co-Processor");
    if (topClass == 255)
        return _("Miscellaneous");
    if (topClass < 0 || topClass >= pciClasses.length)
        return undefined;
    return pciClasses[topClass];
}

/*
 * Read properties of a single NodeDevice
 *
 * @param NodeDevice object path
 */
export async function nodeDeviceGet({
    id: objPath,
    connectionName,
} : {
    id: string,
    connectionName: ConnectionName,
}): Promise<void> {
    try {
        const [deviceXml] = await call<[string]>(connectionName, objPath, 'org.libvirt.NodeDevice', 'GetXMLDesc', [0], { timeout, type: 'u' });
        const parsed = parseNodeDeviceDumpxml(deviceXml);
        if (parsed) {
            const deviceXmlObject: NodeDevice = {
                connectionName,
                ...parsed,
            };

            if (deviceXmlObject.capability.type == "pci") {
                if (deviceXmlObject.path)
                    deviceXmlObject.pciSlotName = basename(deviceXmlObject.path);
                deviceXmlObject.pciClass = getPciClassString(deviceXmlObject.capability.class);
            }

            appState.addNodeDevice(deviceXmlObject);
        }
    } catch (ex) {
        console.warn('GET_NODE_DEVICE action failed for path', objPath, String(ex));
    }
}

export async function nodeDeviceGetAll({
    connectionName,
} : {
    connectionName: ConnectionName
}): Promise<void> {
    try {
        const [objPaths] : [string[]] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListNodeDevices', [0], { timeout, type: 'u' });
        // Chunk calls to nodeDeviceGet, without this systems with a lot of pci
        // devices will reach the open file limit
        const chunkSize = 200;
        for (let i = 0; i < objPaths.length; i += chunkSize) {
            const objPathsChunked = objPaths.slice(i, i + chunkSize);
            await Promise.all(objPathsChunked.map(path => nodeDeviceGet({ connectionName, id: path })));
        }
    } catch (ex) {
        console.warn('GET_ALL_NODE_DEVICES action failed:', String(ex));
        throw ex;
    }
}
