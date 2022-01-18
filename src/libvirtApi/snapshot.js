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
import { call, timeout } from './helpers.js';

export function snapshotCreate({ connectionName, vmId, name, description }) {
    const xmlDesc = getSnapshotXML(name, description);

    return call(connectionName, vmId, 'org.libvirt.Domain', 'SnapshotCreateXML', [xmlDesc, 0], { timeout, type: 'su' });
}

export function snapshotCurrent({ connectionName, objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'SnapshotCurrent', [0], { timeout, type: 'u' });
}

export function snapshotDelete({ connectionName, domainPath, snapshotName }) {
    return call(connectionName, domainPath, 'org.libvirt.Domain', 'SnapshotLookupByName', [snapshotName, 0], { timeout, type: 'su' })
            .then((objPath) => {
                return call(connectionName, objPath[0], 'org.libvirt.DomainSnapshot', 'Delete', [0], { timeout, type: 'u' });
            });
}

export function snapshotGetAll({ connectionName, domainPath }) {
    call(connectionName, domainPath, 'org.libvirt.Domain', 'ListDomainSnapshots', [0], { timeout, type: 'u' })
            .then(objPaths => {
                const snaps = [];
                const promises = [];

                objPaths[0].forEach(objPath => {
                    promises.push(call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'GetXMLDesc', [0], { timeout, type: 'u' })
                            .then((xml) => {
                                const result = { xml };
                                return call(connectionName, objPath, 'org.libvirt.DomainSnapshot', 'IsCurrent', [0], { timeout, type: 'u' })
                                        .then((isCurrent) => {
                                            result.isCurrent = isCurrent;
                                            return result;
                                        });
                            })
                    );
                });

                // WA to avoid Promise.all() fail-fast behavior
                const toResultObject = (promise) => {
                    return promise
                            .then(result => ({ success: true, result }))
                            .catch(error => ({ success: false, error }));
                };

                Promise.all(promises.map(toResultObject))
                        .then(snapXmlList => {
                            snapXmlList.forEach(snap => {
                                if (snap.success) {
                                    const result = snap.result;
                                    const snapParams = parseDomainSnapshotDumpxml(result.xml[0]);
                                    snapParams.isCurrent = result.isCurrent[0];
                                    snaps.push(snapParams);
                                } else {
                                    console.warn("DomainSnapshot method GetXMLDesc failed", snap.error.toString());
                                }
                            });
                            return store.dispatch(updateDomainSnapshots({
                                connectionName,
                                domainPath,
                                snaps: snaps.sort((a, b) => a.creationTime - b.creationTime)
                            }));
                        });
            })
            .catch(ex => {
                console.warn("LIST_DOMAIN_SNAPSHOTS action failed for domain", domainPath, ":", JSON.stringify(ex));
                store.dispatch(updateDomainSnapshots({
                    connectionName,
                    domainPath,
                    snaps: -1
                }));
            });
}

export function snapshotRevert({ connectionName, domainPath, snapshotName }) {
    return call(connectionName, domainPath, 'org.libvirt.Domain', 'SnapshotLookupByName', [snapshotName, 0], { timeout, type: 'su' })
            .then((objPath) => {
                return call(connectionName, objPath[0], 'org.libvirt.DomainSnapshot', 'Revert', [0], { timeout, type: 'u' });
            });
}
