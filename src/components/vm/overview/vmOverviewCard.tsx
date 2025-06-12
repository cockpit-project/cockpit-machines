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
import cockpit from 'cockpit';

import type { VM } from '../../../types';
import type { Config } from '../../../reducers';
import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";
import { DialogsContext } from 'dialogs.jsx';

import { CPUModal } from './cpuModal.jsx';
import MemoryModal from './memoryModal.jsx';
import {
    rephraseUI,
    vmId,
} from '../../../helpers.js';
import { updateVm } from '../../../actions/store-actions.js';
import { BootOrderLink } from './bootOrder.jsx';
import { FirmwareLink } from './firmware.jsx';
import { WatchdogLink } from './watchdog.jsx';
import { needsShutdownCpuModel, NeedsShutdownTooltip, needsShutdownVcpu } from '../../common/needsShutdown.jsx';
import { InfoPopover } from '../../common/infoPopover.jsx';
import { VsockLink } from './vsock.jsx';
import { StateIcon } from '../../common/stateIcon.jsx';
import { domainChangeAutostart, domainGet } from '../../../libvirtApi/domain.js';
import store from '../../../store.js';
import {
    SOCAT_EXAMPLE,
    SOCAT_EXAMPLE_HEADER,
    VSOCK_INFO_MESSAGE,
    WATCHDOG_INFO_MESSAGE,
} from './helpers.jsx';

import '../../common/overviewCard.css';

const _ = cockpit.gettext;

interface VmOverviewCardProps {
    vm: VM;
    vms: VM[];
    maxVcpu: string;
    cpuModels: string[];
    config: Config;
    loaderElems: HTMLCollection;
    libvirtVersion: number;
}

interface VmOverviewCardState {
    virtXMLAvailable: boolean | undefined,
}

class VmOverviewCard extends React.Component<VmOverviewCardProps, VmOverviewCardState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: VmOverviewCardProps) {
        super(props);

        this.state = {
            virtXMLAvailable: undefined,
        };
        this.openCpu = this.openCpu.bind(this);
        this.openMemory = this.openMemory.bind(this);
        this.onAutostartChanged = this.onAutostartChanged.bind(this);
    }

    componentDidMount() {
        cockpit.script('type virt-xml', [], { err: 'ignore' })
                .then(() => {
                    this.setState({ virtXMLAvailable: true });
                }, () => this.setState({ virtXMLAvailable: false }));
    }

    onAutostartChanged() {
        const { vm } = this.props;
        const autostart = !vm.autostart;

        domainChangeAutostart({ connectionName: vm.connectionName, vmName: vm.name, autostart })
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                });
    }

    openCpu() {
        const Dialogs = this.context;
        Dialogs.show(<CPUModal vm={this.props.vm} maxVcpu={this.props.maxVcpu} models={this.props.cpuModels} />);
    }

    openMemory() {
        const Dialogs = this.context;
        Dialogs.show(<MemoryModal vm={this.props.vm} config={this.props.config} />);
    }

    render() {
        const { vm, vms, libvirtVersion } = this.props;
        const idPrefix = vmId(vm.name);

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
                        {cockpit.format_bytes(vm.currentMemory * 1024, { base2: true })}
                    </FlexItem>
                    <Button variant="link" isInline isDisabled={!vm.persistent} onClick={this.openMemory}>
                        {_("edit")}
                    </Button>
                </Flex>
            </DescriptionListDescription>
        );

        let cpuEditButton = (
            <Button variant="link" isInline isDisabled={!vm.persistent || !this.state.virtXMLAvailable} onClick={this.openCpu}>
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
        const cpuLink = (
            <DescriptionListDescription id={`${idPrefix}-cpu`}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                        {cockpit.format(cockpit.ngettext("$0 vCPU", "$0 vCPUs", Number(vm.vcpus.count)), vm.vcpus.count) + ", " +
                        rephraseUI('cpuMode', vm.cpu.mode) + (vm.cpu.model ? ` (${vm.cpu.model})` : '')}
                    </FlexItem>
                    { (needsShutdownCpuModel(vm) || needsShutdownVcpu(vm)) && <NeedsShutdownTooltip iconId="cpu-tooltip" tooltipId="tip-cpu" /> }
                    { cpuEditButton }
                </Flex>
            </DescriptionListDescription>
        );

        return (
            <Flex className="overview-tab" direction={{ default: "column", "2xl": "row" }}>
                <FlexItem>
                    <DescriptionList isHorizontal>
                        <Content component={ContentVariants.h4}>
                            {_("General")}
                        </Content>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Connection")}</DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-connection`}>{rephraseUI('connections', vm.connectionName)}</DescriptionListDescription>
                        </DescriptionListGroup>

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
                            <DescriptionListTerm>{_("CPU")}</DescriptionListTerm>
                            {cpuLink}
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Boot order")}</DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-boot-order`}>
                                <BootOrderLink vm={vm} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        {vm.persistent && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Autostart")}</DescriptionListTerm>
                            {autostart}
                        </DescriptionListGroup>}

                        <DescriptionListGroup>
                            <DescriptionListTerm>
                                {_("Watchdog")}
                                <InfoPopover
                                    alertSeverityVariant="info"
                                    position="right"
                                    bodyContent={WATCHDOG_INFO_MESSAGE}
                                />
                            </DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-watchdog`}>
                                <WatchdogLink vm={vm} idPrefix={idPrefix} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>
                                {_("Vsock")}
                                <InfoPopover
                                    alertSeverityVariant="info"
                                    position="right"
                                    headerContent={_("vsock requires special software")}
                                    bodyContent={VSOCK_INFO_MESSAGE}
                                    footerContent={
                                        <Flex direction={{ default: 'column' }}>
                                            <FlexItem>{SOCAT_EXAMPLE_HEADER}</FlexItem>
                                            {SOCAT_EXAMPLE}
                                        </Flex>
                                    }
                                    hasAutoWidth
                                />
                            </DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-vsock`}>
                                <VsockLink vm={vm} vms={vms} idPrefix={idPrefix} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                    </DescriptionList>
                </FlexItem>
                <FlexItem>
                    <DescriptionList isHorizontal>
                        <Content component={ContentVariants.h4}>
                            {_("Hypervisor details")}
                        </Content>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Emulated machine")}</DescriptionListTerm>
                            <DescriptionListDescription id={`${idPrefix}-emulated-machine`}>{vm.emulatedMachine}</DescriptionListDescription>
                        </DescriptionListGroup>

                        { this.props.loaderElems && libvirtVersion >= 5002000 && // <os firmware=[bios/efi]' settings is available only for libvirt version >= 5.2. Before that version it silently ignores this attribute in the XML
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Firmware")}</DescriptionListTerm>
                                <FirmwareLink vm={vm}
                                              loaderElems={this.props.loaderElems}
                                              idPrefix={idPrefix} />
                            </DescriptionListGroup>}
                    </DescriptionList>
                </FlexItem>
            </Flex>
        );
    }
}

export default VmOverviewCard;
