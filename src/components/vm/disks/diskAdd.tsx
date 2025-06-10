/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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

import type { optString, VM, VMDisk, VMDiskDevice, StoragePool, StorageVolume } from '../../../types';
import type {
    DialogValues as VolumeCreateBodyDialogValues,
    ValidationFailed as VolumeCreateBodyValidationFailed,
} from '../../storagePools/storageVolumeCreateBody';

import React, { useMemo, useState, useEffect } from 'react';
import { Bullseye } from "@patternfly/react-core/dist/esm/layouts/Bullseye";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form, FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import cockpit from 'cockpit';
import { useDialogs } from 'dialogs.jsx';
import { FormHelper } from 'cockpit-components-form-helper.jsx';

import { FileAutoComplete } from 'cockpit-components-file-autocomplete.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { diskBusTypes, diskCacheModes, units, convertToUnit, getDefaultVolumeFormat, getNextAvailableTarget, getStorageVolumesUsage, getVmStoragePools } from '../../../helpers.js';
import { VolumeCreateBody } from '../../storagePools/storageVolumeCreateBody.jsx';
import { domainAttachDisk, domainGet, domainInsertDisk, domainIsRunning } from '../../../libvirtApi/domain.js';
import { storagePoolGetAll } from '../../../libvirtApi/storagePool.js';
import { storageVolumeCreateAndAttach } from '../../../libvirtApi/storageVolume.js';

const _ = cockpit.gettext;

const CREATE_NEW = 'create-new';
const USE_EXISTING = 'use-existing';
const CUSTOM_PATH = 'custom-path';

const poolTypesNotSupportingVolumeCreation = ['iscsi', 'iscsi-direct', 'gluster', 'mpath'];

function clearSerial(serial: string): string {
    return serial.replace(' ', '_').replace(/([^A-Za-z0-9_.+-]+)/gi, '');
}

function getFilteredVolumes(vmStoragePool: StoragePool, disks: Record<string, VMDisk>): StorageVolume[] {
    const usedDiskPaths = Object.getOwnPropertyNames(disks)
            .filter(target => disks[target].source && (disks[target].source.file || disks[target].source.volume))
            .map(target => (disks[target].source && (disks[target].source.file || disks[target].source.volume)));

    const filteredVolumes = (vmStoragePool.volumes || []).filter(volume => !usedDiskPaths.includes(volume.path) && !usedDiskPaths.includes(volume.name));

    const filteredVolumesSorted = filteredVolumes.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });

    return filteredVolumesSorted;
}

function getDiskUsageMessage(vms: VM[], storagePool: StoragePool, volumeName: string) {
    const isVolumeUsed = getStorageVolumesUsage(vms, storagePool);

    if (!isVolumeUsed[volumeName] || (isVolumeUsed[volumeName].length === 0))
        return null;

    const vmsUsing = isVolumeUsed[volumeName].join(', ');
    return cockpit.format(_("This volume is already used by $0."), vmsUsing);
}

function getDefaultVolumeName(vmStoragePool: StoragePool, vm: VM) {
    const filteredVolumes = getFilteredVolumes(vmStoragePool, vm.disks);
    return filteredVolumes[0] && filteredVolumes[0].name;
}

interface DialogValues extends VolumeCreateBodyDialogValues {
    existingVolumeName?: string | undefined;
    permanent: boolean;
    storagePoolName?: string;
    serial: string;
    cacheMode: string;
    busType?: string | undefined;
    file: string;
    device: VMDiskDevice;
    storagePool?: StoragePool | undefined;
    target?: string | undefined;
}

interface ValidationFailed extends VolumeCreateBodyValidationFailed {
    storagePool?: string;
    serial?: string;
    customPath?: string | null;
    existingVolumeName?: string;
}

type OnValueChanged = <K extends keyof DialogValues>(key: K, value: DialogValues[K]) => void;

const SelectExistingVolume = ({
    idPrefix,
    storagePoolName,
    existingVolumeName,
    onValueChanged,
    vmStoragePools,
    vmDisks,
    vms
} : {
    idPrefix: string,
    storagePoolName: string | undefined,
    existingVolumeName: string | undefined,
    onValueChanged: OnValueChanged,
    vmStoragePools: StoragePool[],
    vmDisks: Record<string, VMDisk>,
    vms: VM[],
}) => {
    const vmStoragePool = vmStoragePools.find(pool => pool.name == storagePoolName);
    if (!vmStoragePool)
        return null;

    const filteredVolumes = getFilteredVolumes(vmStoragePool, vmDisks);

    let initiallySelected;
    let content;
    if (filteredVolumes.length > 0) {
        content = filteredVolumes.map(volume => {
            return (
                <FormSelectOption value={volume.name} key={volume.name}
                                  label={volume.name} />
            );
        });
        initiallySelected = existingVolumeName;
    } else {
        content = (
            <FormSelectOption value="empty" key="empty-list"
                              label={_("The pool is empty")} />
        );
        initiallySelected = "empty";
    }

    const diskUsageMessage = existingVolumeName && getDiskUsageMessage(vms, vmStoragePool, existingVolumeName);
    return (
        <FormGroup fieldId={`${idPrefix}-select-volume`}
                   label={_("Volume")}>
            <FormSelect id={`${idPrefix}-select-volume`}
                        onChange={(_event, value) => onValueChanged('existingVolumeName', value)}
                        value={initiallySelected}
                        validated={diskUsageMessage ? "warning" : undefined}
                        isDisabled={!filteredVolumes.length}>
                {content}
            </FormSelect>
            <FormHelper fieldId={`${idPrefix}-select-volume`} variant="warning" helperText={diskUsageMessage} />
        </FormGroup>
    );
};

const PermanentChange = ({
    idPrefix,
    onValueChanged,
    permanent,
    vm
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    permanent: boolean,
    vm: VM,
}) => {
    // By default for a running VM, the disk is attached until shut down only. Enable permanent change of the domain.xml
    if (!domainIsRunning(vm.state)) {
        return null;
    }

    return (
        <FormGroup fieldId={`${idPrefix}-permanent`} label={_("Persistence")} hasNoPaddingTop>
            <Checkbox id={`${idPrefix}-permanent`}
                      isChecked={permanent}
                      label={_("Always attach")}
                      onChange={(_event, checked) => onValueChanged('permanent', checked)} />
        </FormGroup>
    );
};

const PoolRow = ({
    idPrefix,
    onValueChanged,
    storagePoolName,
    validationFailed,
    vmStoragePools
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    storagePoolName: string | undefined,
    validationFailed: ValidationFailed,
    vmStoragePools: (StoragePool & { disabled?: boolean })[],
}) => {
    const validationStatePool = validationFailed.storagePool ? 'error' : 'default';

    return (
        <FormGroup fieldId={`${idPrefix}-select-pool`}
                   label={_("Pool")}>
            <FormSelect id={`${idPrefix}-select-pool`}
                           isDisabled={!vmStoragePools.length}
                           onChange={(_event, value) => onValueChanged('storagePoolName', value)}
                           validated={validationStatePool}
                           value={storagePoolName || 'no-resource'}>
                {vmStoragePools.length > 0
                    ? vmStoragePools
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(pool => {
                                return (
                                    <FormSelectOption isDisabled={!!pool.disabled} value={pool.name} key={pool.name}
                                                  label={pool.name} />
                                );
                            })
                    : [<FormSelectOption value='no-resource' key='no-resource'
                                         label={_("No storage pools available")} />]}
            </FormSelect>
            <FormHelper fieldId={`${idPrefix}-select-pool`} helperTextInvalid={validationFailed.storagePool} />
        </FormGroup>
    );
};

const AdditionalOptions = ({
    cacheMode,
    device,
    idPrefix,
    onValueChanged,
    busType,
    serial,
    validationFailed,
    supportedDiskBusTypes
} : {
    cacheMode: string,
    device: VMDiskDevice,
    idPrefix: string,
    onValueChanged: OnValueChanged,
    busType: string | undefined,
    serial: string,
    validationFailed: ValidationFailed,
    supportedDiskBusTypes: string[],
}) => {
    const [expanded, setExpanded] = useState(false);
    const [showAllowedCharactersMessage, setShowAllowedCharactersMessage] = useState(false);
    const [showMaxLengthMessage, setShowMaxLengthMessage] = useState(false);
    const [truncatedSerial, setTruncatedSerial] = useState("");

    // Many disk types have serial length limitations.
    // libvirt docs: "IDE/SATA devices are commonly limited to 20 characters. SCSI devices depending on hypervisor version are limited to 20, 36 or 247 characters."
    // https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms
    const serialLength = busType === "scsi" ? 36 : 20;

    useEffect(() => {
        const clearedSerial = clearSerial(serial);

        if (serial !== clearedSerial) {
            // Show the message once triggered and leave it around as reminder
            setShowAllowedCharactersMessage(true);
            onValueChanged('serial', clearedSerial);
        }
        if (clearedSerial.length > serialLength) {
            setShowMaxLengthMessage(true);
            setTruncatedSerial(clearedSerial.substring(0, serialLength));
        } else {
            setShowMaxLengthMessage(false);
        }
    }, [onValueChanged, serial, serialLength, busType]);

    const displayBusTypes: { value: string, disabled?: boolean }[] = diskBusTypes[device]
            .filter(bus => supportedDiskBusTypes.includes(bus))
            .map(type => ({ value: type }));
    if (!displayBusTypes.find(displayBusType => busType === displayBusType.value))
        displayBusTypes.push({ value: busType || "", disabled: true });

    return (
        <ExpandableSection toggleText={ expanded ? _("Hide additional options") : _("Show additional options")}
                           onToggle={() => setExpanded(!expanded)} isExpanded={expanded} className="pf-v6-u-pt-lg">
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <Grid hasGutter md={6}>
                    <FormGroup fieldId='cache-mode' label={_("Cache")}>
                        <FormSelect id='cache-mode'
                            onChange={(_event, value) => onValueChanged('cacheMode', value)}
                            value={cacheMode}>
                            {diskCacheModes.map(cacheMode =>
                                (<FormSelectOption value={cacheMode} key={cacheMode}
                                                  label={cacheMode} />)
                            )}
                        </FormSelect>
                    </FormGroup>

                    <FormGroup fieldId={idPrefix + '-bus-type'} label={_("Bus")}>
                        <FormSelect id={idPrefix + '-bus-type'}
                            data-value={busType}
                            onChange={(_event, value) => onValueChanged('busType', value)}
                            value={busType}>
                            {displayBusTypes.map(busType =>
                                (<FormSelectOption value={busType.value}
                                                  key={busType.value}
                                                  isDisabled={!!busType.disabled}
                                                  label={busType.value} />)
                            )}
                        </FormSelect>
                    </FormGroup>
                </Grid>
                <FormGroup fieldId={idPrefix + "-serial"}
                    label={_("Disk identifier")}>
                    <TextInput id={idPrefix + "-serial"}
                        aria-label={_("serial number")}
                        className="ct-monospace"
                        value={serial}
                        onChange={(_, value) => onValueChanged("serial", value)} />
                    <FormHelperText>
                        {validationFailed.serial
                            ? <HelperText>
                                <HelperTextItem variant="error">
                                    {validationFailed.serial}
                                </HelperTextItem>
                            </HelperText>
                            : <HelperText component="ul">
                                { showAllowedCharactersMessage &&
                                <HelperTextItem id="serial-characters-message" key="regex" variant="indeterminate">
                                    {_("Allowed characters: basic Latin alphabet, numbers, and limited punctuation (-, _, +, .)")}
                                </HelperTextItem>
                                }
                                { showMaxLengthMessage &&
                                <HelperTextItem id="serial-length-message" key="length" variant="warning">
                                    {cockpit.format(_("Identifier may be silently truncated to $0 characters "), serialLength)}
                                    <span className="ct-monospace">{`(${truncatedSerial})`}</span>
                                </HelperTextItem>
                                }
                            </HelperText>
                        }
                    </FormHelperText>
                </FormGroup>
            </Form>
        </ExpandableSection>
    );
};

const CreateNewDisk = ({
    format,
    idPrefix,
    onValueChanged,
    size,
    storagePoolName,
    unit,
    validationFailed,
    vmStoragePools,
    volumeName,
} : {
    format: optString,
    idPrefix: string,
    onValueChanged: OnValueChanged,
    size: number,
    storagePoolName: string | undefined,
    unit: string,
    validationFailed: ValidationFailed,
    vmStoragePools: StoragePool[],
    volumeName: string,
}) => {
    const storagePool = vmStoragePools.find(pool => pool.name == storagePoolName);

    return (
        <>
            <PoolRow idPrefix={idPrefix}
                     storagePoolName={storagePoolName}
                     validationFailed={validationFailed}
                     onValueChanged={onValueChanged}
                     vmStoragePools={vmStoragePools.map(pool => ({ ...pool, disabled: poolTypesNotSupportingVolumeCreation.includes(pool.type) }))} />
            {storagePool &&
            <VolumeCreateBody format={format}
                              size={size}
                              storagePool={storagePool}
                              unit={unit}
                              validationFailed={validationFailed}
                              volumeName={volumeName}
                              idPrefix={idPrefix}
                              onValueChanged={(key: keyof VolumeCreateBodyDialogValues, value) => onValueChanged(key, value)} />}
        </>
    );
};

const UseExistingDisk = ({
    existingVolumeName,
    idPrefix,
    onValueChanged,
    storagePoolName,
    validationFailed,
    vm,
    vmStoragePools,
    vms,
} : {
    existingVolumeName: string | undefined,
    idPrefix: string,
    onValueChanged: OnValueChanged,
    storagePoolName: string | undefined,
    validationFailed: ValidationFailed,
    vm: VM,
    vmStoragePools: StoragePool[],
    vms: VM[],
}) => {
    return (
        <>
            <PoolRow idPrefix={idPrefix}
                     storagePoolName={storagePoolName}
                     validationFailed={validationFailed}
                     onValueChanged={onValueChanged}
                     vmStoragePools={vmStoragePools} />
            {vmStoragePools.length > 0 &&
                <SelectExistingVolume idPrefix={idPrefix}
                                      vms={vms}
                                      storagePoolName={storagePoolName}
                                      existingVolumeName={existingVolumeName}
                                      onValueChanged={onValueChanged}
                                      vmStoragePools={vmStoragePools}
                                      vmDisks={vm.disks} />}
        </>
    );
};

const CustomPath = ({
    idPrefix,
    onValueChanged,
    device,
    validationFailed,
    hideDeviceRow
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    device?: string,
    validationFailed: ValidationFailed,
    hideDeviceRow?: boolean,
}) => {
    return (
        <>
            <FormGroup
                id={`${idPrefix}-file`}
                fieldId={`${idPrefix}-file-autocomplete`}
                label={_("Custom path")}>
                <FileAutoComplete
                    id={`${idPrefix}-file-autocomplete`}
                    placeholder={_("Path to file on host's file system")}
                    onChange={(value: string) => onValueChanged("file", value)}
                    superuser="try" />
                <FormHelper fieldId={`${idPrefix}-file-autocomplete`} helperTextInvalid={validationFailed.customPath} />
            </FormGroup>
            {!hideDeviceRow && <FormGroup label={_("Device")}>
                <FormSelect id={`${idPrefix}-select-device`}
                        onChange={(_event, value) => {
                            cockpit.assert(value == "disk" || value == "cdrom");
                            onValueChanged('device', value);
                        }}
                        value={device}>
                    <FormSelectOption value="disk" key="disk"
                                  label={_("Disk image file")} />
                    <FormSelectOption value="cdrom" key="cdrom"
                                  label={_("CD/DVD disc")} />
                </FormSelect>
            </FormGroup>}
        </>
    );
};

const sortFunction = (poolA: StoragePool, poolB: StoragePool) => poolA.name.localeCompare(poolB.name);

export const AddDiskModalBody = ({
    disk,
    idPrefix,
    isMediaInsertion,
    vm,
    vms,
    supportedDiskBusTypes
} : {
    disk?: VMDisk,
    idPrefix: string,
    isMediaInsertion?: boolean,
    vm: VM,
    vms: VM[],
    supportedDiskBusTypes: string[],
}) => {
    const [customDiskVerificationFailed, setCustomDiskVerificationFailed] = useState(false);
    const [customDiskVerificationMessage, setCustomDiskVerificationMessage] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [dialogErrorDetail, setDialogErrorDetail] = useState<string | null>(null);
    const [diskParams, setDiskParams] = useState<DialogValues>({
        cacheMode: 'default',
        device: "disk",
        file: "",
        format: undefined,
        serial: "",
        size: 1,
        unit: units.GiB.name,
        volumeName: "",
        permanent: vm.persistent,
    });
    const [mode, setMode] = useState(isMediaInsertion ? CUSTOM_PATH : CREATE_NEW);
    const [validate, setValidate] = useState(false);
    const [verificationInProgress, setVerificationInProgress] = useState(false);
    const [storagePools, setStoragePools] = useState<StoragePool[] | undefined>();

    const Dialogs = useDialogs();

    const defaultPool = useMemo(() => storagePools?.[0], [storagePools]);

    // VM params that should be refreshed when VM, storage Pools or mode changes
    const initialDiskParams = useMemo(() => ({
        connectionName: vm.connectionName,
        existingVolumeName: defaultPool && getDefaultVolumeName(defaultPool, vm),
        storagePool: defaultPool,
        type: mode === CUSTOM_PATH ? "file" : "volume",
    }), [defaultPool, mode, vm]);
    const storagePoolName = diskParams.storagePool?.name;

    const getPoolFormatAndDevice = (pool: StoragePool, volName: optString | false) => {
        const params: Pick<DialogValues, "format" | "device"> = {
            format: getDefaultVolumeFormat(pool),
            device: "disk"
        };
        if (volName && ['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(pool.type) > -1) {
            const volume = (pool.volumes || []).find(vol => vol.name === volName);
            if (volume?.format) {
                params.format = volume.format;
                if (volume.format === "iso")
                    params.device = "cdrom";
            }
        }
        return params;
    };

    useEffect(() => {
        // Refresh storage volume list before displaying the dialog.
        // There are recently no Libvirt events for storage volumes and polling is ugly.
        // https://bugzilla.redhat.com/show_bug.cgi?id=1578836
        storagePoolGetAll({ connectionName: vm.connectionName })
                .finally(() => setStoragePools(getVmStoragePools(vm.connectionName).sort(sortFunction)))
                .catch(exc => dialogErrorSet(_("Storage pools could not be fetched"), exc.message));
    }, [vm.connectionName]);

    useEffect(() => {
        // Reset dialog form when changing mode or if storage pools list changed
        setDiskParams(diskParams => ({
            ...diskParams,
            ...initialDiskParams,
        }));
    }, [initialDiskParams]);

    useEffect(() => {
        // Follow up state updates after 'existingVolumeName' is changed
        if (!diskParams.storagePool) {
            // if storage pool detection finished, and there are no pools, mark format detection as initialized
            if (storagePools !== undefined && storagePools.length === 0)
                setDiskParams(diskParams => ({ ...diskParams, format: null }));
            return;
        }

        setDiskParams(diskParams => ({
            ...diskParams,
            ...getPoolFormatAndDevice(diskParams.storagePool!, mode == USE_EXISTING && diskParams.existingVolumeName),
        }));
    }, [storagePools, diskParams.storagePool, diskParams.existingVolumeName, mode]);

    useEffect(() => {
        // Initial state settings and follow up state updates after 'device' is changed

        // According to https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms (section about 'target'),
        // scsi is the default option for libvirt for cdrom devices
        let newBus: optString = diskParams.device === "cdrom" ? "scsi" : null;

        if (!newBus) {
            // If disk with the same device exists, use the same bus too
            for (const disk of Object.values(vm.disks)) {
                if (disk.device === diskParams.device) {
                    newBus = disk.bus;
                    break;
                }
            }
            newBus = newBus || "virtio";
        }

        setDiskParams(diskParams => ({ ...diskParams, busType: newBus }));
    }, [diskParams.device, vm.disks]);

    useEffect(() => {
        // Initial state settings and follow up state updates after 'busType' is changed
        const existingTargets = Object.getOwnPropertyNames(vm.disks);
        const availableTarget = isMediaInsertion ? disk?.target : getNextAvailableTarget(existingTargets, diskParams.busType || "");
        setDiskParams(diskParams => ({ ...diskParams, target: availableTarget }));
    }, [vm.disks, disk?.target, diskParams.busType, isMediaInsertion]);

    useEffect(() => {
        const file = diskParams.file;

        if (file?.endsWith(".iso")) {
            setDiskParams(diskParams => ({ ...diskParams, device: "cdrom" }));
        }

        if (file) {
            setVerificationInProgress(true);
            cockpit.spawn(["head", "--bytes=16", file], { binary: true, err: "message", superuser: "try" })
                    .then(file_header => {
                        let format;

                        // https://git.qemu.org/?p=qemu.git;a=blob;f=docs/interop/qcow2.txt
                        if (file_header[0] == 81 && file_header[1] == 70 &&
                            file_header[2] == 73 && file_header[3] == 251) {
                            format = "qcow2";
                            // All zeros, no backing file offset
                            if (file_header.slice(8).every(bytes => bytes === 0)) {
                                setCustomDiskVerificationFailed(false);
                            } else {
                                setCustomDiskVerificationFailed(true);
                                setCustomDiskVerificationMessage(_("Importing an image with a backing file is unsupported"));
                            }
                        } else {
                            format = "raw";
                            setCustomDiskVerificationFailed(false);
                        }
                        setDiskParams(diskParams => ({ ...diskParams, format }));
                        setVerificationInProgress(false);
                    })
                    .catch(e => {
                        setVerificationInProgress(false);
                        setDiskParams(diskParams => ({ ...diskParams, format: "raw" }));
                        console.warn("could not execute head --bytes=16", e.toString());
                    });
        } else {
            setCustomDiskVerificationFailed(false);
        }
    }, [diskParams.file]);

    const onValueChanged = <K extends keyof DialogValues>(key: K, value: DialogValues[K]): void => {
        switch (key) {
        case 'storagePoolName': {
            const currentPool = (storagePools || []).find(pool => pool.name === value && pool.connectionName === vm.connectionName);
            if (!currentPool)
                break;

            const existingVolumeName = getDefaultVolumeName(currentPool, vm);

            setDiskParams(diskParams => ({
                ...diskParams,
                storagePool: currentPool,
                existingVolumeName,
                ...getPoolFormatAndDevice(currentPool, mode == USE_EXISTING && existingVolumeName),
            }));
            break;
        }
        default:
            setDiskParams(diskParams => ({ ...diskParams, [key]: value }));
        }
    };

    const dialogErrorSet = (text: string, detail: string) => {
        setDialogError(text);
        setDialogErrorDetail(detail);
    };

    const _validationFailed = useMemo(() => {
        const validateParams = () => {
            const validationFailed: ValidationFailed = {};
            const storagePoolType = diskParams.storagePool?.type;

            if (mode !== CUSTOM_PATH && !storagePoolName)
                validationFailed.storagePool = _("Please choose a storage pool");

            if (mode === CUSTOM_PATH && customDiskVerificationFailed)
                validationFailed.customPath = customDiskVerificationMessage;

            if (mode === CREATE_NEW) {
                if (!diskParams.volumeName) {
                    validationFailed.volumeName = _("Please enter new volume name");
                }
                if (poolTypesNotSupportingVolumeCreation.includes(storagePoolType || "")) {
                    validationFailed.storagePool = cockpit.format(_("Pool type $0 does not support volume creation"), storagePoolType);
                }
                const poolCapacity = diskParams.storagePool && convertToUnit(diskParams.storagePool.capacity, units.B, diskParams.unit);
                if (!isNaN(Number(poolCapacity)) && diskParams.size > Number(poolCapacity)) {
                    validationFailed.size = cockpit.format(_("Storage volume size must not exceed the storage pool's capacity ($0 $1)"), poolCapacity?.toFixed(2), diskParams.unit);
                }
            } else if (mode === USE_EXISTING) {
                if (!diskParams.existingVolumeName)
                    validationFailed.existingVolumeName = _("Please choose a volume");
            }

            return validationFailed;
        };
        return validateParams();
    }, [diskParams, mode, customDiskVerificationFailed, customDiskVerificationMessage, storagePoolName]);
    const validationFailed = validate ? _validationFailed : {};

    let defaultBody;
    const dialogLoading = storagePools === undefined || diskParams.format === undefined;
    if (dialogLoading) {
        defaultBody = (
            <Bullseye>
                <Spinner />
            </Bullseye>
        );
    } else if (isMediaInsertion) {
        defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <FormGroup fieldId={`${idPrefix}-source`}
                           id={`${idPrefix}-source-group`}
                           label={_("Source")} isInline hasNoPaddingTop>
                    <Radio id={`${idPrefix}-custompath`}
                           name="source"
                           label={_("Custom path")}
                           isChecked={mode === CUSTOM_PATH}
                           onChange={() => setMode(CUSTOM_PATH)} />
                    <Radio id={`${idPrefix}-useexisting`}
                           name="source"
                           label={_("Use existing")}
                           isChecked={mode === USE_EXISTING}
                           onChange={() => setMode(USE_EXISTING)} />
                </FormGroup>
                {mode === USE_EXISTING && (
                    <UseExistingDisk idPrefix={`${idPrefix}-existing`}
                                     onValueChanged={onValueChanged}
                                     storagePoolName={storagePoolName}
                                     existingVolumeName={diskParams.existingVolumeName}
                                     validationFailed={validationFailed}
                                     vmStoragePools={storagePools}
                                     vms={vms}
                                     vm={vm} />
                )}
                {mode === CUSTOM_PATH && (
                    <CustomPath idPrefix={idPrefix}
                                onValueChanged={onValueChanged}
                                hideDeviceRow
                                validationFailed={validationFailed} />
                )}
            </Form>
        );
    } else {
        defaultBody = (
            <>
                <Form onSubmit={e => e.preventDefault()} isHorizontal>
                    <FormGroup fieldId={`${idPrefix}-source`}
                               id={`${idPrefix}-source-group`}
                               label={_("Source")} isInline hasNoPaddingTop>
                        <Radio id={`${idPrefix}-createnew`}
                               name="source"
                               label={_("Create new")}
                               isChecked={mode === CREATE_NEW}
                               onChange={() => setMode(CREATE_NEW)} />
                        <Radio id={`${idPrefix}-useexisting`}
                               name="source"
                               label={_("Use existing")}
                               isChecked={mode === USE_EXISTING}
                               onChange={() => setMode(USE_EXISTING)} />
                        <Radio id={`${idPrefix}-custompath`}
                               name="source"
                               label={_("Custom path")}
                               isChecked={mode === CUSTOM_PATH}
                               onChange={() => setMode(CUSTOM_PATH)} />
                    </FormGroup>
                    {mode === CREATE_NEW && (
                        <CreateNewDisk idPrefix={`${idPrefix}-new`}
                                       onValueChanged={onValueChanged}
                                       storagePoolName={storagePoolName}
                                       volumeName={diskParams.volumeName}
                                       size={diskParams.size}
                                       unit={diskParams.unit}
                                       format={diskParams.format}
                                       validationFailed={validationFailed}
                                       vmStoragePools={storagePools} />
                    )}
                    {mode === USE_EXISTING && (
                        <UseExistingDisk idPrefix={`${idPrefix}-existing`}
                                         onValueChanged={onValueChanged}
                                         storagePoolName={storagePoolName}
                                         existingVolumeName={diskParams.existingVolumeName}
                                         validationFailed={validationFailed}
                                         vmStoragePools={storagePools}
                                         vms={vms}
                                         vm={vm} />
                    )}
                    {mode === CUSTOM_PATH && (
                        <CustomPath idPrefix={idPrefix}
                                    onValueChanged={onValueChanged}
                                    device={diskParams.device}
                                    validationFailed={validationFailed} />
                    )}
                    {vm.persistent &&
                    <PermanentChange idPrefix={idPrefix}
                                     permanent={diskParams.permanent}
                                     onValueChanged={onValueChanged}
                                     vm={vm} />}
                </Form>
                <AdditionalOptions cacheMode={diskParams.cacheMode}
                                   device={diskParams.device}
                                   idPrefix={idPrefix}
                                   onValueChanged={onValueChanged}
                                   busType={diskParams.busType}
                                   serial={diskParams.serial}
                                   validationFailed={validationFailed}
                                   supportedDiskBusTypes={supportedDiskBusTypes} />
            </>
        );
    }

    return (
        <Modal position="top" variant="medium" id={`${idPrefix}-dialog-modal-window`} isOpen onClose={Dialogs.close}>
            <ModalHeader title={isMediaInsertion ? _("Insert disc media") : _("Add disk")} />
            <ModalBody>
                {dialogError && <ModalError dialogError={dialogError} {...dialogErrorDetail && { dialogErrorDetail } } />}
                {defaultBody}
            </ModalBody>
            <ModalFooter>
                <AddDiskModalFooter
                  dialogLoading={dialogLoading}
                  dialogErrorSet={dialogErrorSet}
                  diskParams={diskParams}
                  idPrefix={idPrefix}
                  isMediaInsertion={!!isMediaInsertion}
                  mode={mode}
                  setValidate={setValidate}
                  storagePoolName={storagePoolName}
                  storagePools={storagePools}
                  validate={validate}
                  validationFailed={_validationFailed}
                  verificationInProgress={verificationInProgress}
                  vm={vm}
                />
            </ModalFooter>
        </Modal>
    );
};

const AddDiskModalFooter = ({
    dialogErrorSet,
    dialogLoading,
    diskParams,
    idPrefix,
    isMediaInsertion,
    mode,
    setValidate,
    storagePoolName,
    storagePools,
    validate,
    validationFailed,
    verificationInProgress,
    vm,
} : {
    dialogErrorSet: (text: string, detail: string) => void,
    dialogLoading: boolean,
    diskParams: DialogValues,
    idPrefix: string,
    isMediaInsertion: boolean,
    mode: string,
    setValidate: (flag: boolean) => void,
    storagePoolName: string | undefined,
    storagePools: StoragePool[] | undefined,
    validate: boolean,
    validationFailed: ValidationFailed,
    verificationInProgress: boolean,
    vm: VM,
}) => {
    const [addDiskInProgress, setAddDiskInProgress] = useState(false);
    const Dialogs = useDialogs();

    const onInsertClicked = () => {
        cockpit.assert(diskParams.target);
        return domainInsertDisk({
            connectionName: vm.connectionName,
            vmName: vm.name,
            target: diskParams.target,
            diskType: mode === CUSTOM_PATH ? "file" : "volume",
            file: diskParams.file,
            poolName: storagePoolName,
            volumeName: diskParams.existingVolumeName,
            live: vm.state === "running",
        });
    };

    const onAddClicked = () => {
        cockpit.assert(diskParams.target);

        const hotplug = domainIsRunning(vm.state);

        if (mode === CREATE_NEW) {
            // create new disk
            const size = convertToUnit(diskParams.size, diskParams.unit, 'MiB');
            return storageVolumeCreateAndAttach({
                connectionName: vm.connectionName,
                poolName: storagePoolName || "",
                volumeName: diskParams.volumeName,
                size,
                format: diskParams.format || "",
                target: diskParams.target,
                permanent: diskParams.permanent,
                hotplug,
                vmId: vm.id,
                cacheMode: diskParams.cacheMode,
                busType: diskParams.busType || "",
                serial: diskParams.serial
            });
        }

        return domainAttachDisk({
            connectionName: vm.connectionName,
            type: mode === CUSTOM_PATH ? "file" : "volume",
            file: diskParams.file,
            device: diskParams.device,
            poolName: storagePoolName,
            volumeName: diskParams.existingVolumeName,
            format: diskParams.format || "",
            target: diskParams.target,
            permanent: diskParams.permanent,
            hotplug,
            vmId: vm.id,
            cacheMode: diskParams.cacheMode,
            shareable: false,
            busType: diskParams.busType || "",
            serial: diskParams.serial
        });
    };

    const onClick = () => {
        setValidate(true);
        if (Object.getOwnPropertyNames(validationFailed).length > 0) {
            setAddDiskInProgress(false);
            return;
        }

        setAddDiskInProgress(true);

        return (
            isMediaInsertion
                ? onInsertClicked()
                : onAddClicked()
        )
                .then(() => { // force reload of VM data, events are not reliable (i.e. for a down VM)
                    Dialogs.close();
                    return domainGet({ connectionName: vm.connectionName, id: vm.id });
                })
                .catch(exc => {
                    setAddDiskInProgress(false);
                    dialogErrorSet(_("Disk failed to be added"), exc.message);
                });
    };

    return (
        <>
            <Button id={`${idPrefix}-dialog-add`}
                    variant='primary'
                    isLoading={addDiskInProgress || verificationInProgress}
                    isDisabled={addDiskInProgress || verificationInProgress || dialogLoading ||
                                ((storagePools || []).length == 0 && mode != CUSTOM_PATH) ||
                                (validate && Object.keys(validationFailed).length > 0) ||
                                !diskParams.target}
                    onClick={onClick}>
                {isMediaInsertion ? _("Insert") : _("Add")}
            </Button>
            <Button id={`${idPrefix}-dialog-cancel`} variant='link' onClick={Dialogs.close}>
                {_("Cancel")}
            </Button>
        </>
    );
};
