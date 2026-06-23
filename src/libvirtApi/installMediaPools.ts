/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <https://www.gnu.org/licenses/>.
 */

/* Persistence for "installation media" storage pools.
 *
 * The user can mark a storage pool whose volumes are installation media (ISO
 * images), so the "Create VM" dialog can default its installation source to
 * that pool's directory instead of the filesystem root.
 *
 * libvirt storage pools have no <metadata> element to persist such a flag (and
 * the pool 'type' is a fixed enum), so the marks live in a small Cockpit-owned
 * file on the host, keyed by pool UUID. Keeping it host-side rather than in the
 * browser's localStorage means the choice is shared across browsers and admins.
 */

import cockpit from 'cockpit';

import type { ConnectionName } from '../types';

interface InstallMediaConfig {
    pools: string[];
}

const SYSTEM_PATH = "/etc/cockpit/machines/install-media-pools.json";

async function configPath(connectionName: ConnectionName): Promise<string> {
    if (connectionName === "system")
        return SYSTEM_PATH;

    const user = await cockpit.user();
    return `${user.home}/.config/cockpit/machines/install-media-pools.json`;
}

function readPools(content: InstallMediaConfig | null): string[] {
    return Array.isArray(content?.pools) ? content.pools : [];
}

// Return the UUIDs of pools the user marked as installation-media sources.
// A missing or unreadable config means "nothing marked".
export async function getInstallMediaPools(connectionName: ConnectionName): Promise<string[]> {
    try {
        const path = await configPath(connectionName);
        const opts = connectionName === "system"
            ? { syntax: JSON, superuser: "try" as const }
            : { syntax: JSON };
        const content = await cockpit.file<InstallMediaConfig>(path, opts).read();
        return readPools(content);
    } catch (ex) {
        console.warn("Could not read installation-media pool config:", String(ex));
        return [];
    }
}

// Add (enabled) or remove (!enabled) a pool UUID from the config, rewriting it
// atomically. The containing directory is created on demand.
export async function setInstallMediaPool(
    connectionName: ConnectionName,
    uuid: string,
    enabled: boolean,
): Promise<void> {
    const path = await configPath(connectionName);
    const dir = path.replace(/\/[^/]+$/, "");
    await cockpit.spawn(["mkdir", "-p", dir],
                        connectionName === "system" ? { superuser: "try" } : {});

    const opts = connectionName === "system"
        ? { syntax: JSON, superuser: "try" as const }
        : { syntax: JSON };
    await cockpit.file<InstallMediaConfig>(path, opts).modify(content => {
        const pools = new Set(readPools(content));
        if (enabled)
            pools.add(uuid);
        else
            pools.delete(uuid);
        return { pools: Array.from(pools) };
    });
}
