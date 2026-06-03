/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useState, useMemo } from 'react';

import type { ConnectionName, VM, StoragePool, OSInfo } from '../../types';
import { useDialogs } from 'dialogs';

import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup, FormSection } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tab, TabTitleText, Tabs } from "@patternfly/react-core/dist/esm/components/Tabs";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { ExternalLinkAltIcon, TrashIcon } from '@patternfly/react-icons';
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";

import { useInit } from "hooks.js";
import cockpit from 'cockpit';
import { MachinesConnectionSelector } from '../common/machinesConnectionSelector.jsx';
import { TypeaheadSelect, type TypeaheadSelectOption } from 'cockpit-components-typeahead-select';
import { SimpleSelect, type SimpleSelectOption } from "cockpit-components-simple-select";
import {
    isEmpty,
    convertToUnit,
    getBestUnit,
    toReadableNumber,
    units,
    getStorageVolumesUsage, type StorageVolumesUsage,
    LIBVIRT_SYSTEM_CONNECTION,
} from "../../helpers.js";
import {
    getPXEInitialNetworkSource,
    getPXENetworkOptions,
    getVirtualNetworkByName,
    getVirtualNetworkPXESupport
} from './pxe-helpers.js';

import {
    URL_SOURCE,
    LOCAL_INSTALL_MEDIA_SOURCE,
    CLOUD_IMAGE,
    DOWNLOAD_AN_OS,
    EXISTING_DISK_IMAGE_SOURCE,
    PXE_SOURCE,
    autodetectOS,
    compareDates,
    correctSpecialCases,
    filterReleaseEolDates,
    getOSStringRepresentation,
    getOSDescription,
    needsRHToken,
    isDownloadableOs,
    loadOfflineToken,
    removeOfflineToken,
    saveOfflineToken,
} from "./createVmDialogUtils.js";
import { domainCreate } from '../../libvirtApi/domain.js';
import { storagePoolRefresh } from '../../libvirtApi/storagePool.js';
import { getAccessToken } from '../../libvirtApi/rhel-images.js';
import { getOsInfoList } from '../../libvirtApi/common.js';
import { appState } from '../../state';

import {
    useDialogState_async, DialogState, DialogField,
    DialogErrorMessage,
    DialogHelperText,
    DialogTextInput, OptionalFormGroup,
    DialogDropdownSelect, DialogDropdownSelectObject,
    DialogCancelButton
} from 'cockpit/dialog';

import {
    FileAutoComplete,
    PasswordInput,
    DynamicList,
    DialogActionButton,
} from "../common/dialog";

import './createVmDialog.css';

const _ = cockpit.gettext;

/* Returns pool's available space
 * Pool needs to be referenced by it's name or path.
 */
function getPoolSpaceAvailable({
    storagePools,
    poolName,
    poolPath,
    connectionName
} : {
    storagePools: StoragePool[],
    poolName?: string | undefined,
    poolPath?: string | undefined,
    connectionName: ConnectionName,
}): number | undefined {
    storagePools = storagePools.filter(pool => pool.connectionName === connectionName);

    let storagePool;
    if (poolName)
        storagePool = storagePools.find(pool => pool.name === poolName);
    else if (poolPath)
        storagePool = storagePools.find(pool => pool.target && pool.target.path === poolPath);

    return (storagePool && storagePool.available) ? Number(storagePool.available) : undefined;
}

/* Returns available space of default storage pool
 *
 * First it tries to find storage pool called "default"
 * If there is none, a pool with path "/var/lib/libvirt/images" (system connection)
 * or "~/.local/share/libvirt/images" (session connection)
 * If no default pool could be found, virt-install will create a pool named "default",
 * whose available space we cannot predict
 * see: virtinstall/storage.py - StoragePool.build_default_pool()
 */

let current_user: cockpit.UserInfo | null = null;
cockpit.user().then(user => { current_user = user });

function getSpaceAvailable(storagePools: StoragePool[], connectionName: ConnectionName): number | undefined {
    let space = getPoolSpaceAvailable({ storagePools, poolName: "default", connectionName });

    if (!space) {
        let poolPath;
        if (connectionName === LIBVIRT_SYSTEM_CONNECTION)
            poolPath = "/var/lib/libvirt/images";
        else if (current_user)
            poolPath = current_user.home + "/.local/share/libvirt/images";

        space = getPoolSpaceAvailable({ storagePools, poolPath, connectionName });
    }

    return space;
}

function getVmName(connectionName: ConnectionName, vms: VM[], os: OSInfo) {
    let retName = os.shortId;

    const date = new Date();
    retName += '-' + date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();

    let tmpRetName = retName;
    // VM with same name already exists, append a character at the end, starting with 'B'
    for (let i = 66; vms.some(vm => vm.name === tmpRetName && connectionName == vm.connectionName) && i <= 91; i++) {
        // Could not generate name which doesn't collide with any other VM name
        if (i === 91)
            return "";
        tmpRetName = retName + '-' + String.fromCharCode(i);
    }

    return tmpRetName;
}

interface SourceValue {
    type: string;
    os: OSInfo | null;
    mediaId: string;
    source: string;
    offlineToken: string,
    accessToken: string,
}

function init_Source(initialSourceType: string, initialSource: string, initialOS: string, osInfoList: OSInfo[]): SourceValue {
    let os = null;
    if (initialOS)
        os = osInfoList.find(os => os.shortId === initialOS) || null;

    return {
        type: initialSourceType,
        os,
        mediaId: "",
        source: initialSource,
        offlineToken: "",
        accessToken: ""
    };
}

function validate_Source(field: DialogField<SourceValue>) {
    field.validate(val => {
        const { type, os, source, offlineToken } = val;

        function validate_os() {
            if (!os)
                return _("You need to select the most closely matching operating system");
        }

        function validate_source() {
            if (!isEmpty(source)) {
                switch (type) {
                case PXE_SOURCE:
                    break;
                case LOCAL_INSTALL_MEDIA_SOURCE:
                case CLOUD_IMAGE:
                case EXISTING_DISK_IMAGE_SOURCE:
                    if (!source.startsWith("/"))
                        return _("Invalid filename");
                    break;
                case URL_SOURCE:
                default:
                    if (!source.startsWith("http") &&
                            !source.startsWith("ftp") &&
                            !source.startsWith("nfs")) {
                        return _("Source should start with http, ftp or nfs protocol");
                    }
                    break;
                }
            } else if (type != DOWNLOAD_AN_OS) {
                if (type == EXISTING_DISK_IMAGE_SOURCE)
                    return _("Disk image path must not be empty");
                else
                    return _("Installation source must not be empty");
            }
        }

        function validate_offlineToken() {
            if (type == DOWNLOAD_AN_OS && os && needsRHToken(os.shortId) && isEmpty(offlineToken))
                return _("Offline token must not be empty");
        }

        return {
            os: validate_os(),
            source: validate_source(),
            offlineToken: validate_offlineToken(),
        };
    });
}

function downloadingDisabled(source: SourceValue): boolean {
    // This happens if a offlineToken is needed and we are either
    // still obtaining access token (validating offline token) or
    // failed to obtain one.

    return source.type == DOWNLOAD_AN_OS && !!source.os && needsRHToken(source.os.shortId) && isEmpty(source.accessToken);
}

const Source = ({
    field,
    connectionName,
    osInfoList,
    updateOs,
} : {
    field: DialogField<SourceValue>,
    connectionName: ConnectionName,
    osInfoList: OSInfo[],
    updateOs: (os: OSInfo | null) => void,
}) => {
    const [autodetectOSInProgress, setAutodetectOSInProgress] = useState(false);
    const { type, os, source } = field.get();

    function update_type(new_type: string) {
        if (new_type == PXE_SOURCE) {
            const source = getPXEInitialNetworkSource(
                appState.nodeDevices.filter(nodeDevice => nodeDevice.connectionName == connectionName),
                appState.networks.filter(network => network.connectionName == connectionName));
            field.sub("source").set(source || "");
        } else if (type == PXE_SOURCE) {
            field.sub("source").set("");
        }
    }

    function update_source() {
        field.sub("source").get_async(250, async (installMedia, task) => {
            if (!installMedia || installMedia.endsWith("/"))
                return;

            setAutodetectOSInProgress(true);
            try {
                // XXX - cancelling of old detection promises
                const resJSON = await autodetectOS(installMedia);
                const res = JSON.parse(resJSON);
                const osEntry = osInfoList.filter(osEntry => osEntry.id == res.os);

                if (!task.is_cancelled() && osEntry && osEntry[0]) {
                    field.sub("os", updateOs).set(osEntry[0]);
                    if (typeof res.media == "string")
                        field.sub("mediaId").set(res.media);
                }
            } catch (ex) {
                console.log("osinfo-detect command failed: ", String(ex));
            }
            setAutodetectOSInProgress(false);
        });
    }

    let installationSource;
    let installationSourceWarning;
    switch (type) {
    case DOWNLOAD_AN_OS:
        installationSource = (
            <>
                <OSRow
                        field={field.sub("os", updateOs)}
                        osInfoList={osInfoList.filter(isDownloadableOs)}
                        isLoading={false}
                />
                { os && needsRHToken(os.shortId) &&
                <OfflineTokenRow
                            offlineField={field.sub("offlineToken")}
                            accessField={field.sub("accessToken")}
                />
                }
            </>
        );
        break;

    case LOCAL_INSTALL_MEDIA_SOURCE:
        installationSource = (
            <FileAutoComplete
                    label={_("Installation source")}
                    field={field.sub("source", update_source)}
                    placeholder={_("Path to ISO file on host's file system")}
            />
        );
        break;

    case CLOUD_IMAGE:
        installationSource = (
            <FileAutoComplete
                    label={_("Installation source")}
                    field={field.sub("source", update_source)}
                    placeholder={_("Path to cloud image file on host's file system")}
            />
        );
        break;

    case EXISTING_DISK_IMAGE_SOURCE:
        installationSource = (
            <FileAutoComplete
                    label={_("Disk image")}
                    field={field.sub("source", update_source)}
                    placeholder={_("Existing disk image on host's file system")}
            />
        );
        break;

    case PXE_SOURCE:
        if (source.includes('type=direct')) {
            installationSourceWarning = _("In most configurations, macvtap does not work for host to guest network communication.");
        } else if (source.includes('network=')) {
            const netObj = getVirtualNetworkByName(connectionName, source.split('network=')[1]);

            if (!netObj || !getVirtualNetworkPXESupport(netObj))
                installationSourceWarning = _("Network selection does not support PXE.");
        }

        installationSource = (
            <DialogDropdownSelect
                    label={_("Installation source")}
                    field={field.sub("source")}
                    options={getPXENetworkOptions(connectionName)}
                    warning={installationSourceWarning}
            />
        );
        break;

    case URL_SOURCE:
        installationSource = (
            <DialogTextInput
                    label={_("Installation source")}
                field={field.sub("source", update_source)}
                    minLength={1}
                    placeholder={_("Remote URL")}
            />
        );
        break;
    }

    return (
        <>
            {type != EXISTING_DISK_IMAGE_SOURCE &&
                <DialogDropdownSelect
                    label={_("Installation type")}
                    field={field.sub("type", update_type)}
                    options={[
                        {
                            value: DOWNLOAD_AN_OS,
                            label: _("Download an OS"),
                        },
                        {
                            value: CLOUD_IMAGE,
                            label: _("Cloud base image")
                        },
                        {
                            value: LOCAL_INSTALL_MEDIA_SOURCE,
                            label: _("Local install media (ISO image or distro install tree)"),
                        },
                        {
                            value: URL_SOURCE,
                            label: _("URL (ISO image or distro install tree)"),
                        },
                        {
                            value: PXE_SOURCE,
                            label: _("Network boot (PXE)")
                        },
                    ]}
                />
            }

            { installationSource }

            { type != DOWNLOAD_AN_OS &&
                <OSRow
                    field={field.sub("os", updateOs)}
                    osInfoList={osInfoList}
                    isLoading={autodetectOSInProgress}
                />
            }
        </>
    );
};

function getInfoListExt(osInfoList: OSInfo[]): OSInfo[] {
    return osInfoList
            .map(os => correctSpecialCases(os))
            .sort((a, b) => {
                if (a.vendor == b.vendor) {
                    // Sort OS with numbered version by version
                    if ((a.version && b.version) && (a.version !== b.version))
                        return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
                    // Sort OS with non-numbered version (e.g. "testing", "rawhide") by release date
                    else if ((a.releaseDate || b.releaseDate) && (a.releaseDate !== b.releaseDate))
                        return (compareDates(a.releaseDate, b.releaseDate, true) > 0) ? 1 : -1;

                    // Sort OSes of the same vendor in DESCENDING order
                    return getOSStringRepresentation(a).toLowerCase() < getOSStringRepresentation(b).toLowerCase() ? 1 : -1;
                }

                // Sort different vendors in ASCENDING order
                return getOSStringRepresentation(a).toLowerCase() > getOSStringRepresentation(b).toLowerCase() ? 1 : -1;
            });
}

function getOSSelectOptions(osInfoListExt: OSInfo[]): TypeaheadSelectOption[] {
    const IGNORE_VENDORS = ['ALTLinux', 'Mandriva', 'GNOME Project'];
    const newOsEntries = [];
    const oldOsEntries = [];
    for (const os of osInfoListExt) {
        if (filterReleaseEolDates(os) && !IGNORE_VENDORS.find(vendor => vendor == os.vendor))
            newOsEntries.push(os);
        else
            oldOsEntries.push(os);
    }

    const make_option = (os: OSInfo): TypeaheadSelectOption => ({
        value: os.shortId,
        content: getOSStringRepresentation(os),
        description: getOSDescription(os),
    });

    return [
        { decorator: "header", content: _("Recommended operating systems"), key: "recommended-header" },
        ...newOsEntries.map(make_option),
        { decorator: "divider", key: "divider" },
        { decorator: "header", content: _("Unsupported and older operating systems"), key: "unsupported-header" },
        ...oldOsEntries.map(make_option),
    ];
}

const OSRow = ({
    field,
    osInfoList,
    isLoading,
} : {
    field: DialogField<OSInfo | null>,
    osInfoList: OSInfo[],
    isLoading: boolean,
}) => {
    const osInfoListExt = useMemo(() => getInfoListExt(osInfoList), [osInfoList]);
    const selectOptions = useMemo(() => getOSSelectOptions(osInfoListExt), [osInfoListExt]);

    return (
        <FormGroup
            data-loading={!!isLoading}
            label={_("Operating system")}
        >
            <TypeaheadSelect
                toggleProps={{ id: field.id() }}
                isDisabled={isLoading}
                isScrollable
                placeholder={_("Choose an operating system")}
                selectOptions={selectOptions}
                selected={field.get()?.shortId}
                onSelect={(_event, value) => {
                    const os = osInfoListExt.find(os => os.shortId === value);
                    field.set(os || null);
                }}
                onClearSelection={() => {
                    field.set(null);
                }}
            />
            <DialogHelperText field={field} />
        </FormGroup>
    );
};

interface ValidationState {
    option: "default" | "error" | "success";
    message: React.ReactNode;
}

const HelperMessageToken = ({ message } : { message?: string }) => {
    const link = (
        <a href="https://access.redhat.com/management/api" target="_blank" rel="noopener noreferrer">
            <ExternalLinkAltIcon className="pf-v6-u-mr-xs" />
            {_("Get a new RHSM token.")}
        </a>
    );

    return (
        <Flex id="token-helper-message" className="pf-v6-c-form__helper-text">
            {message && <FlexItem className="invalid-token-helper" grow={{ default: 'grow' }}>{message + " "}</FlexItem>}
            <FlexItem>
                { link }
                {" " + _("Then copy and paste it above.")}
            </FlexItem>
        </Flex>
    );
};

const validationStates: Record<string, ValidationState> = {
    DEFAULT: {
        option: "default",
        message: <HelperMessageToken />,
    },
    INPROGRESS: {
        option: "default",
        message: <span id="token-helper-message" className="pf-v6-c-form__helper-text"><Spinner size="md" /> {_("Checking token validity...")}</span>,
    },
    FAILED: {
        option: "error",
        message: <HelperMessageToken message={_("Error checking token")} />,
    },
    EXPIRED: {
        option: "default",
        message: <HelperMessageToken message={_("Old token expired")} />,
    },
    SUCCESS: {
        option: "success",
        message: _("Valid token"),
    },
};

const OfflineTokenRow = ({
    offlineField,
    accessField,
} : {
    offlineField: DialogField<string>,
    accessField: DialogField<string>,
}) => {
    const [validationState, setValidationState] = useState(validationStates.DEFAULT);
    const [disabled, setDisabled] = useState(false);

    useInit(() => {
        loadOfflineToken((token) => {
            if (token) {
                offlineField.set(token);
                setDisabled(true);
                setValidationState(validationStates.INPROGRESS);
                getAccessToken(token)
                        .then(out => {
                            const accessToken = out.trim();
                            setDisabled(false);
                            accessField.set(accessToken);
                            setValidationState(validationStates.SUCCESS);
                        })
                        .catch(ex => {
                            if (ex.message && ex.message.includes("400")) // RHSM API returns '400' if token is not valid
                                setValidationState(validationStates.EXPIRED);
                            else
                                setValidationState(validationStates.FAILED);

                            offlineField.set("");
                            removeOfflineToken();
                            setDisabled(false);
                            console.info(`Could not validate saved offline token from localStorage: "${JSON.stringify(ex)}"`);
                        });
            }
        });
    });

    const setOfflineTokenHelper = (offlineToken: string) => {
        offlineField.set(offlineToken);
        if (isEmpty(offlineToken)) {
            accessField.set("");
            setValidationState(validationStates.DEFAULT);
        } else {
            offlineField.get_async(500, async (val, task) => {
                setValidationState(validationStates.INPROGRESS);
                try {
                    const out = await getAccessToken(val);
                    if (!task.is_cancelled()) {
                        accessField.set(out.trim());
                        setValidationState(validationStates.SUCCESS);
                        saveOfflineToken(offlineToken);
                    }
                } catch (ex) {
                    console.error(`Offline token validation failed: "${JSON.stringify(ex)}"`);
                    accessField.set("");
                    setValidationState(validationStates.FAILED);
                }
            });
        }
    };

    return (
        <FormGroup
            label={_("Offline token")}
            fieldId={offlineField.id()}
        >
            <TextArea
                id={offlineField.id()}
                validated={offlineField.validation_text() ? "error" : validationState.option}
                disabled={disabled}
                minLength={1}
                value={offlineField.get()}
                onChange={(_, value) => setOfflineTokenHelper(value)}
                rows={4}
            />
            <DialogHelperText field={offlineField} explanation={validationState.message} />
        </FormGroup>
    );
};

interface UsersConfigurationValue {
    rootPassword: string,
    userLogin: string,
    userPassword: string,
}

const UsersConfigurationRow = ({
    field,
    rootPasswordLabelInfo,
    forUnattended = false,
} : {
    field: DialogField<UsersConfigurationValue>,
    rootPasswordLabelInfo: string,
    forUnattended?: boolean,
}) => {
    return (
        <>
            <PasswordInput
                label={_("Root password")}
                labelInfo={rootPasswordLabelInfo}
                field={field.sub("rootPassword")}
            />
            {(!forUnattended || appState.virtInstallCapabilities?.unattendedUserLogin) &&
                <>
                    <DialogTextInput
                        label={_("User login")}
                        field={field.sub("userLogin")}
                    />
                    <PasswordInput
                        label={_("User password")}
                        labelInfo={_("Leave the password blank if you do not wish to have a user account created")}
                        field={field.sub("userPassword")}
                    />
                </>}
        </>
    );
};

interface SshKey {
    type: string;
    data: string;
    comment: string;
}

interface SshKeyValue {
    text: string;
    parsedKey: SshKey | null;
}

async function parseKey(key: string): Promise<SshKey | null> {
    const parts = key.split(" ");
    if (parts.length >= 2) {
        try {
            await cockpit.spawn(["ssh-keygen", "-l", "-f", "-"], { err: "message" }).input(key);
            return {
                type: parts[0],
                data: parts[1],
                comment: parts[2], // comment is optional in SSH-format
            };
        } catch (ex) {
            console.debug("failed to parse key", String(ex));
        }
    }
    return null;
}

const SshKeysRow = ({
    field,
    removeItem,
    addItem,
} : {
    field: DialogField<SshKeyValue>,
    removeItem: () => void,
    addItem: (v: SshKeyValue) => void,
}) => {
    const { text, parsedKey } = field.get();

    const onChangeHelper = (value: string) => {
        field.sub("text").set(value);
        field.get_async(500, async (value, task) => {
            const lines = value.text.split(/\r?\n/);
            const keys = [];
            for (const l of lines) {
                keys.push(await parseKey(l));
            }
            if (!task.is_cancelled()) {
                // First is for us
                field.sub("parsedKey").set(keys[0]);
                // Rest will be added as new items
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim())
                        addItem({ text: lines[i], parsedKey: keys[i] });
                }
            }
        });
    };

    return (
        <Grid id={field.id()}>
            <GridItem span={11}>
                {parsedKey
                    ? <FlexItem
                          id="validated"
                    >
                        <strong>{parsedKey.comment}</strong>
                        <span>{parsedKey.comment ? " - " + parsedKey.type : parsedKey.type}</span>
                        <div>{parsedKey.data}</div>
                    </FlexItem>
                    : <FormGroup
                          label={_("Public key")}
                          fieldId='public-key'>
                        <TextArea
                              value={text}
                              aria-label={_("Public SSH key")}
                              onChange={(_, value) => onChangeHelper(value)}
                              rows={3}
                        />
                        <DialogHelperText
                              field={field}
                              explanation={_("Keys are located in ~/.ssh/ and have a \".pub\" extension.")}
                        />
                    </FormGroup>
                }
            </GridItem>
            <GridItem
                span={1}
                className="pf-m-1-col-on-md remove-button-group"
            >
                <Button
                    variant='plain'
                    className="btn-close"
                    id={field.id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={() => removeItem()}
                />
            </GridItem>
        </Grid>
    );
};

interface AutomationValue {
    profile: string;
    users: UsersConfigurationValue,
    sshKeys: SshKeyValue[];
    extraArgs: string;
}

const UnattendedRow = ({
    field,
    os,
} : {
    field: DialogField<AutomationValue>,
    os: OSInfo,
}) => {
    function makeProfileOption(profile: string) {
        let profileName;
        if (profile == 'jeos')
            profileName = 'Server';
        else if (profile == 'desktop')
            profileName = 'Workstation';
        else
            profileName = profile;
        return {
            value: profile,
            label: profileName,
        };
    }

    return (
        <>
            {os.profiles.length > 0 &&
                <DialogDropdownSelect
                    label={_("Profile")}
                    field={field.sub("profile")}
                    options={
                        // Let jeos (Server) appear always first on the list since in osinfo-db
                        // it's not consistent
                        os.profiles.sort().reverse()
                                .map(makeProfileOption)
                    }
                />
            }
            <UsersConfigurationRow
                forUnattended
                field={field.sub("users")}
                rootPasswordLabelInfo={_("Leave the password blank if you do not wish to have a root account created")}
            />
        </>
    );
};

function validate_CloudInit(field: DialogField<AutomationValue>) {
    field.validate(val => {
        let userPassword;
        let userLogin;
        if (val.users.userLogin && !val.users.userPassword && val.sshKeys.length === 0)
            userPassword = _("User password must not be empty when user login is set");
        if (val.users.userPassword && !val.users.userLogin)
            userLogin = _("User login must not be empty when user password is set");
        else if (val.sshKeys.length > 0 && !val.users.userLogin)
            userLogin = _("User login must not be empty when SSH keys are set");
        return {
            users: {
                userPassword,
                userLogin,
            }
        };
    });
}

const CloudInitOptionsRow = ({
    field,
} : {
    field: DialogField<AutomationValue>,
}) => {
    const sub_sshKeys = field.sub("sshKeys");

    return (
        <>
            <UsersConfigurationRow
                field={field.sub("users")}
                rootPasswordLabelInfo={_("Leave the password blank if you do not wish to set a root password")}
            />
            <DynamicList<SshKeyValue>
                emptyStateString={_("No SSH keys specified")}
                label={_("SSH keys")}
                actionLabel={_("Add SSH keys")}
                field={sub_sshKeys}
                init={{ text: "", parsedKey: null }}
                render={(f, i) => <SshKeysRow
                                      key={i}
                                      field={f}
                                      removeItem={() => sub_sshKeys.remove(i)}
                                      addItem={val => sub_sshKeys.add(val)}
                />
                }
            />
        </>
    );
};

interface SizeValue {
    size: string,
    unit: string,
}

const SizeInput = ({
    label,
    field,
    warning,
    explanation,
} : {
    label: React.ReactNode,
    field: DialogField<SizeValue>,
    warning?: React.ReactNode;
    explanation?: React.ReactNode;
}) => {
    const { size, unit } = field.get();

    function unit_changed(newUnit: string) {
        field.sub("size").set(String(convertToUnit(size, unit, newUnit)));
    }

    return (
        <OptionalFormGroup
            label={label}
            fieldId={field.sub("size").id()}
        >
            <InputGroup>
                <DialogTextInput
                    className="size-input"
                    field={field.sub("size")}
                    type="text"
                    inputMode='numeric'
                />
                <DialogDropdownSelect
                    className="unit-select"
                    field={field.sub("unit", unit_changed)}
                    options={[
                        { value: units.MiB.name, label: _("MiB") },
                        { value: units.GiB.name, label: _("GiB") },
                    ]}
                />
            </InputGroup>
            <DialogHelperText field={field} warning={warning} explanation={explanation} />
        </OptionalFormGroup>
    );
};

function init_Memory(minimum: number = 0): SizeValue {
    if (minimum) {
        // Set memory to minimum required by OS.
        let bestUnit = getBestUnit(minimum, units.B);
        if (bestUnit.base1024Exponent >= 4) bestUnit = units.GiB;
        if (bestUnit.base1024Exponent <= 1) bestUnit = units.MiB;
        const converted = convertToUnit(minimum, units.B, bestUnit);
        return { size: String(converted), unit: bestUnit.name };
    } else {
        // Use available memory on host as initial default value in
        // modal, but not more than one GiB.
        let unit = units.MiB.name;
        let size = appState.nodeMaxMemory && Math.floor(convertToUnit(appState.nodeMaxMemory, units.KiB, units.MiB));
        if (size && size > 1024) {
            unit = units.GiB.name;
            size = 1;
        }
        return { size: String(size), unit };
    }
}

function validate_Memory(field: DialogField<SizeValue>) {
    field.validate(v => {
        if (Number(v.size) === 0) {
            return _("Memory must not be 0");
        }
        if (appState.nodeMaxMemory && Number(v.size) > convertToUnit(appState.nodeMaxMemory, units.KiB, v.unit)) {
            return cockpit.format(
                _("$0 $1 available on host"),
                toReadableNumber(convertToUnit(appState.nodeMaxMemory, units.KiB, v.unit)),
                v.unit);
        }
    });
}

const MemoryRow = ({
    field,
    minimumMemory,
} : {
    field: DialogField<SizeValue>,
    minimumMemory: number,
}) => {
    const { size, unit } = field.get();

    let explanation;
    if (appState.nodeMaxMemory) {
        explanation = cockpit.format(
            _("$0 $1 available on host"),
            toReadableNumber(convertToUnit(appState.nodeMaxMemory, units.KiB, unit)),
            unit
        );
    }

    let warning;
    if (minimumMemory && convertToUnit(size, unit, units.B) < minimumMemory) {
        warning = (
            cockpit.format(
                _("The selected operating system has minimum memory requirement of $0 $1"),
                convertToUnit(minimumMemory, units.B, unit),
                unit)
        );
    }

    return (
        <SizeInput
            label={_("Memory")}
            field={field}
            warning={warning}
            explanation={explanation}
        />
    );
};

const ExtraArgumentsRow = ({
    field,
    os,
} : {
    field: DialogField<string>,
    os: OSInfo,
}) => {
    return (
        <DialogTextInput
            label={_("Boot arguments")}
            field={field}
            explanation={cockpit.format(_("Arguments passed to the booted kernel can often be used to control the installer. Refer to the documentation of the installer of $0."), os.name)}
        />
    );
};

interface StorageValue {
    newSize: SizeValue,
    storagePoolName: string,
    storageVolume: string,

    connectionName: ConnectionName,
    storagePools: StoragePool[],
}

function init_Storage(connectionName: ConnectionName): StorageValue {
    return {
        newSize: {
            size: String(convertToUnit(10 * 1024, units.MiB, units.GiB)),
            unit: units.GiB.name,
        },
        storagePoolName: "NewVolumeQCOW2",
        storageVolume: "",

        connectionName,
        storagePools: appState.storagePools.filter(pool => pool.connectionName === connectionName),
    };
}

function update_Storage(field: DialogField<StorageValue>, minimum: number) {
    if (minimum) {
        let bestUnit = getBestUnit(minimum, units.B);
        if (bestUnit.base1024Exponent >= 4) bestUnit = units.GiB;
        if (bestUnit.base1024Exponent <= 1) bestUnit = units.MiB;
        const converted = convertToUnit(minimum, units.B, bestUnit);

        field.sub("newSize").set(
            {
                size: String(converted),
                unit: bestUnit.name
            }
        );
    } else {
        field.sub("newSize").set(
            {
                size: String(convertToUnit(10 * 1024, units.MiB, units.GiB)),
                unit: units.GiB.name,
            }
        );
    }
}

function validate_Storage(field: DialogField<StorageValue>) {
    const { storagePoolName } = field.get();

    if (storagePoolName == 'NewVolumeQCOW2' || storagePoolName == 'NewVolumeRAW')
        field.sub("newSize").validate(v => {
            if (Number(v.size) === 0)
                return _("Storage size must not be 0");
        });
}

const StorageRow = ({
    field,
    allowNoDisk,
    minimumStorage,
} : {
    field: DialogField<StorageValue>,
    allowNoDisk: boolean,
    minimumStorage: number,
}) => {
    const { newSize, storagePoolName, storageVolume, connectionName, storagePools } = field.get();

    const poolSpaceAvailable = getSpaceAvailable(storagePools, connectionName);
    const explanationNewVolume = (
        poolSpaceAvailable
            ? cockpit.format(
                _("$0 $1 available at default location"),
                toReadableNumber(convertToUnit(poolSpaceAvailable, units.B, newSize.unit)),
                newSize.unit)
            : ""
    );

    let warningNewVolume;
    if (minimumStorage && convertToUnit(newSize.size, newSize.unit, units.B) < minimumStorage) {
        warningNewVolume = (
            cockpit.format(
                _("The selected operating system has minimum storage size requirement of $0 $1"),
                toReadableNumber(convertToUnit(minimumStorage, units.B, newSize.unit)),
                newSize.unit)
        );
    }

    let volumeEntries: string[] = [];
    let isVolumeUsed: StorageVolumesUsage = {};
    // Existing storage pool is chosen
    if (storagePoolName !== "NewVolumeQCOW2" && storagePoolName !== "NewVolumeRAW" && storagePoolName !== "NoStorage") {
        const storagePool = storagePools.find(pool => pool.name === storagePoolName);
        if (storagePool) {
            isVolumeUsed = getStorageVolumesUsage(appState.vms, storagePool);
            volumeEntries = storagePool.volumes.map(vol => vol.name);
        }
    }

    const alreadyUsed = storageVolume && isVolumeUsed[storageVolume] && isVolumeUsed[storageVolume].length > 0;

    const StorageSelectOptions: SimpleSelectOption<string>[] = [
        { value: "NewVolumeQCOW2", content: _("Create new qcow2 volume") },
        { value: "NewVolumeRAW", content: _("Create new raw volume") },
    ];
    if (allowNoDisk) {
        StorageSelectOptions.push({ decorator: "divider", key: "dividerNoStorage" });
        StorageSelectOptions.push({ value: "NoStorage", content: _("No storage") });
    }
    const nonEmptyStoragePools = storagePools.filter(pool => pool.volumes.length);
    if (nonEmptyStoragePools.length > 0) {
        StorageSelectOptions.push({ decorator: "divider", key: "dividerPools" });
        StorageSelectOptions.push({ decorator: "header", key: "Storage pools", content: _("Storage pools") });
        nonEmptyStoragePools.forEach(pool => StorageSelectOptions.push({ value: pool.name, content: pool.name }));
    }

    return (
        <>
            <FormGroup
                label={_("Storage")}
            >
                <SimpleSelect
                    toggleProps={{ id: field.id() }}
                    toggleWidth="100%"
                    selected={storagePoolName}
                    onSelect={value => {
                        field.sub("storagePoolName").set(value);
                        const storagePool = storagePools.find(pool => pool.name === value);
                        if (storagePool)
                            field.sub("storageVolume").set(storagePool.volumes[0].name);
                    }}
                    options={StorageSelectOptions}
                />
            </FormGroup>

            { storagePoolName !== "NewVolumeQCOW2" &&
                storagePoolName !== "NewVolumeRAW" &&
                storagePoolName !== "NoStorage" &&
                <DialogDropdownSelectObject
                    label={_("Volume")}
                    field={field.sub("storageVolume")}
                    options={volumeEntries}
                    warning={alreadyUsed && _("This volume is already used by another VM.")}
                />
            }

            { (storagePoolName === "NewVolumeQCOW2" || storagePoolName === "NewVolumeRAW") &&
                <SizeInput
                    label={_("Storage limit")}
                    field={field.sub("newSize")}
                    warning={warningNewVolume}
                    explanation={explanationNewVolume}
                />
            }
        </>
    );
};

interface DetailsValue {
    connectionName: ConnectionName,
    source: SourceValue,
    memory: SizeValue,
    storage: StorageValue,
}

function init_Details(initialSourceType: string, initialSource: string, initialOS: string, osInfoList: OSInfo[]): DetailsValue {
    const connectionName = appState.systemSocketInactive ? "session" : "system";

    return {
        connectionName,
        source: init_Source(initialSourceType, initialSource, initialOS, osInfoList),
        memory: init_Memory(),
        storage: init_Storage(connectionName),
    };
}

function validate_Details(field: DialogField<DetailsValue>) {
    validate_Source(field.sub("source"));
    validate_Storage(field.sub("storage"));
    validate_Memory(field.sub("memory"));
}

const Details = ({
    field,
    osInfoList,
    setSuggestedName,
} : {
    field: DialogField<DetailsValue>,
    osInfoList: OSInfo[],
    setSuggestedName: (name: string) => void,
}) => {
    const sub_connectionName = field.sub("connectionName");

    function updateOs(os: OSInfo | null) {
        if (os) {
            setSuggestedName(getVmName(sub_connectionName.get(), appState.vms, os));
            field.sub("memory").set(init_Memory(os.minimumResources.ram));
            update_Storage(field.sub("storage"), os.minimumResources.storage || 0);
        } else {
            setSuggestedName("");
            field.sub("memory").set(init_Memory());
            field.sub("storage").set(init_Storage(sub_connectionName.get()));
        }
    }

    const sourceType = field.get().source.type;

    return (
        <>
            <MachinesConnectionSelector
                id={sub_connectionName.id()}
                connectionName={sub_connectionName.get()}
                onValueChanged={(_, val) => {
                    sub_connectionName.set(val);
                    const { storagePoolName } = field.sub("storage").get();
                    if (storagePoolName !== "NewVolumeQCOW2" && storagePoolName !== "NewVolumeRAW" && storagePoolName !== "NoStorage") {
                        // storage pools are different for each connection, so we set storagePool value to default (newVolume)
                        field.sub("storage").sub("storagePoolName")
                                .set("NewVolumeQCOW2");
                    }

                    // For different connections the generated VM names might differ
                    // try to regenerate it
                    const { os } = field.sub("source").get();
                    if (os)
                        setSuggestedName(getVmName(sub_connectionName.get(), appState.vms, os));
                }}
                showInfoHelper
                isReadonly={appState.systemSocketInactive}
            />
            <Source
                field={field.sub("source")}
                connectionName={sub_connectionName.get()}
                osInfoList={osInfoList}
                updateOs={updateOs}
            />

            { sourceType != EXISTING_DISK_IMAGE_SOURCE &&
                <StorageRow
                    field={field.sub("storage")}
                    allowNoDisk={sourceType !== CLOUD_IMAGE}
                    minimumStorage={field.get().source.os?.minimumResources.storage || 0}
                />
            }

            <MemoryRow
                field={field.sub("memory")}
                minimumMemory={field.get().source.os?.minimumResources.ram || 0}
            />
        </>
    );
};

interface AutomationState {
    excuse: undefined | string,
    unattendedInstructionsMessage: string,
    showUnattendedRow: boolean,
    showCloudInitRow: boolean,
    showExtraArgsRow: boolean,
}

function compute_AutomationState(source: SourceValue): AutomationState {
    const unattendedInstructionsMessage = _("Enter root and/or user information to enable unattended installation.");
    const unattendedUnavailableMessage = _("Automated installs are only available when downloading an image, an install tree or using cloud-init.");
    const unattendedOsUnsupportedMessageFormat = (os: string) => cockpit.format(_("$0 does not support unattended installation."), os);

    let showUnattendedRow = false;
    let showCloudInitRow = false;
    let showExtraArgsRow = false;
    if ((source.type == URL_SOURCE || source.type == LOCAL_INSTALL_MEDIA_SOURCE) && source.os) {
        if (source.source && !source.source.endsWith(".iso"))
            showExtraArgsRow = source.os.treeInstallable;
    } else if (source.type == DOWNLOAD_AN_OS) {
        showUnattendedRow = !!source.os?.unattendedInstallable;
        showExtraArgsRow = !!source.os?.treeInstallable;
    } else if (source.type === CLOUD_IMAGE && appState.virtInstallCapabilities?.cloudInitSupported) {
        showCloudInitRow = true;
    }

    let excuse;
    if (!showUnattendedRow && !showCloudInitRow && !showExtraArgsRow) {
        excuse = unattendedUnavailableMessage;
    } else if (source.os && source.type === DOWNLOAD_AN_OS && appState.virtInstallCapabilities?.unattendedSupported) {
        if (!showUnattendedRow && !showExtraArgsRow) {
            excuse = unattendedOsUnsupportedMessageFormat(getOSStringRepresentation(source.os));
        }
    }

    return {
        excuse,
        unattendedInstructionsMessage,
        showUnattendedRow,
        showCloudInitRow,
        showExtraArgsRow,
    };
}

function init_Automation(): AutomationValue {
    return {
        profile: "",
        users: {
            rootPassword: "",
            userLogin: "",
            userPassword: "",
        },
        sshKeys: [],
        extraArgs: "",
    };
}

function validate_Automation(field: DialogField<AutomationValue>, source: SourceValue) {
    if (source.type === CLOUD_IMAGE && appState.virtInstallCapabilities?.cloudInitSupported) {
        validate_CloudInit(field);
    }
}

const Automation = ({
    field,
    source,
    state,
} : {
    field: DialogField<AutomationValue>,
    source: SourceValue,
    state: AutomationState,
}) => {
    return (
        <>
            {(state.showUnattendedRow || state.showCloudInitRow) && state.unattendedInstructionsMessage}
            {state.showUnattendedRow && source.os &&
                <UnattendedRow
                    field={field}
                    os={source.os}
                />
            }
            {state.showCloudInitRow &&
                <CloudInitOptionsRow
                    field={field}
                />
            }
            {state.showExtraArgsRow && source.os &&
                <ExtraArgumentsRow
                    field={field.sub("extraArgs")}
                    os={source.os}
                />
            }
        </>
    );
};

interface CreateVmModalValues {
    name: string,
    suggestedName: string,
    details: DetailsValue,
    automation: AutomationValue,
    osInfoList: OSInfo[],
}

function isUnattendedInstallation(values: CreateVmModalValues): boolean {
    function emptyUsers(users: UsersConfigurationValue) {
        return !users.rootPassword && !users.userLogin && !users.userPassword;
    }
    return values.details.source.type == DOWNLOAD_AN_OS && !emptyUsers(values.automation.users);
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
        const osInfoList = await getOsInfoList();

        // XXX - reget pools

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
            suggestedName: "",
            details: init_Details(defaultSourceType, initialSource || "", initialOS || "", osInfoList),
            automation: init_Automation(),
            osInfoList
        };
    }

    function validate(dlg: DialogState<CreateVmModalValues>) {
        dlg.field("name").validate(name => {
            name = name.trim();
            if (isEmpty(name))
                name = dlg.values.suggestedName.trim();
            if (isEmpty(name))
                return _("Name must not be empty");
            else if (appState.vms.some(vm => vm.name === name && vm.connectionName == dlg.values.details.connectionName))
                return cockpit.format(_("VM $0 already exists"), name);
        });

        validate_Details(dlg.field("details"));
        validate_Automation(dlg.field("automation"), dlg.values.details.source);
    }

    async function onCreateClicked(values: CreateVmModalValues, variant: string) {
        const { storagePools } = appState;
        const { details, automation } = values;
        const { source } = details;
        const vmName = isEmpty(values.name.trim()) ? values.suggestedName : values.name;

        const users = automation.users;
        const unattendedInstallation = !(source.type === CLOUD_IMAGE) && !!(users.rootPassword || users.userLogin || users.userPassword);
        const vmParams = {
            connectionName: details.connectionName,
            vmName,
            source: source.source,
            sourceType: source.type,
            os: source.os ? source.os.shortId : 'auto',
            osVersion: source.os ? source.os.version : '',
            profile: automation.profile,
            memorySize: convertToUnit(details.memory.size, details.memory.unit, units.MiB), // XXX - round
            storageSize: convertToUnit(details.storage.newSize.size, details.storage.newSize.unit, units.GiB),
            storagePool: details.storage.storagePoolName,
            storageVolume: details.storage.storageVolume,
            unattended: unattendedInstallation,
            userPassword: users.userPassword,
            rootPassword: users.rootPassword,
            userLogin: users.userLogin,
            sshKeys: automation.sshKeys.map(key => key.text),
            startVm: variant == "main",
            accessToken: source.accessToken,
            extraArguments: automation.extraArgs,
        };

        domainCreate(vmParams).then(() => {
            if (details.storage.storagePoolName === "NewVolumeQCOW2" || details.storage.storagePoolName === "NewVolumeRAW") {
                const storagePool = storagePools.find(pool => pool.connectionName === details.connectionName && pool.name === "default");
                if (storagePool)
                    storagePoolRefresh({ connectionName: storagePool.connectionName, objPath: storagePool.id });
            }
        }, (exception) => {
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
                        isEmpty(dlg.values.suggestedName.trim())
                            ? _("Unique name")
                            : cockpit.format(_("Unique name, default: $0"), dlg.values.suggestedName)
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
                                      setSuggestedName={val => dlg.field("suggestedName").set(val)}
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
                                      source={dlg.values.details.source}
                                      state={autoState}
                                />
                            </FormSection>
                        </Tab>
                    </Tabs>
                    : <Details
                          field={dlg.field("details")}
                          osInfoList={dlg.values.osInfoList}
                          setSuggestedName={val => dlg.field("suggestedName").set(val)}
                    />
                }
            </Form>
        );
    }

    const handleClose = onClose ?? Dialogs.close;

    const unattendedInstallation = dlg instanceof DialogState && isUnattendedInstallation(dlg.values);

    let createAndEdit = (
        <DialogActionButton
            dialog={dlg}
            variant="edit"
            action={onCreateClicked}
            isAriaDisabled={
                (dlg instanceof DialogState && downloadingDisabled(dlg.values.details.source)) || unattendedInstallation
            }
        >
            {mode == 'create' ? _("Create and edit") : _("Import and edit")}
        </DialogActionButton>
    );

    if (unattendedInstallation) {
        createAndEdit = (
            <Tooltip
                id='create-and-edit-disabled-tooltip'
                key="create-and-edit-tooltip"
                content={_("Setting the user passwords for unattended installation requires starting the VM when creating it")}
            >
                {createAndEdit}
            </Tooltip>
        );
    }

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
                    action={onCreateClicked}
                    onClose={handleClose}
                    isDisabled={dlg instanceof DialogState && downloadingDisabled(dlg.values.details.source)}
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
