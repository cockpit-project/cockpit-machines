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
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { DropdownItem } from "@patternfly/react-core/dist/esm/deprecated/components/Dropdown";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Stack } from "@patternfly/react-core/dist/esm/layouts/Stack";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { ExclamationTriangleIcon, InfoIcon } from '@patternfly/react-icons';
import { useDialogs, DialogsContext } from 'dialogs.jsx';

import { getStorageVolumesUsage, storagePoolId } from '../../helpers.js';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { storageVolumeDelete } from '../../libvirtApi/storageVolume.js';
import { storagePoolDeactivate, storagePoolUndefine } from '../../libvirtApi/storagePool.js';
import cockpit from 'cockpit';

import './storagePoolDelete.scss';

const _ = cockpit.gettext;

/*
 * Finds out if any volume is used as a disk independently
 * with no reference to a pool (e.g. using direct volume path).
 * If so, then pool can be deleted but only without its content.
 *
 * @param {object} pool
 * @param {array} vms
 * returns {boolean}
 */
function canDeleteOnlyWithoutVolumes(pool, vms) {
    if (!canDelete(pool, vms))
        return false;

    const isVolumeUsed = getStorageVolumesUsage(vms, pool);

    for (const property in isVolumeUsed) {
        if (isVolumeUsed[property].length > 0)
            return true;
    }

    return false;
}

/*
 * Finds out if any disk uses pool name in it's definition.
 * If so, then pool cannot be deleted with nor without its content.
 *
 * @param {object} pool
 * @param {array} vms
 * returns {boolean}
 */
function canDelete(pool, vms) {
    for (let i = 0; i < vms.length; i++) {
        const vm = vms[i];
        const disks = Object.values(vm.disks);

        if (disks.some(disk => disk.source.pool === pool.name))
            return false;
    }

    return true;
}

function getPoolDeleteHelperText(vms, storagePool) {
    const usage = getStorageVolumesUsage(vms, storagePool);
    let vmsUsage = [];
    for (const property in usage)
        vmsUsage = vmsUsage.concat(usage[property]);

    vmsUsage = [...new Set(vmsUsage)]; // remove duplicates
    return (
        <>
            {_("Pool's volumes are used by VMs ")}
            <b> {vmsUsage.join(', ') + "."} </b>
            {_("Detach the disks using this pool from any VMs before attempting deletion.")}
        </>
    );
}

class StoragePoolDelete extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            deleteVolumes: false,
        };
        this.delete = this.delete.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    onValueChanged(key, value) {
        const stateDelta = { [key]: value };

        this.setState(stateDelta);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    delete() {
        const Dialogs = this.context;
        const storagePool = this.props.storagePool;
        const volumes = storagePool.volumes || [];
        const storagePoolDeactivateAndUndefine = (storagePool) => {
            if (storagePool.active) {
                return storagePoolDeactivate({ connectionName: storagePool.connectionName, objPath: storagePool.id })
                        .then(() => storagePoolUndefine({ connectionName: storagePool.connectionName, objPath: storagePool.id }));
            } else {
                return storagePoolUndefine({ connectionName: storagePool.connectionName, objPath: storagePool.id });
            }
        };

        if (this.state.deleteVolumes && storagePool.volumes.length > 0) {
            Promise.all(volumes.map(volume => storageVolumeDelete({ connectionName: storagePool.connectionName, poolName: storagePool.name, volName: volume.name })))
                    .then(() => storagePoolDeactivateAndUndefine(storagePool))
                    .then(() => Dialogs.close(),
                          exc => this.dialogErrorSet(_("The storage pool could not be deleted"), exc.message));
        } else {
            storagePoolDeactivateAndUndefine(storagePool)
                    .then(() => Dialogs.close(),
                          exc => this.dialogErrorSet(_("The storage pool could not be deleted"), exc.message));
        }
    }

    render() {
        const Dialogs = this.context;
        const { storagePool, vms } = this.props;
        const volumes = storagePool.volumes || [];

        const showWarning = () => {
            if (canDeleteOnlyWithoutVolumes(storagePool, vms) && this.state.deleteVolumes) {
                return (
                    <HelperText>
                        <HelperTextItem icon={<InfoIcon />}>
                            {getPoolDeleteHelperText(vms, storagePool)}
                        </HelperTextItem>
                    </HelperText>
                );
            }
        };

        const defaultBody = (
            <Stack hasGutter>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                { storagePool.active
                    ? (volumes.length > 0
                        ? <Checkbox id='storage-pool-delete-volumes'
                                    isChecked={this.state.deleteVolumes}
                                    label={<>
                                        { _("Also delete all volumes inside this pool:")}
                                        <List className="pool-volumes-delete-list">
                                            {volumes
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(vol => <ListItem key={storagePool.name + vol.name}>{vol.name}</ListItem>)
                                            }
                                        </List>
                                    </>}
                                    onChange={(_event, checked) => this.onValueChanged('deleteVolumes', checked)} />
                        : _("No volumes exist in this storage pool."))
                    : _("Deleting an inactive storage pool will only undefine the pool. Its content will not be deleted.")
                }
            </Stack>
        );

        return (
            <Modal id="storage-pool-delete-modal" position="top" variant="small" isOpen onClose={Dialogs.close}
                title={<>
                    <ExclamationTriangleIcon color="orange" className="pf-v5-u-mr-sm" />
                    { cockpit.format(_("Delete $0 storage pool?"), storagePool.name) }
                </>}
                   footer={
                       <>
                           {showWarning()}
                           <Button variant='danger'
                               onClick={this.delete}
                               isDisabled={canDeleteOnlyWithoutVolumes(storagePool, vms) && this.state.deleteVolumes}>
                               {_("Delete")}
                           </Button>
                           <Button variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {defaultBody}
            </Modal>
        );
    }
}
StoragePoolDelete.propTypes = {
    storagePool: PropTypes.object.isRequired,
    vms: PropTypes.array.isRequired,
};

export const StoragePoolDeleteAction = ({ storagePool, vms }) => {
    const Dialogs = useDialogs();

    const id = storagePoolId(storagePool.name, storagePool.connectionName);
    let tooltipText;
    if (!canDelete(storagePool, vms)) {
        tooltipText = getPoolDeleteHelperText(vms, storagePool);
    } else if (!storagePool.persistent) {
        tooltipText = _("Non-persistent storage pool cannot be deleted. It ceases to exists when it's deactivated.");
    }

    if (!canDelete(storagePool, vms) || !storagePool.persistent) {
        return (
            <Tooltip id='delete-tooltip'
                     content={tooltipText}>
                <span>
                    <DropdownItem id={`delete-${id}`}
                                  className='pf-m-danger'
                                  isAriaDisabled>
                        {_("Delete")}
                    </DropdownItem>
                </span>
            </Tooltip>
        );
    } else {
        return (
            <DropdownItem id={`delete-${id}`}
                          className='pf-m-danger'
                          onClick={() => Dialogs.show(<StoragePoolDelete storagePool={storagePool} vms={vms} />)}>
                {_("Delete")}
            </DropdownItem>
        );
    }
};
