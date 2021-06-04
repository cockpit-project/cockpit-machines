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
import moment from "moment";

import {
    Button,
    Form, FormGroup,
    Modal,
    TextArea,
    TextInput
} from "@patternfly/react-core";

import { ModalError } from "cockpit-components-inline-notification.jsx";
import { createSnapshot, getVmSnapshots } from "../../../libvirt-dbus.js";

const _ = cockpit.gettext;

const NameRow = ({ onValueChanged, name, validationError }) => {
    return (
        <FormGroup validated={validationError.name ? "error" : "default"}
            label={_("Name")}
            fieldId="snapshot-create-dialog-name"
            helperTextInvalid={validationError.name}>
            <TextInput value={name}
                validated={validationError.name ? "error" : "default"}
                id="snapshot-create-dialog-name"
                onChange={(value) => onValueChanged("name", value)} />
        </FormGroup>
    );
};

const DescriptionRow = ({ onValueChanged, description }) => {
    return (
        <FormGroup fieldId="snapshot-create-dialog-description" label={_("Description")}>
            <TextArea value={description}
                id="snapshot-create-dialog-description"
                onChange={(value) => onValueChanged("description", value)}
                resizeOrientation="vertical"
            />
        </FormGroup>
    );
};

export class CreateSnapshotModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            name: props.vm.name + '_' + moment().format("YYYY-MM-DD_hh:mma"),
            description: "",
            validationError: {},
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
            validationError.name = "Name already exists";
        else if (!name && submitted)
            validationError.name = "Name should not be empty";

        return validationError;
    }

    onCreate() {
        const { vm, onClose } = this.props;
        const { name, description } = this.state;
        const validationError = this.onValidate(true);

        this.setState({ submitted: true });

        if (!Object.keys(validationError).length) {
            this.setState({ inProgress: true });
            createSnapshot({ connectionName: vm.connectionName, vmId: vm.id, name, description })
                    .then(() => {
                        // VM Snapshots do not trigger any events so we have to refresh them manually
                        getVmSnapshots({ connectionName: vm.connectionName, domainPath: vm.id });
                        onClose();
                    })
                    .catch(exc => {
                        this.setState({ inProgress: false });
                        this.dialogErrorSet(_("Snapshot failed to be created"), exc.message);
                    });
        }
    }

    render() {
        const { idPrefix, onClose } = this.props;
        const { name, description, submitted } = this.state;
        const validationError = this.onValidate(submitted);

        const body = (
            <Form isHorizontal>
                <NameRow name={name} validationError={validationError} onValueChanged={this.onValueChanged} />
                <DescriptionRow description={description} onValueChanged={this.onValueChanged} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal`} isOpen onClose={onClose}
                   title={_("Create snapshot")}
                   footer={
                       <>
                           {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                           <Button variant="primary" isLoading={this.state.inProgress} isDisabled={this.state.inProgress} onClick={this.onCreate}>
                               {_("Create")}
                           </Button>
                           <Button variant="link" className="btn-cancel" onClick={onClose}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {body}
            </Modal>
        );
    }
}
