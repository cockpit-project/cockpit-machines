/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */

import cockpit from 'cockpit';

import type { ConnectionName } from '../../types';
import { appState } from '../../state';

import { FileChooserCollection } from "cockpit/react/FileChooser";

const _ = cockpit.gettext;

export async function getPoolCollections(connectionName: ConnectionName) {
    const res: FileChooserCollection[] = [];
    for (const p of appState.storagePools) {
        if (p.connectionName == connectionName && p.active) {
            res.push({
                label: cockpit.format(_("Pool \"$0\""), p.name),
                emptyLabel: _("Pool has no volumes"),
                list: async () => p.volumes.map(v => v.path).filter(p => typeof p == "string"),
            });
        }
    }
    return res;
}
