/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 - 2024 Red Hat, Inc.
 */

import * as ipaddr from "ipaddr.js";

/**
 * Validates correctness of ipv4 address
 */
export const validateIpv4 = (address: string): boolean => ipaddr.IPv4.isValid(address);

/**
 * Returns if the provided address is the network's broadcast address
 */
export function ipv4IsBroadcast(address: string, prefix: string): boolean {
    return address === ipaddr.IPv4.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
}

/**
 * Returns if the provided address is the network identifier
 */
export function ipv4IsNetworkIdentifier(address: string, prefix: string): boolean {
    return address === ipaddr.IPv4.networkAddressFromCIDR(`${address}/${prefix}`).toString();
}

export function ipv4ExampleBridgeAddressForNetworkIdentifier(network: string): string {
    const net = ipaddr.IPv4.parse(network);
    net.octets[3] += 1;
    return ipaddr.fromByteArray(net.octets).toString();
}

/**
 * parses ipv4 prefix length or mask
 */
export function parseNetmask(prefixOrNetmask: string): number | null {
    if (/^[0-9]+$/.test(prefixOrNetmask)) {
        // prefix
        try {
            const prefix = parseInt(prefixOrNetmask);
            ipaddr.IPv4.subnetMaskFromPrefixLength(prefix);
            return prefix;
        } catch {
            return null;
        }
    } else {
        // mask
        try {
            return ipaddr.IPv4.parse(prefixOrNetmask).prefixLengthFromSubnetMask();
        } catch {
            return null;
        }
    }
}

/**
 * Converts ipv4 prefix length to mask if @netmask is already not mask
 */
export function netmaskConvert(prefixOrNetmask: string): string {
    // single number → netmask
    if (/^[0-9]+$/.test(prefixOrNetmask)) {
        try {
            return ipaddr.IPv4.subnetMaskFromPrefixLength(parseInt(prefixOrNetmask)).toString();
        } catch {
            // leave unchanged; UI will validate
        }
    }

    return prefixOrNetmask;
}

/**
 * Checks whetever address @address is in subnet defined by @network and @netmask
 */
export function isIpv4InNetwork(network: string, prefix: string, address: string): boolean {
    if (!validateIpv4(network) || !validateIpv4(address))
        return false;

    const b_network = ipaddr.IPv4.broadcastAddressFromCIDR(`${network}/${prefix}`).toString();
    const b_ipaddr = ipaddr.IPv4.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
    return b_network === b_ipaddr;
}

/**
 * Validates correctness of ipv6 address
 */
export const validateIpv6 = (address: string): boolean => ipaddr.IPv6.isValid(address);

/**
 * validates correctness of ipv6 prefix length
 */
export function validateIpv6Prefix(prefix: string): boolean {
    if (/^[0-9]+$/.test(prefix.trim())) {
        try {
            ipaddr.IPv6.subnetMaskFromPrefixLength(Number(prefix));
            return true;
        } catch {
        }
    }
    return false;
}

/**
 * Checks whetever IPv6 @address is in subnet defined by @network and @prefix
 */
export function isIpv6InNetwork(network: string, prefix: string, address: string): boolean {
    if (!validateIpv6(network) || !validateIpv6Prefix(prefix) || !validateIpv6(address))
        return false;

    const b_network = ipaddr.IPv6.broadcastAddressFromCIDR(`${network}/${prefix}`).toString();
    const b_ipaddr = ipaddr.IPv6.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
    return b_network === b_ipaddr;
}

/**
 * Validates a single VLAN ID (1-4094)
 */
export function validateVlanId(id: string): boolean {
    return /^\s*[0-9]+\s*$/.test(id) && Number(id) >= 1 && Number(id) <= 4094;
}

/**
 * Parses a list of VLAN IDs like "10,20-25" into sorted unique numbers; null on any invalid entry
 */
export function parseVlanIds(list: string): number[] | null {
    const ids = new Set<number>();

    for (const item of list.split(',')) {
        const match = /^\s*([0-9]+)\s*(?:-\s*([0-9]+)\s*)?$/.exec(item);
        if (!match)
            return null;
        const start = Number(match[1]);
        const end = match[2] === undefined ? start : Number(match[2]);
        if (start < 1 || end > 4094 || start > end)
            return null;
        for (let id = start; id <= end; id++)
            ids.add(id);
    }

    return [...ids].sort((a, b) => a - b);
}

/**
 * Formats VLAN IDs the way parseVlanIds() reads them, collapsing consecutive IDs into ranges: "10-12, 20"
 */
export function formatVlanIds(ids: number[]): string {
    const sorted = [...new Set(ids)].sort((a, b) => a - b);
    const ranges: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const start = sorted[i];
        while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1)
            i++;
        ranges.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
    }

    return ranges.join(", ");
}
