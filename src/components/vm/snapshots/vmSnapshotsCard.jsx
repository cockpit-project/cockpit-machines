/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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

import React from 'react';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { CheckIcon, InfoAltIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';
import { useDialogs, DialogsContext } from 'dialogs.jsx';
import * as timeformat from 'timeformat';
import { ListingTable } from "cockpit-components-table.jsx";

import { vmId, vmSupportsExternalSnapshots, vmHasVFIOHostDevs } from "../../../helpers.js";
import { CreateSnapshotModal } from "./vmSnapshotsCreateModal.jsx";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';
import { RevertSnapshotModal } from './vmSnapshotsRevertModal.jsx';
import { snapshotDelete, snapshotGetAll } from '../../../libvirtApi/snapshot.js';
import { domainGet } from '../../../libvirtApi/domain.js';

import './vmSnapshotsCard.scss';

const _ = cockpit.gettext;

export const VmSnapshotsActions = ({ vm, config, storagePools }) => {
    const Dialogs = useDialogs();
    const id = vmId(vm.name);

    const isExternal = vmSupportsExternalSnapshots(config, vm);

    function open() {
        Dialogs.show(<CreateSnapshotModal idPrefix={`${id}-create-snapshot`}
                                          isExternal={isExternal}
                                          storagePools={storagePools}
                                          vm={vm} />);
    }

    let excuse = null;
    if (vm.state != 'shut off' && vmHasVFIOHostDevs(vm))
        excuse = _("Creating snapshots of VMs with VFIO devices is not supported while they are running.");

    const button = (
        <Button id={`${id}-add-snapshot-button`}
                variant="secondary"
                onClick={open}
                isAriaDisabled={!!excuse}>
            {_("Create snapshot")}
        </Button>
    );

    return excuse ? <Tooltip content={excuse}>{button}</Tooltip> : button;
};

export class VmSnapshotsCard extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const id = vmId(vm.name);

        let detailMap = [
            {
                name: _("Creation time"),
                value: (snap, snapId) => {
                    const dateRel = timeformat.distanceToNow(snap.creationTime * 1000);
                    const dateAbs = timeformat.dateTimeSeconds(snap.creationTime * 1000);
                    return (
                        <Flex className="snap-creation-time">
                            <FlexItem id={`${id}-snapshot-${snapId}-date`} spacer={{ default: 'spacerSm' }}>
                                <Tooltip content={dateAbs}><span>{dateRel}</span></Tooltip>
                            </FlexItem>
                            { snap.isCurrent && <FlexItem><Tooltip content={_("Current")}>
                                <CheckIcon id={`${id}-snapshot-${snapId}-current`} />
                            </Tooltip></FlexItem> }
                        </Flex>
                    );
                }
            },
            {
                name: _("Name"),
                value: (snap, snapId) => {
                    return (
                        <div id={`${id}-snapshot-${snapId}-name`}>
                            {snap.name}
                        </div>
                    );
                }
            },
            {
                name: _("Description"),
                value: (snap, snapId) => {
                    let desc = snap.description;
                    if (!desc)
                        desc = (<span className="pf-v5-u-disabled-color-100">{_("No description")}</span>);

                    return (
                        <div id={`${id}-snapshot-${snapId}-description`}>
                            {desc}
                        </div>
                    );
                },
                props: { modifier: 'breakWord' }
            },
            {
                name: _("VM state"),
                value: (snap, snapId) => {
                    const statesMap = {
                        shutoff: "shut off",
                        "disk-snapshot": <span className="pf-v5-u-disabled-color-100">{_("no state saved")}</span>,
                    };
                    const state = statesMap[snap.state] || snap.state;

                    const infoTips = {
                        shutdown: _("Shutting down"),
                        "disk-snapshot": _("Disk-only snapshot"),
                        blocked: _("Domain is blocked on resource"),
                        crashed: _("Domain has crashed"),
                    };
                    const tooltipMessage = infoTips[snap.state];
                    const tooltip = tooltipMessage
                        ? (
                            <span className="tooltip-circle">
                                <Tooltip entryDelay={0} exitDelay={0} content={tooltipMessage}>
                                    <InfoAltIcon />
                                </Tooltip>
                            </span>
                        )
                        : null;

                    return (
                        <div id={`${id}-snapshot-${snapId}-type`}>
                            {state}
                            {tooltip}
                        </div>
                    );
                }
            },
            {
                name: _("Parent snapshot"),
                value: (snap, snapId) => {
                    const parentName = snap.parentName || (<span className="pf-v5-u-disabled-color-100">{_("No parent")}</span>);

                    return (
                        <div id={`${id}-snapshot-${snapId}-parent`}>
                            {parentName}
                        </div>
                    );
                }
            },
            {
                name: "",
                aria: _("Actions"),
                value: (snap, snapId) => {
                    const revertSnapshotHelper = () => {
                        const revertDialogProps = {
                            idPrefix: `${id}-snapshot-${snapId}-revert`,
                            vm,
                            snap
                        };
                        return (
                            <Button id={`${id}-snapshot-${snapId}-revert`}
                                    variant='secondary'
                                    onClick={() => Dialogs.show(<RevertSnapshotModal {...revertDialogProps } />)}>
                                {_("Revert")}
                            </Button>
                        );
                    };

                    const deleteSnapshotHelper = () => {
                        const deleteDialogProps = {
                            title: _("Delete snapshot?"),
                            errorMessage: cockpit.format(_("Snapshot $0 could not be deleted"), snap.name),
                            actionDescription: cockpit.format(_("Snapshot $0 will be deleted from $1. All of its captured content will be lost."), snap.name, vm.name),
                            deleteHandler: () => {
                                return snapshotDelete({ connectionName: vm.connectionName, domainPath: vm.id, snapshotName: snap.name })
                                        .then(() => {
                                            // Deleting an external snapshot might change the disk
                                            // configuration of a VM without event.
                                            domainGet({ connectionName: vm.connectionName, id: vm.id });
                                            snapshotGetAll({ connectionName: vm.connectionName, domainPath: vm.id });
                                        });
                            },
                        };

                        return (
                            <DeleteResourceButton objectId={`${id}-snapshot-${snapId}`}
                                                  dialogProps={deleteDialogProps}
                                                  isSecondary />
                        );
                    };

                    return (
                        <div className='machines-listing-actions'>
                            { deleteSnapshotHelper() }
                            { revertSnapshotHelper() }
                        </div>
                    );
                }
            },
        ];

        detailMap = detailMap.filter(d => !d.hidden);

        const columnTitles = detailMap.map(target => ({
            title: target.name,
            props: { width: 15, "aria-label": target.aria }
        }));
        let rows = [];
        if (vm.snapshots) {
            rows = vm.snapshots.sort((a, b) => ((b.creationTime - a.creationTime) || (a.name.localeCompare(b.name)))).map((target, snapId) => {
                const columns = detailMap.map(d => ({ title: d.value(target, snapId), props: d.props }));
                return { columns };
            });
        }

        return (
            <ListingTable aria-label={`VM ${vm.name} Snapshots Cards`}
                          gridBreakPoint='grid-lg'
                          variant="compact"
                          emptyCaption={_("No snapshots defined for this VM")}
                          emptyCaptionDetail={_("Previously taken snapshots allow you to revert to an earlier state if something goes wrong")}
                          columns={columnTitles}
                          rows={rows} />
        );
    }
}
