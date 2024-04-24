/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 - 2024 Red Hat, Inc.
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

import * as ipaddr from "ipaddr.js";

/**
 * Validates correctness of ipv4 address
 *
 * @param {string} address
 * @returns {boolean}
 */
export const validateIpv4 = address => ipaddr.IPv4.isValid(address);

/**
 * Returns if the provided address is the network's broadcast address
 *
 * @param {string} address
 * @returns {boolean}
 */
export function ipv4IsBroadcast(address, prefix) {
    return address === ipaddr.IPv4.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
}

/**
 * Returns if the provided address is the network identifier
 *
 * @param {string} address
 * @returns {boolean}
 */
export function ipv4IsNetworkIdentifier(address, prefix) {
    return address === ipaddr.IPv4.networkAddressFromCIDR(`${address}/${prefix}`).toString();
}

export function ipv4ExampleBridgeAddressForNetworkIdentifier(network) {
    const net = ipaddr.parse(network);
    net.octets[3] += 1;
    return ipaddr.fromByteArray(net.octets).toString();
}

/**
 * parses ipv4 prefix length or mask
 *
 * @param {string} prefixOrNetmask
 * @returns int prefix length, or null if invalid
 */
export function parseNetmask(prefixOrNetmask) {
    if (/^[0-9]+$/.test(prefixOrNetmask)) {
        // prefix
        try {
            const prefix = parseInt(prefixOrNetmask);
            ipaddr.IPv4.subnetMaskFromPrefixLength(prefix);
            return prefix;
        } catch (_ex) {
            return null;
        }
    } else {
        // mask
        try {
            return ipaddr.IPv4.parse(prefixOrNetmask).prefixLengthFromSubnetMask();
        } catch (_ex) {
            return null;
        }
    }
}

/**
 * Converts ipv4 prefix length to mask if @netmask is already not mask
 *
 * @param {string} prefixOrNetmask
 * @returns {string}
 */
export function netmaskConvert(prefixOrNetmask) {
    // single number → netmask
    if (/^[0-9]+$/.test(prefixOrNetmask)) {
        try {
            return ipaddr.IPv4.subnetMaskFromPrefixLength(parseInt(prefixOrNetmask)).toString();
        } catch (_ex) {
            // leave unchanged; UI will validate
        }
    }

    return prefixOrNetmask;
}

/**
 * Checks whetever address @address is in subnet defined by @network and @netmask
 *
 * @param {string} network
 * @param {string} netmask
 * @param {string} address
 * @returns {boolean}
 */
export function isIpv4InNetwork(network, prefix, address) {
    if (!validateIpv4(network) || !validateIpv4(address))
        return false;

    const b_network = ipaddr.IPv4.broadcastAddressFromCIDR(`${network}/${prefix}`).toString();
    const b_ipaddr = ipaddr.IPv4.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
    return b_network === b_ipaddr;
}

/**
 * Validates correctness of ipv6 address
 *
 * @param {string} address
 * @returns {boolean}
 */
export const validateIpv6 = address => ipaddr.IPv6.isValid(address);

/**
 * validates correctness of ipv6 prefix length
 *
 * @param {string} prefixOrNetmask
 * @returns {boolean}
 */
export function validateIpv6Prefix(prefix) {
    if (/^[0-9]+$/.test(prefix.trim())) {
        try {
            ipaddr.IPv6.subnetMaskFromPrefixLength(prefix);
            return true;
        } catch (_ex) {}
    }
    return false;
}

/**
 * Checks whetever IPv6 @address is in subnet defined by @network and @prefix
 *
 * @param {string} network
 * @param {string} prefix
 * @param {string} address
 * @returns {boolean}
 */
export function isIpv6InNetwork(network, prefix, address) {
    if (!validateIpv6(network) || !validateIpv6Prefix(prefix) || !validateIpv6(address))
        return false;

    const b_network = ipaddr.IPv6.broadcastAddressFromCIDR(`${network}/${prefix}`).toString();
    const b_ipaddr = ipaddr.IPv6.broadcastAddressFromCIDR(`${address}/${prefix}`).toString();
    return b_network === b_ipaddr;
}
