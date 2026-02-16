/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import type { StoragePool } from '../../types';
import { useDialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import cockpit from 'cockpit';

import { convertToUnit } from '../../helpers.js';
import { storageVolumeCreate } from '../../libvirtApi/storageVolume.js';

import {
    type VolumeCreateValue, VolumeCreate, init_VolumeCreate, validate_VolumeCreate,
} from './storageVolumeCreateBody.jsx';
import {
    useDialogState,
    DialogError, DialogErrorMessage,
    DialogActionButton, DialogCancelButton,
} from 'cockpit/dialog';

const _ = cockpit.gettext;

interface CreateStorageVolumeValues {
    volume: VolumeCreateValue,
}

const CreateStorageVolumeModal = ({
    idPrefix,
    storagePool,
} : {
    idPrefix: string;
    storagePool: StoragePool;
}) => {
    const Dialogs = useDialogs();

    function init() {
        return {
            volume: init_VolumeCreate(storagePool),
        };
    }

    function validate() {
        validate_VolumeCreate(dlg.field("volume"));
    }

    const dlg = useDialogState<CreateStorageVolumeValues>(init, validate);

    async function create(values: CreateStorageVolumeValues) {
        const { name: volName, format, size: volSize, unit } = values.volume;
        const { name: poolName, connectionName } = storagePool;
        const size = convertToUnit(volSize, unit, 'MiB');

        try {
            await storageVolumeCreate({
                connectionName,
                poolName,
                volName,
                size,
                format
            });
        } catch (ex) {
            throw DialogError.fromError(_("Volume failed to be created"), ex);
        }
    }

    return (
        <Modal
            position="top"
            variant="medium"
            id={`${idPrefix}-dialog-modal`}
            className='volume-create'
            isOpen
            onClose={Dialogs.close}
        >
            <ModalHeader title={_("Create storage volume")} />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                <Form isHorizontal>
                    <VolumeCreate field={dlg.field("volume")} />
                </Form>
            </ModalBody>
            <ModalFooter>
                <DialogActionButton dialog={dlg} onClose={Dialogs.close} action={create}>
                    {_("Create")}
                </DialogActionButton>
                <DialogCancelButton dialog={dlg} onClose={Dialogs.close} />
            </ModalFooter>
        </Modal>
    );
};

export const StorageVolumeCreate = ({
    storagePool,
} : {
    storagePool: StoragePool,
}) => {
    const Dialogs = useDialogs();
    const idPrefix = `${storagePool.name}-${storagePool.connectionName}-create-volume`;
    const poolTypesNotSupportingVolumeCreation = ['iscsi', 'iscsi-direct', 'gluster', 'mpath'];

    const createButton = () => {
        if (!poolTypesNotSupportingVolumeCreation.includes(storagePool.type) && storagePool.active) {
            return (
                <Button id={`${idPrefix}-button`}
                    variant='secondary'
                    onClick={
                        () => Dialogs.show(
                            <CreateStorageVolumeModal
                                idPrefix="create-volume"
                                storagePool={storagePool}
                            />
                        )
                    }
                >
                    {_("Create volume")}
                </Button>
            );
        } else {
            return (
                <Tooltip
                    id='create-tooltip'
                    content={
                        storagePool.active
                            ? _("Pool type doesn't support volume creation")
                            : _("Pool needs to be active to create volume")
                    }
                >
                    <span>
                        <Button
                            id={`${idPrefix}-button`}
                            variant='secondary'
                            isDisabled
                        >
                            {_("Create volume")}
                        </Button>
                    </span>
                </Tooltip>
            );
        }
    };

    return createButton();
};
