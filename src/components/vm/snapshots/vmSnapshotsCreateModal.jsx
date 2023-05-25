/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2020 Red Hat, Inc.
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
import cockpit from "cockpit";
import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { ModalError } from "cockpit-components-inline-notification.jsx";
import { snapshotCreate, snapshotGetAll } from "../../../libvirtApi/snapshot.js";

const _ = cockpit.gettext;

const NameRow = ({ onValueChanged, name, validationError }) => {
    return (
        <FormGroup
            label={_("Name")}
            fieldId="snapshot-create-dialog-name">
            <TextInput value={name}
                validated={validationError.name ? "error" : "default"}
                id="snapshot-create-dialog-name"
                onChange={(_, value) => onValueChanged("name", value)} />
            <FormHelper helperTextInvalid={validationError.name} />
        </FormGroup>
    );
};

const DescriptionRow = ({ onValueChanged, description }) => {
    return (
        <FormGroup fieldId="snapshot-create-dialog-description" label={_("Description")}>
            <TextArea value={description}
                id="snapshot-create-dialog-description"
                onChange={(_, value) => onValueChanged("description", value)}
                resizeOrientation="vertical"
            />
        </FormGroup>
    );
};

export class CreateSnapshotModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        // cut off seconds, subseconds, and timezone
        const now = new Date().toISOString()
                .replace(/:[^:]*$/, '');
        this.state = {
            name: props.vm.name + '_' + now,
            description: "",
            inProgress: false,
        };

        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onValidate = this.onValidate.bind(this);
        this.onCreate = this.onCreate.bind(this);
    }

    onValueChanged(key, value) {
        this.setState({ [key]: value });
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onValidate(submitted = false) {
        const { name } = this.state;
        const { vm } = this.props;
        const validationError = {};

        if (vm.snapshots.findIndex(snap => snap.name === name) > -1)
            validationError.name = _("Name already exists");
        else if (!name && submitted)
            validationError.name = _("Name should not be empty");

        return validationError;
    }

    onCreate() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const { name, description } = this.state;
        const validationError = this.onValidate(true);

        this.setState({ submitted: true });

        if (!Object.keys(validationError).length) {
            this.setState({ inProgress: true });
            snapshotCreate({ connectionName: vm.connectionName, vmId: vm.id, name, description })
                    .then(() => {
                        // VM Snapshots do not trigger any events so we have to refresh them manually
                        snapshotGetAll({ connectionName: vm.connectionName, domainPath: vm.id });
                        Dialogs.close();
                    })
                    .catch(exc => {
                        this.setState({ inProgress: false });
                        this.dialogErrorSet(_("Snapshot failed to be created"), exc.message);
                    });
        }
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix } = this.props;
        const { name, description, submitted } = this.state;
        const validationError = this.onValidate(submitted);

        const body = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NameRow name={name} validationError={validationError} onValueChanged={this.onValueChanged} />
                <DescriptionRow description={description} onValueChanged={this.onValueChanged} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal`} isOpen onClose={Dialogs.close}
                   title={_("Create snapshot")}
                   footer={
                       <>
                           <Button variant="primary" isLoading={this.state.inProgress} isDisabled={this.state.inProgress} onClick={this.onCreate}>
                               {_("Create")}
                           </Button>
                           <Button variant="link" onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                {body}
            </Modal>
        );
    }
}
