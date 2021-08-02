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
import { getVolumeXML } from '../xmlCreator.js';
import { parseStorageVolumeDumpxml } from '../libvirt-common.js';
import { storagePoolRefresh } from './storagePool.js';
import { domainAttachDisk } from './domain.js';
import { call, timeout } from './helpers.js';

export function storageVolumeCreate({ connectionName, poolName, volName, size, format }) {
    const volXmlDesc = getVolumeXML(volName, size, format);

    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [poolName], { timeout, type: 's' })
            .then(path => {
                return call(connectionName, path[0], 'org.libvirt.StoragePool', 'StorageVolCreateXML', [volXmlDesc, 0], { timeout, type: 'su' })
                        .then(() => {
                            return storagePoolRefresh({ connectionName, objPath: path[0] });
                        });
            });
}

export function storageVolumeCreateAndAttach({
    connectionName,
    poolName,
    volumeName,
    size,
    format,
    target,
    vmId,
    vmName,
    permanent,
    hotplug,
    cacheMode,
    busType,
}) {
    const volXmlDesc = getVolumeXML(volumeName, size, format);

    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [poolName], { timeout, type: 's' })
            .then((storagePoolPath) => {
                return call(connectionName, storagePoolPath[0], 'org.libvirt.StoragePool', 'StorageVolCreateXML', [volXmlDesc, 0], { timeout, type: 'su' })
                        .then(() => {
                            return storagePoolRefresh({ connectionName, objPath: storagePoolPath[0] });
                        });
            })
            .then((volPath) => {
                return domainAttachDisk({ connectionName, type: "volume", device: "disk", poolName, volumeName, format, target, vmId, permanent, hotplug, cacheMode, busType });
            });
}

export function storageVolumeDelete({ connectionName, poolName, volName }) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [poolName], { timeout, type: 's' })
            .then(objPath => call(connectionName, objPath[0], 'org.libvirt.StoragePool', 'StorageVolLookupByName', [volName], { timeout, type: 's' }))
            .then(objPath => call(connectionName, objPath[0], 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' }));
}

export function storageVolumeGetAll({ connectionName, poolName }) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [poolName], { timeout, type: 's' })
            .then(storagePoolPath => {
                return call(connectionName, storagePoolPath[0], 'org.libvirt.StoragePool', 'ListStorageVolumes', [0], { timeout, type: 'u' });
            })
            .then((objPaths) => {
                const volumes = [];
                const storageVolumesPropsPromises = [];

                for (let i = 0; i < objPaths[0].length; i++) {
                    const objPath = objPaths[0][i];

                    storageVolumesPropsPromises.push(
                        call(connectionName, objPath, 'org.libvirt.StorageVol', 'GetXMLDesc', [0], { timeout, type: 'u' })
                    );
                }

                // WA to avoid Promise.all() fail-fast behavior
                const toResultObject = (promise) => {
                    return promise
                            .then(result => ({ success: true, result }))
                            .catch(error => ({ success: false, error }));
                };

                return Promise.all(storageVolumesPropsPromises.map(toResultObject)).then(volumeXmlList => {
                    for (let i = 0; i < volumeXmlList.length; i++) {
                        if (volumeXmlList[i].success) {
                            const volumeXml = volumeXmlList[i].result[0];
                            const dumpxmlParams = parseStorageVolumeDumpxml(connectionName, volumeXml);

                            volumes.push(dumpxmlParams);
                        }
                    }
                    return Promise.resolve(volumes);
                });
            })
            .catch(ex => console.warn("GET_STORAGE_VOLUMES action failed for pool %s: %s", poolName, ex.toString()));
}
