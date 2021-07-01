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
    Button,
    Checkbox,
    Flex,
    FlexItem,
    Form,
    FormGroup,
    Modal,
    Radio,
    TextInput,
    Popover,
    PopoverPosition
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from "@patternfly/react-icons";

import { migrateToUri } from '../../libvirt-dbus.js';
import { isEmpty, isObjectEmpty } from '../../helpers.js';
import { ModalError } from 'cockpit-components-inline-notification.jsx';

import './vmMigrateDialog.scss';

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

const DurationRow = ({ temporary, setTemporary }) => {
    return (
        <FormGroup hasNoPaddingTop
                   fieldId="temporary"
                   label={
                       <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                           <span>{_("Duration")}</span>
                           <Popover aria-label="Duration popover"
                                    position={PopoverPosition.bottom}
                                    enableFlip
                                    bodyContent={<Flex direction={{ default: 'column' }}>
                                        <FlexItem>
                                            <h4 className="popover-headline">{_("Permanent (default)")}</h4>
                                            <p>{_("The migrated VM configuration is removed from the source host. The destination host is considered the new home of the VM.")}</p>
                                        </FlexItem>
                                        <FlexItem>
                                            <h4 className="popover-headline">{_("Temporary")}</h4>
                                            <p>{_("A copy of the VM will run on the destination and will disappear when it is shut off. Meanwhile, the origin host keeps its copy of the VM configuration.")}</p>
                                        </FlexItem>
                                    </Flex>}>
                               <OutlinedQuestionCircleIcon />
                           </Popover>
                       </Flex>
                   }>
            <Checkbox id="temporary"
                      isChecked={temporary}
                      label={_("Temporary migration")}
                      onChange={setTemporary} />
        </FormGroup>
    );
};

const StorageRow = ({ storage, setStorage }) => {
    return (
        <FormGroup hasNoPaddingTop
                   label={
                       <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                           <span>{_("Storage")}</span>
                           <Popover aria-label="Storage popover"
                                    position={PopoverPosition.bottom}
                                    enableFlip
                                    bodyContent={<Flex direction={{ default: 'column' }}>
                                        <FlexItem>
                                            <h4 className="popover-headline">{_("Shared storage")}</h4>
                                            <p>{_("Use the same location on both the origin and destination hosts for your storage. This can be a shared storage pool, NFS, or any other method of sharing storage.")}</p>
                                        </FlexItem>
                                        <FlexItem>
                                            <h4 className="popover-headline">{_("Copy storage")}</h4>
                                            <p>{_("Full disk images and the domain's memory will be migrated. Only non-shared, writable disk images will be transferred. Unused storage will remain on the origin after migration.")}</p>
                                        </FlexItem>
                                    </Flex>}>
                               <OutlinedQuestionCircleIcon />
                           </Popover>
                       </Flex>
                   }>
            <Radio id="shared"
                   name="storage"
                   label={_("Storage is at a shared location")}
                   isChecked={storage === "nocopy"}
                   onChange={() => setStorage("nocopy")} />
            <Radio id="copy"
                   name="storage"
                   label={_("Copy storage")}
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
        <Form onSubmit={e => e.preventDefault()} isHorizontal>
            <DestUriRow destUri={destUri}
                        setDestUri={setDestUri}
                        validationFailed={validationFailed} />
            <DurationRow temporary={temporary}
                        setTemporary={setTemporary} />
            <StorageRow storage={storage}
                        setStorage={setStorage} />
        </Form>
    );

    const dataCorruptionWarning = () => {
        const hasWriteableDisks = Object.values(vm.disks).findIndex(a => !a.readonly) !== -1;

        if (temporary && storage === "nocopy" && hasWriteableDisks)
            return <div className="footer-warning">{_("Do not run this VM on the origin and destination hosts at the same time.")}</div>;
        else if (temporary && storage === "copy")
            return <div className="footer-warning">{_("All VM activity, including storage, will be temporary. This will result in data loss on the destination host.")}</div>;
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
