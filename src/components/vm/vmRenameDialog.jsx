/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2021 Red Hat, Inc.
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
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import { isObjectEmpty } from '../../helpers.js';
import { domainRename } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const RenameDialog = ({ vmName, vmId, connectionName }) => {
    const Dialogs = useDialogs();
    const [newName, setNewName] = useState(vmName);
    const [error, dialogErrorSet] = useState({});
    const [submitted, setSubmitted] = useState(false);

    function onRename() {
        setSubmitted(true);

        if (!newName)
            return;

        return domainRename({ connectionName, id: vmId, newName })
                .then(() => {
                    Dialogs.close();
                    // If we are on the VMs details page change the URL to reflect the new name after the rename operation succeeded
                    if (cockpit.location.path.length > 0)
                        cockpit.location.go(["vm"], { ...cockpit.location.options, name: newName, connection: connectionName });
                }, exc => {
                    dialogErrorSet({ dialogError: cockpit.format(_("Failed to rename VM $0"), vmName), dialogErrorDetail: exc.message });
                });
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
           title={cockpit.format(_("Rename VM $0"), vmName)}
           footer={
               <>
                   <Button variant='primary'
                           id="rename-dialog-confirm"
                           isDisabled={!newName}
                           onClick={onRename}>
                       {_("Rename")}
                   </Button>
                   <Button variant='link' onClick={Dialogs.close}>
                       {_("Cancel")}
                   </Button>
               </>
           }>
            <Form onSubmit={e => {
                e.preventDefault();
                onRename();
            }}
            isHorizontal>
                {!isObjectEmpty(error) && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} />}
                <FormGroup label={_("New name")}
                           fieldId="rename-dialog-new-name">
                    <TextInput id='rename-dialog-new-name'
                               validated={submitted && !newName ? "error" : "default"}
                               value={newName}
                               onChange={(_, value) => setNewName(value)} />
                    <FormHelper helperTextInvalid={submitted && !newName && _("New name must not be empty")} />
                </FormGroup>
            </Form>
        </Modal>
    );
};
