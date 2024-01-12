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
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Text, TextContent, TextList, TextListItem } from "@patternfly/react-core/dist/esm/components/Text";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';
import { fmt_to_fragments } from 'utils.jsx';

import { NeedsShutdownAlert } from '../common/needsShutdown.jsx';
import { domainReplaceSpice } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const ReplaceSpiceDialog = ({ vmName, vmId, connectionName, vmRunning }) => {
    const Dialogs = useDialogs();
    const [error, dialogErrorSet] = useState(null);
    const [inProgress, setInProgress] = useState(false);

    function onReplace() {
        setInProgress(true);

        return domainReplaceSpice({ connectionName, id: vmId })
                .then(() => Dialogs.close())
                .catch(exc => {
                    // we don't know of any case where this would fail, so this is all belt-and-suspenders
                    // still, give the user some hint how to go on
                    console.warn("Failed to replace SPICE devices:", exc);
                    dialogErrorSet({
                        dialogError: _("Failed to replace SPICE devices"),
                        dialogErrorDetail: fmt_to_fragments(
                            _("Please see $0 how to reconfigure your VM manually."),
                            <a href="https://access.redhat.com/solutions/6955095" target="_blank" rel="noopener noreferrer">
                                https://access.redhat.com/solutions/6955095
                            </a>),
                    });
                })
                .finally(() => setInProgress(false));
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
           title={cockpit.format(_("Replace SPICE devices in VM $0"), vmName)}
           footer={
               <>
                   <Button variant='primary'
                           id="replace-spice-dialog-confirm"
                           isDisabled={inProgress}
                           onClick={onReplace}>
                       {_("Replace")}
                   </Button>
                   <Button variant='link' onClick={Dialogs.close}>
                       {_("Cancel")}
                   </Button>
               </>
           }>
            { vmRunning && !error && <NeedsShutdownAlert idPrefix="spice-modal" /> }
            {error && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} />}
            <TextContent>
                <Text>{_("Reconfigure the virtual machine for a host which does not support SPICE, for host upgrades or live migration:")}</Text>
                <TextList>
                    <TextListItem>{_("Convert SPICE graphics console to VNC.")}</TextListItem>
                    <TextListItem>{_("Convert QXL video card to VGA.")}</TextListItem>
                    <TextListItem>{_("Remove SPICE audio and host devices.")}</TextListItem>
                </TextList>
            </TextContent>
        </Modal>
    );
};
