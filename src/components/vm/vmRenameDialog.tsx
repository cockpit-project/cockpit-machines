/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2021 Red Hat, Inc.
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
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import { domainRename } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

interface DialogError {
    dialogError?: string;
    dialogErrorDetail?: string;
}

export const RenameDialog = ({
    vmName,
    vmId,
    connectionName
} : {
    vmName: string,
    vmId: string,
    connectionName: ConnectionName,
}) => {
    const Dialogs = useDialogs();
    const [newName, setNewName] = useState(vmName);
    const [error, dialogErrorSet] = useState<DialogError>({});
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
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}>
            <ModalHeader title={cockpit.format(_("Rename VM $0"), vmName)} />
            <ModalBody>
                <Form onSubmit={e => {
                    e.preventDefault();
                    onRename();
                }}
                isHorizontal>
                    {error.dialogError &&
                        <ModalError
                            dialogError={error.dialogError}
                            {...error.dialogErrorDetail && { dialogErrorDetail: error.dialogErrorDetail } }
                        />
                    }
                    <FormGroup label={_("New name")}
                               fieldId="rename-dialog-new-name">
                        <TextInput id='rename-dialog-new-name'
                                   validated={submitted && !newName ? "error" : "default"}
                                   value={newName}
                                   onChange={(_, value) => setNewName(value)} />
                        <FormHelper helperTextInvalid={(submitted && !newName) ? _("New name must not be empty") : null} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant='primary'
                        id="rename-dialog-confirm"
                        isDisabled={!newName}
                        onClick={onRename}>
                    {_("Rename")}
                </Button>
                <Button variant='link' onClick={Dialogs.close}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
