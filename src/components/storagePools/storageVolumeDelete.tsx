/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import type { StoragePool, StorageVolume } from '../../types';
import type { StorageVolumesUsage } from '../../helpers';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { storageVolumeDelete } from '../../libvirtApi/storageVolume.js';
import { storagePoolRefresh } from '../../libvirtApi/storagePool.js';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

interface StorageVolumeDeleteProps {
    storagePool: StoragePool,
    volumes: StorageVolume[],
    isVolumeUsed: StorageVolumesUsage,
    deleteErrorHandler: (text: string, detail: string) => void,
}

export class StorageVolumeDelete extends React.Component<StorageVolumeDeleteProps> {
    constructor(props: StorageVolumeDeleteProps) {
        super(props);
        this.storageVolumeListDelete = this.storageVolumeListDelete.bind(this);
    }

    storageVolumeListDelete() {
        const { volumes, storagePool } = this.props;

        Promise.all(volumes.map(volume =>
            storageVolumeDelete({ connectionName: storagePool.connectionName, poolName: storagePool.name, volName: volume.name })
        ))
                .then(() => {
                    storagePoolRefresh({ connectionName: storagePool.connectionName, objPath: storagePool.id });
                })
                .catch(exc => {
                    this.props.deleteErrorHandler(_("Storage volumes could not be deleted"), exc.message);
                });
    }

    render() {
        const { volumes, isVolumeUsed } = this.props;
        const volCount = volumes.length;
        const anyVolumeUsed = volumes.some(volume => isVolumeUsed[volume.name].length != 0);

        if (volCount == 0)
            return null;

        const deleteBtn = (
            <Button id='storage-volumes-delete'
                    variant='danger' onClick={this.storageVolumeListDelete}
                    isDisabled={ anyVolumeUsed }>
                {cockpit.format(cockpit.ngettext("Delete $0 volume", "Delete $0 volumes", volCount), volCount)}
            </Button>
        );

        if (!anyVolumeUsed)
            return deleteBtn;

        return (
            <Tooltip id='volume-delete-tooltip' content={_("One or more selected volumes are used by domains. Detach the disks first to allow volume deletion.")}>
                <span>{ deleteBtn }</span>
            </Tooltip>
        );
    }
}
