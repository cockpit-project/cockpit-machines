/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
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

import type { VM } from '../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import { virtXmlEdit } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

interface DialogError {
    dialogError?: string;
    dialogErrorDetail?: string;
}

export const EditDescriptionDialog = ({ vm } : { vm: VM }) => {
    const Dialogs = useDialogs();
    const [description, setDescription] = useState(vm.inactiveXML.description || "");
    const [error, dialogErrorSet] = useState<DialogError>({});

    async function onSubmit() {
        try {
            // The description will appear in a "open" message for a "spawn"
            // channel, and excessive lengths will crash the session with a
            // protocol error. So let's limit it to a reasonable length here.
            await virtXmlEdit(vm, "metadata", 1, { description: description.slice(0, 32000) });
            Dialogs.close();
        } catch (exc) {
            dialogErrorSet({
                dialogError: cockpit.format(_("Failed to set description of VM $0"), vm.name),
                dialogErrorDetail: exc instanceof Error ? exc.message : "",
            });
        }
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}>
            <ModalHeader title={cockpit.format(_("Edit description of VM $0"), vm.name)} />
            <ModalBody>
                <Form onSubmit={e => {
                    e.preventDefault();
                    onSubmit();
                }}
                isHorizontal>
                    {error.dialogError &&
                        <ModalError
                            dialogError={error.dialogError}
                            {...error.dialogErrorDetail && { dialogErrorDetail: error.dialogErrorDetail } }
                        />
                    }
                    <FormGroup label={_("Description")}
                               fieldId="edit-description-dialog-description">
                        <TextArea id='edit-description-dialog-description'
                                   value={description}
                                   onChange={(_, value) => setDescription(value)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant='primary'
                        id="edit-description-dialog-confirm"
                        onClick={onSubmit}>
                    {_("Save")}
                </Button>
                <Button variant='link' onClick={Dialogs.close}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
