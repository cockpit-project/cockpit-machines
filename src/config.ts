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

import type { JsonValue } from "cockpit";
import {
    import_number, import_boolean,
} from "import-json";

import { read_os_release } from "os-release";
import { get_manifest_config_matchlist } from "utils";

interface VmsConfig {
    DefaultRefreshInterval: number;
    MaxPolledVMs: number;
    DummyVmsWaitInterval: number;
    WaitForRetryInstallVm: number;
    StorageMigrationSupported: boolean;
    MaxConsoleCardStates: number;
}

const VMS_CONFIG: VmsConfig = {
    DefaultRefreshInterval: 10000, // in ms
    MaxPolledVMs: 20, // When more than this number of machines are listed on the overview, no usage polling will be done. This avoids excessive traffic.
    DummyVmsWaitInterval: 10 * 60 * 1000, // show dummy vms for max 10 minutes; to let virt-install do work before getting vm from virsh
    WaitForRetryInstallVm: 3 * 1000, // wait for vm to recover in the ui after failed install to show the error
    StorageMigrationSupported: true,
    MaxConsoleCardStates: 10, // maximum number of console card states to keep in memory
};

export async function load_config(): Promise<void> {
    const os_release = await read_os_release();
    const matches = [os_release.PLATFORM_ID, os_release.ID];

    function import_config<K extends keyof VmsConfig>(key: K, importer: (val: JsonValue) => VmsConfig[K]): void {
        const val = get_manifest_config_matchlist("machines", key, null, matches);
        if (val !== null)
            VMS_CONFIG[key] = importer(val);
    }

    import_config("DefaultRefreshInterval", import_number);
    import_config("MaxPolledVMs", import_number);
    import_config("DummyVmsWaitInterval", import_number);
    import_config("WaitForRetryInstallVm", import_number);
    import_config("StorageMigrationSupported", import_boolean);
    import_config("MaxConsoleCardStates", import_number);
}

export default VMS_CONFIG;
