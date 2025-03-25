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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal
} from '@patternfly/react-core/dist/esm/deprecated/components/Modal';
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import { isObjectEmpty } from '../../helpers.js';
import { domainSetDescription } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const EditDescriptionDialog = ({ vm }) => {
    const Dialogs = useDialogs();
    const [description, setDescription] = useState(vm.inactiveXML.description || "");
    const [error, dialogErrorSet] = useState({});

    async function onSubmit() {
        try {
            await domainSetDescription(vm, description);
            Dialogs.close();
        } catch (exc) {
            dialogErrorSet({
                dialogError: cockpit.format(_("Failed to set description of VM $0"), vm.name),
                dialogErrorDetail: exc.message
            });
        }
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
               title={cockpit.format(_("Edit description of VM $0"), vm.name)}
               footer={
                   <>
                       <Button variant='primary'
                               id="edit-description-dialog-confirm"
                               onClick={onSubmit}>
                           {_("Save")}
                       </Button>
                       <Button variant='link' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            <Form onSubmit={e => {
                e.preventDefault();
                onSubmit();
            }}
            isHorizontal>
                {!isObjectEmpty(error) && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} />}
                <FormGroup label={_("Description")}
                           fieldId="edit-description-dialog-description">
                    <TextArea id='edit-description-dialog-description'
                               value={description}
                               onChange={(_, value) => setDescription(value)} />
                </FormGroup>
            </Form>
        </Modal>
    );
};
