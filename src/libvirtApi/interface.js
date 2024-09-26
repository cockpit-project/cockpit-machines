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

export async function interfaceGetAll() {
    let ifaces = [];

    try {
        const ipData = await cockpit.spawn(["ip", "--json", "a"], { err: "ignore" });
        ifaces = JSON.parse(ipData);
    } catch (ex) {
        console.log("Failed to get interfaces with ip command", ex.toString());
    }

    for (const iface of ifaces) {
        // It seems that we only need the interface name that's used in getNetworkDevices() later
        store.dispatch(updateOrAddInterface({name: iface.ifname}));
    }
}
