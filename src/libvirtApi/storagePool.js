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

export async function storagePoolCreate({
    connectionName,
    name,
    type,
    source,
    target,
    autostart,
}) {
    const poolXmlDesc = getPoolXML({ name, type, source, target });

    let storagePoolPath;
    try {
        [storagePoolPath] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolDefineXML',
                                       [poolXmlDesc, 0], { timeout, type: 'su' });
        const args = ['org.libvirt.StoragePool', 'Autostart', cockpit.variant('b', autostart)];

        await call(connectionName, storagePoolPath, 'org.freedesktop.DBus.Properties', 'Set', args, { timeout, type: 'ssv' });
    } catch (ex) {
        if (storagePoolPath)
            storagePoolUndefine({ connectionName, objPath: storagePoolPath });
        throw ex;
    }
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
export async function storagePoolGet({
    id: objPath,
    connectionName,
    updateOnly,
}) {
    let dumpxmlParams;
    const props = {};

    try {
        const [poolXml] = await call(connectionName, objPath, 'org.libvirt.StoragePool', 'GetXMLDesc', [0], { timeout, type: 'u' });
        dumpxmlParams = parseStoragePoolDumpxml(connectionName, poolXml, objPath);

        const [resultProps] = await call(connectionName, objPath, 'org.freedesktop.DBus.Properties', 'GetAll', ['org.libvirt.StoragePool'], { timeout, type: 's' });
        /* Sometimes not all properties are returned; for example when some storage got deleted while part
            * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
            */
        if ("Active" in resultProps)
            props.active = resultProps.Active.v.v;
        if ("Persistent" in resultProps)
            props.persistent = resultProps.Persistent.v.v;
        if ("Autostart" in resultProps)
            props.autostart = resultProps.Autostart.v.v;

        props.volumes = [];
        if (props.active) {
            const volumes = await storageVolumeGetAll({ connectionName, poolName: dumpxmlParams.name });
            props.volumes = volumes;
        }
        store.dispatch(updateOrAddStoragePool(Object.assign({}, dumpxmlParams, props), updateOnly));
    } catch (ex) {
        console.warn('GET_STORAGE_POOL action failed for path', objPath, ex.toString());
    }
}

export async function storagePoolGetAll({
    connectionName,
}) {
    try {
        const [objPaths] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListStoragePools', [0],
                                      { timeout, type: 'u' });
        return await Promise.all(objPaths.map(async path => {
            const [active] = await call(connectionName, path, 'org.freedesktop.DBus.Properties', 'Get',
                                        ['org.libvirt.StoragePool', 'Active'], { timeout, type: 'ss' });
            if (active.v)
                return storagePoolRefresh({ connectionName, objPath: path });
            else
                return storagePoolGet({ connectionName, id: path });
        }));
    } catch (ex) {
        console.warn('GET_ALL_STORAGE_POOLS action failed:', ex.toString());
        throw ex;
    }
}

export async function storagePoolGetCapabilities({ connectionName }) {
    // TODO: replace with D-Bus API once available https://issues.redhat.com/browse/RHEL-7045
    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    try {
        const poolCapabilities = await cockpit.spawn(
            ["virsh", "-c", "qemu:///" + connectionName, "pool-capabilities"],
            opts);
        return parsePoolCapabilities(poolCapabilities);
    } catch (ex) {
        console.warn('virsh pool-capabilities failed:', ex.toString());
        throw ex;
    }
}

export function storagePoolRefresh({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Refresh', [0], { timeout, type: 'u' });
}

export function storagePoolUndefine({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.StoragePool', 'Undefine', [], { timeout, type: '' });
}
