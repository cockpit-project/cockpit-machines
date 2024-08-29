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
import { getVolumeXML } from '../libvirt-xml-create.js';
import { parseStorageVolumeDumpxml } from '../libvirt-xml-parse.js';
import { storagePoolRefresh } from './storagePool.js';
import { domainAttachDisk } from './domain.js';
import { call, timeout } from './helpers.js';

export async function storageVolumeCreate({ connectionName, poolName, volName, size, format }) {
    const volXmlDesc = getVolumeXML(volName, size, format);

    const [path] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName',
                              [poolName], { timeout, type: 's' });
    await call(connectionName, path, 'org.libvirt.StoragePool', 'StorageVolCreateXML', [volXmlDesc, 0], { timeout, type: 'su' });
    await storagePoolRefresh({ connectionName, objPath: path });
}

export async function storageVolumeCreateAndAttach({
    connectionName,
    poolName,
    volumeName,
    size,
    format,
    target,
    vmId,
    permanent,
    hotplug,
    cacheMode,
    busType,
    serial,
}) {
    const volXmlDesc = getVolumeXML(volumeName, size, format);
    const [storagePoolPath] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [poolName], { timeout, type: 's' });
    await call(connectionName, storagePoolPath, 'org.libvirt.StoragePool', 'StorageVolCreateXML', [volXmlDesc, 0], { timeout, type: 'su' });
    await storagePoolRefresh({ connectionName, objPath: storagePoolPath });
    await domainAttachDisk({ connectionName, type: "volume", device: "disk", poolName, volumeName, format, target, vmId, permanent, hotplug, cacheMode, busType, serial });
}

export async function storageVolumeDelete({ connectionName, poolName, volName }) {
    const [poolPath] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName',
                                  [poolName], { timeout, type: 's' });
    const [volPath] = await call(connectionName, poolPath, 'org.libvirt.StoragePool', 'StorageVolLookupByName',
                                 [volName], { timeout, type: 's' });
    await call(connectionName, volPath, 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' });
}

export async function storageVolumeGetAll({ connectionName, poolName }) {
    try {
        const [storagePoolPath] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName',
                                             [poolName], { timeout, type: 's' });
        const [objPaths] = await call(connectionName, storagePoolPath, 'org.libvirt.StoragePool', 'ListStorageVolumes', [0],
                                      { timeout, type: 'u' });

        const storageVolumesPropsPromises = objPaths.map(objPath =>
            call(connectionName, objPath, 'org.libvirt.StorageVol', 'GetXMLDesc', [0], { timeout, type: 'u' })
        );

        const volumeXmlList = await Promise.allSettled(storageVolumesPropsPromises);
        return volumeXmlList
                .filter(vol => vol.status === 'fulfilled')
                .map(vol => parseStorageVolumeDumpxml(connectionName, vol.value[0]));
    } catch (ex) {
        console.warn("GET_STORAGE_VOLUMES action failed for pool", poolName, ":", ex.toString());
    }
}
