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

import cockpit from 'cockpit';
import React, { useState } from 'react';

import type { ConnectionName } from '../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { isEmpty, isObjectEmpty } from '../../helpers.js';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import "./vmCloneDialog.css";
const _ = cockpit.gettext;

interface Validation {
    name?: string;
}

interface DialogError {
    dialogError?: string;
}

export const CloneDialog = ({
    name,
    connectionName
} : {
    name: string,
    connectionName: ConnectionName,
}) => {
    const Dialogs = useDialogs();
    const [newVmName, setNewVmName] = useState(name + '-clone');
    const [inProgress, setInProgress] = useState(false);
    const [virtCloneOutput, setVirtCloneOutput] = useState('');
    const [error, dialogErrorSet] = useState<DialogError>({});

    function validateParams() {
        const validation: Validation = {};
        if (isEmpty(newVmName.trim()))
            validation.name = _("Name must not be empty");

        return validation;
    }

    function onClone() {
        const validation = validateParams();
        if (!isObjectEmpty(validation)) {
            setInProgress(false);
            return;
        }

        setInProgress(true);
        return cockpit.spawn(
            [
                "virt-clone", "--connect", "qemu:///" + connectionName,
                "--original", name, "--name", newVmName,
                "--auto-clone"
            ],
            {
                pty: true,
                ...(connectionName === "system" ? { superuser: "try" } : { })
            })
                .stream(setVirtCloneOutput)
                .then(Dialogs.close, () => {
                    setInProgress(false);
                    dialogErrorSet({ dialogError: cockpit.format(_("Failed to clone VM $0"), name) });
                });
    }

    const validationFailed = validateParams();
    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}>
            <ModalHeader title={cockpit.format(_("Create a clone VM based on $0"), name)} />
            <ModalBody>
                <Form onSubmit={e => {
                    e.preventDefault();
                    onClone();
                }}
                isHorizontal>
                    {error.dialogError && <ModalError dialogError={error.dialogError} dialogErrorDetail={virtCloneOutput} />}
                    <FormGroup label={_("Name")} fieldId="vm-name"
                               id="vm-name-group">
                        <TextInput id='vm-name'
                                   validated={validationFailed.name ? "error" : "default"}
                                   value={newVmName}
                                   onChange={(_, value) => setNewVmName(value)} />
                        <FormHelper helperTextInvalid={validationFailed.name} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                {isObjectEmpty(error) && virtCloneOutput && <code className="vm-clone-virt-clone-output">{virtCloneOutput}</code>}
                <Button variant='primary'
                        isDisabled={inProgress || !isObjectEmpty(validationFailed)}
                        isLoading={inProgress}
                        onClick={onClone}>
                    {_("Clone")}
                </Button>
                <Button variant='link' onClick={Dialogs.close}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
