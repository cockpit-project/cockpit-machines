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

import type {
    ConnectionName,
    Network
} from '../types';

import { updateOrAddNetwork } from '../actions/store-actions.js';
import { getNetworkXML } from '../libvirt-xml-create.js';
import { parseNetDumpxml } from '../libvirt-xml-parse.js';
import { DBusProps, get_string_prop, get_boolean_prop, call, timeout, Enum } from './helpers.js';

export function networkActivate({
    connectionName,
    objPath
} : {
    connectionName: ConnectionName,
    objPath: string
}): Promise<void> {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Create', [], { timeout, type: '' });
}

interface StaticHostEntriesSpec {
    connectionName: ConnectionName,
    objPath: string,
    macAddress: string,
    ipAddress: string,
    parentIndex: number,
    isNetworkActive: boolean,
}

export function networkAddStaticHostEntries(params: StaticHostEntriesSpec): Promise<void> {
    return networkUpdateStaticHostEntries({ ...params, commandFlag: Enum.VIR_NETWORK_UPDATE_COMMAND_ADD_LAST });
}

export interface NetworkCreateParams {
    connectionName: ConnectionName,
    name: string,
    forwardMode: string,
    device: string,
    ipv4: string,
    netmask: string,
    ipv6: string,
    prefix: string,
    ipv4DhcpRangeStart: string,
    ipv4DhcpRangeEnd: string,
    ipv6DhcpRangeStart: string,
    ipv6DhcpRangeEnd: string,
}

export function networkCreate({
    connectionName,
    name,
    forwardMode,
    device,
    ipv4,
    netmask,
    ipv6,
    prefix,
    ipv4DhcpRangeStart,
    ipv4DhcpRangeEnd,
    ipv6DhcpRangeStart,
    ipv6DhcpRangeEnd
} : NetworkCreateParams): Promise<void> {
    const netXmlDesc = getNetworkXML({
        name,
        forwardMode,
        ipv4,
        netmask,
        ipv6,
        prefix,
        device,
        ipv4DhcpRangeStart,
        ipv4DhcpRangeEnd,
        ipv6DhcpRangeStart,
        ipv6DhcpRangeEnd
    });

    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'NetworkDefineXML', [netXmlDesc], { timeout, type: 's' });
}

export function networkDeactivate({
    connectionName,
    objPath
} : {
    connectionName: ConnectionName,
    objPath: string,
}): Promise<void> {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Destroy', [], { timeout, type: '' });
}

export async function networkGetAll({
    connectionName,
} : {
    connectionName: ConnectionName,
}): Promise<void> {
    try {
        const [objPaths]: [string[]] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListNetworks', [0], { timeout, type: 'u' });
        await Promise.all(objPaths.map(path => networkGet({ connectionName, id: path })));
    } catch (ex) {
        if (ex instanceof Error)
            console.warn('GET_ALL_NETWORKS action failed:', ex.toString());
        throw ex;
    }
}

/*
 * Read properties of a single Network
 *
 * @param Network object path
 */
export async function networkGet({
    id: objPath,
    connectionName,
    updateOnly,
} : {
    id: string,
    connectionName: ConnectionName,
    updateOnly?: boolean,
}): Promise<void> {
    try {
        const props: Partial<Network> & { id: string, connectionName: ConnectionName } = {
            id: objPath,
            connectionName
        };

        const [resultProps] = await call<[DBusProps]>(connectionName, objPath, 'org.freedesktop.DBus.Properties', 'GetAll', ['org.libvirt.Network'], { timeout, type: 's' });
        /* Sometimes not all properties are returned; for example when some network got deleted while part
            * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
            */
        if ("Active" in resultProps)
            props.active = get_boolean_prop(resultProps, "Active");
        if ("Persistent" in resultProps)
            props.persistent = get_boolean_prop(resultProps, "Persistent");
        if ("Autostart" in resultProps)
            props.autostart = get_boolean_prop(resultProps, "Autostart");
        if ("Name" in resultProps)
            props.name = get_string_prop(resultProps, "Name");

        const [xml] = await call<[string]>(connectionName, objPath, 'org.libvirt.Network', 'GetXMLDesc', [0], { timeout, type: 'u' });
        const network = parseNetDumpxml(xml);
        store.dispatch(updateOrAddNetwork(Object.assign(props, network), !!updateOnly));
    } catch (ex) {
        if (ex instanceof Error)
            console.warn('GET_NETWORK action failed for path', objPath, ex.toString());
    }
}

export async function networkChangeAutostart({
    network,
    autostart
} : {
    network: Network,
    autostart: boolean,
}): Promise<void> {
    const [networkPath] = await call<[string]>(network.connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect',
                                               'NetworkLookupByName', [network.name], { timeout, type: 's' });
    const args = ['org.libvirt.Network', 'Autostart', cockpit.variant('b', autostart)];

    await call(network.connectionName, networkPath, 'org.freedesktop.DBus.Properties', 'Set', args, { timeout, type: 'ssv' });
    await networkGet({ connectionName: network.connectionName, id: network.id });
}

export function networkRemoveStaticHostEntries(params: StaticHostEntriesSpec): Promise<void> {
    return networkUpdateStaticHostEntries({ ...params, commandFlag: Enum.VIR_NETWORK_UPDATE_COMMAND_DELETE });
}

export function networkUndefine({
    connectionName,
    objPath
} : {
    connectionName: ConnectionName,
    objPath: string,
}): Promise<void> {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Undefine', [], { timeout, type: '' });
}

function networkUpdateStaticHostEntries({
    connectionName,
    objPath,
    macAddress,
    ipAddress,
    parentIndex,
    isNetworkActive,
    commandFlag
} : StaticHostEntriesSpec & { commandFlag: number }): Promise<void> {
    let flags = Enum.VIR_NETWORK_UPDATE_AFFECT_CONFIG;
    if (isNetworkActive)
        flags |= Enum.VIR_NETWORK_UPDATE_AFFECT_LIVE;

    return call(
        connectionName,
        objPath,
        'org.libvirt.Network',
        'Update',
        [commandFlag, Enum.VIR_NETWORK_SECTION_IP_DHCP_HOST, parentIndex, `<host mac='${macAddress}' ip='${ipAddress}' />`, flags]
        , { timeout, type: 'uuisu' }
    );
}
