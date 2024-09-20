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

import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Progress, ProgressVariant } from "@patternfly/react-core/dist/esm/components/Progress";

import { logDebug } from "../../helpers.js";

const _ = cockpit.gettext;

class VmUsageTab extends React.Component {
    render() {
        const vm = this.props.vm;

        const memTotal = vm.currentMemory ? vm.currentMemory * 1024 : 0;
        const [memTotalFmt, memTotalUnit] = cockpit.format_bytes(memTotal, { base2: true, separate: true });
        const rssMem = vm.rssMemory ? vm.rssMemory * 1024 : 0;
        const memRss = cockpit.format_bytes(rssMem, memTotalUnit, { base2: true, separate: true })[0];

        const totalCpus = vm.vcpus && vm.vcpus.count > 0 ? vm.vcpus.count : 0;
        const vmCpuUsage = vm.cpuUsage;
        const cpuUsage = isNaN(vmCpuUsage) ? 0 : parseFloat(vmCpuUsage.toFixed(1));
        const totalCpusStr = cockpit.format(cockpit.ngettext("$0 vCPU", "$0 vCPUs", totalCpus), totalCpus);

        logDebug(`VmUsageTab.render(): rssMem: ${rssMem} KiB, memTotal: ${memTotal} KiB, totalCpus: ${totalCpus}, cpuUsage: ${cpuUsage}`);

        return (
            <Flex direction={{ default: 'column' }}>
                <FlexItem className="memory-usage-chart">
                    <Progress value={rssMem}
                        className="pf-m-sm"
                        min={0} max={memTotal}
                        variant={rssMem / memTotal > 0.9 ? ProgressVariant.danger : ProgressVariant.info}
                        title={_("Memory")}
                        label={cockpit.format("$0 / $1 $2", memRss, memTotalFmt, memTotalUnit)} />
                </FlexItem>
                <FlexItem className="vcpu-usage-chart">
                    <Progress value={cpuUsage}
                        className="pf-m-sm"
                        min={0} max={100}
                        variant={cpuUsage > 90 ? ProgressVariant.danger : ProgressVariant.info}
                        title={_("CPU")}
                        label={cockpit.format("$0% of $1", cpuUsage, totalCpusStr)} />
                </FlexItem>
            </Flex>
        );
    }
}

VmUsageTab.propTypes = {
    vm: PropTypes.object.isRequired,
};

export default VmUsageTab;
