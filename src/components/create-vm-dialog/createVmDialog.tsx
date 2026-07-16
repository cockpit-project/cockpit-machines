/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useState } from 'react';

import type { ConnectionName, OSInfo } from '../../types';
import { useDialogs } from 'dialogs';

import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormSection } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tab, TabTitleText, Tabs } from "@patternfly/react-core/dist/esm/components/Tabs";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";

import cockpit from 'cockpit';
import {
    isEmpty,
    convertToUnit,
    units,
} from "../../helpers.js";

import {
    LOCAL_INSTALL_MEDIA_SOURCE,
    CLOUD_IMAGE,
    DOWNLOAD_AN_OS,
    EXISTING_DISK_IMAGE_SOURCE,
    needsRHToken,
} from "./createVmDialogUtils.js";

import { encodeVirtArg, domainCreate } from '../../libvirtApi/domain.js';
import { storagePoolGetAll } from '../../libvirtApi/storagePool.js';
import { getOsInfoList } from '../../libvirtApi/common.js';
import { appState } from '../../state';

import {
    useDialogState_async, DialogState,
    DialogErrorMessage,
    DialogTextInput,
    DialogActionButton, DialogCancelButton
} from 'cockpit/dialog';

import { DetailsValue, init_Details, validate_Details, Details } from "./details";
import { compute_AutomationState, AutomationValue, init_Automation, validate_Automation, Automation } from "./automation";
import { getNewDiskImagePath } from '../common/storage';

import './createVmDialog.css';

const _ = cockpit.gettext;

interface CreateVmModalValues {
    name: string,
    details: DetailsValue,
    automation: AutomationValue,
    osInfoList: OSInfo[],
}

function isUnattendedInstallation(values: CreateVmModalValues): boolean {
    function emptyUsers(users: AutomationValue["users"]) {
        return !users.rootPassword && !users.userLogin && !users.userPassword;
    }
    return values.details.source.type == DOWNLOAD_AN_OS && !emptyUsers(values.automation.users);
}

function downloadingDisabled(values: CreateVmModalValues): boolean {
    // This happens if a offlineToken is needed and we are either
    // still obtaining access token (validating offline token) or
    // failed to obtain one.

    const source = values.details.source;
    return source.type == DOWNLOAD_AN_OS && !!source.os && needsRHToken(source.os.shortId) && isEmpty(source.accessToken);
}

export const CreateVmModal = ({
    mode,
    initialSource,
    initialOS,
    initialName,
    initialSourceType,
    onClose,
} : {
    mode: 'create' | 'import';
    initialSource?: string | undefined;
    initialOS?: string | undefined;
    initialName?: string | undefined;
    initialSourceType?: string | undefined;
    onClose?: () => void;
}) => {
    const Dialogs = useDialogs();
    const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

    async function init(): Promise<CreateVmModalValues> {
        async function poolGetAll(connectionName: ConnectionName) {
            try {
                await storagePoolGetAll({ connectionName });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (ex) {
                // Error has been logged by storagePoolGetAll and been
                // re-thrown.  We don't want any error here from
                // stopping the dialog from opening.
            }
        }

        const [osInfoList] = await Promise.all(
            [
                getOsInfoList(),
                poolGetAll("session"),
                poolGetAll("system"),
            ]
        );

        let defaultSourceType;
        if (mode == 'create') {
            // Use initialSourceType if provided, otherwise fall back to defaults
            if (initialSourceType) {
                defaultSourceType = initialSourceType;
            } else if (!appState.virtInstallCapabilities?.downloadOSSupported) {
                defaultSourceType = LOCAL_INSTALL_MEDIA_SOURCE;
            } else {
                defaultSourceType = DOWNLOAD_AN_OS;
            }
        } else {
            defaultSourceType = EXISTING_DISK_IMAGE_SOURCE;
        }

        return {
            name: initialName || "",
            details: await init_Details(defaultSourceType, initialSource || "", initialOS || "", osInfoList),
            automation: init_Automation(),
            osInfoList
        };
    }

    function validate(dlg: DialogState<CreateVmModalValues>) {
        dlg.field("name").validate(name => {
            name = name.trim();
            if (isEmpty(name))
                name = dlg.values.details.suggestedName.trim();
            if (isEmpty(name))
                return _("Name must not be empty");
            else if (appState.vms.some(vm => vm.name === name && vm.connectionName == dlg.values.details.connectionName))
                return cockpit.format(_("VM $0 already exists"), name);
        });

        validate_Details(dlg.field("details"));
        validate_Automation(dlg.field("automation"), dlg.values.details);
    }

    async function onCreateClicked(values: CreateVmModalValues, variant: "run" | "edit") {
        const { details, automation } = values;
        const { source } = details;
        const vmName = isEmpty(values.name.trim()) ? values.details.suggestedName : values.name;

        const users = automation.users;
        const unattendedInstallation = !(source.type === CLOUD_IMAGE) && !!(users.rootPassword || users.userLogin || users.userPassword);

        let storageDisk = null;
        if (details.storage.mode == "create-new") {
            const params = details.storage.create_new;
            storageDisk = encodeVirtArg(
                {
                    path: await getNewDiskImagePath(params, vmName),
                    size: convertToUnit(params.size.size, params.size.unit, units.GiB),
                    format: params.name.format,
                }
            );
        } else if (details.storage.mode == "use-existing") {
            const params = details.storage.use_existing;
            storageDisk = encodeVirtArg(
                {
                    path: params.file,
                }
            );
        } else
            storageDisk = "none";

        const vmParams = {
            connectionName: details.connectionName,
            vmName,
            source: source.source,
            sourceType: source.type,
            os: source.os ? source.os.shortId : 'auto',
            osVersion: source.os ? source.os.version : '',
            profile: automation.profile,
            memorySize: convertToUnit(details.memory.size, details.memory.unit, units.MiB),
            storageDisk,
            storagePool: "",
            storageSize: 0,
            storageVolume: "",
            unattended: unattendedInstallation,
            userPassword: users.userPassword,
            rootPassword: users.rootPassword,
            userLogin: users.userLogin,
            sshKeys: automation.sshKeys.map(key => key.text),
            startVm: variant == "run",
            accessToken: source.accessToken,
            extraArguments: automation.extraArgs,
        };

        domainCreate(vmParams)
            .catch(
                exception => {
                    console.error(`spawn 'vm creation' returned error: "${JSON.stringify(exception)}"`);
                    appState.addNotification({
                        text: cockpit.format(_("Creation of VM $0 failed"), vmParams.vmName),
                        detail: exception.message.split(/Traceback(.+)/)[0],
                    });
                });

        if (variant == "edit") {
            cockpit.location.go(["vm"], {
                ...cockpit.location.options,
                name: vmName,
                connection: details.connectionName
            });
        }
    }

    const dlg = useDialogState_async(init, validate);

    let dialogBody;

    const handleTabClick = (event: React.MouseEvent, tabIndex: number | string) => {
        // Prevent the form from being submitted.
        event.preventDefault();
        setActiveTabKey(tabIndex);
    };

    if (dlg == null) {
        dialogBody = (
            <Flex justifyContent={{ default: 'justifyContentCenter' }} alignItems={{ default: 'alignItemsCenter' }} style={{ minHeight: '200px' }}>
                <FlexItem>
                    <Spinner size="lg" />
                </FlexItem>
                <FlexItem>
                    {_("Loading operating system information...")}
                </FlexItem>
            </Flex>
        );
    } else if (dlg instanceof DialogState) {
        const autoState = compute_AutomationState(dlg.values.details.source);

        dialogBody = (
            <Form isHorizontal>
                <DialogTextInput
                    label={_("Name")}
                    field={dlg.field("name")}
                    placeholder={
                        isEmpty(dlg.values.details.suggestedName.trim())
                            ? _("Unique name")
                            : cockpit.format(_("Unique name, default: $0"), dlg.values.details.suggestedName)
                    }
                />
                { mode === "create"
                    ? <Tabs activeKey={activeTabKey} onSelect={handleTabClick}>
                        <Tab
                              eventKey={0}
                              title={<TabTitleText>{_("Details")}</TabTitleText>}
                              id="details-tab"
                        >
                            <FormSection>
                                <Details
                                      field={dlg.field("details")}
                                      osInfoList={dlg.values.osInfoList}
                                />
                            </FormSection>
                        </Tab>
                        <Tab
                              eventKey={1}
                              title={<TabTitleText>{_("Automation")}</TabTitleText>}
                              id="automation"
                              {...autoState.excuse && { tooltip: <Tooltip content={autoState.excuse} /> }}
                              isAriaDisabled={!!autoState.excuse}
                        >
                            <FormSection>
                                <Automation
                                      field={dlg.field("automation")}
                                      details={dlg.values.details}
                                      state={autoState}
                                />
                            </FormSection>
                        </Tab>
                    </Tabs>
                    : <Details
                          field={dlg.field("details")}
                          osInfoList={dlg.values.osInfoList}
                    />
                }
            </Form>
        );
    }

    const handleClose = onClose ?? Dialogs.close;

    const unattendedInstallation = dlg instanceof DialogState && isUnattendedInstallation(dlg.values);
    const downloadingIsDisabled = dlg instanceof DialogState && downloadingDisabled(dlg.values);

    const createAndEdit = (
        <DialogActionButton
            dialog={dlg}
            variant="secondary"
            action={values => onCreateClicked(values, "edit")}
            excuse={
                unattendedInstallation
                    ? _("Setting the user passwords for unattended installation requires starting the VM when creating it")
                    : undefined
            }
            isDisabled={downloadingIsDisabled}
        >
            {mode == 'create' ? _("Create and edit") : _("Import and edit")}
        </DialogActionButton>
    );

    return (
        <Modal
            position="top"
            variant="medium"
            id='create-vm-dialog'
            isOpen
            onClose={handleClose}
        >
            <ModalHeader
                title={mode == 'create' ? _("Create new virtual machine") : _("Import a virtual machine")}
            />
            <ModalBody>
                <DialogErrorMessage dialog={dlg} />
                {dialogBody}
            </ModalBody>
            <ModalFooter>
                <DialogActionButton
                    dialog={dlg}
                    action={values => onCreateClicked(values, "run")}
                    onClose={handleClose}
                    isDisabled={downloadingIsDisabled}
                >
                    {mode == 'create' ? _("Create and run") : _("Import and run")}
                </DialogActionButton>
                {createAndEdit}
                <DialogCancelButton
                    dialog={dlg}
                    onClose={handleClose}
                >
                    {_("Cancel")}
                </DialogCancelButton>
            </ModalFooter>
        </Modal>
    );
};

interface CreateVmActionProps {
    mode: 'create' | 'import';
}

export const CreateVmAction = ({ mode }: CreateVmActionProps) => {
    const vi_caps = appState.virtInstallCapabilities;

    const open = () => {
        // Open dialog by setting URL parameter - dialog is rendered declaratively based on URL
        cockpit.location.replace(cockpit.location.path, { action: mode });
    };

    let testdata;
    if (!vi_caps)
        testdata = "disabledCheckingFeatures";
    else if (!vi_caps.virtInstallAvailable)
        testdata = "disabledVirtInstall";

    let createButton = (
        <Button isDisabled={testdata !== undefined}
                test-data={testdata}
                id={mode === 'create' ? 'create-new-vm' : 'import-existing-vm'}
                variant='secondary'
                onClick={open}>
            {mode === 'create' ? _("Create VM") : _("Import VM")}
        </Button>
    );

    if (!vi_caps?.virtInstallAvailable)
        createButton = (
            <Tooltip id='virt-install-not-available-tooltip'
                     content={_("virt-install package needs to be installed on the system in order to create new VMs")}>
                <span>
                    {createButton}
                </span>
            </Tooltip>
        );
    else
        createButton = (
            <Tooltip id={mode + '-button-tooltip'}
                     position={mode === "create" ? "top-end" : "top"}
                     className={mode === "create" ? "custom-arrow" : ""}
                     content={mode === "create"
                         ? _("Create VM from local or network installation medium")
                         : _("Create VM by importing a disk image of an existing VM installation")
                     }
                     isContentLeftAligned>
                <span>
                    {createButton}
                </span>
            </Tooltip>
        );

    return createButton;
};
