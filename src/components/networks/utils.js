/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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

import * as ip from "ip";

/**
 * Validates correctness of ipv4 address
 *
 * @param {string} address
 * @returns {boolean}
 */
export function validateIpv4(address) {
    return ip.isV4Format(address);
}

/**
 * Returns if the provided address is the network's broadcast address
 *
 * @param {string} address
 * @returns {boolean}
 */
export function ipv4IsBroadcast(address, netMask) {
    if (!validateNetmask(netMask))
        return false;
    const mask = netmaskConvert(netMask);
    const subnet = ip.subnet(address, mask);

    // user provided netmask
    return address === subnet.broadcastAddress;
}

/**
 * Returns if the provided address is the network identifier
 *
 * @param {string} address
 * @returns {boolean}
 */
export function ipv4IsNetworkIdentifier(address, netMask) {
    if (!validateNetmask(netMask))
        return false;
    const mask = netmaskConvert(netMask);
    const subnet = ip.subnet(address, mask);

    // user provided network identifier
    return address === subnet.networkAddress;
}

/**
 * validates correctness of ipv4 prefix length or mask
 *
 * @param {string} prefixOrNetmask
 * @returns {boolean}
 */
export function validateNetmask(prefixOrNetmask) {
    const netmaskParts = ["255", "254", "252", "248", "240", "224", "192", "128", "0"];
    const parts = prefixOrNetmask.split('.');

    // prefix length
    if (parts.length === 1) {
        if (!/^[0-9]+$/.test(parts[0].trim()))
            return false;
        const prefixLength = parseInt(parts[0], 10);
        if (isNaN(prefixLength) || prefixLength < 1 || prefixLength > 31)
            return false;

        return true;
    }

    // netmask
    if (!validateIpv4(prefixOrNetmask))
        return false;

    for (let i = 0; i < 4; i++) {
        if (!(netmaskParts.includes(parts[i])))
            return false;
    }

    return true;
}

/**
 * Converts ipv4 prefix length to mask if @netmask is already not mask
 *
 * @param {string} prefixOrNetmask
 * @returns {string}
 */
export function netmaskConvert(prefixOrNetmask) {
    const parts = prefixOrNetmask.split('.');

    if (parts.length === 4)
        return prefixOrNetmask;
    else if (parts.length === 1)
        return ip.fromPrefixLen(prefixOrNetmask);
}

/**
 * Checks whetever address @ip is in subnet defined by @network and @netmask
 *
 * @param {string} network
 * @param {string} netmask
 * @param {string} ip
 * @returns {boolean}
 */
export function isIpv4InNetwork(network, netmask, ipaddr) {
    if (!ip.isV4Format(network) || !validateNetmask(netmask) || !ip.isV4Format(ipaddr))
        return false;
    const mask = netmaskConvert(netmask);

    return ip.subnet(network, mask).contains(ipaddr);
}

/**
 * Validates correctness of ipv6 address
 *
 * @param {string} address
 * @returns {boolean}
 */
export function validateIpv6(address) {
    return ip.isV6Format(address);
}

/**
 * validates correctness of ipv6 prefix length
 *
 * @param {string} prefixOrNetmask
 * @returns {boolean}
 */
export function validateIpv6Prefix(prefix) {
    if (!/^[0-9]+$/.test(prefix.trim()))
        return false;
    const prefixLength = parseInt(prefix, 10);
    if (isNaN(prefixLength) || prefixLength < 0 || prefixLength > 128)
        return false;

    return true;
}

/**
 * Converts ipv6 address to string containing it's binary representation
 *
 * @param {string} ip
 * @returns {string}
 */
function ipv6ToBinStr(ip) {
    const validGroupCount = 8;
    /* Split address by `:`
     * Then check if the array contains an empty string (happens at ::), and if so
     * replace it with the appropriate number of 0 entries.
     */
    const arrAddr = ip.split(":");
    const arrAddrExpanded = arrAddr.reduce((accum, hexNum) => {
        if (hexNum)
            accum.push(hexNum);
        else
            for (let i = 0; i < (validGroupCount - arrAddr.length + 1); i++)
                accum.push("0");
        return accum;
    }, []);

    /* Convert the array of 8 hex entries into a 128 bits binary string */
    return arrAddrExpanded.map(num => {
        let bin = parseInt(num, 16).toString(2);
        while (bin.length < 16)
            bin = "0" + bin;
        return bin;
    }).join("");
}

/**
 * Checks whetever IPv6 address @ip is in subnet defined by @network and @prefix
 *
 * @param {string} network
 * @param {string} prefix
 * @param {string} ip
 * @returns {boolean}
 */
export function isIpv6InNetwork(network, prefix, ip) {
    network = ipv6ToBinStr(network);
    network = network.substring(0, prefix);
    ip = ipv6ToBinStr(ip);
    ip = ip.substring(0, prefix);

    return network == ip;
}
