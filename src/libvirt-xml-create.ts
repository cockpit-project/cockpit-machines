/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
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

import type { optString } from './types';

export function getDiskXML(
    type: string,
    file: string | undefined,
    device: string,
    poolName: string | undefined,
    volumeName: string | undefined,
    format: string,
    target: string,
    cacheMode: string,
    shareable: boolean | undefined,
    busType: string,
    serial: string,
): string {
    const doc = document.implementation.createDocument('', '', null);

    const diskElem = doc.createElement('disk');
    diskElem.setAttribute('type', type);
    diskElem.setAttribute('device', device);

    const driverElem = doc.createElement('driver');
    driverElem.setAttribute('name', 'qemu');
    if (format && ['qcow2', 'raw'].includes(format))
        driverElem.setAttribute('type', format);
    driverElem.setAttribute('cache', cacheMode);
    driverElem.setAttribute('discard', 'unmap');
    diskElem.appendChild(driverElem);

    const sourceElem = doc.createElement('source');
    if (type === 'file') {
        if (file)
            sourceElem.setAttribute('file', file);
    } else {
        if (volumeName)
            sourceElem.setAttribute('volume', volumeName);
        if (poolName)
            sourceElem.setAttribute('pool', poolName);
    }
    diskElem.appendChild(sourceElem);

    const targetElem = doc.createElement('target');
    targetElem.setAttribute('dev', target);
    targetElem.setAttribute('bus', busType);
    diskElem.appendChild(targetElem);

    if (shareable) {
        const shareableElem = doc.createElement('shareable');
        diskElem.appendChild(shareableElem);
    }

    if (serial) {
        const serialElem = doc.createElement('serial');
        serialElem.appendChild(doc.createTextNode(serial));
        diskElem.appendChild(serialElem);
    }

    doc.appendChild(diskElem);

    return new XMLSerializer().serializeToString(doc.documentElement);
}

export interface NetworkSpec {
    name: string,
    forwardMode: string,
    device: string,
    ipv4: string | undefined,
    netmask: string,
    ipv6: string | undefined,
    prefix: string,
    ipv4DhcpRangeStart: string,
    ipv4DhcpRangeEnd: string,
    ipv6DhcpRangeStart: string,
    ipv6DhcpRangeEnd: string,
}

export function getNetworkXML({
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
}: NetworkSpec): string {
    const doc = document.implementation.createDocument('', '', null);

    const networkElem = doc.createElement('network');

    const nameElem = doc.createElement('name');
    nameElem.appendChild(doc.createTextNode(name));
    networkElem.appendChild(nameElem);

    if (forwardMode !== 'none') {
        const forwardElem = doc.createElement('forward');
        forwardElem.setAttribute('mode', forwardMode);
        if ((forwardMode === 'nat' || forwardMode === 'route') && device !== 'automatic')
            forwardElem.setAttribute('dev', device);
        networkElem.appendChild(forwardElem);
    }

    if (forwardMode === 'none' ||
        forwardMode === 'nat' ||
        forwardMode === 'route' ||
        forwardMode === 'open') {
        const domainElem = doc.createElement('domain');
        domainElem.setAttribute('name', name);
        domainElem.setAttribute('localOnly', 'yes');
        networkElem.appendChild(domainElem);
    }

    if (ipv4) {
        const dnsElem = doc.createElement('dns');
        const hostElem = doc.createElement('host');
        hostElem.setAttribute('ip', ipv4);
        const hostnameElem = doc.createElement('hostname');
        const hostnameTextNode = doc.createTextNode('gateway');
        hostnameElem.appendChild(hostnameTextNode);
        hostElem.appendChild(hostnameElem);
        dnsElem.appendChild(hostElem);
        networkElem.appendChild(dnsElem);

        const ipElem = doc.createElement('ip');
        ipElem.setAttribute('address', ipv4);
        ipElem.setAttribute('netmask', netmask);
        ipElem.setAttribute('localPtr', 'yes');
        networkElem.appendChild(ipElem);

        if (ipv4DhcpRangeStart) {
            const dhcpElem = doc.createElement('dhcp');
            ipElem.appendChild(dhcpElem);

            const rangeElem = doc.createElement('range');
            rangeElem.setAttribute('start', ipv4DhcpRangeStart);
            rangeElem.setAttribute('end', ipv4DhcpRangeEnd);
            dhcpElem.appendChild(rangeElem);
        }
    }

    if (ipv6) {
        const ipv6Elem = doc.createElement('ip');
        ipv6Elem.setAttribute('family', 'ipv6');
        ipv6Elem.setAttribute('address', ipv6);
        ipv6Elem.setAttribute('prefix', prefix);
        networkElem.appendChild(ipv6Elem);

        if (ipv6DhcpRangeStart) {
            const dhcpElem = doc.createElement('dhcp');
            ipv6Elem.appendChild(dhcpElem);

            const rangeElem = doc.createElement('range');
            rangeElem.setAttribute('start', ipv6DhcpRangeStart);
            rangeElem.setAttribute('end', ipv6DhcpRangeEnd);
            dhcpElem.appendChild(rangeElem);
        }
    }

    doc.appendChild(networkElem);

    return new XMLSerializer().serializeToString(doc.documentElement);
}

export function getVolumeXML(
    volumeName: string,
    size: number,
    format: optString,
): string {
    const doc = document.implementation.createDocument('', '', null);

    const volElem = doc.createElement('volume');
    volElem.setAttribute('type', 'file');

    const nameElem = doc.createElement('name');
    nameElem.appendChild(doc.createTextNode(volumeName));
    volElem.appendChild(nameElem);

    const allocationElem = doc.createElement('capacity');
    allocationElem.setAttribute('unit', 'MiB');
    allocationElem.appendChild(doc.createTextNode(String(size)));
    volElem.appendChild(allocationElem);

    const targetElem = doc.createElement('target');

    if (format) {
        const formatElem = doc.createElement('format');
        formatElem.setAttribute('type', format);
        targetElem.appendChild(formatElem);
    }

    volElem.appendChild(targetElem);

    doc.appendChild(volElem);

    return new XMLSerializer().serializeToString(doc.documentElement);
}

export interface StoragePoolSource {
    dir?: string;
    device?: string;
    name?: string;
    host?: string;
    initiator?: string;
    format?: string | undefined;
}

export function getPoolXML({
    name,
    type,
    source,
    target
} : {
    name: string,
    type: string,
    source: StoragePoolSource,
    target: string,
}): string {
    const doc = document.implementation.createDocument('', '', null);

    const poolElem = doc.createElement('pool');
    poolElem.setAttribute('type', type);

    const nameElem = doc.createElement('name');
    nameElem.appendChild(doc.createTextNode(name));
    poolElem.appendChild(nameElem);

    if (target) {
        const targetElem = doc.createElement('target');
        const pathElem = doc.createElement('path');
        pathElem.appendChild(doc.createTextNode(target));
        targetElem.appendChild(pathElem);
        poolElem.appendChild(targetElem);
    }

    const sourceElem = doc.createElement('source');
    if (source.dir) {
        const dirElem = doc.createElement('dir');

        dirElem.setAttribute('path', source.dir);
        sourceElem.appendChild(dirElem);
    }
    if (source.device) {
        const deviceElem = doc.createElement('device');

        deviceElem.setAttribute('path', source.device);
        sourceElem.appendChild(deviceElem);
    }
    if (source.name) {
        const sourceNameElem = doc.createElement('name');

        sourceNameElem.appendChild(doc.createTextNode(source.name));
        sourceElem.appendChild(sourceNameElem);
    }
    if (source.host) {
        const hostElem = doc.createElement('host');

        hostElem.setAttribute('name', source.host);
        sourceElem.appendChild(hostElem);
    }
    if (source.initiator) {
        const initiatorElem = doc.createElement('initiator');
        const iqnElem = doc.createElement('iqn');

        iqnElem.setAttribute('name', source.initiator);
        initiatorElem.appendChild(iqnElem);
        sourceElem.appendChild(initiatorElem);
    }
    if (source.format) {
        const formatElem = doc.createElement('format');

        formatElem.setAttribute('type', source.format);
        sourceElem.appendChild(formatElem);
    }
    if (source.host || source.dir || source.device || source.name || source.initiator || source.format)
        poolElem.appendChild(sourceElem);

    doc.appendChild(poolElem);

    return new XMLSerializer().serializeToString(doc.documentElement);
}

// see https://libvirt.org/formatsnapshot.html
export function getSnapshotXML(
    name?: string,
    description?: string,
    memoryPath?: string | null,
): string {
    const doc = document.implementation.createDocument('', '', null);

    const snapElem = doc.createElement('domainsnapshot');

    if (name) {
        const nameElem = doc.createElement('name');
        nameElem.appendChild(doc.createTextNode(name));
        snapElem.appendChild(nameElem);
    }

    if (description) {
        const descriptionElem = doc.createElement('description');
        descriptionElem.appendChild(doc.createTextNode(description));
        snapElem.appendChild(descriptionElem);
    }

    if (memoryPath) {
        const memoryElem = doc.createElement('memory');
        memoryElem.setAttribute('snapshot', 'external');
        memoryElem.setAttribute('file', memoryPath);
        snapElem.appendChild(memoryElem);
    }

    doc.appendChild(snapElem);

    return new XMLSerializer().serializeToString(doc.documentElement);
}
