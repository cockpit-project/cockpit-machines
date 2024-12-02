/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2023 Red Hat, Inc.
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
export function getServerAddress() {
    return window.location.hostname;
}

export function isLocalhost(address) {
    return address === "localhost" || address.startsWith("127");
}

export function isAmbigious(address) {
    return isLocalhost(address) || ["0", "0.0.0.0"].includes(address);
}

// Get address where VNC or SPICE server is located
export function getConsoleAddress(consoleDetails) {
    let address = consoleDetails.address;

    if (!address || isAmbigious(address))
        address = getServerAddress();

    return address;
}

export function needsTunnel(consoleAddress, serverAddress) {
    return isLocalhost(consoleAddress) && !isLocalhost(serverAddress);
}
