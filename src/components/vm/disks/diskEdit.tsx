/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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

import React from 'react';
import cockpit from 'cockpit';

import type { Dialogs } from 'dialogs';
import type { optString, VM, VMDisk, VMDiskDevice } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs, DialogsContext } from 'dialogs.jsx';

import { domainUpdateDiskAttributes } from '../../../libvirtApi/domain.js';
import { diskBusTypes, diskCacheModes, getDiskPrettyName, getDiskFullName } from '../../../helpers.js';
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';
import { InfoPopover } from '../../common/infoPopover.jsx';

const _ = cockpit.gettext;

interface DialogValues {
    cacheMode: optString;
    busType: optString;
    access: string;
}

type OnValueChanged = <K extends keyof DialogValues>(key: K, value: DialogValues[K]) => void;

const NameRow = ({
    idPrefix,
    name,
    diskType
} : {
    idPrefix: string,
    name: optString,
    diskType: optString,
}) => {
    let label = _("ID");
    if (diskType == "file" || diskType == "block" || diskType == "dir")
        label = _("Path");
    else if (diskType === "network")
        label = _("Url");
    else if (diskType === "volume")
        label = _("Storage volume");

    return (
        <FormGroup fieldId={`${idPrefix}-name`} label={label} hasNoPaddingTop>
            <div id={`${idPrefix}-name`}>
                {name}
            </div>
        </FormGroup>
    );
};

const CacheRow = ({
    onValueChanged,
    dialogValues,
    idPrefix,
    shutoff
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    idPrefix: string,
    shutoff: boolean,
}) => {
    return (
        <FormGroup fieldId={`${idPrefix}-cache-mode`}
                   label={_("Cache")}
                   {...!shutoff
                       ? { labelHelp: <InfoPopover bodyContent={_("Machine must be shut off before changing cache mode")} /> }
                       : { }
                   }>
            <FormSelect id={`${idPrefix}-cache-mode`}
                        onChange={(_event, value) => onValueChanged('cacheMode', value)}
                        isDisabled={!shutoff}
                        value={dialogValues.cacheMode ?? "default"}>
                {diskCacheModes.map(cacheMode => {
                    return (
                        <FormSelectOption value={cacheMode} key={cacheMode}
                                          label={cacheMode} />
                    );
                })}
            </FormSelect>
        </FormGroup>
    );
};

const BusRow = ({
    onValueChanged,
    dialogValues,
    diskDevice,
    idPrefix,
    shutoff,
    supportedDiskBusTypes
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    diskDevice: VMDiskDevice,
    idPrefix: string,
    shutoff: boolean,
    supportedDiskBusTypes: string[],
}) => {
    const busTypes: { value: string, disabled?: boolean }[] = diskBusTypes[diskDevice]
            .filter(bus => supportedDiskBusTypes.includes(bus))
            .map(type => ({ value: type }));
    if (busTypes.find(busType => busType.value == dialogValues.busType) == undefined)
        busTypes.push({ value: dialogValues.busType || "", disabled: true });

    return (
        <FormGroup fieldId={`${idPrefix}-bus-type`} label={_("Bus")}
            {...!shutoff
                ? { labelHelp: <InfoPopover bodyContent={_("Machine must be shut off before changing bus type")} /> }
                : { }
            }>
            <FormSelect id={`${idPrefix}-bus-type`}
                onChange={(_event, value) => onValueChanged('busType', value)}
                value={dialogValues.busType}
                isDisabled={!shutoff}>
                {busTypes.map(busType => {
                    return (
                        <FormSelectOption value={busType.value} key={busType.value}
                                          isDisabled={!!busType.disabled}
                                          label={busType.value} />
                    );
                })}
            </FormSelect>
        </FormGroup>
    );
};

const AccessRow = ({
    onValueChanged,
    dialogValues,
    diskDevice,
    idPrefix
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    diskDevice: VMDiskDevice,
    idPrefix: string,
}) => {
    return (
        <FormGroup fieldId={`${idPrefix}-access`} label={_("Access")} isInline hasNoPaddingTop>
            <Radio id={`${idPrefix}-readonly`}
                   name="access"
                   value="readonly"
                   isChecked={dialogValues.access == "readonly" }
                   onChange={(event) => {
                       onValueChanged("access", event.currentTarget.value);
                   }}
                   label={_("Read-only")} />
            {diskDevice != "cdrom" &&
                <Radio id={`${idPrefix}-writable`}
                       name="access"
                       value="writable"
                       isChecked={dialogValues.access == "writable" }
                       onChange={(event) => {
                           onValueChanged("access", event.currentTarget.value);
                       }}
                       label={_("Writeable")} />}
        </FormGroup>
    );
};

export const EditDiskAction = ({
    idPrefix,
    disk,
    vm,
    supportedDiskBusTypes
} : {
    idPrefix: string,
    disk: VMDisk,
    vm: VM,
    supportedDiskBusTypes: string[],
}) => {
    const Dialogs = useDialogs();

    function open() {
        Dialogs.show(<EditDiskModal idPrefix={idPrefix}
                                    disk={disk}
                                    supportedDiskBusTypes={supportedDiskBusTypes}
                                    vm={vm} />);
    }

    const enabled = (Object.keys(diskBusTypes).includes(disk.device || "") &&
                     supportedDiskBusTypes &&
                     supportedDiskBusTypes.length > 0);

    return (
        <Button id={idPrefix}
                isDisabled={!enabled}
                variant='secondary'
                onClick={open}>
            {_("Edit")}
        </Button>
    );
};

interface EditDiskModalProps {
    idPrefix: string;
    disk: VMDisk;
    supportedDiskBusTypes: string[];
    vm: VM;
}

interface EditDiskModalState extends DialogValues {
    dialogError?: string;
    dialogErrorDetail?: string;
}

export class EditDiskModal extends React.Component<EditDiskModalProps, EditDiskModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: EditDiskModalProps) {
        super(props);
        let access;
        if (props.disk.readonly)
            access = "readonly";
        else
            access = "writable";

        this.state = {
            access,
            busType: props.disk.bus,
            cacheMode: props.disk.driver.cache,
        };
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onSaveClicked = this.onSaveClicked.bind(this);
    }

    onValueChanged<K extends keyof DialogValues>(key: K, value: DialogValues[K]): void {
        this.setState({ [key]: value } as Pick<EditDiskModalState, K>);
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onSaveClicked() {
        const Dialogs = this.context;
        const { disk, vm } = this.props;
        const existingTargets = Object.getOwnPropertyNames(vm.disks);

        domainUpdateDiskAttributes({
            connectionName: vm.connectionName,
            objPath: vm.id,
            target: disk.target,
            readonly: this.state.access == "readonly",
            shareable: this.props.disk.shareable,
            busType: this.state.busType,
            cache: this.state.cacheMode,
            existingTargets
        })
                .then(Dialogs.close)
                .catch(exc => this.dialogErrorSet(_("Disk settings could not be saved"), exc.message));
    }

    render() {
        const Dialogs = this.context;
        const { vm, disk, idPrefix, supportedDiskBusTypes } = this.props;

        const defaultBody = (
            <Form isHorizontal>
                <NameRow idPrefix={idPrefix}
                         diskType={disk.type}
                         name={getDiskFullName(disk)} />

                <AccessRow dialogValues={this.state}
                           diskDevice={disk.device}
                           idPrefix={idPrefix}
                           onValueChanged={this.onValueChanged} />

                <BusRow dialogValues={this.state}
                        diskDevice={disk.device || "disk"}
                        idPrefix={idPrefix}
                        onValueChanged={this.onValueChanged}
                        shutoff={vm.state == 'shut off'}
                        supportedDiskBusTypes={supportedDiskBusTypes} />

                <CacheRow dialogValues={this.state}
                        idPrefix={idPrefix}
                        onValueChanged={this.onValueChanged}
                        shutoff={vm.state == 'shut off'} />
            </Form>
        );

        const showWarning = () => {
            if (vm.state === 'running' && (
                (this.state.access == 'readonly' && !disk.readonly) ||
                (this.state.access == 'shareable' && !disk.shareable))) {
                return <NeedsShutdownAlert idPrefix={idPrefix} />;
            }
        };

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-dialog`}
                   isOpen
                   onClose={Dialogs.close}
            >
                <ModalHeader title={cockpit.format(_("Edit $0 attributes"), getDiskPrettyName(disk))} />
                <ModalBody>
                    {showWarning()}
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    {defaultBody}
                </ModalBody>
                <ModalFooter>
                    <Button id={`${idPrefix}-dialog-save`} variant='primary' onClick={this.onSaveClicked}>
                        {_("Save")}
                    </Button>
                    <Button id={`${idPrefix}-dialog-cancel`} variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}
