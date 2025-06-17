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

import React from 'react';

import type { VM } from '../../../types';
import type { Config } from '../../../reducers';
import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';

import cockpit from 'cockpit';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import {
    units,
    convertToUnit,
    vmId
} from '../../../helpers.js';
import MemorySelectRow from './memorySelectRow.jsx';
import {
    domainGet,
    domainSetMemory,
    domainSetMaxMemory,
} from '../../../libvirtApi/domain.js';

import './memoryModal.css';

const _ = cockpit.gettext;

interface MemoryModalProps {
    vm: VM;
    config: Config;
}

interface MemoryModalState {
    memory: number,
    memoryUnit: string,
    maxMemory: number,
    maxMemoryUnit: string,
    nodeMaxMemory: number,
    minAllowedMemory: number,
    dialogError?: string;
    dialogErrorDetail?: string;
}

export class MemoryModal extends React.Component<MemoryModalProps, MemoryModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: MemoryModalProps) {
        super(props);
        this.state = {
            memory: props.vm.currentMemory, // Stored always in KiB to ease checks; the conversions to the user presented values happen inside the render
            memoryUnit: units.MiB.name,
            maxMemory: props.vm.memory, // Stored always in KiB to ease checks; the conversions to the user presented values happen inside the render
            maxMemoryUnit: units.MiB.name,
            nodeMaxMemory: props.config.nodeMaxMemory || NaN,
            minAllowedMemory: convertToUnit(128, 'MiB', 'KiB'),
        };
        this.save = this.save.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    onValueChanged<K extends keyof MemoryModalState>(key: K, value: MemoryModalState[K]) {
        let stateDelta: Partial<MemoryModalState> = {};

        if (key == 'memory') {
            const memoryKiB = convertToUnit(value, this.state.memoryUnit, 'KiB');

            if (memoryKiB <= this.state.maxMemory) {
                stateDelta.memory = Math.max(memoryKiB, this.state.minAllowedMemory);
            } else if (memoryKiB > this.state.maxMemory && this.props.vm.state != 'running') {
                stateDelta.memory = Math.min(memoryKiB, this.state.nodeMaxMemory);
                stateDelta.maxMemory = Math.min(memoryKiB, this.state.nodeMaxMemory);
            }
        } else if (key == 'maxMemory') {
            const maxMemoryKiB = convertToUnit(value, this.state.maxMemoryUnit, 'KiB');

            if (maxMemoryKiB < this.state.nodeMaxMemory) {
                stateDelta.maxMemory = Math.max(maxMemoryKiB, this.state.minAllowedMemory);
            } else {
                stateDelta.maxMemory = this.state.nodeMaxMemory;
            }
            if (maxMemoryKiB < this.state.memory) {
                stateDelta.memory = Math.max(maxMemoryKiB, this.state.minAllowedMemory);
            }
        } else if (key == 'memoryUnit' || key == 'maxMemoryUnit')
            stateDelta = { [key]: value };

        this.setState(stateDelta as MemoryModalState);
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    save() {
        const Dialogs = this.context;
        const { vm } = this.props;

        if (vm.memory !== this.state.maxMemory) {
            domainSetMaxMemory({
                id: vm.id,
                connectionName: vm.connectionName,
                maxMemory: this.state.maxMemory
            })
                    .then(() => {
                        if (vm.currentMemory !== this.state.maxMemory) {
                            domainSetMemory({
                                id: vm.id,
                                connectionName: vm.connectionName,
                                memory: this.state.memory,
                                isRunning: vm.state == 'running'
                            })
                                    .then(() => {
                                        if (vm.state !== 'running')
                                            domainGet({ connectionName: vm.connectionName, id: vm.id });
                                        Dialogs.close();
                                    })
                                    .catch(exc => this.dialogErrorSet(_("Memory could not be saved"), exc.message));
                        }
                    })
                    .catch(exc => this.dialogErrorSet(_("Maximum memory could not be saved"), exc.message));
        } else if (vm.currentMemory !== this.state.memory) {
            domainSetMemory({
                id: vm.id,
                connectionName: vm.connectionName,
                memory: this.state.memory,
                isRunning: vm.state == 'running'
            })
                    .then(() => {
                        if (vm.state !== 'running')
                            domainGet({ connectionName: vm.connectionName, id: vm.id });
                        Dialogs.close();
                    })
                    .catch(exc => this.dialogErrorSet(_("Memory could not be saved"), exc.message));
        } else {
            Dialogs.close();
        }
    }

    render() {
        const Dialogs = this.context;
        const vm = this.props.vm;
        const idPrefix = vmId(vm.name) + '-memory-modal';
        const defaultBody = (
            <Form isHorizontal id='memory-config-dialog'>
                <MemorySelectRow id={`${idPrefix}-memory`}
                    label={_("Current allocation")}
                    value={Math.floor(convertToUnit(this.state.memory, 'KiB', this.state.memoryUnit))}
                    minValue={Math.floor(convertToUnit(this.state.minAllowedMemory, 'KiB', this.state.memoryUnit))}
                    maxValue={Math.floor(convertToUnit(this.state.maxMemory, 'KiB', this.state.memoryUnit))}
                    initialUnit={this.state.memoryUnit}
                    onValueChange={value => this.onValueChanged('memory', value)}
                    onUnitChange={(_event, value) => this.onValueChanged('memoryUnit', value)} />

                <MemorySelectRow id={`${idPrefix}-max-memory`}
                    label={_("Maximum allocation")}
                    value={Math.floor(convertToUnit(this.state.maxMemory, 'KiB', this.state.maxMemoryUnit))}
                    minValue={Math.floor(convertToUnit(this.state.minAllowedMemory, 'KiB', this.state.maxMemoryUnit))}
                    maxValue={Math.floor(convertToUnit(this.state.nodeMaxMemory, 'KiB', this.state.maxMemoryUnit))}
                    initialUnit={this.state.maxMemoryUnit}
                    onValueChange={value => this.onValueChanged('maxMemory', value)}
                    onUnitChange={(_event, value) => this.onValueChanged('maxMemoryUnit', value)}
                    helperText={vm.state === 'running' ? _("Only editable when the guest is shut off") : null}
                    isDisabled={vm.state != 'shut off'} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id='vm-memory-modal' isOpen onClose={Dialogs.close}>
                <ModalHeader title={cockpit.format(_("$0 memory adjustment"), vm.name)} />
                <ModalBody>
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    {defaultBody}
                </ModalBody>
                <ModalFooter>
                    <Button id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                        {_("Save")}
                    </Button>
                    <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}

export default MemoryModal;
