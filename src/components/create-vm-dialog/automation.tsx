/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import cockpit from 'cockpit';
import React from 'react';

import type { OSInfo } from '../../types';

import { FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { TrashIcon } from '@patternfly/react-icons';

import {
    URL_SOURCE,
    LOCAL_INSTALL_MEDIA_SOURCE,
    CLOUD_IMAGE,
    DOWNLOAD_AN_OS,
    getOSStringRepresentation,
} from "./createVmDialogUtils.js";
import { appState } from '../../state';

import {
    DialogField,
    DialogHelperText,
    DialogTextInput,
    DialogDropdownSelect,
} from 'cockpit/dialog';

import { DynamicList } from "./dynamicList";
import { PasswordInput } from "./passwordInput";
import { type DetailsValue } from "./details";

const _ = cockpit.gettext;

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

    const textChanged = () => {
        field.get_async(async (value, signal) => {
            const lines = value.text.split(/\r?\n/);
            const keys = [];
            for (const l of lines) {
                keys.push(await parseKey(l));
            }
            if (!signal.aborted) {
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
        <Grid data-ouia-component-id={field.ouia_id()}>
            <GridItem span={11}>
                {parsedKey
                    ? (
                        <FlexItem
                            id="validated"
                        >
                            <strong>{parsedKey.comment}</strong>
                            <span>{parsedKey.comment ? " - " + parsedKey.type : parsedKey.type}</span>
                            <div>{parsedKey.data}</div>
                        </FlexItem>
                    )
                    : (
                        <FormGroup
                            label={_("Public key")}
                        >
                            <TextArea
                                value={text}
                                aria-label={_("Public SSH key")}
                                onChange={(_, value) => field.sub("text", textChanged).set_debounced(value)}
                                rows={3}
                            />
                            <DialogHelperText
                                field={field}
                                explanation={_("Keys are located in ~/.ssh/ and have a \".pub\" extension.")}
                            />
                        </FormGroup>
                    )
                }
            </GridItem>
            <GridItem
                span={1}
                className="pf-m-1-col-on-md remove-button-group"
            >
                <Button
                    variant='plain'
                    className="btn-close"
                    ouiaId={field.ouia_id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={() => removeItem()}
                />
            </GridItem>
        </Grid>
    );
};

export interface AutomationValue {
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
                render={
                    (f, i) => <SshKeysRow
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

export interface AutomationState {
    excuse: undefined | string,
    unattendedInstructionsMessage: string,
    showUnattendedRow: boolean,
    showCloudInitRow: boolean,
    showExtraArgsRow: boolean,
}

export function compute_AutomationState(source: DetailsValue["source"]): AutomationState {
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

export function init_Automation(): AutomationValue {
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

export function validate_Automation(field: DialogField<AutomationValue>, details: DetailsValue) {
    if (details.source.type === CLOUD_IMAGE && appState.virtInstallCapabilities?.cloudInitSupported) {
        validate_CloudInit(field);
    }
}

export const Automation = ({
    field,
    details,
    state,
} : {
    field: DialogField<AutomationValue>,
    details: DetailsValue,
    state: AutomationState,
}) => {
    return (
        <>
            {(state.showUnattendedRow || state.showCloudInitRow) && state.unattendedInstructionsMessage}
            {state.showUnattendedRow && details.source.os &&
                <UnattendedRow
                    field={field}
                    os={details.source.os}
                />
            }
            {state.showCloudInitRow &&
                <CloudInitOptionsRow
                    field={field}
                />
            }
            {state.showExtraArgsRow && details.source.os &&
                <ExtraArgumentsRow
                    field={field.sub("extraArgs")}
                    os={details.source.os}
                />
            }
        </>
    );
};
