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
import { debounce } from 'throttle-debounce';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Bullseye } from "@patternfly/react-core/dist/esm/layouts/Bullseye";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form, FormGroup, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import cockpit from 'cockpit';
import { useDialogs } from 'dialogs.jsx';
import { FormHelper } from 'cockpit-components-form-helper.jsx';

import { FileAutoComplete } from 'cockpit-components-file-autocomplete.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { diskBusTypes, diskCacheModes, units, convertToUnit, getDefaultVolumeFormat, getNextAvailableTarget, getStorageVolumesUsage, getStorageVolumeDiskTarget, getVmStoragePools } from '../../../helpers.js';
import { VolumeCreateBody } from '../../storagePools/storageVolumeCreateBody.jsx';
import { domainAttachDisk, domainGet, domainInsertDisk, domainIsRunning, domainUpdateDiskAttributes } from '../../../libvirtApi/domain.js';
import { storagePoolGetAll } from '../../../libvirtApi/storagePool.js';
import { storageVolumeCreateAndAttach } from '../../../libvirtApi/storageVolume.js';

const _ = cockpit.gettext;

const CREATE_NEW = 'create-new';
const USE_EXISTING = 'use-existing';
const CUSTOM_PATH = 'custom-path';

const poolTypesNotSupportingVolumeCreation = ['iscsi', 'iscsi-direct', 'gluster', 'mpath'];

function clearSerial(serial) {
    return serial.replace(' ', '_').replace(/([^A-Za-z0-9_.+-]+)/gi, '');
}

function getFilteredVolumes(vmStoragePool, disks) {
    const usedDiskPaths = Object.getOwnPropertyNames(disks)
            .filter(target => disks[target].source && (disks[target].source.file || disks[target].source.volume))
            .map(target => (disks[target].source && (disks[target].source.file || disks[target].source.volume)));

    const filteredVolumes = vmStoragePool.volumes.filter(volume => !usedDiskPaths.includes(volume.path) && !usedDiskPaths.includes(volume.name));

    const filteredVolumesSorted = filteredVolumes.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });

    return filteredVolumesSorted;
}

function getDiskUsageMessage(vms, storagePool, volumeName) {
    const isVolumeUsed = getStorageVolumesUsage(vms, storagePool);

    if (!isVolumeUsed[volumeName] || (isVolumeUsed[volumeName].length === 0))
        return null;

    const vmsUsing = isVolumeUsed[volumeName].join(', ');
    const volume = storagePool.volumes.find(vol => vol.name === volumeName);

    let message = cockpit.format(_("This volume is already used by $0."), vmsUsing);
    if (volume.format === "raw")
        message += " " + _("Adding this disk will change its access mode to shared.");

    return message;
}

function getDefaultVolumeName(vmStoragePool, vm) {
    const filteredVolumes = getFilteredVolumes(vmStoragePool, vm.disks);
    return filteredVolumes[0] && filteredVolumes[0].name;
}

const SelectExistingVolume = ({ idPrefix, storagePoolName, existingVolumeName, onValueChanged, vmStoragePools, vmDisks, vms }) => {
    const vmStoragePool = vmStoragePools.find(pool => pool.name == storagePoolName);
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

    const diskUsageMessage = getDiskUsageMessage(vms, vmStoragePool, existingVolumeName);
    return (
        <FormGroup fieldId={`${idPrefix}-select-volume`}
                   label={_("Volume")}>
            <FormSelect id={`${idPrefix}-select-volume`}
                        onChange={(_event, value) => onValueChanged('existingVolumeName', value)}
                        value={initiallySelected}
                        validated={diskUsageMessage && "warning"}
                        isDisabled={!filteredVolumes.length}>
                {content}
            </FormSelect>
            <FormHelper fieldId={`${idPrefix}-select-volume`} variant="warning" helperText={diskUsageMessage} />
        </FormGroup>
    );
};

const PermanentChange = ({ idPrefix, onValueChanged, permanent, vm }) => {
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

const PoolRow = ({ idPrefix, onValueChanged, storagePoolName, validationFailed, vmStoragePools }) => {
    const validationStatePool = validationFailed.storagePool ? 'error' : 'default';

    return (
        <FormGroup fieldId={`${idPrefix}-select-pool`}
                   label={_("Pool")}>
            <FormSelect id={`${idPrefix}-select-pool`}
                           isDisabled={!vmStoragePools.length || !vmStoragePools.every(pool => pool.volumes !== undefined)}
                           onChange={(_event, value) => onValueChanged('storagePoolName', value)}
                           validated={validationStatePool}
                           value={storagePoolName || 'no-resource'}>
                {vmStoragePools.length > 0
                    ? vmStoragePools
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(pool => {
                                return (
                                    <FormSelectOption isDisabled={pool.disabled} value={pool.name} key={pool.name}
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

const AdditionalOptions = ({ cacheMode, device, idPrefix, onValueChanged, busType, serial, validationFailed, supportedDiskBusTypes }) => {
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
            // Show the message once triggerred and leave it around as reminder
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

    const displayBusTypes = diskBusTypes[device]
            .filter(bus => supportedDiskBusTypes.includes(bus))
            .map(type => ({ value: type }));
    if (!displayBusTypes.find(displayBusType => busType === displayBusType.value))
        displayBusTypes.push({ value: busType, disabled: true });

    return (
        <ExpandableSection toggleText={ expanded ? _("Hide additional options") : _("Show additional options")}
                           onToggle={() => setExpanded(!expanded)} isExpanded={expanded} className="pf-v5-u-pt-lg">
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
                                                  isDisabled={busType.disabled}
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
                                <HelperTextItem variant="error" hasIcon>
                                    {validationFailed.serial}
                                </HelperTextItem>
                            </HelperText>
                            : <HelperText component="ul">
                                { showAllowedCharactersMessage &&
                                <HelperTextItem id="serial-characters-message" key="regex" variant="indeterminate" hasIcon>
                                    {_("Allowed characters: basic Latin alphabet, numbers, and limited punctuation (-, _, +, .)")}
                                </HelperTextItem>
                                }
                                { showMaxLengthMessage &&
                                <HelperTextItem id="serial-length-message" key="length" variant="warning" hasIcon>
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
                              onValueChanged={onValueChanged} />}
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

const CustomPath = ({ idPrefix, onValueChanged, device, validationFailed, hideDeviceRow }) => {
    return (
        <>
            <FormGroup
                id={`${idPrefix}-file`}
                fieldId={`${idPrefix}-file-autocomplete`}
                label={_("Custom path")}>
                <FileAutoComplete
                    id={`${idPrefix}-file-autocomplete`}
                    placeholder={_("Path to file on host's file system")}
                    onChange={value => debounce(250, onValueChanged("file", value))}
                    superuser="try" />
                <FormHelper fieldId={`${idPrefix}-file-autocomplete`} helperTextInvalid={validationFailed.customPath} />
            </FormGroup>
            {!hideDeviceRow && <FormGroup label={_("Device")}>
                <FormSelect id={`${idPrefix}-select-device`}
                        onChange={(_event, value) => onValueChanged('device', value)}
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

const sortFunction = (poolA, poolB) => poolA.name.localeCompare(poolB.name);

export const AddDiskModalBody = ({ disk, idPrefix, isMediaInsertion, vm, vms, supportedDiskBusTypes }) => {
    const [customDiskVerificationFailed, setCustomDiskVerificationFailed] = useState(false);
    const [customDiskVerificationMessage, setCustomDiskVerificationMessage] = useState(null);
    const [dialogError, setDialogError] = useState(null);
    const [dialogErrorDetail, setDialogErrorDetail] = useState(null);
    const [diskParams, setDiskParams] = useState({
        cacheMode: 'default',
        device: "disk",
        file: "",
        format: "",
        serial: "",
        size: 1,
        unit: units.GiB.name,
        volumeName: "",
        permanent: true,
    });
    const [mode, setMode] = useState(isMediaInsertion ? CUSTOM_PATH : CREATE_NEW);
    const [validate, setValidate] = useState(false);
    const [verificationInProgress, setVerificationInProgress] = useState(false);
    const [storagePools, setStoragePools] = useState();

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

    useEffect(() => {
        // Refresh storage volume list before displaying the dialog.
        // There are recently no Libvirt events for storage volumes and polling is ugly.
        // https://bugzilla.redhat.com/show_bug.cgi?id=1578836
        storagePoolGetAll({ connectionName: vm.connectionName })
                .always(() => {
                    setStoragePools(getVmStoragePools(vm.connectionName).sort(sortFunction));
                })
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
        if (!diskParams.storagePool)
            return;

        let format = getDefaultVolumeFormat(diskParams.storagePool);
        let deviceType = "disk";
        if (['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(diskParams.storagePool.type) > -1) {
            const volume = diskParams.storagePool.volumes.find(vol => vol.name === diskParams.existingVolumeName);
            if (volume && volume.format) {
                format = volume.format;
                if (volume.format === "iso")
                    deviceType = "cdrom";
            }
        }
        setDiskParams(diskParams => ({
            ...diskParams,
            format,
            device: deviceType,
        }));
    }, [diskParams.storagePool, diskParams.existingVolumeName]);

    useEffect(() => {
        // Initial state settings and follow up state updates after 'device' is changed

        // According to https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms (section about 'target'),
        // scsi is the default option for libvirt for cdrom devices
        let newBus = diskParams.device === "cdrom" && "scsi";

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
        const availableTarget = isMediaInsertion ? disk.target : getNextAvailableTarget(existingTargets, diskParams.busType);
        setDiskParams(diskParams => ({ ...diskParams, target: availableTarget }));
    }, [vm.disks, disk?.target, diskParams.busType, isMediaInsertion]);

    const currentPoolRef = useRef();
    useEffect(() => {
        if (currentPoolRef.current === undefined) {
            currentPoolRef.current = diskParams.storagePool;

            // Reset the format only when the Format selection dropdown changes entries - otherwise just keep the old selection
            // All pool types apart from 'disk' have either 'raw' or 'qcow2' format
            const prevPool = currentPoolRef.current;
            if ((diskParams.storagePool?.type == 'disk' && prevPool?.type != 'disk') || (diskParams.storagePool?.type != 'disk' && prevPool?.type == 'disk')) {
                prevPool.current = diskParams.storagePool;
                setDiskParams(diskParams => ({
                    ...diskParams,
                    format: getDefaultVolumeFormat(diskParams.storagePool?.name),
                }));
            }
        }
    }, [diskParams.storagePool?.type, diskParams.storagePool?.name, diskParams.storagePool]);

    useEffect(() => {
        const file = diskParams.file;

        if (file?.endsWith(".iso")) {
            setDiskParams(diskParams => ({ ...diskParams, device: "cdrom" }));
        }

        if (file) {
            setVerificationInProgress(true);
            cockpit.spawn(["head", "--bytes=16", file], { binary: true, err: "message", superuser: "try" })
                    .then(file_header => {
                        let format = "";

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

    const onValueChanged = (key, value) => {
        switch (key) {
        case 'storagePoolName': {
            const currentPool = storagePools.find(pool => pool.name === value && pool.connectionName === vm.connectionName);
            setDiskParams(diskParams => ({ ...diskParams, storagePool: currentPool, existingVolumeName: getDefaultVolumeName(currentPool, vm) }));
            break;
        }
        case 'mode': {
            setMode(value);
            break;
        }
        default:
            setDiskParams(diskParams => ({ ...diskParams, [key]: value }));
        }
    };

    const dialogErrorSet = (text, detail) => {
        setDialogError(text);
        setDialogErrorDetail(detail);
    };

    const _validationFailed = useMemo(() => {
        const validateParams = () => {
            const validationFailed = {};
            const storagePoolType = diskParams.storagePool?.type;

            if (mode !== CUSTOM_PATH && !storagePoolName)
                validationFailed.storagePool = _("Please choose a storage pool");

            if (mode === CUSTOM_PATH && customDiskVerificationFailed)
                validationFailed.customPath = customDiskVerificationMessage;

            if (mode === CREATE_NEW) {
                if (!diskParams.volumeName) {
                    validationFailed.volumeName = _("Please enter new volume name");
                }
                if (poolTypesNotSupportingVolumeCreation.includes(storagePoolType)) {
                    validationFailed.storagePool = cockpit.format(_("Pool type $0 does not support volume creation"), storagePoolType);
                }
                const poolCapacity = diskParams.storagePool && parseFloat(convertToUnit(diskParams.storagePool.capacity, units.B, diskParams.unit));
                if (!isNaN(poolCapacity) && diskParams.size > poolCapacity) {
                    validationFailed.size = cockpit.format(_("Storage volume size must not exceed the storage pool's capacity ($0 $1)"), poolCapacity.toFixed(2), diskParams.unit);
                }
            } else if (mode === USE_EXISTING) {
                if (mode !== CUSTOM_PATH && !diskParams.existingVolumeName)
                    validationFailed.existingVolumeName = _("Please choose a volume");
            }

            return validationFailed;
        };
        return validateParams();
    }, [diskParams, mode, customDiskVerificationFailed, customDiskVerificationMessage, storagePoolName]);
    const validationFailed = validate ? _validationFailed : {};

    let defaultBody;
    const dialogLoading = storagePools === undefined;
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
                           onChange={() => onValueChanged('mode', CUSTOM_PATH)} />
                    <Radio id={`${idPrefix}-useexisting`}
                           name="source"
                           label={_("Use existing")}
                           isChecked={mode === USE_EXISTING}
                           onChange={() => onValueChanged('mode', USE_EXISTING)} />
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
                               onChange={() => onValueChanged('mode', CREATE_NEW)} />
                        <Radio id={`${idPrefix}-useexisting`}
                               name="source"
                               label={_("Use existing")}
                               isChecked={mode === USE_EXISTING}
                               onChange={() => onValueChanged('mode', USE_EXISTING)} />
                        <Radio id={`${idPrefix}-custompath`}
                               name="source"
                               label={_("Custom path")}
                               isChecked={mode === CUSTOM_PATH}
                               onChange={() => onValueChanged('mode', CUSTOM_PATH)} />
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
        <Modal position="top" variant="medium" id={`${idPrefix}-dialog-modal-window`} isOpen onClose={Dialogs.close}
               title={isMediaInsertion ? _("Insert disc media") : _("Add disk")}
               footer={
                   <AddDiskModalFooter
                     dialogLoading={dialogLoading}
                     dialogErrorSet={dialogErrorSet}
                     diskParams={diskParams}
                     idPrefix={idPrefix}
                     isMediaInsertion={isMediaInsertion}
                     mode={mode}
                     setValidate={setValidate}
                     storagePoolName={storagePoolName}
                     storagePools={storagePools}
                     validate={validate}
                     validationFailed={_validationFailed}
                     verificationInProgress={verificationInProgress}
                     vm={vm}
                     vms={vms}
                   />
               }
        >
            {dialogError && <ModalError dialogError={dialogError} dialogErrorDetail={dialogErrorDetail} />}
            {defaultBody}
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
    vms,
}) => {
    const [addDiskInProgress, setAddDiskInProgress] = useState(false);
    const Dialogs = useDialogs();

    const onInsertClicked = () => {
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
        const hotplug = domainIsRunning(vm.state);
        let storagePool, volume, isVolumeUsed;

        if (mode === CREATE_NEW) {
            // create new disk
            const size = convertToUnit(diskParams.size, diskParams.unit, 'MiB');
            return storageVolumeCreateAndAttach({
                connectionName: vm.connectionName,
                poolName: storagePoolName,
                volumeName: diskParams.volumeName,
                size,
                format: diskParams.format,
                target: diskParams.target,
                permanent: diskParams.permanent,
                hotplug,
                vmName: vm.name,
                vmId: vm.id,
                cacheMode: diskParams.cacheMode,
                busType: diskParams.busType,
                serial: diskParams.serial
            });
        } else if (mode === USE_EXISTING) {
            // use existing volume
            storagePool = storagePools.find(pool => pool.name === storagePoolName);
            volume = storagePool.volumes.find(vol => vol.name === diskParams.existingVolumeName);
            isVolumeUsed = getStorageVolumesUsage(vms, storagePool);
        }

        return domainAttachDisk({
            connectionName: vm.connectionName,
            type: mode === CUSTOM_PATH ? "file" : "volume",
            file: diskParams.file,
            device: diskParams.device,
            poolName: storagePoolName,
            volumeName: diskParams.existingVolumeName,
            format: diskParams.format,
            target: diskParams.target,
            permanent: diskParams.permanent,
            hotplug,
            vmName: vm.name,
            vmId: vm.id,
            cacheMode: diskParams.cacheMode,
            shareable: volume && volume.format === "raw" && isVolumeUsed[diskParams.existingVolumeName].length > 0,
            busType: diskParams.busType,
            serial: diskParams.serial
        })
                .then(() => { // force reload of VM data, events are not reliable (i.e. for a down VM)
                    const promises = [];
                    if (mode !== CUSTOM_PATH && volume.format === "raw" && isVolumeUsed[diskParams.existingVolumeName]) {
                        isVolumeUsed[diskParams.existingVolumeName].forEach(vmName => {
                            const vm = vms.find(vm => vm.name === vmName);
                            const diskTarget = getStorageVolumeDiskTarget(vm, storagePool, diskParams.existingVolumeName);

                            promises.push(
                                domainUpdateDiskAttributes({ connectionName: vm.connectionName, objPath: vm.id, readonly: false, shareable: true, target: diskTarget })
                                        .catch(exc => dialogErrorSet(_("Disk settings could not be saved"), exc.message))
                            );
                        });

                        return Promise.all(promises);
                    }
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
                    return domainGet({ connectionName: vm.connectionName, name: vm.name, id: vm.id });
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
                                (storagePools.length == 0 && mode != CUSTOM_PATH) ||
                                (validate && Object.keys(validationFailed).length > 0)}
                    onClick={onClick}>
                {isMediaInsertion ? _("Insert") : _("Add")}
            </Button>
            <Button id={`${idPrefix}-dialog-cancel`} variant='link' onClick={Dialogs.close}>
                {_("Cancel")}
            </Button>
        </>
    );
};
