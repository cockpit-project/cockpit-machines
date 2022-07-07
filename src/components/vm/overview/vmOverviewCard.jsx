/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import {
    Button, Text, TextVariants, Tooltip,
    DescriptionList, DescriptionListGroup, DescriptionListTerm, DescriptionListDescription,
    Flex, FlexItem,
    Switch,
} from "@patternfly/react-core";
import { DialogsContext } from 'dialogs.jsx';

import { VCPUModal } from './vcpuModal.jsx';
import { CPUTypeModal } from './cpuTypeModal.jsx';
import MemoryModal from './memoryModal.jsx';
import {
    rephraseUI,
    vmId
} from '../../../helpers.js';
import { updateVm } from '../../../actions/store-actions.js';
import { BootOrderLink } from './bootOrder.jsx';
import { FirmwareLink } from './firmware.jsx';
import WarningInactive from '../../common/warningInactive.jsx';
import { StateIcon } from '../../common/stateIcon.jsx';
import { domainChangeAutostart, domainGet } from '../../../libvirtApi/domain.js';
import store from '../../../store.js';

import '../../common/overviewCard.css';

const _ = cockpit.gettext;

class VmOverviewCard extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            runningVmUpdated: false,
            virtXMLAvailable: undefined,
        };
        this.openVcpu = this.openVcpu.bind(this);
        this.openCpuType = this.openCpuType.bind(this);
        this.openMemory = this.openMemory.bind(this);
        this.onAutostartChanged = this.onAutostartChanged.bind(this);
    }

    componentDidMount() {
        cockpit.spawn(['which', 'virt-xml'], { err: 'ignore' })
                .then(() => {
                    this.setState({ virtXMLAvailable: true });
                }, () => this.setState({ virtXMLAvailable: false }));
    }

    onAutostartChanged() {
        const { vm } = this.props;
        const autostart = !vm.autostart;

        domainChangeAutostart({ connectionName: vm.connectionName, vmName: vm.name, autostart: autostart })
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                });
    }

    openVcpu() {
        const Dialogs = this.context;
        Dialogs.show(<VCPUModal vm={this.props.vm} maxVcpu={this.props.maxVcpu} />);
    }

    openCpuType() {
        const Dialogs = this.context;
        Dialogs.show(<CPUTypeModal vm={this.props.vm} models={this.props.cpuModels} />);
    }

    openMemory() {
        const Dialogs = this.context;
        Dialogs.show(<MemoryModal vm={this.props.vm} config={this.props.config} />);
    }

    render() {
        const { vm, nodeDevices, libvirtVersion } = this.props;
        const idPrefix = vmId(vm.name);

        const vcpusChanged = (vm.vcpus.count !== vm.inactiveXML.vcpus.count) ||
                             (vm.vcpus.max !== vm.inactiveXML.vcpus.max) ||
                             (vm.cpu.sockets !== vm.inactiveXML.cpu.sockets) ||
                             (vm.cpu.threads !== vm.inactiveXML.cpu.threads) ||
                             (vm.cpu.cores !== vm.inactiveXML.cpu.cores);

        /* The live xml shows what host-model expanded to when started
         * This is important since the expansion varies depending on the host and so needs to be tracked across migration
         */
        let cpuModeChanged = false;
        if (vm.inactiveXML.cpu.mode == 'host-model')
            cpuModeChanged = !(vm.cpu.mode == 'host-model' || vm.cpu.model == this.props.cpuHostModel);
        else if (vm.inactiveXML.cpu.mode == 'host-passthrough')
            cpuModeChanged = vm.cpu.mode != 'host-passthrough';
        else if (vm.inactiveXML.cpu.mode == 'custom')
            cpuModeChanged = vm.cpu.mode !== 'custom' || vm.cpu.model !== vm.inactiveXML.cpu.model;

        const autostart = (
            <DescriptionListDescription>
                <Switch id={`${idPrefix}-autostart-switch`}
                        isChecked={vm.autostart}
                        onChange={this.onAutostartChanged}
                        label={_("Run when host boots")} />
            </DescriptionListDescription>
        );
        const memoryLink = (
            <DescriptionListDescription id={`${idPrefix}-memory-count`}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                        {cockpit.format_bytes(vm.currentMemory * 1024)}
                    </FlexItem>
                    <Button variant="link" isInline isDisabled={!vm.persistent} onClick={this.openMemory}>
                        {_("edit")}
                    </Button>
                </Flex>
            </DescriptionListDescription>
        );
        const vcpuLink = (
            <DescriptionListDescription id={`${idPrefix}-vcpus-count`}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{vm.vcpus.count}</FlexItem>
                    { vm.persistent && vm.state === "running" && vcpusChanged && <WarningInactive iconId="vcpus-tooltip" tooltipId="tip-vcpus" /> }
                    <Button variant="link" isInline isDisabled={!vm.persistent} onClick={this.openVcpu}>
                        {_("edit")}
                    </Button>
                </Flex>
            </DescriptionListDescription>
        );

        let cpuEditButton = (
            <Button variant="link" isInline isAriaDisabled={!vm.persistent || !this.state.virtXMLAvailable} onClick={this.openCpuType}>
                {_("edit")}
            </Button>
        );
        if (!this.state.virtXMLAvailable) {
            cpuEditButton = (
                <Tooltip id='virt-install-missing'
                         content={_("virt-install package needs to be installed on the system in order to edit this attribute")}>
                    {cpuEditButton}
                </Tooltip>
            );
        }
        const vmCpuType = (
            <DescriptionListDescription id={`${idPrefix}-cpu-model`}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                        {rephraseUI('cpuMode', vm.cpu.mode) + (vm.cpu.model ? ` (${vm.cpu.model})` : '')}
                    </FlexItem>
                    { vm.persistent && vm.state === "running" && cpuModeChanged && <WarningInactive iconId="cpu-tooltip" tooltipId="tip-cpu" /> }
                    { cpuEditButton }
                </Flex>
            </DescriptionListDescription>
        );

        return (
            <Flex className="overview-tab" direction={{ default:"column", "2xl": "row" }}>
                <FlexItem>
                    <DescriptionList isHorizontal>
                        <Text component={TextVariants.h4}>
                            {_("General")}
                        </Text>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("State")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                <StateIcon error={vm.error}
                                               state={vm.state}
                                               valueId={`${idPrefix}-${vm.connectionName}-state`}
                                               dismissError={() => store.dispatch(updateVm({
                                                   connectionName: vm.connectionName,
                                                   name: vm.name,
                                                   error: null
                                               }))} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Memory")}</DescriptionListTerm>
                            {memoryLink}
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("vCPUs")}</DescriptionListTerm>
                            {vcpuLink}
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("CPU type")}</DescriptionListTerm>
                            {vmCpuType}
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Boot order")}</DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-boot-order`}>
                                <BootOrderLink vm={vm} idPrefix={idPrefix}
                                                   nodeDevices={nodeDevices} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        {vm.persistent && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Autostart")}</DescriptionListTerm>
                            {autostart}
                        </DescriptionListGroup>}
                    </DescriptionList>
                </FlexItem>
                <FlexItem>
                    <DescriptionList isHorizontal>
                        <Text component={TextVariants.h4}>
                            {_("Hypervisor details")}
                        </Text>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Emulated machine")}</DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-emulated-machine`}>{vm.emulatedMachine}</DescriptionListDescription>
                        </DescriptionListGroup>

                        { this.props.loaderElems && libvirtVersion >= 5002000 && // <os firmware=[bios/efi]' settings is available only for libvirt version >= 5.2. Before that version it silently ignores this attribute in the XML
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Firmware")}</DescriptionListTerm>
                                <FirmwareLink vm={vm}
                                              loaderElems={this.props.loaderElems}
                                              libvirtVersion={libvirtVersion}
                                              idPrefix={idPrefix} />
                            </DescriptionListGroup>}
                    </DescriptionList>
                </FlexItem>
            </Flex>
        );
    }
}

VmOverviewCard.propTypes = {
    vm: PropTypes.object.isRequired,
    config: PropTypes.object.isRequired,
    libvirtVersion: PropTypes.number.isRequired,
    nodeDevices: PropTypes.array.isRequired,
};

export default VmOverviewCard;
