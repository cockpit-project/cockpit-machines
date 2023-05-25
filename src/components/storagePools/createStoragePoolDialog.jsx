/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { DialogsContext } from 'dialogs.jsx';
import { FormHelper } from 'cockpit-components-form-helper.jsx';

import { LIBVIRT_SYSTEM_CONNECTION } from '../../helpers.js';
import { MachinesConnectionSelector } from '../common/machinesConnectionSelector.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { FileAutoComplete } from 'cockpit-components-file-autocomplete.jsx';
import { storagePoolCreate, storagePoolGetCapabilities } from '../../libvirtApi/storagePool.js';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

const StoragePoolNameRow = ({ onValueChanged, dialogValues }) => {
    const validationState = dialogValues.validationFailed.name ? 'error' : 'default';

    return (
        <FormGroup fieldId='storage-pool-dialog-name' label={_("Name")}>
            <TextInput id='storage-pool-dialog-name'
                       placeholder={_("Storage pool name")}
                       value={dialogValues.name || ''}
                       validated={validationState}
                       onChange={(_, value) => onValueChanged('name', value)} />
            <FormHelper fieldId="storage-pool-dialog-name" helperTextInvalid={validationState == "error" && (dialogValues.name.length == 0 ? _("Name should not be empty") : _("Name contains invalid characters"))} />
        </FormGroup>
    );
};

const StoragePoolTypeRow = ({ onValueChanged, dialogValues, libvirtVersion, poolCapabilities }) => {
    const poolTypes = [
        { type: 'dir', detail: _("Filesystem directory") },
        { type: 'netfs', detail: _("Network file system") },
        { type: 'iscsi', detail: _("iSCSI target") },
        { type: 'disk', detail: _("Physical disk device") },
        { type: 'logical', detail: _("LVM volume group") },
    ];
    // iscsi-direct exists since 4.7.0
    if (libvirtVersion && libvirtVersion >= 4007000)
        poolTypes.push({ type: 'iscsi-direct', detail: _("iSCSI direct target") });

    const supportedPoolTypes = poolTypes.filter(pool => poolCapabilities[pool.type] ? poolCapabilities[pool.type].supported === "yes" : true);

    /* TODO
        { type: 'fs', detail _("Pre-formatted Block Device") },
        { type: 'gluster', detail _("Gluster Filesystem") },
        { type: 'mpath', detail _("Multipath Device Enumerator") },
        { type: 'rbd', detail _("RADOS Block Device/Ceph") },
        { type: 'scsi', detail _("SCSI Host Adapter") },
        { type: 'sheepdog', detail _("Sheepdog Filesystem") },
        { type: 'zfs', detail _("ZFS Pool") },
     */

    return (
        <FormGroup fieldId='storage-pool-dialog-type' label={_("Type")}>
            <FormSelect id='storage-pool-dialog-type'
                        value={dialogValues.type}
                        onChange={(_event, value) => onValueChanged('type', value)}>
                { supportedPoolTypes
                        .map(pool => {
                            return (
                                <FormSelectOption value={pool.type} key={pool.type}
                                                  label={pool.detail} />
                            );
                        })
                }
            </FormSelect>
        </FormGroup>
    );
};

const StoragePoolTargetRow = ({ onValueChanged, dialogValues }) => {
    const validationState = dialogValues.target.length == 0 && dialogValues.validationFailed.target ? 'error' : 'default';

    if (['dir', 'netfs', 'iscsi', 'disk'].includes(dialogValues.type)) {
        return (
            <FormGroup fieldId='storage-pool-dialog-target' label={_("Target path")}
                       id="storage-pool-dialog-target-group">
                <FileAutoComplete id='storage-pool-dialog-target'
                                  superuser='try'
                                  placeholder={_("Path on host's filesystem")}
                                  onChange={value => onValueChanged('target', value)} />
                <FormHelper fieldId="storage-pool-dialog-target" helperTextInvalid={validationState == "error" && _("Target path should not be empty")} />
            </FormGroup>
        );
    }
    return null;
};

const StoragePoolHostRow = ({ onValueChanged, dialogValues }) => {
    const validationState = dialogValues.source.host.length == 0 && dialogValues.validationFailed.host ? 'error' : 'default';

    if (['netfs', 'iscsi', 'iscsi-direct'].includes(dialogValues.type))
        return (
            <FormGroup fieldId='storage-pool-dialog-host' label={_("Host")}>
                <TextInput id='storage-pool-dialog-host'
                           validated={validationState}
                           placeholder={_("Host name")}
                           value={dialogValues.source.host || ''}
                           onChange={(_, value) => onValueChanged('source', { host: value })} />
                <FormHelper fieldId="storage-pool-dialog-host" helperTextInvalid={validationState == "error" && _("Host should not be empty")} />
            </FormGroup>
        );
    return null;
};

const StoragePoolInitiatorRow = ({ onValueChanged, dialogValues }) => {
    const validationState = dialogValues.source.initiator.length == 0 && dialogValues.validationFailed.source ? 'error' : 'default';

    if (['iscsi-direct'].includes(dialogValues.type))
        return (
            <FormGroup label={_("Initiator")} fieldId='storage-pool-dialog-initiator'>
                <TextInput id='storage-pool-dialog-initiator'
                           placeholder={_("iSCSI initiator IQN")}
                           validated={validationState}
                           value={dialogValues.source.initiator || ''}
                           onChange={(_, value) => onValueChanged('source', { initiator: value })} />
                <FormHelper fieldId="storage-pool-dialog-initiator" helperTextInvalid={validationState == "error" && _("Initiator should not be empty")} />
            </FormGroup>
        );
    return null;
};

const StoragePoolSourceRow = ({ onValueChanged, dialogValues }) => {
    let validationState;
    let placeholder;
    const diskPoolSourceFormatTypes = ['dos', 'dvh', 'gpt', 'mac'];

    if (dialogValues.type == 'netfs') {
        validationState = dialogValues.source.dir.length == 0 && dialogValues.validationFailed.source ? 'error' : 'default';
        placeholder = _("The directory on the server being exported");
    } else if (dialogValues.type == 'iscsi' || dialogValues.type == 'iscsi-direct') {
        validationState = dialogValues.source.device.length == 0 && dialogValues.validationFailed.source ? 'error' : 'default';
        placeholder = _("iSCSI target IQN");
    } else if (dialogValues.type == 'disk') {
        validationState = dialogValues.source.device.length == 0 && dialogValues.validationFailed.source ? 'error' : 'default';
        placeholder = _("Physical disk device on host");
    } else if (dialogValues.type == 'logical') {
        validationState = dialogValues.source.name && dialogValues.validationFailed.source ? 'error' : 'default';
        placeholder = _("Volume group name");
    }

    if (['netfs', 'iscsi', 'iscsi-direct'].includes(dialogValues.type))
        return (
            <FormGroup label={_("Source path")} fieldId='storage-pool-dialog-source'>
                <TextInput id='storage-pool-dialog-source'
                           minLength={1}
                           value={dialogValues.source.dir || dialogValues.source.device || ''}
                           onChange={(_, value) => {
                               if (dialogValues.type == 'netfs')
                                   return onValueChanged('source', { dir: value });
                               else
                                   return onValueChanged('source', { device: value });
                           }}
                           placeholder={placeholder} />
                <FormHelper fieldId="storage-pool-dialog-source" helperTextInvalid={validationState == "error" && _("Source path should not be empty")} />
            </FormGroup>
        );
    else if (dialogValues.type == 'disk')
        return (
            <Grid hasGutter>
                <FormGroup fieldId='storage-pool-dialog-source' label={_("Source path")}
                           className="pf-m-8-col"
                           id="storage-pool-dialog-source-group">
                    <FileAutoComplete id='storage-pool-dialog-source'
                                      superuser='try'
                                      placeholder={placeholder}
                                      onChange={value => onValueChanged('source', { device: value })} />
                    <FormHelper fieldId="storage-pool-dialog-source" helperTextInvalid={validationState == "error" && _("Source path should not be empty")} />
                </FormGroup>
                <FormGroup fieldId='storage-pool-dialog-source-format' label={_("Format")}
                           className="pf-m-4-col">
                    <FormSelect id='storage-pool-dialog-source-format'
                                value={dialogValues.source.format}
                                onChange={(_event, value) => onValueChanged('source', { format: value })}>
                        { diskPoolSourceFormatTypes
                                .map(format => {
                                    return (
                                        <FormSelectOption value={format} key={format}
                                                          label={format} />
                                    );
                                })
                        }
                    </FormSelect>
                </FormGroup>
            </Grid>
        );
    else if (dialogValues.type == 'logical')
        return (
            <FormGroup fieldId='storage-pool-dialog-source' label={_("Source volume group")}>
                <TextInput id='storage-pool-dialog-source'
                           validated={validationState}
                           minLength={1}
                           value={dialogValues.source.name || ''}
                           onChange={(_, value) => onValueChanged('source', { name: value })}
                           placeholder={placeholder} />
                <FormHelper fieldId="storage-pool-dialog-source" helperTextInvalid={validationState == "error" && _("Volume group name should not be empty")} />
            </FormGroup>
        );
    return null;
};

const StoragePoolAutostartRow = ({ onValueChanged, dialogValues }) => {
    return (
        <FormGroup label={_("Startup")} fieldId='storage-pools-dialog-autostart' hasNoPaddingTop>
            <Checkbox id='storage-pool-dialog-autostart'
                      label={_("Start pool when host boots")}
                      isChecked={dialogValues.autostart}
                      onChange={(_event, checked) => onValueChanged('autostart', checked)} />
        </FormGroup>
    );
};

class CreateStoragePoolModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {
            createInProgress: false,
            dialogError: undefined,
            name: '',
            connectionName: LIBVIRT_SYSTEM_CONNECTION,
            type: 'dir',
            source: {
                host: '',
                dir: '',
                device: '',
                name: '',
                initiator: '',
                format: undefined
            },
            target: '',
            autostart: true,
            validationFailed: {},
        };
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.dialogErrorDismiss = this.dialogErrorDismiss.bind(this);
        this.onCreateClicked = this.onCreateClicked.bind(this);
    }

    onValueChanged(key, value) {
        if (key == 'source') {
            const property = Object.keys(value)[0];
            const propertyValue = value[Object.keys(value)[0]];
            this.setState(prevState => ({
                source: Object.assign({}, prevState.source, { [property]: propertyValue })
            }));
        } else if (key == 'type') {
            if (value == 'disk') {
                // When switching to disk type select the default format which is 'dos'
                this.setState(prevState => ({
                    source: Object.assign({}, prevState.source, { format: 'dos' })
                }));
            } else {
                this.setState(prevState => ({
                    source: Object.assign({}, prevState.source, { format: undefined })
                }));
            }
            this.setState({ [key]: value });
        } else {
            this.setState({ [key]: value });
        }
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    dialogErrorDismiss() {
        this.setState({ dialogError: undefined });
    }

    onCreateClicked() {
        const Dialogs = this.context;

        let modalIsIncomplete = false;
        const validationFailed = Object.assign({}, this.state.validationFailed);

        // Mandatory props for all pool types
        ['name'].forEach(prop => {
            if (this.state[prop].length == 0 || this.state[prop].includes("'") || this.state[prop].includes("\"")) {
                modalIsIncomplete = true;
                validationFailed[prop] = true;
            }
        });

        // Mandatory props for dir pool type
        if (this.state.type == 'dir') {
            if (this.state.target.length == 0) {
                modalIsIncomplete = true;
                validationFailed.target = true;
            }
        }

        // Mandatory props for netfs pool type
        if (this.state.type == 'netfs') {
            if (this.state.source.dir.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
            if (this.state.source.host.length == 0) {
                modalIsIncomplete = true;
                validationFailed.host = true;
            }
            if (this.state.target.length == 0) {
                modalIsIncomplete = true;
                validationFailed.target = true;
            }
        }

        // Mandatory props for iscsi pool type
        if (this.state.type == 'iscsi') {
            if (this.state.source.device.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
            if (this.state.source.host.length == 0) {
                modalIsIncomplete = true;
                validationFailed.host = true;
            }
            if (this.state.target.length == 0) {
                modalIsIncomplete = true;
                validationFailed.target = true;
            }
        }

        // Mandatory props for iscsi-direct pool type
        if (this.state.type == 'iscsi-direct') {
            if (this.state.source.device.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
            if (this.state.source.host.length == 0) {
                modalIsIncomplete = true;
                validationFailed.host = true;
            }
            if (this.state.source.initiator.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
        }

        // Mandatory props for disk pool type
        if (this.state.type == 'disk') {
            if (this.state.source.device.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
            if (this.state.target.length == 0) {
                modalIsIncomplete = true;
                validationFailed.target = true;
            }
        }

        // Mandatory props for logical pool type
        if (this.state.type == 'logical') {
            if (this.state.source.name.length == 0) {
                modalIsIncomplete = true;
                validationFailed.source = true;
            }
        }

        this.setState({ validationFailed });

        if (!modalIsIncomplete) {
            this.setState({ createInProgress: true });
            storagePoolCreate({ ...this.state })
                    .fail(exc => {
                        this.setState({ createInProgress: false });
                        this.dialogErrorSet(_("Storage pool failed to be created"), exc.message);
                    })
                    .then(Dialogs.close);
        }
    }

    render() {
        const Dialogs = this.context;

        const defaultBody = (
            <Form isHorizontal>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                <MachinesConnectionSelector id='storage-pool-dialog-connection'
                    connectionName={this.state.connectionName}
                    onValueChanged={this.onValueChanged}
                    loggedUser={this.props.loggedUser} />
                <StoragePoolNameRow dialogValues={this.state}
                                    onValueChanged={this.onValueChanged} />
                <StoragePoolTypeRow dialogValues={this.state}
                                    libvirtVersion={this.props.libvirtVersion}
                                    poolCapabilities={this.props.poolCapabilities}
                                    onValueChanged={this.onValueChanged} />

                <StoragePoolTargetRow dialogValues={this.state}
                                      onValueChanged={this.onValueChanged} />
                <StoragePoolHostRow dialogValues={this.state}
                                    onValueChanged={this.onValueChanged} />
                <StoragePoolSourceRow dialogValues={this.state}
                                      onValueChanged={this.onValueChanged} />
                <StoragePoolInitiatorRow dialogValues={this.state}
                                      onValueChanged={this.onValueChanged} />
                <StoragePoolAutostartRow dialogValues={this.state}
                                         onValueChanged={this.onValueChanged} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id='create-storage-pool-dialog' className='pool-create' isOpen onClose={ Dialogs.close }
                   title={_("Create storage pool")}
                   footer={
                       <>
                           <Button variant='primary' isLoading={this.state.createInProgress} isDisabled={this.state.createInProgress} onClick={this.onCreateClicked}>
                               {_("Create")}
                           </Button>
                           <Button variant='link' onClick={ Dialogs.close }>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {defaultBody}
            </Modal>
        );
    }
}
CreateStoragePoolModal.propTypes = {
    libvirtVersion: PropTypes.number,
    loggedUser: PropTypes.object.isRequired,
};

export class CreateStoragePoolAction extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = { poolCapabilities: undefined };
    }

    componentDidMount() {
        storagePoolGetCapabilities({ connectionName: "session" })
                .then(poolCapabilities => this.setState({ poolCapabilities }))
                .catch(() => this.setState({ poolCapabilities: {} }));
    }

    render() {
        const Dialogs = this.context;

        const open = () => {
            Dialogs.show(<CreateStoragePoolModal poolCapabilities={this.state.poolCapabilities}
                                                 libvirtVersion={this.props.libvirtVersion}
                                                 loggedUser={this.props.loggedUser} />);
        };

        return (
            <Button id='create-storage-pool'
                    variant='secondary'
                    isDisabled={this.state.poolCapabilities === undefined}
                    onClick={open}>
                {_("Create storage pool")}
            </Button>
        );
    }
}
CreateStoragePoolAction.propTypes = {
    libvirtVersion: PropTypes.number,
    loggedUser: PropTypes.object.isRequired,
};
