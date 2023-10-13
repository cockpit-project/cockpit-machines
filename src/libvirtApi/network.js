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

import { updateOrAddNetwork } from '../actions/store-actions.js';
import { getNetworkXML } from '../libvirt-xml-create.js';
import { parseNetDumpxml } from '../libvirt-xml-parse.js';
import { call, timeout, Enum } from './helpers.js';

export function networkActivate({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Create', [], { timeout, type: '' });
}

export function networkAddStaticHostEntries(params) {
    return networkUpdateStaticHostEntries({ ...params, commandFlag: Enum.VIR_NETWORK_UPDATE_COMMAND_ADD_LAST });
}

export function networkCreate({
    connectionName, name, forwardMode, device, ipv4, netmask, ipv6, prefix,
    ipv4DhcpRangeStart, ipv4DhcpRangeEnd, ipv6DhcpRangeStart, ipv6DhcpRangeEnd
}) {
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

export function networkDeactivate({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Destroy', [], { timeout, type: '' });
}

export function networkGetAll({
    connectionName,
}) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListNetworks', [0], { timeout, type: 'u' })
            .then(objPaths => {
                return Promise.all(objPaths[0].map((path) => networkGet({ connectionName, id: path })));
            })
            .catch(ex => {
                console.warn('GET_ALL_NETWORKS action failed:', ex.toString());
                return Promise.reject(ex);
            });
}

/*
 * Read properties of a single Network
 *
 * @param Network object path
 */
export function networkGet({
    id: objPath,
    connectionName,
    updateOnly,
}) {
    const props = {};

    return call(connectionName, objPath, 'org.freedesktop.DBus.Properties', 'GetAll', ['org.libvirt.Network'], { timeout, type: 's' })
            .then(resultProps => {
                /* Sometimes not all properties are returned; for example when some network got deleted while part
                 * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
                 */
                if ("Active" in resultProps[0])
                    props.active = resultProps[0].Active.v.v;
                if ("Persistent" in resultProps[0])
                    props.persistent = resultProps[0].Persistent.v.v;
                if ("Autostart" in resultProps[0])
                    props.autostart = resultProps[0].Autostart.v.v;
                if ("Name" in resultProps[0])
                    props.name = resultProps[0].Name.v.v;
                props.id = objPath;
                props.connectionName = connectionName;
                console.log(JSON.stringify(props));

                return call(connectionName, objPath, 'org.libvirt.Network', 'GetXMLDesc', [0], { timeout, type: 'u' });
            })
            .then(xml => {
                const network = parseNetDumpxml(xml);
                return store.dispatch(updateOrAddNetwork(Object.assign({}, props, network), updateOnly));
            })
            .catch(ex => console.warn('GET_NETWORK action failed for path', objPath, ex.toString()));
}

export function networkChangeAutostart({ network, autostart }) {
    return call(network.connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'NetworkLookupByName', [network.name], { timeout, type: 's' })
            .then(networkPath => {
                const args = ['org.libvirt.Network', 'Autostart', cockpit.variant('b', autostart)];

                return call(network.connectionName, networkPath[0], 'org.freedesktop.DBus.Properties', 'Set', args, { timeout, type: 'ssv' });
            })
            .then(() => networkGet({ connectionName: network.connectionName, id: network.id, name: network.name }));
}

export function networkRemoveStaticHostEntries(params) {
    return networkUpdateStaticHostEntries({ ...params, commandFlag: Enum.VIR_NETWORK_UPDATE_COMMAND_DELETE });
}

export function networkUndefine({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Network', 'Undefine', [], { timeout, type: '' });
}

function networkUpdateStaticHostEntries({ connectionName, objPath, macAddress, ipAddress, parentIndex, isNetworkActive, commandFlag }) {
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
