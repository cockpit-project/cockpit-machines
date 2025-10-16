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

import type { VM } from '../../types';
import type { Notification } from '../../app';

import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";
import { Progress, ProgressVariant } from "@patternfly/react-core/dist/esm/components/Progress";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";

import { runVirsh, domainGet } from '../../libvirtApi/domain';

const _ = cockpit.gettext;

async function enable_balloon_polling(vm: VM, onAddErrorNotification: (n: Notification) => void) {
    try {
        await runVirsh(vm, ["dommemstat", vm.uuid, "--period", "10", "--config", ...(vm.state == "running") ? ["--live"] : []]);
        await domainGet(vm);
    } catch (exc) {
        console.log("ERROR", exc);
        onAddErrorNotification({
            text: _("Failed to enable meory usage polling."),
            detail: String(exc),
            resourceId: vm.id,
        });
    }
}

const VmUsageTab = ({
    vm,
    onAddErrorNotification,
} : {
    vm: VM,
    onAddErrorNotification: (n: Notification) => void
}) => {
    let mem_usage;

    if (vm.hasPollingMemBalloon) {
        const memTotal = vm.currentMemory ? vm.currentMemory * 1024 : 0;
        const [memTotalFmt, memTotalUnit] = cockpit.format_bytes(memTotal, { base2: true, separate: true });
        let usedMem: number;
        let usedMemFmt: string;
        if (vm.state != "running") {
            usedMem = 0;
            usedMemFmt = "0";
        } else if (vm.memoryUsed === undefined) {
            usedMem = 0;
            usedMemFmt = _("waiting");
        } else {
            usedMem = vm.memoryUsed * 1024;
            usedMemFmt = cockpit.format_bytes(usedMem, memTotalUnit, { base2: true, separate: true })[0];
        }

        mem_usage = (
            <Progress value={usedMem}
                className="pf-m-sm"
                min={0} max={memTotal}
                variant={usedMem / memTotal > 0.9 ? ProgressVariant.danger : undefined}
                title={_("Memory")}
                label={cockpit.format("$0 / $1 $2", usedMemFmt, memTotalFmt, memTotalUnit)} />
        );
    } else {
        mem_usage = (
            <Split>
                <SplitItem>
                    {_("Memory usage reporting not enabled")}
                </SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                    <Button isInline variant="link" onClick={() => enable_balloon_polling(vm, onAddErrorNotification)}>
                        {_("enable")}
                    </Button>
                </SplitItem>
            </Split>
        );
    }

    const totalCpus = vm.vcpus && Number(vm.vcpus.count) > 0 ? Number(vm.vcpus.count) : 0;
    const vmCpuUsage = vm.cpuUsage;
    const cpuUsage = vmCpuUsage || 0;
    const totalCpusStr = cockpit.format(cockpit.ngettext("$0 vCPU", "$0 vCPUs", totalCpus), totalCpus);

    return (
        <Flex direction={{ default: 'column' }}>
            <FlexItem className="memory-usage-chart">
                {mem_usage}
            </FlexItem>
            <FlexItem className="vcpu-usage-chart">
                <Progress value={cpuUsage}
                    className="pf-m-sm"
                    min={0} max={100}
                    variant={cpuUsage > 90 ? ProgressVariant.danger : undefined}
                    title={_("CPU")}
                    label={cockpit.format("$0% of $1", cpuUsage.toFixed(1), totalCpusStr)} />
            </FlexItem>
        </Flex>
    );
};

export default VmUsageTab;
