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
        // --details adds "linkinfo", which tells virtual devices (bridges, bonds, ...) apart from physical ones
        const ipData = await cockpit.spawn(["ip", "--json", "--details", "a"], { err: "message" });
        ifaces = JSON.parse(ipData);
    } catch (ex) {
        console.warn("Failed to get interfaces with ip command:", String(ex));
    }

    for (const iface of ifaces) {
        appState.addNodeInterface({
            name: iface.ifname,
            MAC: iface.address,
            Active: iface.operstate === "UP",
            kind: iface.linkinfo?.info_kind,
            vlanFiltering: iface.linkinfo?.info_data?.vlan_filtering === 1,
        });
    }
}
