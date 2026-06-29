/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useState, useMemo, useId } from 'react';

import type { ConnectionName, VM, StoragePool, OSInfo } from '../../types';

import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
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
import { getAccessToken } from '../../libvirtApi/rhel-images.js';
import { appState } from '../../state';

import {
    DialogField,
    DialogHelperText,
    DialogTextInput, OptionalFormGroup,
    DialogDropdownSelect, DialogDropdownSelectObject,
} from 'cockpit/dialog';

import {
    FileAutoComplete,
} from "../common/dialog";

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

function getSpaceAvailable(storagePools: StoragePool[], connectionName: ConnectionName): number | undefined {
    let space = getPoolSpaceAvailable({ storagePools, poolName: "default", connectionName });

    if (!space) {
        let poolPath;
        if (connectionName === LIBVIRT_SYSTEM_CONNECTION)
            poolPath = "/var/lib/libvirt/images";
        else {
            cockpit.assert(appState.loggedUser);
            poolPath = appState.loggedUser.home + "/.local/share/libvirt/images";
        }

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

const Source = ({
    field,
    connectionName,
    osInfoList,
    osChanged,
} : {
    field: DialogField<SourceValue>,
    connectionName: ConnectionName,
    osInfoList: OSInfo[],
    osChanged: (os: OSInfo | null) => void,
}) => {
    const [autodetectOSInProgress, setAutodetectOSInProgress] = useState(false);
    const { type, os, source } = field.get();

    const os_field = field.sub("os", osChanged);

    function type_changed(new_type: string) {
        if (new_type == PXE_SOURCE) {
            const source = getPXEInitialNetworkSource(
                appState.nodeDevices.filter(nodeDevice => nodeDevice.connectionName == connectionName),
                appState.networks.filter(network => network.connectionName == connectionName));
            field.sub("source").set(source || "");
        } else if (type == PXE_SOURCE) {
            field.sub("source").set("");
        }
    }

    function source_changed() {
        field.sub("source").get_async(async (installMedia, signal) => {
            if (!installMedia || installMedia.endsWith("/"))
                return;

            setAutodetectOSInProgress(true);
            try {
                const resJSON = await autodetectOS(installMedia, signal);
                const res = JSON.parse(resJSON);
                const osEntry = osInfoList.filter(osEntry => osEntry.id == res.os);

                if (!signal.aborted && osEntry && osEntry[0]) {
                    os_field.set(osEntry[0]);
                    if (typeof res.media == "string")
                        field.sub("mediaId").set(res.media);
                }
            } catch (ex) {
                console.log("osinfo-detect command failed: ", String(ex));
            }
            setAutodetectOSInProgress(false);
        });
    }

    const source_field = field.sub("source", source_changed);

    let installationSource;
    let installationSourceWarning;
    switch (type) {
    case DOWNLOAD_AN_OS:
        installationSource = (
            <>
                <OSRow
                    field={os_field}
                    osInfoList={osInfoList.filter(isDownloadableOs)}
                    isLoading={false}
                />
                {
                    os && needsRHToken(os.shortId) &&
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
                field={source_field}
                placeholder={_("Path to ISO file on host's file system")}
            />
        );
        break;

    case CLOUD_IMAGE:
        installationSource = (
            <FileAutoComplete
                label={_("Installation source")}
                field={source_field}
                placeholder={_("Path to cloud image file on host's file system")}
            />
        );
        break;

    case EXISTING_DISK_IMAGE_SOURCE:
        installationSource = (
            <FileAutoComplete
                label={_("Disk image")}
                field={source_field}
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
                field={source_field}
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
                    field={field.sub("type", type_changed)}
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
                    field={os_field}
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
            data-ouia-component-id={field.ouia_id()}
        >
            <TypeaheadSelect
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
    const id = useId();

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

    const offlineTokenChanged = (offlineToken: string) => {
        if (isEmpty(offlineToken)) {
            accessField.set("");
            setValidationState(validationStates.DEFAULT);
        } else {
            offlineField.get_async(async (val, signal) => {
                setValidationState(validationStates.INPROGRESS);
                try {
                    const out = await getAccessToken(val);
                    if (!signal.aborted) {
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
            fieldId={id}
        >
            <TextArea
                id={id}
                data-ouia-component-id={offlineField.ouia_id()}
                validated={offlineField.validation_text() ? "error" : validationState.option}
                disabled={disabled}
                minLength={1}
                value={offlineField.get()}
                onChange={(_, value) => offlineField.notify(offlineTokenChanged).set_debounced(value)}
                rows={4}
            />
            <DialogHelperText field={offlineField} explanation={validationState.message} />
        </FormGroup>
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
    const id = useId();

    function unit_changed(newUnit: string) {
        field.sub("size").set(String(convertToUnit(size, unit, newUnit)));
    }

    return (
        <OptionalFormGroup
            label={label}
            fieldId={id}
        >
            <InputGroup>
                <DialogTextInput
                    id={id}
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
                    toggleProps={{ ouiaId: field.ouia_id() }}
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

export interface DetailsValue {
    connectionName: ConnectionName,
    suggestedName: string,
    source: SourceValue,
    memory: SizeValue,
    storage: StorageValue,
}

export function init_Details(
    initialSourceType: string,
    initialSource: string,
    initialOS: string,
    osInfoList: OSInfo[]
): DetailsValue {
    const connectionName = appState.systemSocketInactive ? "session" : "system";

    return {
        connectionName,
        suggestedName: "",
        source: init_Source(initialSourceType, initialSource, initialOS, osInfoList),
        memory: init_Memory(),
        storage: init_Storage(connectionName),
    };
}

export function validate_Details(field: DialogField<DetailsValue>) {
    validate_Source(field.sub("source"));
    validate_Storage(field.sub("storage"));
    validate_Memory(field.sub("memory"));
}

export const Details = ({
    field,
    osInfoList,
} : {
    field: DialogField<DetailsValue>,
    osInfoList: OSInfo[],
}) => {
    const sub_connectionName = field.sub("connectionName");

    function osChanged(os: OSInfo | null) {
        if (os) {
            field.sub("suggestedName").set(getVmName(sub_connectionName.get(), appState.vms, os));
            field.sub("memory").set(init_Memory(os.minimumResources.ram));
            update_Storage(field.sub("storage"), os.minimumResources.storage || 0);
        } else {
            field.sub("suggestedName").set("");
            field.sub("memory").set(init_Memory());
            field.sub("storage").set(init_Storage(sub_connectionName.get()));
        }
    }

    const sourceType = field.get().source.type;

    return (
        <>
            <MachinesConnectionSelector
                ouiaId={sub_connectionName.ouia_id()}
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
                        field.sub("suggestedName").set(getVmName(sub_connectionName.get(), appState.vms, os));
                }}
                showInfoHelper
                isReadonly={appState.systemSocketInactive}
            />
            <Source
                field={field.sub("source")}
                connectionName={sub_connectionName.get()}
                osInfoList={osInfoList}
                osChanged={osChanged}
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
