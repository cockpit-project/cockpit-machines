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

import { updateDomainSnapshots } from '../actions/store-actions.js';
import { getSnapshotXML } from '../libvirt-xml-create.js';
import { parseDomainSnapshotDumpxml } from '../libvirt-xml-parse.js';
import { call, Enum, timeout } from './helpers.js';
import { logDebug } from '../helpers.js';

export function snapshotCreate({ connectionName, vmId, name, description, memoryPath, disks, isExternal, storagePools }) {
    // that flag ought to be implicit for non-running VMs, see https://issues.redhat.com/browse/RHEL-22797
    const flags = (!isExternal || memoryPath) ? 0 : Enum.VIR_DOMAIN_SNAPSHOT_CREATE_DISK_ONLY;
    const xmlDesc = getSnapshotXML(name, description, disks, memoryPath, isExternal, storagePools, connectionName);
    return call(connectionName, vmId, 'org.libvirt.Domain', 'SnapshotCreateXML', [xmlDesc, flags], { timeout, type: 'su' });
}

export function snapshotCurrent({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'SnapshotCurrent', [0], { timeout, type: 'u' });
}

export async function snapshotDelete({ connectionName, domainPath, snapshotName }) {
    const [objPath] = await call(connectionName, domainPath, 'org.libvirt.Domain', 'SnapshotLookupByName',
                                 [snapshotName, 0], { timeout, type: 'su' });
    await call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'Delete', [0], { timeout, type: 'u' });
}

export async function snapshotGetAll({ connectionName, domainPath }) {
    try {
        const [objPaths] = await call(connectionName, domainPath, 'org.libvirt.Domain', 'ListDomainSnapshots', [0],
                                      { timeout, type: 'u' });

        const snapXmlList = await Promise.allSettled(objPaths.map(async objPath => {
            const [xml] = await call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'GetXMLDesc', [0], { timeout, type: 'u' });
            const [isCurrent] = await call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'IsCurrent', [0], { timeout, type: 'u' });
            return { xml, isCurrent };
        }));

        const snaps = [];
        snapXmlList.forEach(snap => {
            if (snap.status === 'fulfilled') {
                const snapParams = parseDomainSnapshotDumpxml(snap.value.xml);
                snapParams.isCurrent = snap.value.isCurrent;
                snaps.push(snapParams);
            } else {
                console.warn("DomainSnapshot method GetXMLDesc failed", snap.reason.toString());
            }
        });
        store.dispatch(updateDomainSnapshots({
            connectionName,
            domainPath,
            snaps: snaps.sort((a, b) => a.creationTime - b.creationTime)
        }));
    } catch (ex) {
        if (ex.name === 'org.freedesktop.DBus.Error.UnknownMethod')
            logDebug("LIST_DOMAIN_SNAPSHOTS action failed for domain", domainPath, ", not supported by libvirt-dbus");
        else
            console.warn("LIST_DOMAIN_SNAPSHOTS action failed for domain", domainPath, ":", JSON.stringify(ex), "name:", ex.name);
        store.dispatch(updateDomainSnapshots({
            connectionName,
            domainPath,
            snaps: -1
        }));
    }
}

export async function snapshotRevert({ connectionName, domainPath, snapshotName, force }) {
    const flags = force ? Enum.VIR_DOMAIN_SNAPSHOT_REVERT_FORCE : 0;

    const [objPath] = await call(connectionName, domainPath, 'org.libvirt.Domain', 'SnapshotLookupByName', [snapshotName, 0],
                                 { timeout, type: 'su' });
    await call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'Revert', [flags], { timeout, type: 'u' });
}
