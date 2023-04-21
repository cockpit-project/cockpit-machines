/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2023 Red Hat, Inc.
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

import React, { useState } from 'react';
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormSelect, FormSelectOption, FormSelectOptionGroup } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { InfoAltIcon } from '@patternfly/react-icons';

import { useDialogs } from 'dialogs.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainSetVCPUSettings, domainSetCpuMode } from "../../../libvirtApi/domain.js";
import { digitFilter } from "../../../helpers.js";
import { NeedsShutdownAlert } from '../../common/needsShutdown.jsx';

const _ = cockpit.gettext;

const dividers = (num) => {
    const divs = [1];

    for (let i = 2; i < num; i++) {
        if (num % i === 0) {
            divs.push(i);
        }
    }

    if (num > 1) {
        divs.push(num);
    }

    return divs;
};

const clamp = (value, max, min) => {
    return value < min || isNaN(value) ? min : (value > max ? max : value);
};

export const CPUModal = ({ vm, maxVcpu, models }) => {
    const Dialogs = useDialogs();

    const [error, setError] = useState(undefined);
    const [sockets, setSockets] = useState(vm.cpu.topology.sockets || 1);
    const [threads, setThreads] = useState(vm.cpu.topology.threads || 1);
    const [cores, setCores] = useState(vm.cpu.topology.cores || 1);
    const [max, setMax] = useState(vm.vcpus.max || 1);
    const [count, setCount] = useState(parseInt(vm.vcpus.count) || 1);
    const [cpuMode, setCpuMode] = useState(vm.cpu.mode);
    const [cpuModel, setCpuModel] = useState(vm.cpu.model);
    const [isLoading, setIsLoading] = useState(false);

    function onMaxChange (value) {
        const maxHypervisor = parseInt(maxVcpu);
        let maxValue = parseInt(value);

        // Check new value for limits
        maxValue = clamp(maxValue, maxHypervisor, 1);

        // Recalculate new values for sockets, cores and threads according to new max value
        // Max value = Sockets * Cores * Threads
        const stateDelta = { max: maxValue, sockets, cores };

        // If count of used VCPU greater then new max value, then change it to new max value
        if (maxValue < count) {
            stateDelta.count = maxValue;
        }

        // Recalculate sockets first, and get array of all divisors of new max values
        let divs = dividers(stateDelta.max);

        // If current sockets value is not in divisors array, then change it to max divisor
        if (divs.indexOf(sockets) === -1 || (vm.cpu.topology.sockets || 1) === sockets) {
            stateDelta.sockets = divs[divs.length - 1];
        }

        // Get next divisors
        divs = dividers(stateDelta.max / stateDelta.sockets);
        if (divs.indexOf(cores) === -1) {
            stateDelta.cores = divs[divs.length - 1];
        }

        // According to: Max value = Sockets * Cores * Threads. Threads = Max value / ( Sockets * Cores )
        stateDelta.threads = stateDelta.max / (stateDelta.cores * stateDelta.sockets);
        setSockets(stateDelta.sockets);
        setCores(stateDelta.cores);
        setThreads(stateDelta.threads);
        if (stateDelta.count)
            setCount(stateDelta.count);
        setMax(stateDelta.max);
    }

    function onCountSelect (value) {
        const newValue = clamp(value, max, 1);
        setCount(parseInt(newValue));
    }

    function onSocketChange (value) {
        const stateDelta = { sockets, cores };
        stateDelta.sockets = parseInt(value);

        // Get divisors of Max VCPU number divided by number of sockets
        const divs = dividers(max / stateDelta.sockets);

        // If current cores value is not in divisors array, then change it to max divisor
        if (divs.indexOf(cores) === -1) {
            stateDelta.cores = divs[divs.length - 1];
        }

        // Likewise: Max value = Sockets * Cores * Threads. Sockets = Max value / ( Threads * Cores )
        stateDelta.threads = (max / (stateDelta.sockets * stateDelta.cores));
        setSockets(stateDelta.sockets);
        setCores(stateDelta.cores);
        setThreads(stateDelta.threads);
    }

    function onThreadsChange (value) {
        const stateDelta = { sockets, threads };
        stateDelta.threads = parseInt(value);
        const divs = dividers(max / stateDelta.threads);

        // If current sockets value is not in divisors array, then change it to max divisor
        if (divs.indexOf(stateDelta.sockets) === -1) {
            stateDelta.sockets = divs[divs.length - 1];
        }

        // Likewise: Max value = Sockets * Cores * Threads. Cores = Max value / ( Threads * Sockets )
        stateDelta.cores = (max / (stateDelta.sockets * stateDelta.threads));

        setSockets(stateDelta.sockets);
        setCores(stateDelta.cores);
        setThreads(stateDelta.threads);
    }

    function onCoresChange (value) {
        const stateDelta = { sockets, threads };
        stateDelta.cores = parseInt(value);

        const divs = dividers(max / stateDelta.cores);

        // If current sockets value is not in divisors array, then change it to max divisor
        if (divs.indexOf(stateDelta.sockets) === -1) {
            stateDelta.sockets = divs[divs.length - 1];
        }

        // Likewise: Max value = Sockets * Cores * Threads. Threads = Max value / ( Cores * Sockets )
        stateDelta.threads = (max / (stateDelta.sockets * stateDelta.cores));

        setSockets(stateDelta.sockets);
        setCores(stateDelta.cores);
        setThreads(stateDelta.threads);
    }

    function saveTopology() {
        return domainSetVCPUSettings({
            name: vm.name,
            connectionName: vm.connectionName,
            isRunning: vm.state == 'running',
            max,
            count,
            sockets,
            threads,
            cores,
        }).then(Dialogs.close, exc => setError({ dialogError: _("vCPU and CPU topology settings could not be saved"), dialogErrorDetail: exc.message }));
    }

    // First we need to update CPU mode, since libvirt resets topology upon mode/model change
    function saveCPUMode() {
        setIsLoading(true);
        domainSetCpuMode({
            name: vm.name,
            id: vm.id,
            connectionName: vm.connectionName,
            mode: cpuMode,
            model: cpuModel
        }).then(saveTopology, exc => {
            setIsLoading(false);
            setError({ dialogError: _("CPU mode could not be saved"), dialogErrorDetail: exc.message });
        });
    }

    let caution = null;
    if (vm.state === 'running' && (
        sockets != (vm.cpu.topology.sockets || 1) ||
        threads != (vm.cpu.topology.threads || 1) ||
        cores != (vm.cpu.topology.cores || 1) ||
        max != vm.vcpus.max ||
        count != vm.vcpus.count)
    )
        caution = <NeedsShutdownAlert idPrefix="cpu-modal" />;

    const defaultBody = (
        <Form isHorizontal className="cpu-modal">
            { caution }
            { error && error.dialogError && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} /> }
            <Flex flexWrap={{ default: "wrap" }}>
                <Flex direction={{ default: "column" }}>
                    <FormGroup fieldId="machines-vcpu-count-field" label={_("vCPU count")}
                               labelIcon={
                                   <Popover bodyContent={_("Fewer than the maximum number of virtual CPUs should be enabled.")}>
                                       <button onClick={e => e.preventDefault()} className="pf-c-form__group-label-help">
                                           <InfoAltIcon noVerticalAlign />
                                       </button>
                                   </Popover>}>
                        <TextInput id="machines-vcpu-count-field"
                                   type="number" inputMode="numeric" pattern="[0-9]*" value={count}
                                   onKeyPress={digitFilter}
                                   onChange={onCountSelect} />
                    </FormGroup>

                    <FormGroup fieldId="machines-vcpu-max-field" label={_("vCPU maximum")}
                               labelIcon={
                                   <Popover bodyContent={maxVcpu
                                       ? cockpit.format(_("Maximum number of virtual CPUs allocated for the guest OS, which must be between 1 and $0"), parseInt(maxVcpu))
                                       : _("Maximum number of virtual CPUs allocated for the guest OS")}>
                                       <button onClick={e => e.preventDefault()} className="pf-c-form__group-label-help">
                                           <InfoAltIcon noVerticalAlign />
                                       </button>
                                   </Popover>}>
                        <TextInput id="machines-vcpu-max-field"
                                   type="number" inputMode="numeric" pattern="[0-9]*"
                                   onKeyPress={digitFilter}
                                   onChange={onMaxChange} value={max} />
                    </FormGroup>
                </Flex>
                <Flex direction={{ default: "column" }}>
                    <FormGroup fieldId="sockets" label={_("Sockets")}
                               labelIcon={
                                   <Popover bodyContent={_("Preferred number of sockets to expose to the guest.")}>
                                       <button onClick={e => e.preventDefault()} className="pf-c-form__group-label-help">
                                           <InfoAltIcon noVerticalAlign />
                                       </button>
                                   </Popover>}>
                        <FormSelect id="socketsSelect"
                                    value={sockets.toString()}
                                    onChange={onSocketChange}>
                            {dividers(max).map((t) => <FormSelectOption key={t.toString()} value={t.toString()} label={t.toString()} />)}
                        </FormSelect>
                    </FormGroup>
                    <FormGroup fieldId="coresSelect" label={_("Cores per socket")}>
                        <FormSelect id="coresSelect"
                                    value={cores.toString()}
                                    onChange={onCoresChange}>
                            {dividers(max).map((t) => <FormSelectOption key={t.toString()} value={t.toString()} label={t.toString()} />)}
                        </FormSelect>
                    </FormGroup>

                    <FormGroup fieldId="threadsSelect" label={_("Threads per core")}>
                        <FormSelect id="threadsSelect"
                                    value={threads.toString()}
                                    onChange={onThreadsChange}>
                            {dividers(max).map((t) => <FormSelectOption key={t.toString()} value={t.toString()} label={t.toString()} />)}
                        </FormSelect>
                    </FormGroup>
                </Flex>
            </Flex>
            <FormGroup id="cpu-model-select-group" label={_("Mode")}>
                <FormSelect value={cpuModel || cpuMode}
                            aria-label={_("Mode")}
                            onChange={value => {
                                if ((value == "host-model" || value == "host-passthrough")) {
                                    setCpuMode(value);
                                    setCpuModel(undefined);
                                } else {
                                    setCpuModel(value);
                                    setCpuMode("custom");
                                }
                            }}>
                    <FormSelectOption key="host-model"
                                      value="host-model"
                                      label="host-model" />
                    <FormSelectOption key="host-passthrough"
                                      value="host-passthrough"
                                      label="host-passthrough" />
                    <FormSelectOptionGroup key="custom" label={_("custom")}>
                        {models.map(model => <FormSelectOption key={model} value={model} label={model} />)}
                    </FormSelectOptionGroup>
                </FormSelect>
            </FormGroup>
        </Form>
    );

    return (
        <Modal position="top" variant="medium" id='machines-cpu-modal-dialog' isOpen onClose={Dialogs.close}
               title={cockpit.format(_("$0 CPU details"), vm.name)}
               footer={
                   <>
                       <Button id='machines-cpu-modal-dialog-apply' variant='primary' onClick={saveCPUMode} isDisabled={isLoading} isLoading={isLoading}>
                           {_("Apply")}
                       </Button>
                       <Button id='machines-cpu-modal-dialog-cancel' variant='link' className='btn-cancel' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            { defaultBody }
        </Modal>
    );
};
