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

import type { StoragePool } from '../../types';
import type { DialogValues, ValidationFailed } from './storageVolumeCreateBody';
import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import cockpit from 'cockpit';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { units, getDefaultVolumeFormat, convertToUnit, isEmpty } from '../../helpers.js';
import { storageVolumeCreate } from '../../libvirtApi/storageVolume.js';
import { VolumeCreateBody } from './storageVolumeCreateBody.jsx';

const _ = cockpit.gettext;

interface CreateStorageVolumeModalProps {
    idPrefix: string;
    storagePool: StoragePool;
}

interface CreateStorageVolumeModalState extends DialogValues {
    createInProgress: boolean,
    validate?: boolean;
    dialogError: string | undefined,
    dialogErrorDetail?: string | undefined;
}

class CreateStorageVolumeModal extends React.Component<CreateStorageVolumeModalProps, CreateStorageVolumeModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: CreateStorageVolumeModalProps) {
        super(props);
        this.state = {
            createInProgress: false,
            dialogError: undefined,
            volumeName: '',
            size: 1,
            unit: units.GiB.name,
            format: getDefaultVolumeFormat(props.storagePool),
        };
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onCreateClicked = this.onCreateClicked.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.validateParams = this.validateParams.bind(this);
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onValueChanged<K extends keyof DialogValues>(key: K, value: DialogValues[K]) {
        this.setState({ [key]: value } as Pick<CreateStorageVolumeModalState, K>);
    }

    validateParams() {
        const validationFailed: ValidationFailed = {};

        if (isEmpty(this.state.volumeName.trim()))
            validationFailed.volumeName = _("Name must not be empty");
        const poolCapacity = convertToUnit(this.props.storagePool.capacity, units.B, this.state.unit);
        if (this.state.size > poolCapacity)
            validationFailed.size = cockpit.format(_("Storage volume size must not exceed the storage pool's capacity ($0 $1)"), poolCapacity.toFixed(2), this.state.unit);

        return validationFailed;
    }

    onCreateClicked() {
        const Dialogs = this.context;
        const validation = this.validateParams();
        if (Object.getOwnPropertyNames(validation).length > 0) {
            this.setState({ createInProgress: false, validate: true });
        } else {
            this.setState({ createInProgress: true, validate: false });

            const { volumeName, format } = this.state;
            const { name, connectionName } = this.props.storagePool;
            const size = convertToUnit(this.state.size, this.state.unit, 'MiB');

            storageVolumeCreate({ connectionName, poolName: name, volName: volumeName, size, format })
                    .then(() => Dialogs.close())
                    .catch(exc => {
                        this.setState({ createInProgress: false });
                        this.dialogErrorSet(_("Volume failed to be created"), exc.message);
                    });
        }
    }

    render() {
        const Dialogs = this.context;
        const idPrefix = `${this.props.idPrefix}-dialog`;
        const validationFailed = this.state.validate ? this.validateParams() : {};

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal`} className='volume-create' isOpen onClose={Dialogs.close}>
                <ModalHeader title={_("Create storage volume")} />
                <ModalBody>
                    <Form isHorizontal>
                        {this.state.dialogError &&
                            <ModalError
                                dialogError={this.state.dialogError}
                                {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                            />
                        }
                        <VolumeCreateBody format={this.state.format}
                                          idPrefix={idPrefix}
                                          onValueChanged={this.onValueChanged}
                                          size={this.state.size}
                                          storagePool={this.props.storagePool}
                                          unit={this.state.unit}
                                          validationFailed={validationFailed}
                                          volumeName={this.state.volumeName} />
                    </Form>
                </ModalBody>
                <ModalFooter>
                    <Button variant="primary" onClick={this.onCreateClicked} isLoading={this.state.createInProgress} isDisabled={this.state.createInProgress}>
                        {_("Create")}
                    </Button>
                    <Button variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}

interface StorageVolumeCreateProps {
    storagePool: StoragePool,
}

export class StorageVolumeCreate extends React.Component<StorageVolumeCreateProps> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    render() {
        const Dialogs = this.context;
        const idPrefix = `${this.props.storagePool.name}-${this.props.storagePool.connectionName}-create-volume`;
        const poolTypesNotSupportingVolumeCreation = ['iscsi', 'iscsi-direct', 'gluster', 'mpath'];

        const createButton = () => {
            if (!poolTypesNotSupportingVolumeCreation.includes(this.props.storagePool.type) && this.props.storagePool.active) {
                return (
                    <Button id={`${idPrefix}-button`}
                            variant='secondary'
                            onClick={() => Dialogs.show(<CreateStorageVolumeModal idPrefix="create-volume"
                                                                                  storagePool={this.props.storagePool} />)}>
                        {_("Create volume")}
                    </Button>
                );
            } else {
                return (
                    <Tooltip id='create-tooltip'
                             content={this.props.storagePool.active ? _("Pool type doesn't support volume creation") : _("Pool needs to be active to create volume")}>
                        <span>
                            <Button id={`${idPrefix}-button`}
                                    variant='secondary'
                                    isDisabled>
                                {_("Create volume")}
                            </Button>
                        </span>
                    </Tooltip>
                );
            }
        };

        return createButton();
    }
}
