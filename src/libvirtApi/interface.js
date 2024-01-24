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
import store from '../store.js';

import { updateOrAddInterface } from '../actions/store-actions.js';
import { parseIfaceDumpxml } from '../libvirt-xml-parse.js';
import { call, Enum, timeout } from './helpers.js';

/*
 * Read properties of a single Interface
 *
 * @param {object} objPath interface object path
 * @param {string} connectionName
 */
export async function interfaceGet({
    id: objPath,
    connectionName,
}) {
    const props = {};

    try {
        const [resultProps] = await call(connectionName, objPath, 'org.freedesktop.DBus.Properties', 'GetAll',
                                         ['org.libvirt.Interface'], { timeout, type: 's' });
        /* Sometimes not all properties are returned; for example when some network got deleted while part
            * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
            */
        if ("Active" in resultProps)
            props.active = resultProps.Active.v.v;
        if ("MAC" in resultProps)
            props.mac = resultProps.MAC.v.v;
        if ("Name" in resultProps)
            props.name = resultProps.Name.v.v;
        props.id = objPath;
        props.connectionName = connectionName;

        const [xml] = await call(connectionName, objPath, 'org.libvirt.Interface', 'GetXMLDesc', [0], { timeout, type: 'u' });
        const iface = parseIfaceDumpxml(xml);
        store.dispatch(updateOrAddInterface(Object.assign(props, iface)));
    } catch (ex) {
        console.log('listInactiveInterfaces action for path', objPath, ex.toString());
    }
}

export async function interfaceGetAll({ connectionName }) {
    const flags = Enum.VIR_CONNECT_LIST_INTERFACES_ACTIVE | Enum.VIR_CONNECT_LIST_INTERFACES_INACTIVE;

    try {
        const [ifaces] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListInterfaces', [flags], { timeout, type: 'u' });
        await Promise.all(ifaces.map(path => interfaceGet({ connectionName, id: path })));
    } catch (ex) {
        console.warn('getAllInterfaces action failed:', ex.toString());
        throw ex;
    }
}
