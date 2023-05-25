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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon";
import { Text, TextVariants } from "@patternfly/react-core/dist/esm/components/Text";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";
import { DialogsContext } from 'dialogs.jsx';
import { HelpIcon } from '@patternfly/react-icons';

import { CPUModal } from './cpuModal.jsx';
import MemoryModal from './memoryModal.jsx';
import {
    convertToBestUnit,
    rephraseUI,
    units,
    vmId,
} from '../../../helpers.js';
import { updateVm } from '../../../actions/store-actions.js';
import { BootOrderLink } from './bootOrder.jsx';
import { FirmwareLink } from './firmware.jsx';
import { WatchdogLink } from './watchdog.jsx';
import { needsShutdownCpuModel, NeedsShutdownTooltip, needsShutdownVcpu } from '../../common/needsShutdown.jsx';
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

class VmOverviewCard extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            virtXMLAvailable: undefined,
        };
        this.openCpu = this.openCpu.bind(this);
        this.openMemory = this.openMemory.bind(this);
        this.onAutostartChanged = this.onAutostartChanged.bind(this);
    }

    componentDidMount() {
        cockpit.script('type virt-xml', { err: 'ignore' })
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
        const { vm, vms, nodeDevices, libvirtVersion } = this.props;
        const idPrefix = vmId(vm.name);

        const autostart = (
            <DescriptionListDescription>
                <Switch id={`${idPrefix}-autostart-switch`}
                        isChecked={vm.autostart}
                        onChange={this.onAutostartChanged}
                        label={_("Run when host boots")} />
            </DescriptionListDescription>
        );
        const memory = convertToBestUnit(vm.currentMemory, units.KiB);
        const memoryLink = (
            <DescriptionListDescription id={`${idPrefix}-memory-count`}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                        {cockpit.format("$0 $1", parseFloat(memory.value).toFixed(1), memory.unit)}
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
                        {cockpit.format(cockpit.ngettext("$0 vCPU", "$0 vCPUs", vm.vcpus.count), vm.vcpus.count) + ", " +
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
                        <Text component={TextVariants.h4}>
                            {_("General")}
                        </Text>

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
                                <BootOrderLink vm={vm} idPrefix={idPrefix}
                                                   nodeDevices={nodeDevices} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        {vm.persistent && <DescriptionListGroup>
                            <DescriptionListTerm>{_("Autostart")}</DescriptionListTerm>
                            {autostart}
                        </DescriptionListGroup>}

                        <DescriptionListGroup>
                            <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                                <FlexItem>
                                    <DescriptionListTerm>
                                        {_("Watchdog")}
                                    </DescriptionListTerm>
                                </FlexItem>
                                <FlexItem>
                                    <Popover alertSeverityVariant="info"
                                        position="right"
                                        bodyContent={WATCHDOG_INFO_MESSAGE}>
                                        <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                                            <Icon className="overview-icon" status="info">
                                                <HelpIcon noVerticalAlign />
                                            </Icon>
                                        </button>
                                    </Popover>
                                </FlexItem>
                            </Flex>
                            <DescriptionListDescription id={`${idPrefix}-watchdog`}>
                                <WatchdogLink vm={vm} idPrefix={idPrefix} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                                <FlexItem>
                                    <DescriptionListTerm>
                                        {_("Vsock")}
                                    </DescriptionListTerm>
                                </FlexItem>
                                <FlexItem>
                                    <Popover alertSeverityVariant="info"
                                        position="right"
                                        headerContent={_("vsock requires special software")}
                                        bodyContent={VSOCK_INFO_MESSAGE}
                                        footerContent={
                                            <Flex direction={{ default: 'column' }}>
                                                <FlexItem>{SOCAT_EXAMPLE_HEADER}</FlexItem>
                                                {SOCAT_EXAMPLE}
                                            </Flex>
                                        }
                                        hasAutoWidth>
                                        <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                                            <Icon className="overview-icon" status="info">
                                                <HelpIcon noVerticalAlign />
                                            </Icon>
                                        </button>
                                    </Popover>
                                </FlexItem>
                            </Flex>
                            <DescriptionListDescription id={`${idPrefix}-vsock`}>
                                <VsockLink vm={vm} vms={vms} idPrefix={idPrefix} infoMessage={VSOCK_INFO_MESSAGE} socatMessage={SOCAT_EXAMPLE} />
                            </DescriptionListDescription>
                        </DescriptionListGroup>
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
    vms: PropTypes.array.isRequired,
    config: PropTypes.object.isRequired,
    libvirtVersion: PropTypes.number.isRequired,
    nodeDevices: PropTypes.array.isRequired,
};

export default VmOverviewCard;
