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
import {
    Alert,
    Button,
    Checkbox,
    Flex,
    Form,
    FormGroup,
    Modal,
    Radio,
    TextInput,
    Tooltip
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from "@patternfly/react-icons";

import { migrateToUri } from '../../libvirt-dbus.js';
import { isEmpty, isObjectEmpty } from '../../helpers.js';
import { ModalError } from 'cockpit-components-inline-notification.jsx';

const _ = cockpit.gettext;

const DestUriRow = ({ validationFailed, destUri, setDestUri }) => {
    return (
        <FormGroup label={_("Destination URI")} fieldId="dest-uri-input"
                   helperTextInvalid={validationFailed.destUri}
                   validated={validationFailed.destUri ? "error" : "default"}>
            <TextInput id='dest-uri-input'
                       validated={validationFailed.destUri ? "error" : "default"}
                       value={destUri}
                       placeholder={cockpit.format(_("Example, $0"), "qemu+ssh://192.0.2.16/system")}
                       onChange={setDestUri} />
        </FormGroup>
    );
};

const OptionsRow = ({ temporary, setTemporary }) => {
    return (
        <FormGroup label={_("Options")}
                   hasNoPaddingTop>
            <Checkbox id="temporary"
                      isChecked={temporary}
                      label={
                          <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                              <span>{_("Move temporarily")}</span>
                              <Tooltip position="top"
                                       content={
                                           <>
                                               <p>{_("By default, the migrated VM config is removed from the source host, and saved persistently on the destination host. The destination host is considered the new home of the VM.")}</p>
                                               <p>{_("If 'temporary' is selected, the migration is considered only a temporary move: the source host maintains a copy of the VM config, and the running copy moved to the destination is only transient, and will disappear when it is shutdown.")}</p>
                                           </>}>
                                  <OutlinedQuestionCircleIcon />
                              </Tooltip>
                          </Flex>
                      }
                      onChange={setTemporary} />
        </FormGroup>
    );
};

const StorageRow = ({ storage, setStorage }) => {
    return (
        <FormGroup label={_("Storage")}
                   hasNoPaddingTop>
            <Radio id="shared"
                   name="storage"
                   label={_("VM's storage is already shared with the destination")}
                   isChecked={storage === "nocopy"}
                   onChange={() => setStorage("nocopy")} />
            <Radio id="copy"
                   name="storage"
                   label={
                       <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                           <span>{_("VM's storage needs to be copied to the destination")}</span>
                           <Tooltip id="storage-copy-tooltip"
                                    content={_("Migrate full disk images in addition to domain's memory. Only non-shared non-readonly disk images will be transferred.")}>
                               <OutlinedQuestionCircleIcon />
                           </Tooltip>
                       </Flex>
                   }
                   isChecked={storage === "copy"}
                   onChange={() => setStorage("copy")} />
        </FormGroup>
    );
};

export const MigrateDialog = ({ vm, connectionName, toggleModal }) => {
    const [destUri, setDestUri] = useState("");
    const [error, setDialogError] = useState({});
    const [inProgress, setInProgress] = useState(false);
    const [storage, setStorage] = useState("nocopy");
    const [temporary, setTemporary] = useState(false);
    const [validationFailed, setValidationFailed] = useState(false);

    function validateParams() {
        const validation = {};
        if (isEmpty(destUri.trim()))
            validation.destUri = _("Destination URI must not be empty");

        return validation;
    }

    function onMigrate() {
        if (!isObjectEmpty(validateParams())) {
            setValidationFailed(true);
            return;
        }

        setInProgress(true);
        return migrateToUri(connectionName, vm.id, destUri, storage, temporary)
                .then(toggleModal, exc => {
                    setInProgress(false);
                    setDialogError({ dialogError: _("Migration failed"), message: exc.message });
                });
    }

    const body = (
        <Form isHorizontal>
            <DestUriRow destUri={destUri}
                        setDestUri={setDestUri}
                        validationFailed={validationFailed} />
            <StorageRow storage={storage}
                        setStorage={setStorage} />
            <OptionsRow temporary={temporary}
                        setTemporary={setTemporary} />
        </Form>
    );

    const dataCorruptionWarning = () => {
        const hasWriteableDisks = Object.values(vm.disks).findIndex(a => !a.readonly) !== -1;
        if (storage === "nocopy" && temporary && hasWriteableDisks) {
            return <Alert isInline
                          variant="warning"
                          id="data-corruption-warning"
                          title={_("Do not run this VM on multiple hosts at the same time, as it will lead to data corruption.")} />;
        }
    };

    const footer = (
        <>
            {!isObjectEmpty(error) && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.message} />}
            {dataCorruptionWarning()}
            <Button variant='primary'
                    id="migrate-button"
                    isLoading={inProgress}
                    isDisabled={inProgress}
                    onClick={onMigrate}>
                {_("Migrate")}
            </Button>
            <Button id="cancel-button" variant='link' onClick={toggleModal}>
                {_("Cancel")}
            </Button>
        </>
    );

    return (
        <Modal id="migrate-modal" position="top" variant="medium" isOpen onClose={toggleModal}
           title={_("Migrate VM to another host")}
           footer={footer}>
            {body}
        </Modal>
    );
};
