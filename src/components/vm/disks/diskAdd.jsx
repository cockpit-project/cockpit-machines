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
import React, { useCallback, useState, useEffect } from 'react';
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
import { DialogsContext } from 'dialogs.jsx';
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

function getDefaultVolumeName(poolName, storagePools, vm) {
    const vmStoragePool = storagePools.find(pool => pool.name == poolName);
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

    const diskUsageMessage = getDiskUsageMessage(vms, vmStoragePools.find(pool => pool.name === storagePoolName), existingVolumeName);
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

    const setSerialHelper = useCallback(value => {
        const clearedSerial = clearSerial(value);

        if (value !== clearedSerial)
            // Show the message once triggerred and leave it around as reminder
            setShowAllowedCharactersMessage(true);
        if (clearedSerial.length > serialLength) {
            setShowMaxLengthMessage(true);
            setTruncatedSerial(clearedSerial.substring(0, serialLength));
        } else {
            setShowMaxLengthMessage(false);
        }

        onValueChanged('serial', clearedSerial);
    }, [onValueChanged, serialLength]);

    useEffect(() => {
        setSerialHelper(serial);
    }, [setSerialHelper, serial, busType]);

    const displayBusTypes = diskBusTypes[device]
            .filter(bus => supportedDiskBusTypes.includes(bus))
            .map(type => ({ value: type }));
    if (!displayBusTypes.find(displayBusType => busType.value === displayBusType.busType))
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
                        onChange={(_, value) => setSerialHelper(value)} />
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
                    onChange={value => onValueChanged("file", value)}
                    superuser="try" />
                <FormHelper fieldId={`${idPrefix}-file-autocomplete`} helperTextInvalid={validationFailed.customPath} />
            </FormGroup>
            {!hideDeviceRow && <FormGroup id={`${idPrefix}-device`}
                   fieldId={`${idPrefix}-select-device`}
                   label={_("Device")}>
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

export class AddDiskModalBody extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {
            validate: false,
            dialogLoading: true,
            customDiskVerificationFailed: false,
            customDiskVerificationMessage: null,
            verificationInProgress: false,
            file: null,
        };
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onAddClicked = this.onAddClicked.bind(this);
        this.onInsertClicked = this.onInsertClicked.bind(this);
        this.existingVolumeNameDelta = this.existingVolumeNameDelta.bind(this);
        this.validateParams = this.validateParams.bind(this);
    }

    get initialState() {
        const { vm, vms, isMediaInsertion } = this.props;
        const storagePools = getVmStoragePools(vm);
        const defaultBus = 'virtio';
        const existingTargets = Object.getOwnPropertyNames(vm.disks);
        const availableTarget = getNextAvailableTarget(existingTargets, defaultBus);
        const sortFunction = (poolA, poolB) => poolA.name.localeCompare(poolB.name);
        let defaultPool;
        if (storagePools.length > 0)
            defaultPool = storagePools
                    .map(pool => ({ name: pool.name, type: pool.type }))
                    .sort(sortFunction)[0];

        return {
            storagePools,
            vm,
            vms,
            file: "",
            device: "disk",
            storagePoolName: defaultPool && defaultPool.name,
            storagePoolType: defaultPool && defaultPool.type,
            mode: isMediaInsertion ? CUSTOM_PATH : CREATE_NEW,
            volumeName: "",
            existingVolumeName: undefined,
            size: 1,
            unit: units.GiB.name,
            format: defaultPool && getDefaultVolumeFormat(defaultPool),
            target: availableTarget,
            permanent: !domainIsRunning(vm.state), // default true for a down VM; for a running domain, the disk is attached tentatively only
            hotplug: domainIsRunning(vm.state), // must be kept false for a down VM; the value is not being changed by user
            addDiskInProgress: false,
            cacheMode: 'default',
            busType: defaultBus,
            updateDisks: false,
            serial: "",
        };
    }

    componentDidMount() {
        // Refresh storage volume list before displaying the dialog.
        // There are recently no Libvirt events for storage volumes and polling is ugly.
        // https://bugzilla.redhat.com/show_bug.cgi?id=1578836
        storagePoolGetAll({ connectionName: this.props.vm.connectionName })
                .then(() => this.setState({ dialogLoading: false, ...this.initialState }))
                .catch(exc => this.dialogErrorSet(_("Storage pools could not be fetched"), exc.message));
    }

    validateParams() {
        const validationFailed = {};

        if (this.state.mode !== CUSTOM_PATH && !this.state.storagePoolName)
            validationFailed.storagePool = _("Please choose a storage pool");

        if (this.state.mode === CUSTOM_PATH && this.state.customDiskVerificationFailed)
            validationFailed.customPath = this.state.customDiskVerificationMessage;

        if (this.state.mode === CREATE_NEW) {
            if (!this.state.volumeName) {
                validationFailed.volumeName = _("Please enter new volume name");
            }
            if (poolTypesNotSupportingVolumeCreation.includes(this.state.storagePoolType)) {
                validationFailed.storagePool = cockpit.format(_("Pool type $0 does not support volume creation"), this.state.storagePoolType);
            }
            const poolCapacity = parseFloat(convertToUnit(this.state.storagePools.find(pool => pool.name == this.state.storagePoolName).capacity, units.B, this.state.unit));
            if (this.state.size > poolCapacity) {
                validationFailed.size = cockpit.format(_("Storage volume size must not exceed the storage pool's capacity ($0 $1)"), poolCapacity.toFixed(2), this.state.unit);
            }
        } else if (this.state.mode === USE_EXISTING) {
            if (this.state.mode !== CUSTOM_PATH && !this.state.existingVolumeName)
                validationFailed.existingVolumeName = _("Please choose a volume");
        }

        return validationFailed;
    }

    existingVolumeNameDelta(value, poolName) {
        const { storagePools, vm } = this.state;
        const stateDelta = { existingVolumeName: value };
        const pool = storagePools.find(pool => pool.name === poolName && pool.connectionName === vm.connectionName);
        if (!pool)
            return stateDelta;

        stateDelta.format = getDefaultVolumeFormat(pool);
        let deviceType = "disk";
        if (['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(pool.type) > -1) {
            const volume = pool.volumes.find(vol => vol.name === value);
            if (volume && volume.format) {
                stateDelta.format = volume.format;
                if (volume.format === "iso")
                    deviceType = "cdrom";
            }
        }

        this.onValueChanged("device", deviceType);

        return stateDelta;
    }

    onValueChanged(key, value) {
        let stateDelta = {};
        const { storagePools, vm } = this.state;

        switch (key) {
        case 'storagePoolName': {
            const currentPool = storagePools.find(pool => pool.name === value && pool.connectionName === vm.connectionName);
            const prevPool = storagePools.find(pool => pool.name === this.state.storagePoolName && pool.connectionName === vm.connectionName);
            this.setState({ storagePoolName: value, storagePoolType: currentPool.type });
            // Reset the format only when the Format selection dropdown changes entries - otherwise just keep the old selection
            // All pool types apart from 'disk' have either 'raw' or 'qcow2' format
            if (currentPool && prevPool && ((currentPool.type == 'disk' && prevPool.type != 'disk') || (currentPool.type != 'disk' && prevPool.type == 'disk'))) {
                // use onValueChange instead of setState in order to perform subsequent state change logic
                this.onValueChanged('format', getDefaultVolumeFormat(value));
            }

            if (this.state.mode === USE_EXISTING) { // user changed pool
                // use onValueChange instead of setState in order to perform subsequent state change logic
                this.onValueChanged('existingVolumeName', getDefaultVolumeName(value, storagePools, vm));
            }
            break;
        }
        case 'existingVolumeName': {
            stateDelta.existingVolumeName = value;
            this.setState(prevState => { // to prevent asynchronous for recursive call with existingVolumeName as a key
                return this.existingVolumeNameDelta(value, prevState.storagePoolName);
            });
            break;
        }
        case 'mode': {
            this.setState(prevState => { // to prevent asynchronous for recursive call with existingVolumeName as a key
                stateDelta = this.initialState;
                stateDelta.mode = value;
                if (value === USE_EXISTING) { // user moved to USE_EXISTING subtab
                    const poolName = stateDelta.storagePoolName;
                    if (poolName)
                        stateDelta = { ...stateDelta, ...this.existingVolumeNameDelta(getDefaultVolumeName(poolName, storagePools, vm), prevState.storagePoolName) };
                }

                return stateDelta;
            });
            break;
        }
        case 'busType': {
            const existingTargets = Object.getOwnPropertyNames(this.props.vm.disks);
            const availableTarget = getNextAvailableTarget(existingTargets, value);
            this.setState({ busType: value, target: availableTarget });
            break;
        }
        case 'file': {
            this.setState({ file: value });

            if (value.endsWith(".iso")) {
                // use onValueChange instead of setState in order to perform subsequent state change logic
                this.onValueChanged("device", "cdrom");
            }

            if (value && this.state.device === "disk") {
                this.setState({ verificationInProgress: true, validate: false });
                cockpit.spawn(["head", "--bytes=16", value], { binary: true, err: "message", superuser: "try" })
                        .then(file_header => {
                            let format = "";

                            // https://git.qemu.org/?p=qemu.git;a=blob;f=docs/interop/qcow2.txt
                            if (file_header[0] == 81 && file_header[1] == 70 &&
                                file_header[2] == 73 && file_header[3] == 251) {
                                format = "qcow2";
                                // All zeros, no backing file offset
                                if (file_header.slice(8).every(bytes => bytes === 0)) {
                                    this.setState({ customDiskVerificationFailed: false, format });
                                } else {
                                    this.setState({
                                        format,
                                        customDiskVerificationFailed: true,
                                        customDiskVerificationMessage: _("Importing an image with a backing file is unsupported"),
                                        validate: true
                                    });
                                }
                            } else {
                                format = "raw";
                                this.setState({ customDiskVerificationFailed: false, format });
                            }
                            this.setState({ verificationInProgress: false });
                        })
                        .catch(e => {
                            this.setState({
                                verificationInProgress: false,
                                format: "raw",
                            });
                            console.warn("could not execute head --bytes=16", e.toString());
                        });
            } else {
                this.setState({ customDiskVerificationFailed: false });
            }
            break;
        }
        case 'device': {
            this.setState({ device: value });
            let newBus;
            // If disk with the same device exists, use the same bus too
            for (const disk of Object.values(this.props.vm.disks)) {
                if (disk.device === value) {
                    newBus = disk.bus;
                    break;
                }
            }

            if (newBus) {
                this.onValueChanged("busType", newBus);
                // Disk device "cdrom" and bus "virtio" are incompatible, see:
                // https://listman.redhat.com/archives/libvir-list/2019-January/msg01104.html
            } else if (value === "cdrom" && this.state.busType === "virtio") {
                // use onValueChange instead of setState in order to perform subsequent state change logic
                // According to https://libvirt.org/formatdomain.html#hard-drives-floppy-disks-cdroms (section about 'target'),
                // scsi is the default option for libvirt in this case too
                this.onValueChanged("busType", "scsi");
            }
            break;
        }
        default:
            this.setState({ [key]: value });
        }
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onInsertClicked() {
        const Dialogs = this.context;
        const close = Dialogs.close;
        const { vm } = this.state;
        const { disk } = this.props;

        const validation = this.validateParams();
        if (Object.getOwnPropertyNames(validation).length > 0)
            return this.setState({ addDiskInProgress: false, validate: true });

        this.setState({ addDiskInProgress: true, validate: false });
        return domainInsertDisk({
            connectionName: vm.connectionName,
            vmName: vm.name,
            target: disk.target,
            diskType: this.state.mode === CUSTOM_PATH ? "file" : "volume",
            file: this.state.file,
            poolName: this.state.storagePoolName,
            volumeName: this.state.existingVolumeName,
            live: vm.state === "running",
        })
                .then(() => { // force reload of VM data, events are not reliable (i.e. for a down VM)
                    close();
                    return domainGet({ connectionName: vm.connectionName, name: vm.name, id: vm.id });
                })
                .catch(exc => {
                    this.setState({ addDiskInProgress: false });
                    this.dialogErrorSet(_("Disk failed to be created"), exc.message);
                });
    }

    onAddClicked() {
        const Dialogs = this.context;
        const { vm, vms, storagePools } = this.state;
        let storagePool, volume, isVolumeUsed;
        const close = Dialogs.close;

        const validation = this.validateParams();
        if (Object.getOwnPropertyNames(validation).length > 0)
            return this.setState({ addDiskInProgress: false, validate: true });

        if (this.state.mode === CREATE_NEW) {
            this.setState({ addDiskInProgress: true, validate: false });
            // create new disk
            return storageVolumeCreateAndAttach({
                connectionName: vm.connectionName,
                poolName: this.state.storagePoolName,
                volumeName: this.state.volumeName,
                size: convertToUnit(this.state.size, this.state.unit, 'MiB'),
                format: this.state.format,
                target: this.state.target,
                permanent: this.state.permanent,
                hotplug: this.state.hotplug,
                vmName: vm.name,
                vmId: vm.id,
                cacheMode: this.state.cacheMode,
                busType: this.state.busType,
                serial: clearSerial(this.state.serial)
            })
                    .then(() => { // force reload of VM data, events are not reliable (i.e. for a down VM)
                        close();
                        return domainGet({ connectionName: vm.connectionName, name: vm.name, id: vm.id });
                    })
                    .catch(exc => {
                        this.setState({ addDiskInProgress: false });
                        this.dialogErrorSet(_("Disk failed to be created"), exc.message);
                    });
        } else if (this.state.mode === USE_EXISTING) {
            // use existing volume
            storagePool = storagePools.find(pool => pool.name === this.state.storagePoolName);
            volume = storagePool.volumes.find(vol => vol.name === this.state.existingVolumeName);
            isVolumeUsed = getStorageVolumesUsage(vms, storagePool);
        }

        return domainAttachDisk({
            connectionName: vm.connectionName,
            type: this.state.mode === CUSTOM_PATH ? "file" : "volume",
            file: this.state.file,
            device: this.state.device,
            poolName: this.state.storagePoolName,
            volumeName: this.state.existingVolumeName,
            format: this.state.format,
            target: this.state.target,
            permanent: this.state.permanent,
            hotplug: this.state.hotplug,
            vmName: vm.name,
            vmId: vm.id,
            cacheMode: this.state.cacheMode,
            shareable: volume && volume.format === "raw" && isVolumeUsed[this.state.existingVolumeName].length > 0,
            busType: this.state.busType,
            serial: this.state.serial
        })
                .then(() => { // force reload of VM data, events are not reliable (i.e. for a down VM)
                    const promises = [];
                    if (this.state.mode !== CUSTOM_PATH && volume.format === "raw" && isVolumeUsed[this.state.existingVolumeName]) {
                        isVolumeUsed[this.state.existingVolumeName].forEach(vmName => {
                            const vm = vms.find(vm => vm.name === vmName);
                            const diskTarget = getStorageVolumeDiskTarget(vm, storagePool, this.state.existingVolumeName);

                            promises.push(
                                domainUpdateDiskAttributes({ connectionName: vm.connectionName, objPath: vm.id, readonly: false, shareable: true, target: diskTarget })
                                        .catch(exc => this.dialogErrorSet(_("Disk settings could not be saved"), exc.message))
                            );
                        });

                        Promise.all(promises)
                                .then(() => close());
                    } else {
                        close();
                    }

                    return domainGet({ connectionName: vm.connectionName, name: vm.name, id: vm.id });
                })
                .catch(exc => {
                    this.setState({ addDiskInProgress: false });
                    this.dialogErrorSet(_("Disk failed to be attached"), exc.message);
                });
    }

    render() {
        const Dialogs = this.context;
        const { dialogLoading, vm, storagePools, vms } = this.state;
        const { isMediaInsertion } = this.props;
        const idPrefix = `${this.props.idPrefix}-adddisk`;
        const validationFailed = this.state.validate ? this.validateParams() : {};

        let defaultBody;
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
                               isChecked={this.state.mode === CUSTOM_PATH}
                               onChange={() => this.onValueChanged('mode', CUSTOM_PATH)} />
                        <Radio id={`${idPrefix}-useexisting`}
                               name="source"
                               label={_("Use existing")}
                               isChecked={this.state.mode === USE_EXISTING}
                               onChange={() => this.onValueChanged('mode', USE_EXISTING)} />
                    </FormGroup>
                    {this.state.mode === USE_EXISTING && (
                        <UseExistingDisk idPrefix={`${idPrefix}-existing`}
                                         onValueChanged={this.onValueChanged}
                                         storagePoolName={this.state.storagePoolName}
                                         existingVolumeName={this.state.existingVolumeName}
                                         validationFailed={validationFailed}
                                         vmStoragePools={storagePools}
                                         vms={vms}
                                         vm={vm} />
                    )}
                    {this.state.mode === CUSTOM_PATH && (
                        <CustomPath idPrefix={idPrefix}
                                    onValueChanged={this.onValueChanged}
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
                                   isChecked={this.state.mode === CREATE_NEW}
                                   onChange={() => this.onValueChanged('mode', CREATE_NEW)} />
                            <Radio id={`${idPrefix}-useexisting`}
                                   name="source"
                                   label={_("Use existing")}
                                   isChecked={this.state.mode === USE_EXISTING}
                                   onChange={() => this.onValueChanged('mode', USE_EXISTING)} />
                            <Radio id={`${idPrefix}-custompath`}
                                   name="source"
                                   label={_("Custom path")}
                                   isChecked={this.state.mode === CUSTOM_PATH}
                                   onChange={() => this.onValueChanged('mode', CUSTOM_PATH)} />
                        </FormGroup>
                        {this.state.mode === CREATE_NEW && (
                            <CreateNewDisk idPrefix={`${idPrefix}-new`}
                                           onValueChanged={this.onValueChanged}
                                           storagePoolName={this.state.storagePoolName}
                                           volumeName={this.state.volumeName}
                                           size={this.state.size}
                                           unit={this.state.unit}
                                           format={this.state.format}
                                           validationFailed={validationFailed}
                                           vmStoragePools={storagePools} />
                        )}
                        {this.state.mode === USE_EXISTING && (
                            <UseExistingDisk idPrefix={`${idPrefix}-existing`}
                                             onValueChanged={this.onValueChanged}
                                             storagePoolName={this.state.storagePoolName}
                                             existingVolumeName={this.state.existingVolumeName}
                                             validationFailed={validationFailed}
                                             vmStoragePools={storagePools}
                                             vms={vms}
                                             vm={vm} />
                        )}
                        {this.state.mode === CUSTOM_PATH && (
                            <CustomPath idPrefix={idPrefix}
                                        onValueChanged={this.onValueChanged}
                                        device={this.state.device}
                                        validationFailed={validationFailed} />
                        )}
                        {vm.persistent &&
                        <PermanentChange idPrefix={idPrefix}
                                         permanent={this.state.permanent}
                                         onValueChanged={this.onValueChanged}
                                         vm={vm} />}
                    </Form>
                    <AdditionalOptions cacheMode={this.state.cacheMode}
                                       device={this.state.device}
                                       idPrefix={idPrefix}
                                       onValueChanged={this.onValueChanged}
                                       busType={this.state.busType}
                                       serial={this.state.serial}
                                       validationFailed={validationFailed}
                                       supportedDiskBusTypes={this.props.supportedDiskBusTypes} />
                </>
            );
        }

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-dialog-modal-window`} isOpen onClose={Dialogs.close}
                   title={isMediaInsertion ? _("Insert disc media") : _("Add disk")}
                   footer={
                       <>
                           <Button id={`${idPrefix}-dialog-add`}
                                   variant='primary'
                                   isLoading={this.state.addDiskInProgress || this.state.verificationInProgress}
                                   isDisabled={this.state.addDiskInProgress || this.state.verificationInProgress || dialogLoading ||
                                               (storagePools.length == 0 && this.state.mode != CUSTOM_PATH) ||
                                               (this.state.mode == CUSTOM_PATH && this.state.device === "disk" && this.state.customDiskVerificationFailed)}
                                   onClick={isMediaInsertion ? this.onInsertClicked : this.onAddClicked}>
                               {isMediaInsertion ? _("Insert") : _("Add")}
                           </Button>
                           <Button id={`${idPrefix}-dialog-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                {defaultBody}
            </Modal>
        );
    }
}
