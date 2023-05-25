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
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Popover, PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";
import { OutlinedQuestionCircleIcon } from "@patternfly/react-icons";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { domainGetAll, domainMigrateToUri } from '../../libvirtApi/domain.js';
import { isEmpty, isObjectEmpty } from '../../helpers.js';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

import './vmMigrateDialog.scss';

const _ = cockpit.gettext;

const DestUriRow = ({ validationFailed, destUri, setDestUri }) => {
    return (
        <FormGroup label={_("Destination URI")} fieldId="dest-uri-input">
            <TextInput id='dest-uri-input'
                       validated={validationFailed.destUri ? "error" : "default"}
                       value={destUri}
                       placeholder={cockpit.format(_("Example, $0"), "qemu+ssh://192.0.2.16/system")}
                       onChange={(_, value) => setDestUri(value)} />
            <FormHelper helperTextInvalid={validationFailed.destUri} />
        </FormGroup>
    );
};

const DurationRow = ({ temporary, setTemporary }) => {
    return (
        <FormGroup hasNoPaddingTop
                   fieldId="temporary"
                   label={_("Duration")}
                   labelIcon={
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
                           <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                               <OutlinedQuestionCircleIcon />
                           </button>
                       </Popover>
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
                   label={_("Storage")}
                   labelIcon={
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
                           <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                               <OutlinedQuestionCircleIcon />
                           </button>
                       </Popover>
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

export const MigrateDialog = ({ vm, connectionName }) => {
    const Dialogs = useDialogs();
    const [destUri, setDestUri] = useState("");
    const [error, setDialogError] = useState({});
    const [inProgress, setInProgress] = useState(false);
    const [storage, setStorage] = useState("nocopy");
    const [temporary, setTemporary] = useState(false);
    const [validationFailed, setValidationFailed] = useState(false);
    const [copyStorageHidden, setCopyStorageHidden] = useState(true);

    cockpit.file("/etc/os-release").read()
            .then(data => {
                let isRhel = false;

                data.split('\n').forEach(line => {
                    const parts = line.split('=');

                    if (parts.length === 2 && parts[0] === "ID" && parts[1].replace(/^"(.*)"$/, '$1') === "rhel")
                        isRhel = true;
                });

                setCopyStorageHidden(isRhel);
            });

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
        return domainMigrateToUri({ connectionName, objPath: vm.id, destUri, storage, temporary })
                .then(() => {
                    Dialogs.close();
                    if (!temporary)
                        cockpit.location.go(["vms"]);
                })
                .then(() => {
                    // Because of bug, we don't get event when migration undefines a VM
                    // https://gitlab.com/libvirt/libvirt/-/issues/186
                    return domainGetAll({ connectionName });
                })
                .catch(exc => {
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
            {!copyStorageHidden && <StorageRow storage={storage}
                                               setStorage={setStorage} />
            }
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
            {dataCorruptionWarning()}
            <Button variant='primary'
                    id="migrate-button"
                    isLoading={inProgress}
                    isDisabled={inProgress}
                    onClick={onMigrate}>
                {_("Migrate")}
            </Button>
            <Button id="cancel-button" variant='link' onClick={Dialogs.close}>
                {_("Cancel")}
            </Button>
        </>
    );

    return (
        <Modal id="migrate-modal" position="top" variant="medium" isOpen onClose={Dialogs.close}
               description={copyStorageHidden && _("Storage volumes must be shared between this host and the destination host.")}
               title={_("Migrate VM to another host")}
               footer={footer}>
            {!isObjectEmpty(error) && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.message} />}
            {body}
        </Modal>
    );
};
