/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2021 Red Hat, Inc.
 */

/*
 * Provider for Libvirt using libvirt-dbus API.
 * See https://github.com/libvirt/libvirt-dbus
 */
import cockpit from 'cockpit';

import { appState } from '../state';

export async function interfaceGetAll(): Promise<void> {
    let ifaces = [];

    try {
        const ipData = await cockpit.spawn(["ip", "--json", "a"], { err: "message" });
        ifaces = JSON.parse(ipData);
    } catch (ex) {
        console.warn("Failed to get interfaces with ip command:", String(ex));
    }

    for (const iface of ifaces) {
        appState.addNodeInterface({
            name: iface.ifname,
            MAC: iface.address,
            Active: iface.operstate === "UP",
        });
    }
}
