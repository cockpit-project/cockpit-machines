/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
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
import cockpit from 'cockpit';
import PropTypes from 'prop-types';
import { Button, Form, Modal, ModalVariant } from "@patternfly/react-core";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { VncRow } from './vncBody.jsx';
import { domainChangeVncSettings, domainGet } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export class EditVNCModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            saveDisabled: false,
            vmName: props.vmName,
            vmId: props.vmId,
            connectionName: props.connectionName,
            vncAddress: props.consoleDetail.address || "",
            vncPort: props.consoleDetail.port || "",
            vncPassword: props.consoleDetail.password || "",
        };

        this.save = this.save.bind(this);
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

    save() {
        const Dialogs = this.context;

        const vncParams = {
            connectionName: this.state.connectionName,
            vmName: this.state.vmName,
            vncAddress: this.state.vncAddress || "",
            vncPort: this.state.vncPort || "",
            vncPassword: this.state.vncPassword || "",
        };

        domainChangeVncSettings(vncParams)
                .then(() => {
                    domainGet({ connectionName: this.state.connectionName, id: this.state.vmId });
                    Dialogs.close();
                })
                .catch((exc) => {
                    this.dialogErrorSet(_("VNC settings could not be saved"), exc.message);
                });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix } = this.props;

        const defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <VncRow idPrefix={idPrefix}
                                 dialogValues={this.state}
                                 onValueChanged={this.onValueChanged} />
            </Form>
        );
        const showWarning = () => {
        };

        return (
            <Modal position="top" variant={ModalVariant.small} id={`${idPrefix}-dialog`} isOpen onClose={Dialogs.close} className='vnc-edit'
                   title={_("Edit VNC settings")}
                   footer={
                       <>
                           <Button isDisabled={this.state.saveDisabled} id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    { showWarning() }
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    {defaultBody}
                </>
            </Modal>
        );
    }
}
EditVNCModal.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    vmName: PropTypes.string.isRequired,
    vmId: PropTypes.string.isRequired,
    connectionName: PropTypes.string.isRequired,
    consoleDetail: PropTypes.object.isRequired,
};

export default EditVNCModal;
