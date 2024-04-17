/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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

import cockpit from 'cockpit';
import { read_os_release } from "os-release.js";

/**
 * Application-wide constants
 */
const VMS_CONFIG = {
    DefaultRefreshInterval: 10000, // in ms
    DummyVmsWaitInterval: 10 * 60 * 1000, // show dummy vms for max 10 minutes; to let virt-install do work before getting vm from virsh
    WaitForRetryInstallVm: 3 * 1000, // wait for vm to recover in the ui after failed install to show the error
    Virsh: {
        connections: {
            system: {
                params: ['-c', 'qemu:///system']
            },
            session: {
                params: ['-c', 'qemu:///session']
            }
        }
    },

    StorageMigrationSupported: true,
};

function try_fields(dict, fields, def) {
    for (let i = 0; i < fields.length; i++) {
        if (fields[i] && dict[fields[i]] !== undefined)
            return dict[fields[i]];
    }
    return undefined;
}

export async function load_config() {
    const config = cockpit.manifests.machines?.config;
    const os_release = await read_os_release();

    function get_config(name) {
        if (config) {
            let val = config[name];
            if (typeof val === 'object' && val !== null)
                val = try_fields(val, [os_release.PLATFORM_ID, os_release.ID]);
            if (val !== undefined)
                VMS_CONFIG[name] = val;
        }
    }

    for (const f in VMS_CONFIG)
        get_config(f);
}

export default VMS_CONFIG;
