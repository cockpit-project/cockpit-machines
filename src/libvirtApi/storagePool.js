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

import { updateOrAddStoragePool } from '../actions/store-actions.js';
import { getPoolXML } from '../libvirt-xml-create.js';
import { parsePoolCapabilities, parseStoragePoolDumpxml } from '../libvirt-xml-parse.js';
import { storageVolumeGetAll } from './storageVolume.js';
import { call, Enum, timeout } from './helpers.js';

export function storagePoolActivate({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Create', [Enum.VIR_STORAGE_POOL_CREATE_NORMAL], { timeout, type: 'u' });
}

export function storagePoolCreate({
    connectionName,
    name,
    type,
    source,
    target,
    autostart,
}) {
    const poolXmlDesc = getPoolXML({ name, type, source, target });
    let storagePoolPath;

    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolDefineXML', [poolXmlDesc, 0], { timeout, type: 'su' })
            .then(poolPath => {
                storagePoolPath = poolPath[0];
                const args = ['org.libvirt.StoragePool', 'Autostart', cockpit.variant('b', autostart)];

                return call(connectionName, storagePoolPath, 'org.freedesktop.DBus.Properties', 'Set', args, { timeout, type: 'ssv' });
            }, exc => {
                if (storagePoolPath)
                    storagePoolUndefine(connectionName, storagePoolPath);
                return Promise.reject(exc);
            });
}

export function storagePoolDeactivate({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Destroy', [], { timeout, type: '' });
}

/*
 * Read Storage Pool properties of a single storage Pool
 *
 * @param Pool object path
 * @returns {Function}
 */
export function storagePoolGet({
    id: objPath,
    connectionName,
    updateOnly,
}) {
    let dumpxmlParams;
    const props = {};

    call(connectionName, objPath, 'org.libvirt.StoragePool', 'GetXMLDesc', [0], { timeout, type: 'u' })
            .then(poolXml => {
                dumpxmlParams = parseStoragePoolDumpxml(connectionName, poolXml[0], objPath);

                return call(connectionName, objPath, 'org.freedesktop.DBus.Properties', 'GetAll', ['org.libvirt.StoragePool'], { timeout, type: 's' });
            })
            .then((resultProps) => {
                /* Sometimes not all properties are returned; for example when some storage got deleted while part
                 * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
                 */
                if ("Active" in resultProps[0])
                    props.active = resultProps[0].Active.v.v;
                if ("Persistent" in resultProps[0])
                    props.persistent = resultProps[0].Persistent.v.v;
                if ("Autostart" in resultProps[0])
                    props.autostart = resultProps[0].Autostart.v.v;

                props.volumes = [];
                if (props.active) {
                    storageVolumeGetAll({ connectionName, poolName: dumpxmlParams.name })
                            .then(volumes => {
                                props.volumes = volumes;
                            })
                            .finally(() => store.dispatch(updateOrAddStoragePool(Object.assign({}, dumpxmlParams, props), updateOnly)));
                } else {
                    store.dispatch(updateOrAddStoragePool(Object.assign({}, dumpxmlParams, props), updateOnly));
                }
            })
            .catch(ex => console.warn('GET_STORAGE_POOL action failed for path', objPath, ex.toString()));
}

export function storagePoolGetAll({
    connectionName,
}) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListStoragePools', [0], { timeout, type: 'u' })
            .then(objPaths => {
                return Promise.all(objPaths[0].map(path => {
                    return call(connectionName, path, 'org.freedesktop.DBus.Properties', 'Get', ['org.libvirt.StoragePool', 'Active'], { timeout, type: 'ss' })
                            .then(active => {
                                if (active[0].v)
                                    return storagePoolRefresh({ connectionName, objPath: path });
                                else
                                    return storagePoolGet({ connectionName, id:path });
                            });
                }));
            })
            .catch(ex => {
                console.warn('GET_ALL_STORAGE_POOLS action failed:', ex.toString());
                return Promise.reject(ex);
            });
}

export function storagePoolGetCapabilities({ connectionName }) {
    // TODO: replace with D-Bus API once available https://bugzilla.redhat.com/show_bug.cgi?id=1986321
    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    return cockpit.spawn(
        ["virsh", "-c", "qemu:///" + connectionName, "pool-capabilities"],
        opts
    ).then(poolCapabilities => parsePoolCapabilities(poolCapabilities), ex => {
        console.warn('virsh pool-capabilities failed:', ex.toString());
        return Promise.reject(ex);
    });
}

export function storagePoolRefresh({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Refresh', [0], { timeout, type: 'u' });
}

export function storagePoolUndefine({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Undefine', [], { timeout, type: '' });
}
