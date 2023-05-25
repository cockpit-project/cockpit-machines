/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { debounce } from 'throttle-debounce';
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Select as PFSelect, SelectGroup, SelectOption } from "@patternfly/react-core/dist/esm/deprecated/components/Select";
import { Tab, TabTitleText, Tabs } from "@patternfly/react-core/dist/esm/components/Tabs";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { ExternalLinkAltIcon } from '@patternfly/react-icons';

import { DialogsContext } from 'dialogs.jsx';
import cockpit from 'cockpit';
import store from "../../store.js";
import { MachinesConnectionSelector } from '../common/machinesConnectionSelector.jsx';
import { FormHelper } from "cockpit-components-form-helper.jsx";
import { FileAutoComplete } from "cockpit-components-file-autocomplete.jsx";
import {
    isEmpty,
    digitFilter,
    convertToUnit,
    getBestUnit,
    toReadableNumber,
    units,
    getStorageVolumesUsage,
    LIBVIRT_SYSTEM_CONNECTION,
    LIBVIRT_SESSION_CONNECTION,
} from "../../helpers.js";
import {
    getPXEInitialNetworkSource,
    getPXENetworkRows,
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
    NONE,
    RUN,
    EDIT,
    autodetectOS,
    compareDates,
    correctSpecialCases,
    filterReleaseEolDates,
    getOSStringRepresentation,
    needsRHToken,
    isDownloadableOs,
    loadOfflineToken,
    removeOfflineToken,
    saveOfflineToken,
} from "./createVmDialogUtils.js";
import { domainCreate } from '../../libvirtApi/domain.js';
import { storagePoolRefresh } from '../../libvirtApi/storagePool.js';
import { getAccessToken } from '../../libvirtApi/rhel-images.js';
import { PasswordFormFields, password_quality } from 'cockpit-components-password.jsx';

import './createVmDialog.scss';

const _ = cockpit.gettext;

/* Returns pool's available space
 * Pool needs to be referenced by it's name or path.
 *
 * @param {array} storagePools
 * @param {string} poolName
 * @param {string} poolPath
 * @param {string} connectionName
 * @returns {number}
 */
function getPoolSpaceAvailable({ storagePools, poolName, poolPath, connectionName }) {
    storagePools = storagePools.filter(pool => pool.connectionName === connectionName);

    let storagePool;
    if (poolName)
        storagePool = storagePools.find(pool => pool.name === poolName);
    else if (poolPath)
        storagePool = storagePools.find(pool => pool.target && pool.target.path === poolPath);

    return storagePool ? storagePool.available : undefined;
}

/* Returns available space of default storage pool
 *
 * First it tries to find storage pool called "default"
 * If there is none, a pool with path "/var/lib/libvirt/images" (system connection)
 * or "~/.local/share/libvirt/images" (session connection)
 * If no default pool could be found, virt-install will create a pool named "default",
 * whose available space we cannot predict
 * see: virtinstall/storage.py - StoragePool.build_default_pool()
 *
 * @param {array} storagePools
 * @param {string} connectionName
 * @returns {number}
 */

let current_user = null;
cockpit.user().then(user => { current_user = user });

function getSpaceAvailable(storagePools, connectionName) {
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

function getMemoryDefaults(nodeMaxMemory) {
    // Use available memory on host as initial default value in modal
    let memorySizeUnit = units.MiB.name;
    let memorySize = nodeMaxMemory && Math.floor(convertToUnit(nodeMaxMemory, units.KiB, units.MiB));
    // If available memory is higher than 1GiB, set 1GiB as default value in modal
    if (memorySize > 1024) {
        memorySizeUnit = units.GiB.name;
        memorySize = 1;
    }

    const minimumMemory = 0;

    return { memorySize, memorySizeUnit, minimumMemory };
}

function getStorageDefaults() {
    const storageSize = convertToUnit(10 * 1024, units.MiB, units.GiB); // tied to Unit
    const storageSizeUnit = units.GiB.name;
    const minimumStorage = 0;

    return { storageSize, storageSizeUnit, minimumStorage };
}

function getVmName(connectionName, vms, os) {
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

function validateParams(vmParams) {
    const validationFailed = {};

    if (isEmpty(vmParams.vmName.trim()) && isEmpty(vmParams.suggestedVmName.trim()))
        validationFailed.vmName = _("Name must not be empty");
    else if (vmParams.vms.some(vm => vm.name === vmParams.vmName))
        validationFailed.vmName = cockpit.format(_("VM $0 already exists"), vmParams.vmName);

    if (vmParams.os == undefined)
        validationFailed.os = _("You need to select the most closely matching operating system");

    const source = vmParams.source ? vmParams.source.trim() : null;

    if (!isEmpty(source)) {
        switch (vmParams.sourceType) {
        case PXE_SOURCE:
            break;
        case LOCAL_INSTALL_MEDIA_SOURCE:
        case CLOUD_IMAGE:
        case EXISTING_DISK_IMAGE_SOURCE:
            if (!vmParams.source.startsWith("/")) {
                validationFailed.source = _("Invalid filename");
            }
            break;
        case URL_SOURCE:
        default:
            if (!vmParams.source.startsWith("http") &&
                !vmParams.source.startsWith("ftp") &&
                !vmParams.source.startsWith("nfs")) {
                validationFailed.source = _("Source should start with http, ftp or nfs protocol");
            }
            break;
        }
    } else if (vmParams.sourceType != DOWNLOAD_AN_OS) {
        if (vmParams.sourceType == EXISTING_DISK_IMAGE_SOURCE)
            validationFailed.source = _("Disk image path must not be empty");
        else
            validationFailed.source = _("Installation source must not be empty");
    }

    if (vmParams.sourceType == DOWNLOAD_AN_OS && vmParams.os && needsRHToken(vmParams.os.shortId) && isEmpty(vmParams.offlineToken))
        validationFailed.offlineToken = _("Offline token must not be empty");

    if (vmParams.memorySize === 0) {
        validationFailed.memory = _("Memory must not be 0");
    }

    if ((vmParams.storagePool == 'NewVolumeQCOW2' || vmParams.storagePool == 'NewVolumeRAW') && vmParams.storageSize === 0) {
        validationFailed.storage = _("Storage size must not be 0");
    }

    if (vmParams.nodeMaxMemory && vmParams.memorySize > convertToUnit(vmParams.nodeMaxMemory, units.KiB, vmParams.memorySizeUnit)) {
        validationFailed.memory = cockpit.format(
            _("$0 $1 available on host"),
            toReadableNumber(convertToUnit(vmParams.nodeMaxMemory, units.KiB, vmParams.memorySizeUnit)),
            vmParams.memorySizeUnit
        );
    }

    if (!vmParams.userPassword && vmParams.userLogin) {
        validationFailed.userPassword = _("User password must not be empty when user login is set");
    }
    if (vmParams.userPassword && !vmParams.userLogin) {
        validationFailed.userLogin = _("User login must not be empty when user password is set");
    }

    return validationFailed;
}

const NameRow = ({ vmName, suggestedVmName, onValueChanged, validationFailed }) => {
    const validationStateName = validationFailed.vmName ? 'error' : 'default';

    return (
        <FormGroup label={_("Name")} fieldId="vm-name"
                   id="vm-name-group">
            <TextInput id='vm-name'
                       validated={validationStateName}
                       minLength={1}
                       value={vmName || ''}
                       placeholder={isEmpty(suggestedVmName.trim()) ? _("Unique name") : cockpit.format(_("Unique name, default: $0"), suggestedVmName)}
                       onChange={(_, value) => onValueChanged('vmName', value)} />
            <FormHelper helperTextInvalid={validationStateName && validationFailed.vmName} />
        </FormGroup>
    );
};

const SourceRow = ({ connectionName, source, sourceType, networks, nodeDevices, os, osInfoList, cloudInitSupported, downloadOSSupported, offlineToken, onValueChanged, validationFailed }) => {
    let installationSource;
    let installationSourceId;
    let installationSourceWarning;
    let validationStateSource = validationFailed.source ? 'error' : 'default';

    switch (sourceType) {
    case LOCAL_INSTALL_MEDIA_SOURCE:
        installationSourceId = "source-file";
        installationSource = (
            <FileAutoComplete id={installationSourceId}
                placeholder={_("Path to ISO file on host's file system")}
                onChange={value => onValueChanged('source', value)}
                superuser="try" />
        );
        break;
    case CLOUD_IMAGE:
        installationSourceId = "source-file";
        installationSource = (
            <FileAutoComplete id={installationSourceId}
                placeholder={_("Path to cloud image file on host's file system")}
                onChange={value => onValueChanged('source', value)}
                superuser="try" />
        );
        break;
    case EXISTING_DISK_IMAGE_SOURCE:
        installationSourceId = "source-disk";
        installationSource = (
            <FileAutoComplete id={installationSourceId}
                placeholder={_("Existing disk image on host's file system")}
                onChange={value => onValueChanged('source', value)}
                superuser="try" />
        );
        break;
    case PXE_SOURCE:
        installationSourceId = "network";
        if (source && source.includes('type=direct')) {
            installationSourceWarning = _("In most configurations, macvtap does not work for host to guest network communication.");
            if (validationStateSource !== 'error')
                validationStateSource = 'warning';
        } else if (source && source.includes('network=')) {
            const netObj = getVirtualNetworkByName(source.split('network=')[1],
                                                   networks);

            if (!netObj || !getVirtualNetworkPXESupport(netObj)) {
                installationSourceWarning = _("Network selection does not support PXE.");
                if (validationStateSource !== 'error')
                    validationStateSource = 'warning';
            }
        }

        installationSource = (
            <FormSelect id="network-select"
                        validated={validationStateSource}
                        value={source || 'no-resource'}
                        onChange={(_event, value) => onValueChanged('source', value)}>
                {getPXENetworkRows(nodeDevices, networks)}
            </FormSelect>
        );
        break;
    case URL_SOURCE:
        installationSourceId = "source-url";
        installationSource = (
            <TextInput id={installationSourceId}
                       validated={validationStateSource}
                       minLength={1}
                       placeholder={_("Remote URL")}
                       value={source}
                       onChange={(_, value) => onValueChanged('source', value)} />
        );
        break;
    default:
        break;
    }

    return (
        <>
            {sourceType != EXISTING_DISK_IMAGE_SOURCE &&
            <FormGroup label={_("Installation type")}
                       id="source-type-group"
                       fieldId="source-type">
                <FormSelect id="source-type"
                            value={sourceType}
                            onChange={(_evnet, value) => onValueChanged('sourceType', value)}>
                    {downloadOSSupported
                        ? <FormSelectOption value={DOWNLOAD_AN_OS}
                                            label={_("Download an OS")} />
                        : null}
                    {cloudInitSupported
                        ? <FormSelectOption value={CLOUD_IMAGE}
                                            label={_("Cloud base image")} />
                        : null}
                    <FormSelectOption value={LOCAL_INSTALL_MEDIA_SOURCE}
                                      label={_("Local install media (ISO image or distro install tree)")} />
                    <FormSelectOption value={URL_SOURCE}
                                      label={_("URL (ISO image or distro install tree)")} />
                    {connectionName == 'system' &&
                    <FormSelectOption value={PXE_SOURCE}
                                      label={_("Network boot (PXE)")} />}
                </FormSelect>
            </FormGroup>}

            {sourceType != DOWNLOAD_AN_OS
                ? <FormGroup label={sourceType != EXISTING_DISK_IMAGE_SOURCE ? _("Installation source") : _("Disk image")}
                             id={installationSourceId + "-group"} fieldId={installationSourceId}>
                    {installationSource}
                    <FormHelper
                        variant={validationStateSource}
                        helperTextInvalid={validationStateSource == "error" && validationFailed.source}
                        helperText={installationSourceWarning} />
                </FormGroup>
                : <>
                    <OSRow os={os}
                           osInfoList={osInfoList.filter(isDownloadableOs)}
                           onValueChanged={onValueChanged}
                           isLoading={false}
                           validationFailed={validationFailed} />
                    {os && needsRHToken(os.shortId) &&
                        <OfflineTokenRow
                            offlineToken={offlineToken}
                            onValueChanged={onValueChanged}
                            formValidationFailed={validationFailed} />}
                </>}
        </>
    );
};

class OSRow extends React.Component {
    constructor(props) {
        super(props);
        const IGNORE_VENDORS = ['ALTLinux', 'Mandriva', 'GNOME Project'];
        const osInfoListExt = this.props.osInfoList
                .map(os => correctSpecialCases(os))
                .filter(os => filterReleaseEolDates(os) && !IGNORE_VENDORS.find(vendor => vendor == os.vendor))
                .sort((a, b) => {
                    if (a.vendor == b.vendor) {
                        // Sort OS with numbered version by version
                        if ((a.version && b.version) && (a.version !== b.version))
                            return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
                        // Sort OS with non-numbered version (e.g. "testing", "rawhide") by release date
                        else if ((a.releaseDate || b.releaseDate) && (a.releaseDate !== b.releaseDate))
                            return compareDates(a.releaseDate, b.releaseDate, true) > 0;

                        // Sort OSes of the same vendor in DESCENDING order
                        return getOSStringRepresentation(a).toLowerCase() < getOSStringRepresentation(b).toLowerCase() ? 1 : -1;
                    }

                    // Sort different vendors in ASCENDING order
                    return getOSStringRepresentation(a).toLowerCase() > getOSStringRepresentation(b).toLowerCase() ? 1 : -1;
                });

        this.state = {
            typeAheadKey: Math.random(),
            osEntries: osInfoListExt,
        };
        this.createValue = os => {
            return ({
                toString: function() { return this.displayName },
                compareTo: function(value) {
                    if (typeof value == "string")
                        return this.shortId.toLowerCase().includes(value.toLowerCase()) || this.displayName.toLowerCase().includes(value.toLowerCase());
                    else
                        return this.shortId == value.shortId;
                },
                ...os,
                displayName: getOSStringRepresentation(os),
            });
        };
    }

    render() {
        const { os, onValueChanged, isLoading, validationFailed } = this.props;
        const validationStateOS = validationFailed.os ? 'error' : 'default';

        return (
            <FormGroup fieldId='os-select'
                       data-loading={!!isLoading}
                       id="os-select-group"
                       label={_("Operating system")}>
                <PFSelect
                    variant="typeahead"
                    key={this.state.typeAheadKey}
                    id='os-select'
                    isDisabled={isLoading}
                    selections={os ? this.createValue(os) : null}
                    typeAheadAriaLabel={_("Choose an operating system")}
                    placeholderText={_("Choose an operating system")}
                    onSelect={(event, value) => {
                        this.setState({
                            isOpen: false
                        });
                        onValueChanged('os', value);
                    }}
                    onClear={() => {
                        this.setState({ isOpen: false });
                        onValueChanged('os', null);
                    }}
                    onToggle={(_event, isOpen) => this.setState({ isOpen })}
                    isOpen={this.state.isOpen}
                    menuAppendTo="parent">
                    {this.state.osEntries.map(os => (<SelectOption key={os.id}
                                                                  value={this.createValue(os)} />))}
                </PFSelect>
                <FormHelper helperTextInvalid={validationStateOS == "error" && validationFailed.os} />
            </FormGroup>
        );
    }
}

// This method needs to be outside of component as re-render would create a new instance of debounce
// Debounce will trigger "getAccessToken" only if >500ms has passed since user changed offlineToken
// Since "getAccessToken" basically triggers HTTP request, this prevents user from triggering dozens of HTTP requests
// while typing an offline token
const getAccessTokenDebounce = debounce(500, (offlineToken, onValueChanged, setValidationState, validationStates, saveOfflineToken) => {
    getAccessToken(offlineToken)
            .then(out => {
                const accessToken = out.trim();
                onValueChanged("accessToken", accessToken);
                setValidationState(validationStates.SUCCESS);
                saveOfflineToken(offlineToken);
            })
            .catch(ex => {
                console.error(`Offline token validation failed: "${JSON.stringify(ex)}"`);
                onValueChanged("accessToken", "");
                setValidationState(validationStates.FAILED);
            });
});

const HelperMessageToken = ({ message }) => {
    const link = (
        <a href="https://access.redhat.com/management/api" target="_blank" rel="noopener noreferrer">
            <ExternalLinkAltIcon className="pf-v5-u-mr-xs" />
            {_("Get a new RHSM token.")}
        </a>
    );

    return (
        <Flex id="token-helper-message" className="pf-v5-c-form__helper-text">
            {message && <FlexItem className="invalid-token-helper" grow={{ default: 'grow' }}>{message + " "}</FlexItem>}
            <FlexItem>
                { link }
                {" " + _("Then copy and paste it above.")}
            </FlexItem>
        </Flex>
    );
};

const validationStates = {
    DEFAULT: {
        option: "default",
        message: <HelperMessageToken />,
    },
    INPROGRESS: {
        option: "default",
        message: <span id="token-helper-message" className="pf-v5-c-form__helper-text"><Spinner size="md" /> {_("Checking token validity...")}</span>,
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

const OfflineTokenRow = ({ offlineToken, onValueChanged, formValidationFailed }) => {
    const [validationState, setValidationState] = useState(validationStates.DEFAULT);
    const [disabled, setDisabled] = useState(false);

    useEffect(() => {
        loadOfflineToken((token) => {
            if (token) {
                onValueChanged("offlineToken", token);
                setDisabled(true);
                setValidationState(validationStates.INPROGRESS);
                getAccessToken(token)
                        .then(out => {
                            const accessToken = out.trim();
                            setDisabled(false);
                            onValueChanged("accessToken", accessToken);
                            setValidationState(validationStates.SUCCESS);
                        })
                        .catch(ex => {
                            if (ex.message && ex.message.includes("400")) // RHSM API returns '400' if token is not valid
                                setValidationState(validationStates.EXPIRED);
                            else
                                setValidationState(validationStates.FAILED);

                            onValueChanged("offlineToken", "");
                            removeOfflineToken();
                            setDisabled(false);
                            console.info(`Could not validate saved offline token from localStorage: "${JSON.stringify(ex)}"`);
                        });
            }
        });
    }, [onValueChanged]);

    const setOfflineTokenHelper = (offlineToken) => {
        onValueChanged("offlineToken", offlineToken);
        // Reset accessToken to prevent race conditions where state could still have access token paired with an old offline token
        // e.g. user inputs offline token, we obtain an access token, then they change offline token and quickly click on "Create" before new access token can be obtained
        onValueChanged("accessToken", "");

        if (isEmpty(offlineToken)) {
            setValidationState(validationStates.DEFAULT);
            onValueChanged("accessToken", "");
        } else {
            setValidationState(validationStates.INPROGRESS);
            getAccessTokenDebounce(offlineToken, onValueChanged, setValidationState, validationStates, saveOfflineToken);
        }
    };

    const helperTextVariant = formValidationFailed.offlineToken ? "error" : validationState.option;
    return (
        <FormGroup label={_("Offline token")} fieldId="offline-token"
                   id="offline-token-group">
            <TextArea id="offline-token"
                      validated={helperTextVariant}
                      disabled={disabled}
                      minLength={1}
                      value={offlineToken || ""}
                      onChange={(_, value) => setOfflineTokenHelper(value)}
                      rows="4" />
            <FormHelper fieldId="offline-token"
                        helperTextInvalid={formValidationFailed.offlineToken && <HelperMessageToken message={formValidationFailed.offlineToken} />}
                        helperText={validationState.message} />
        </FormGroup>
    );
};

const UnattendedRow = ({
    onValueChanged,
    os, profile,
    rootPassword,
    unattendedUserLogin,
    userLogin, userPassword,
    validationFailed,
}) => {
    return (
        <>
            {os.profiles.length > 0 &&
            <FormGroup fieldId="profile-select"
                       label={_("Profile")}>
                <FormSelect id="profile-select"
                            value={profile || (os.profiles && os.profiles[0])}
                            onChange={(_event, e) => onValueChanged('profile', e)}>
                    { (os.profiles || []).sort()
                            .reverse() // Let jeos (Server) appear always first on the list since in osinfo-db it's not consistent
                            .map(profile => {
                                let profileName;
                                if (profile == 'jeos')
                                    profileName = 'Server';
                                else if (profile == 'desktop')
                                    profileName = 'Workstation';
                                else
                                    profileName = profile;
                                return (
                                    <FormSelectOption value={profile}
                                                      key={profile}
                                                      label={profileName} />
                                );
                            }) }
                </FormSelect>
            </FormGroup>}
            <UsersConfigurationRow rootPassword={rootPassword}
                                   rootPasswordLabelInfo={_("Leave the password blank if you do not wish to have a root account created")}
                                   showUserFields={unattendedUserLogin}
                                   userLogin={userLogin}
                                   userPassword={userPassword}
                                   validationFailed={validationFailed}
                                   onValueChanged={onValueChanged} />
        </>
    );
};

const UsersConfigurationRow = ({
    rootPassword,
    rootPasswordLabelInfo,
    showUserFields,
    userLogin, userPassword,
    onValueChanged,
    validationFailed,
}) => {
    const [root_pwd_strength, setRootPasswordStrength] = useState('');
    const [root_pwd_message, setRootPasswordMessage] = useState('');
    const [root_pwd_errors, setRootPasswordErrors] = useState({});

    const [user_pwd_strength, setUserPasswordStrength] = useState('');
    const [user_pwd_message, setUserPasswordMessage] = useState('');
    const [user_pwd_errors, setUserPasswordErrors] = useState({});

    useEffect(() => {
        if (rootPassword) {
            password_quality(rootPassword)
                    .then(strength => {
                        setRootPasswordErrors({});
                        setRootPasswordStrength(strength.value);
                        setRootPasswordMessage(strength.message || '');
                    })
                    .catch(ex => {
                        if (validationFailed !== undefined) {
                            const errors = {};
                            errors.password = (ex.message || ex.toString()).replace(/\n/g, " ");
                            setRootPasswordErrors(errors);
                        }
                        setRootPasswordStrength(0);
                        setRootPasswordMessage('');
                    });
        } else {
            setRootPasswordErrors({});
            setRootPasswordStrength('');
            setRootPasswordMessage('');
        }
    }, [rootPassword, validationFailed]);

    useEffect(() => {
        if (userPassword) {
            password_quality(userPassword)
                    .then(strength => {
                        setUserPasswordErrors({});
                        setUserPasswordStrength(strength.value);
                        setUserPasswordMessage(strength.message || '');
                    })
                    .catch(ex => {
                        if (validationFailed !== undefined) {
                            const errors = {};
                            errors.password = (ex.message || ex.toString()).replace(/\n/g, " ");
                            setUserPasswordErrors(errors);
                        }
                        setUserPasswordStrength(0);
                        setUserPasswordMessage('');
                    });
        } else {
            setUserPasswordErrors({});
            setUserPasswordStrength('');
            setUserPasswordMessage('');
        }
    }, [userPassword, validationFailed]);

    return (
        <>
            <PasswordFormFields initial_password={rootPassword}
                                password_label={_("Root password")}
                                password_strength={root_pwd_strength}
                                idPrefix="create-vm-dialog-root-password"
                                password_message={root_pwd_message}
                                password_label_info={rootPasswordLabelInfo}
                                error_password={root_pwd_errors.password}
                                change={(_, value) => onValueChanged('rootPassword', value)} />
            {showUserFields &&
            <>
                <FormGroup fieldId="user-login"
                           id="create-vm-dialog-user-login-group"
                           label={_("User login")}>
                    <TextInput id='user-login'
                               validated={validationFailed.userLogin ? "error" : "default"}
                               value={userLogin || ''}
                               onChange={(_, value) => onValueChanged('userLogin', value)} />
                    <FormHelper helperTextInvalid={validationFailed.userLogin} />
                </FormGroup>
                <PasswordFormFields initial_password={userPassword}
                                    password_label={_("User password")}
                                    password_strength={user_pwd_strength}
                                    idPrefix="create-vm-dialog-user-password"
                                    password_message={user_pwd_message}
                                    password_label_info={_("Leave the password blank if you do not wish to have a user account created")}
                                    error_password={validationFailed.userPassword ? validationFailed.userPassword : user_pwd_errors.password}
                                    change={(_, value) => onValueChanged('userPassword', value)} />
            </>}
        </>
    );
};

const CloudInitOptionsRow = ({
    onValueChanged,
    rootPassword,
    userLogin, userPassword,
    validationFailed,
}) => {
    return (
        <UsersConfigurationRow rootPassword={rootPassword}
                               rootPasswordLabelInfo={_("Leave the password blank if you do not wish to set a root password")}
                               showUserFields
                               userLogin={userLogin}
                               userPassword={userPassword}
                               validationFailed={validationFailed}
                               onValueChanged={onValueChanged} />
    );
};

const MemoryRow = ({ memorySize, memorySizeUnit, nodeMaxMemory, minimumMemory, onValueChanged, validationFailed }) => {
    let validationStateMemory = validationFailed.memory ? 'error' : 'default';
    let helperText = (
        nodeMaxMemory
            ? cockpit.format(
                _("$0 $1 available on host"),
                toReadableNumber(convertToUnit(nodeMaxMemory, units.KiB, memorySizeUnit)),
                memorySizeUnit
            )
            : ""
    );

    if (validationStateMemory != 'error' && minimumMemory && convertToUnit(memorySize, memorySizeUnit, units.B) < minimumMemory) {
        validationStateMemory = 'warning';
        helperText = (
            cockpit.format(
                _("The selected operating system has minimum memory requirement of $0 $1"),
                convertToUnit(minimumMemory, units.B, memorySizeUnit),
                memorySizeUnit)
        );
    }

    return (
        <>
            <FormGroup label={_("Memory")}
                       fieldId='memory-size' id='memory-group'>
                <InputGroup>
                    <TextInput id='memory-size' value={memorySize}
                               className="size-input"
                               onKeyPress={digitFilter}
                               onChange={(_, value) => onValueChanged('memorySize', Number(value))} />
                    <FormSelect id="memory-size-unit-select"
                                className="unit-select"
                                data-value={memorySizeUnit}
                                value={memorySizeUnit}
                                onChange={(_event, value) => onValueChanged('memorySizeUnit', value)}>
                        <FormSelectOption value={units.MiB.name} key={units.MiB.name}
                                          label={_("MiB")} />
                        <FormSelectOption value={units.GiB.name} key={units.GiB.name}
                                          label={_("GiB")} />
                    </FormSelect>
                </InputGroup>
                <FormHelper fieldId="memory-size"
                            variant={validationStateMemory}
                            helperTextInvalid={validationStateMemory == "error" && validationFailed.memory}
                            helperText={helperText} />
            </FormGroup>
        </>
    );
};

const StorageRow = ({ connectionName, allowNoDisk, storageSize, storageSizeUnit, onValueChanged, minimumStorage, storagePoolName, storagePools, storageVolume, vms, validationFailed, createMode }) => {
    const [isStorageOpen, setIsStorageOpen] = useState(false);

    let validationStateStorage = validationFailed.storage ? 'error' : 'default';
    const poolSpaceAvailable = getSpaceAvailable(storagePools, connectionName);
    let helperTextNewVolume = (
        poolSpaceAvailable
            ? cockpit.format(
                _("$0 $1 available at default location"),
                toReadableNumber(convertToUnit(poolSpaceAvailable, units.B, storageSizeUnit)),
                storageSizeUnit
            )
            : ""
    );

    if (validationStateStorage != 'error' && minimumStorage && convertToUnit(storageSize, storageSizeUnit, units.B) < minimumStorage) {
        validationStateStorage = 'warning';
        helperTextNewVolume = (
            cockpit.format(
                _("The selected operating system has minimum storage size requirement of $0 $1"),
                toReadableNumber(convertToUnit(minimumStorage, units.B, storageSizeUnit)),
                storageSizeUnit)
        );
    }

    let volumeEntries;
    let isVolumeUsed = {};
    // Existing storage pool is chosen
    if (storagePoolName !== "NewVolumeQCOW2" && storagePoolName !== "NewVolumeRAW" && storagePoolName !== "NoStorage") {
        const storagePool = storagePools.find(pool => pool.name === storagePoolName);

        isVolumeUsed = getStorageVolumesUsage(vms, storagePool);
        volumeEntries = (
            storagePool.volumes.map(vol => (<FormSelectOption value={vol.name}
                                                              label={vol.name}
                                                              key={vol.name} />))
        );
    }
    const helperTextVariant = createMode == NONE && (isVolumeUsed[storageVolume] && isVolumeUsed[storageVolume].length > 0) ? "warning" : "default";

    const StorageSelectOptions = [
        <SelectOption key="NewVolumeQCOW2" value="NewVolumeQCOW2">{_("Create new qcow2 volume")}</SelectOption>,
        <SelectOption key="NewVolumeRAW" value="NewVolumeRAW">{_("Create new raw volume")}</SelectOption>
    ];
    if (allowNoDisk) {
        StorageSelectOptions.push(<>
            <Divider key="dividerNoStorage" />
            <SelectOption value="NoStorage" key="NoStorage">{_("No storage")}</SelectOption>
        </>);
    }
    const nonEmptyStoragePools = storagePools.filter(pool => pool.volumes?.length);
    if (nonEmptyStoragePools.length > 0) {
        StorageSelectOptions.push(<>
            <Divider key="dividerPools" />
            <SelectGroup key="Storage pools" label={_("Storage pools")}>
                { nonEmptyStoragePools.map(pool => <SelectOption value={pool.name} key={pool.name} />) }
            </SelectGroup>
        </>);
    }
    return (
        <>
            <FormGroup label={_("Storage")} id="storage-select-group">
                <PFSelect
                    toggleId="storage-select"
                    selections={storagePoolName}
                    typeAheadAriaLabel={_("Choose an operating system")}
                    placeholderText={_("Choose an operating system")}
                    onSelect={(event, value) => {
                        setIsStorageOpen(false);
                        onValueChanged('storagePool', value);
                    }}
                    onToggle={(_event, isOpen) => setIsStorageOpen(isOpen)}
                    isOpen={isStorageOpen}
                    menuAppendTo="parent">
                    {StorageSelectOptions}
                </PFSelect>
            </FormGroup>

            { storagePoolName !== "NewVolumeQCOW2" &&
            storagePoolName !== "NewVolumeRAW" &&
            storagePoolName !== "NoStorage" &&
            <FormGroup label={_("Volume")}
                       fieldId="storage-volume-select">
                <FormSelect id="storage-volume-select"
                            value={storageVolume}
                            validated={helperTextVariant}
                            onChange={(_event, value) => onValueChanged('storageVolume', value)}>
                    {volumeEntries}
                </FormSelect>
                {helperTextVariant == "warning" &&
                <FormHelper
                    variant={helperTextVariant}
                    helperText={_("This volume is already used by another VM.")} />}
            </FormGroup>}

            { (storagePoolName === "NewVolumeQCOW2" || storagePoolName === "NewVolumeRAW") &&
            <>
                <FormGroup label={_("Storage limit")} fieldId='storage-limit'
                           id='storage-group'>
                    <InputGroup>
                        <TextInput id='storage-limit' value={storageSize}
                                   className="size-input"
                                   onKeyPress={digitFilter}
                                   onChange={(_, value) => onValueChanged('storageSize', Number(value))} />
                        <FormSelect id="storage-limit-unit-select"
                                    data-value={storageSizeUnit}
                                    className="unit-select"
                                    value={storageSizeUnit}
                                    onChange={(_event, value) => onValueChanged('storageSizeUnit', value)}>
                            <FormSelectOption value={units.MiB.name} key={units.MiB.name}
                                               label={_("MiB")} />
                            <FormSelectOption value={units.GiB.name} key={units.GiB.name}
                                               label={_("GiB")} />
                        </FormSelect>
                    </InputGroup>
                    <FormHelper
                        fieldId="storage-limit"
                        variant={validationStateStorage}
                        helperTextInvalid={validationStateStorage == "error" && validationFailed.storage}
                        helperText={helperTextNewVolume} />
                </FormGroup>
            </>}
        </>
    );
};

class CreateVmModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        let defaultSourceType;
        if (props.mode == 'create') {
            if (!props.downloadOSSupported)
                defaultSourceType = LOCAL_INSTALL_MEDIA_SOURCE;
            else
                defaultSourceType = DOWNLOAD_AN_OS;
        } else {
            defaultSourceType = EXISTING_DISK_IMAGE_SOURCE;
        }
        super(props);
        this.state = {
            createMode: NONE,
            activeTabKey: 0,
            validate: false,
            vmName: '',
            suggestedVmName: '',
            connectionName: LIBVIRT_SYSTEM_CONNECTION,
            sourceType: defaultSourceType,
            source: '',
            os: undefined,
            ...getMemoryDefaults(props.nodeMaxMemory),
            ...getStorageDefaults(),
            storagePool: 'NewVolumeQCOW2',
            storageVolume: '',
            startVm: true,

            // Unattended installation or cloud init options for cloud images
            profile: '',
            userPassword: '',
            rootPassword: '',
            userLogin: '',
            accessToken: '',
            offlineToken: '',
        };
        this.onCreateClicked = this.onCreateClicked.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.onOsAutodetect = debounce(250, (installMedia) => {
            this.setState({ autodetectOSInProgress: true });
            if (this.autodetectOSPromise)
                this.autodetectOSPromise.close("cancelled");

            this.autodetectOSPromise = autodetectOS(installMedia);
            this.autodetectOSPromise.then(resJSON => {
                const res = JSON.parse(resJSON.trim());
                const osEntry = this.props.osInfoList.filter(osEntry => osEntry.id == res.os);

                if (osEntry && osEntry[0]) {
                    this.onValueChanged('os', osEntry[0]);
                    this.onValueChanged('sourceMediaID', res.media);
                }
                this.setState({ autodetectOSInProgress: false });
                this.autodetectOSPromise = null;
            });
            this.autodetectOSPromise.catch(ex => {
                if (ex.problem == "cancelled")
                    return;

                this.setState({ autodetectOSInProgress: false });
                this.autodetectOSPromise = null;
                console.log("osinfo-detect command failed: ", ex.message);
            });
        });
    }

    handleTabClick = (event, tabIndex) => {
        // Prevent the form from being submitted.
        event.preventDefault();
        this.setState({
            activeTabKey: tabIndex,
        });
    };

    onValueChanged(key, value) {
        switch (key) {
        case 'vmName':
            this.setState({ [key]: value.split(" ").join("_") });
            break;
        case 'source':
            this.setState({ [key]: value });
            if ((this.state.sourceType == URL_SOURCE || this.state.sourceType == LOCAL_INSTALL_MEDIA_SOURCE) && value != '' && value != undefined)
                this.onOsAutodetect(value);
            break;
        case 'sourceType':
            this.setState({ [key]: value });
            if (value == PXE_SOURCE) {
                const { nodeDevices, networks } = store.getState();
                const initialPXESource = getPXEInitialNetworkSource(nodeDevices.filter(nodeDevice => nodeDevice.connectionName == this.state.connectionName),
                                                                    networks.filter(network => network.connectionName == this.state.connectionName));
                this.setState({ source: initialPXESource });
            } else if (this.state.sourceType == PXE_SOURCE && value != PXE_SOURCE) {
                // Reset the source when the previous selection was PXE;
                // all the other choices are string set by the user
                this.setState({ source: '' });
            }
            break;
        case 'storagePool': {
            const storagePool = store.getState().storagePools.filter(pool => pool.connectionName === this.state.connectionName).find(pool => pool.name === value);
            const storageVolumes = storagePool ? storagePool.volumes : undefined;
            const storageVolume = storageVolumes ? storageVolumes[0] : undefined;
            this.setState({
                [key]: value,
                storageVolume: storageVolume ? storageVolume.name : undefined,
            });
            break;
        }
        case 'storageVolume':
            this.setState({ [key]: value });
            break;
        case 'memorySize': {
            // virt-install doesn't allow memory, supplied in MiB, to be a float number
            // check if number is a integer, and if not, round up (ceil)
            const valueMiB = Math.ceil(convertToUnit(value, this.state.memorySizeUnit, units.MiB));
            value = convertToUnit(valueMiB, units.MiB, this.state.memorySizeUnit);

            this.setState({ [key]: value });
            break;
        }
        case 'memorySizeUnit':
            this.setState({ [key]: value });
            key = 'memorySize';
            value = convertToUnit(this.state.memorySize, this.state.memorySizeUnit, value);
            this.setState({ [key]: value });
            break;
        case 'storageSizeUnit':
            this.setState({ [key]: value });
            key = 'storageSize';
            value = convertToUnit(this.state.storageSize, this.state.storageSizeUnit, value);
            this.setState({ [key]: value });
            break;
        case 'connectionName':
            this.setState({ [key]: value });
            if (this.state.sourceType == PXE_SOURCE && value == LIBVIRT_SESSION_CONNECTION) {
                // When changing to session connection, reset media source
                this.onValueChanged('sourceType', LOCAL_INSTALL_MEDIA_SOURCE);
            }

            // specific storage pool is selected
            if (this.state.storagePool !== "NewVolumeQCOW2" && this.state.storagePool !== "NewVolumeRAW" && this.state.storagePool !== "NoStorage") {
                // storage pools are different for each connection, so we set storagePool value to default (newVolume)
                this.setState({ storagePool: "NewVolumeQCOW2" });
            }

            // For different connections the generated VM names might differ
            // try to regenerate it
            if (this.state.os)
                this.setState((prevState, prevProps) => ({ suggestedVmName: getVmName(value, prevProps.vms, prevState.os) }));

            break;
        case 'os': {
            const stateDelta = { [key]: value };

            if (value && value.profiles)
                stateDelta.profile = value.profiles.sort().reverse()[0];

            if (value && value.minimumResources.ram) {
                stateDelta.minimumMemory = value.minimumResources.ram;

                let bestUnit = getBestUnit(stateDelta.minimumMemory, units.B);
                if (bestUnit.base1024Exponent >= 4) bestUnit = units.GiB;
                if (bestUnit.base1024Exponent <= 1) bestUnit = units.MiB;
                const converted = convertToUnit(stateDelta.minimumMemory, units.B, bestUnit);
                this.setState({ memorySizeUnit: bestUnit.name }, () => this.onValueChanged("memorySize", converted));
            } else {
                this.setState((_, prevProps) => getMemoryDefaults(prevProps.nodeMaxMemory));
            }

            if (value && value.minimumResources.storage) {
                stateDelta.minimumStorage = value.minimumResources.storage;

                let bestUnit = getBestUnit(stateDelta.minimumStorage, units.B);
                if (bestUnit.base1024Exponent >= 4) bestUnit = units.GiB;
                if (bestUnit.base1024Exponent <= 1) bestUnit = units.MiB;
                const converted = convertToUnit(stateDelta.minimumStorage, units.B, bestUnit);
                this.setState({ storageSizeUnit: bestUnit.name }, () => this.onValueChanged("storageSize", converted));
            } else {
                this.setState(getStorageDefaults());
            }

            if (!value || !value.unattendedInstallable)
                this.onValueChanged('unattendedInstallation', false);

            // generate VM name based on OS if user selects an OS
            // clear generated VM name if they unselect an OS
            stateDelta.suggestedVmName = value ? getVmName(this.state.connectionName, this.props.vms, value) : "";

            this.setState(stateDelta);
            break;
        }
        default:
            this.setState({ [key]: value });
            break;
        }
    }

    onCreateClicked(startVm) {
        const Dialogs = this.context;
        const { onAddErrorNotification, osInfoList, nodeMaxMemory, vms, loggedUser } = this.props;
        const { storagePools } = store.getState();
        const vmName = isEmpty(this.state.vmName.trim()) ? this.state.suggestedVmName : this.state.vmName;

        const validation = validateParams({ ...this.state, osInfoList, nodeMaxMemory, vms: vms.filter(vm => vm.connectionName == this.state.connectionName) });
        if (Object.getOwnPropertyNames(validation).length > 0) {
            this.setState({ createMode: NONE, validate: true });
        } else {
            // leave dialog open to show immediate errors from the backend
            // close the dialog after VMS_CONFIG.LeaveCreateVmDialogVisibleAfterSubmit
            // then show errors in the notification area
            this.setState({ createMode: startVm ? RUN : EDIT, validate: false });

            const unattendedInstallation = !(this.state.sourceType === CLOUD_IMAGE) && (this.state.rootPassword || this.state.userLogin || this.state.userPassword);
            const vmParams = {
                connectionName: this.state.connectionName,
                vmName,
                source: this.state.source,
                sourceType: this.state.sourceType,
                os: this.state.os ? this.state.os.shortId : 'auto',
                osVersion: this.state.os && this.state.os.version,
                profile: this.state.profile,
                memorySize: convertToUnit(this.state.memorySize, this.state.memorySizeUnit, units.MiB),
                storageSize: convertToUnit(this.state.storageSize, this.state.storageSizeUnit, units.GiB),
                storagePool: this.state.storagePool,
                storageVolume: this.state.storageVolume,
                unattended: unattendedInstallation,
                userPassword: this.state.userPassword,
                rootPassword: this.state.rootPassword,
                userLogin: this.state.userLogin,
                startVm,
                accessToken: this.state.accessToken,
                loggedUser
            };

            domainCreate(vmParams).then(() => {
                if (this.state.storagePool === "NewVolumeQCOW2" || this.state.storagePool === "NewVolumeRAW") {
                    const storagePool = storagePools.find(pool => pool.connectionName === this.state.connectionName && pool.name === "default");
                    if (storagePool)
                        storagePoolRefresh({ connectionName: storagePool.connectionName, objPath: storagePool.id });
                }
            }, (exception) => {
                console.error(`spawn 'vm creation' returned error: "${JSON.stringify(exception)}"`);
                onAddErrorNotification({
                    text: cockpit.format(_("Creation of VM $0 failed"), vmParams.vmName),
                    detail: exception.message.split(/Traceback(.+)/)[0],
                });
            });

            Dialogs.close();

            if (!startVm) {
                cockpit.location.go(["vm"], {
                    ...cockpit.location.options,
                    name: vmName,
                    connection: this.state.connectionName
                });
            }
        }
    }

    render() {
        const Dialogs = this.context;
        const { nodeMaxMemory, osInfoList, loggedUser, vms } = this.props;
        const { storagePools, nodeDevices, networks } = store.getState();
        const validationFailed = this.state.validate && validateParams({ ...this.state, osInfoList, nodeMaxMemory, vms: vms.filter(vm => vm.connectionName == this.state.connectionName) });

        const unattendedInstructionsMessage = _("Enter root and/or user information to enable unattended installation.");
        const unattendedUnavailableMessage = _("Automated installs are only available when downloading an image or using cloud-init.");
        const unattendedOsUnsupportedMessageFormat = os => cockpit.format(_("$0 does not support unattended installation."), os);

        let unattendedDisabled = true;
        if ((this.state.sourceType == URL_SOURCE || this.state.sourceType == LOCAL_INSTALL_MEDIA_SOURCE) && this.state.os) {
            if (this.state.os.medias && this.state.sourceMediaID in this.state.os.medias)
                unattendedDisabled = !this.state.os.medias[this.state.sourceMediaID].unattendedInstallable;
            else
                unattendedDisabled = !this.state.os.unattendedInstallable;
        } else if (this.state.sourceType == DOWNLOAD_AN_OS) {
            unattendedDisabled = !this.state.os || !this.state.os.unattendedInstallable;
        }

        let automationTabTooltip;
        if (!((this.state.sourceType === CLOUD_IMAGE && this.props.cloudInitSupported) ||
            (this.state.os && this.state.sourceType === DOWNLOAD_AN_OS && this.props.unattendedSupported))) {
            automationTabTooltip = <Tooltip content={unattendedUnavailableMessage} />;
        } else if (this.state.os && this.state.sourceType === DOWNLOAD_AN_OS && this.props.unattendedSupported) {
            if (unattendedDisabled) {
                automationTabTooltip = <Tooltip content={unattendedOsUnsupportedMessageFormat(getOSStringRepresentation(this.state.os))} />;
            }
        }

        const detailsTab = (
            <>
                <MachinesConnectionSelector
                    id='connection'
                    connectionName={this.state.connectionName}
                    onValueChanged={this.onValueChanged}
                    loggedUser={loggedUser}
                    showInfoHelper />
                <SourceRow
                    connectionName={this.state.connectionName}
                    networks={networks.filter(network => network.connectionName == this.state.connectionName)}
                    nodeDevices={nodeDevices.filter(nodeDevice => nodeDevice.connectionName == this.state.connectionName)}
                    source={this.state.source}
                    sourceType={this.state.sourceType}
                    os={this.state.os}
                    offlineToken={this.state.offlineToken}
                    osInfoList={this.props.osInfoList}
                    cloudInitSupported={this.props.cloudInitSupported}
                    downloadOSSupported={this.props.downloadOSSupported}
                    onValueChanged={this.onValueChanged}
                    validationFailed={validationFailed} />

                {this.state.sourceType != DOWNLOAD_AN_OS &&
                <>
                    <OSRow
                        os={this.state.os}
                        osInfoList={this.props.osInfoList}
                        onValueChanged={this.onValueChanged}
                        isLoading={this.state.autodetectOSInProgress}
                        validationFailed={validationFailed} />

                </>}
                { this.state.sourceType != EXISTING_DISK_IMAGE_SOURCE &&
                <StorageRow
                    allowNoDisk={this.state.sourceType !== CLOUD_IMAGE}
                    connectionName={this.state.connectionName}
                    storageSize={this.state.storageSize}
                    storageSizeUnit={this.state.storageSizeUnit}
                    onValueChanged={this.onValueChanged}
                    storagePoolName={this.state.storagePool}
                    storagePools={storagePools.filter(pool => pool.connectionName === this.state.connectionName)}
                    storageVolume={this.state.storageVolume}
                    vms={vms}
                    minimumStorage={this.state.minimumStorage}
                    validationFailed={validationFailed}
                    createMode={this.state.createMode}
                />}

                <MemoryRow
                    memorySize={this.state.memorySize}
                    memorySizeUnit={this.state.memorySizeUnit}
                    nodeMaxMemory={nodeMaxMemory}
                    onValueChanged={this.onValueChanged}
                    validationFailed={validationFailed}
                    minimumMemory={this.state.minimumMemory}
                />
            </>
        );

        const automationTab = (
            <>
                {unattendedInstructionsMessage}
                {this.state.os && this.state.sourceType === DOWNLOAD_AN_OS && this.props.unattendedSupported &&
                <UnattendedRow
                    validationFailed={validationFailed}
                    rootPassword={this.state.rootPassword}
                    userLogin={this.state.userLogin}
                    userPassword={this.state.userPassword}
                    unattendedUserLogin={this.props.unattendedUserLogin}
                    os={this.state.os}
                    profile={this.state.profile}
                    onValueChanged={this.onValueChanged} />
                }
                {this.state.sourceType === CLOUD_IMAGE && this.props.cloudInitSupported &&
                <CloudInitOptionsRow validationFailed={validationFailed}
                                     rootPassword={this.state.rootPassword}
                                     userLogin={this.state.userLogin}
                                     userPassword={this.state.userPassword}
                                     onValueChanged={this.onValueChanged} />
                }
            </>
        );

        const dialogBody = (
            <Form isHorizontal>
                <NameRow
                    vmName={this.state.vmName}
                    suggestedVmName={this.state.suggestedVmName}
                    os={this.state.os}
                    onValueChanged={this.onValueChanged}
                    validationFailed={validationFailed} />
                { this.props.mode === "create"
                    ? <Tabs activeKey={this.state.activeTabKey} onSelect={this.handleTabClick}>
                        <Tab eventKey={0} title={<TabTitleText>{_("Details")}</TabTitleText>} id="details-tab" className="pf-v5-c-form">
                            {detailsTab}
                        </Tab>
                        <Tab eventKey={1}
                             title={<TabTitleText>{_("Automation")}</TabTitleText>}
                             id="automation"
                             className="pf-v5-c-form"
                             tooltip={automationTabTooltip}
                             isAriaDisabled={!!automationTabTooltip}>
                            {automationTab}
                        </Tab>
                    </Tabs>
                    : detailsTab }
            </Form>
        );

        const unattendedInstallation = this.state.rootPassword || this.state.userLogin || this.state.userPassword;
        // This happens if offlineToken was supplied and we are either still obtaining access token (validating offline token) or failed to obtain one
        const downloadingRhelDisabled = !isEmpty(this.state.offlineToken) && isEmpty(this.state.accessToken);
        let createAndEdit = (
            <Button variant="secondary"
                    key="secondary-button"
                    id="create-and-edit"
                    isLoading={this.state.createMode === EDIT}
                    isAriaDisabled={!!(
                        this.state.createMode === EDIT ||
                        Object.getOwnPropertyNames(validationFailed).length > 0 ||
                        (this.state.sourceType === DOWNLOAD_AN_OS && unattendedInstallation) ||
                        downloadingRhelDisabled
                    )}
                    onClick={() => this.onCreateClicked(false)}>
                {this.props.mode == 'create' ? _("Create and edit") : _("Import and edit")}
            </Button>
        );
        if (unattendedInstallation) {
            createAndEdit = (
                <Tooltip id='create-and-edit-disabled-tooltip'
                         content={_("Setting the user passwords for unattended installation requires starting the VM when creating it")}>
                    {createAndEdit}
                </Tooltip>
            );
        }

        return (
            <Modal position="top" variant="medium" id='create-vm-dialog' isOpen onClose={Dialogs.close}
                title={this.props.mode == 'create' ? _("Create new virtual machine") : _("Import a virtual machine")}
                actions={[
                    <Button variant="primary"
                            key="primary-button"
                            id="create-and-run"
                            isLoading={this.state.createMode === RUN}
                            isDisabled={
                                this.state.createMode === RUN ||
                                Object.getOwnPropertyNames(validationFailed).length > 0 ||
                                downloadingRhelDisabled
                            }
                            onClick={() => this.onCreateClicked(true)}>
                        {this.props.mode == 'create' ? _("Create and run") : _("Import and run")}
                    </Button>,
                    createAndEdit,
                    <Button variant='link'
                            key="cancel-button"
                            onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                ]}>
                {dialogBody}
            </Modal>
        );
    }
}

export class CreateVmAction extends React.Component {
    static contextType = DialogsContext;

    render() {
        const Dialogs = this.context;

        if (this.props.systemInfo.osInfoList == null)
            return null;

        const open = () => {
            // The initial resources fetching contains only ID - this will be immediately
            // replaced with the whole resource object but there is enough time to cause a crash if parsed here
            Dialogs.show(<CreateVmModal mode={this.props.mode}
                                        nodeMaxMemory={this.props.nodeMaxMemory}
                                        vms={this.props.vms}
                                        osInfoList={this.props.systemInfo.osInfoList}
                                        onAddErrorNotification={this.props.onAddErrorNotification}
                                        cloudInitSupported={this.props.cloudInitSupported}
                                        downloadOSSupported={this.props.downloadOSSupported}
                                        unattendedSupported={this.props.unattendedSupported}
                                        unattendedUserLogin={this.props.unattendedUserLogin}
                                        loggedUser={this.props.systemInfo.loggedUser} />);
        };

        let testdata;
        if (!this.props.systemInfo.osInfoList)
            testdata = "disabledOsInfo";
        else if (!this.props.virtInstallAvailable)
            testdata = "disabledVirtInstall";
        else if (this.props.downloadOSSupported === undefined || this.props.unattendedSupported === undefined)
            testdata = "disabledCheckingFeatures";
        let createButton = (
            <Button isDisabled={testdata !== undefined}
                    testdata={testdata}
                    id={this.props.mode == 'create' ? 'create-new-vm' : 'import-existing-vm'}
                    variant='secondary'
                    onClick={open}>
                {this.props.mode == 'create' ? _("Create VM") : _("Import VM")}
            </Button>
        );
        if (!this.props.virtInstallAvailable)
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
                <Tooltip id={this.props.mode + '-button-tooltip'}
                         position={this.props.mode === "create" ? "top-end" : "top"}
                         className={this.props.mode === "create" && "custom-arrow"}
                         content={this.props.mode === "create"
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
    }
}

CreateVmAction.propTypes = {
    mode: PropTypes.string.isRequired,
    nodeMaxMemory: PropTypes.number,
    onAddErrorNotification: PropTypes.func.isRequired,
    systemInfo: PropTypes.object.isRequired,
};
