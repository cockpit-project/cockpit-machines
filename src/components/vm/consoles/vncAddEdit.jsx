/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
 * Copyright (C) 2025 Red Hat, Inc.
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

import cockpit from 'cockpit';

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
    Form, Modal, ModalVariant,
    FormGroup, FormHelperText, HelperText, HelperTextItem,
    InputGroup, TextInput, Button,
} from "@patternfly/react-core";
import { EyeIcon, EyeSlashIcon } from "@patternfly/react-icons";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { domainChangeVncSettings, domainAttachVnc, domainGet } from '../../../libvirtApi/domain.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

const _ = cockpit.gettext;

const VncBody = ({ idPrefix, onValueChanged, dialogValues, validationErrors }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <>
            <FormGroup
                fieldId={`${idPrefix}-portmode`}
                label={_("Port")} isInline hasNoPaddingTop isStack>
                <TextInput
                    id={`${idPrefix}-port`}
                    value={dialogValues.vncPort}
                    type="text"
                    validated={validationErrors?.vncPort ? "error" : null}
                    onChange={(event) => onValueChanged('vncPort', event.target.value)} />
                <FormHelperText>
                    <HelperText>
                        { validationErrors?.vncPort
                            ? <HelperTextItem variant='error'>{validationErrors?.vncPort}</HelperTextItem>
                            : <HelperTextItem>
                                {_("Leave empty to automatically assign a free port when the machine starts")}
                            </HelperTextItem>
                        }
                    </HelperText>
                </FormHelperText>
            </FormGroup>
            <FormGroup fieldId={`${idPrefix}-password`} label={_("Password")}>
                <InputGroup>
                    <TextInput
                        id={`${idPrefix}-password`}
                        type={showPassword ? "text" : "password"}
                        value={dialogValues.vncPassword}
                        onChange={(event) => onValueChanged('vncPassword', event.target.value)} />
                    <Button
                        variant="control"
                        onClick={() => setShowPassword(!showPassword)}>
                        { showPassword ? <EyeSlashIcon /> : <EyeIcon /> }
                    </Button>
                </InputGroup>
            </FormGroup>
        </>
    );
};

function validateDialogValues(values) {
    const res = { };

    if (values.vncPort != "" && (!values.vncPort.match("^[0-9]+$") || Number(values.vncPort) < 5900))
        res.vncPort = _("Port must be 5900 or larger.");

    return Object.keys(res).length > 0 ? res : null;
}

VncBody.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
    validationErrors: PropTypes.object,
};

export class AddEditVNCModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            vncPort: Number(props.consoleDetail?.port) == -1 ? "" : props.consoleDetail?.port || "",
            vncPassword: props.consoleDetail?.password || "",
            validationErrors: null,
        };

        this.save = this.save.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    onValueChanged(key, value) {
        const stateDelta = { [key]: value, validationErrors: null };
        this.setState(stateDelta);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    save() {
        const Dialogs = this.context;
        const { vm } = this.props;

        const errors = validateDialogValues(this.state);
        if (errors) {
            this.setState({ validationErrors: errors });
            return;
        }

        const vncParams = {
            listen: this.props.consoleDetail?.address || "",
            port: this.state.vncPort || "",
            password: this.state.vncPassword || "",
        };

        (this.props.consoleDetail ? domainChangeVncSettings(vm, vncParams) : domainAttachVnc(vm, vncParams))
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch((exc) => {
                    this.dialogErrorSet(_("VNC settings could not be saved"), exc.message);
                });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm } = this.props;

        const defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <VncBody
                    idPrefix={idPrefix}
                    dialogValues={this.state}
                    validationErrors={this.state.validationErrors}
                    onValueChanged={this.onValueChanged} />
            </Form>
        );

        return (
            <Modal position="top" variant={ModalVariant.medium} id={`${idPrefix}-dialog`} isOpen onClose={Dialogs.close} className='vnc-edit'
                   title={this.props.consoleDetail ? _("Edit VNC settings") : _("Add VNC")}
                   footer={
                       <>
                           <Button isDisabled={!!this.state.validationErrors} id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {this.props.consoleDetail ? _("Save") : _("Add")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    { vm.state === 'running' && !this.state.dialogError && <NeedsShutdownAlert idPrefix={idPrefix} /> }
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    {defaultBody}
                </>
            </Modal>
        );
    }
}

AddEditVNCModal.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    consoleDetail: PropTypes.object,
};
