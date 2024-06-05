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

import { read_os_release } from "os-release";
import { get_manifest_config_matchlist } from "utils";

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

export async function load_config() {
    const os_release = await read_os_release();
    const matches = [os_release.PLATFORM_ID, os_release.ID];

    for (const key in VMS_CONFIG) {
        const val = get_manifest_config_matchlist("machines", key, undefined, matches);
        if (val !== undefined)
            VMS_CONFIG[key] = val;
    }
}

export default VMS_CONFIG;
