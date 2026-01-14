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
import cockpit from 'cockpit';
import React, { useEffect, useState } from 'react';

import type { VM, VMState } from '../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { PowerOffIcon, RedoIcon } from '@patternfly/react-icons';
import { useDialogs } from 'dialogs.jsx';
import { fmt_to_fragments } from 'utils.jsx';
import { KebabDropdown } from 'cockpit-components-dropdown.jsx';

import { vmId } from "../../helpers.js";

import { CloneDialog } from './vmCloneDialog.jsx';
import { ConfirmDialog } from './confirmDialog.jsx';
import { DeleteDialog } from "./deleteDialog.jsx";
import { MigrateDialog } from './vmMigrateDialog.jsx';
import { RenameDialog } from './vmRenameDialog.jsx';
import { EditDescriptionDialog } from './vmEditDescriptionDialog.jsx';
import { canReplaceSpice, ReplaceSpiceDialog } from './vmReplaceSpiceDialog.jsx';
import {
    domainCanReset,
    domainCanInstall,
    domainInstall,
    vmDomainMethod,
    virtXmlAdd
} from '../../libvirtApi/domain.js';
import { appState } from "../../state";

const _ = cockpit.gettext;

const domainCanRun = (vmState: VMState, hasInstallPhase: boolean) => !hasInstallPhase && vmState == 'shut off';
const domainCanShutdown = (vmState: VMState) => domainCanReset(vmState);
const domainCanPause = (vmState: VMState) => vmState == 'running';
const domainCanRename = (vmState: VMState) => vmState == 'shut off';
const domainCanResume = (vmState: VMState) => vmState == 'paused';

function startOperationProgress(vm: VM) {
    appState.updateVm(vm, { operationInProgressFromState: vm.state, onShutOff: null });
}

function isOperationInProgress(vm: VM) {
    return vm.state == vm.operationInProgressFromState;
}

function setVmError(vm: VM, msg: string, ex: unknown) {
    console.warn(msg, ":", String(ex));
    appState.updateVm(
        vm,
        {
            operationInProgressFromState: undefined,
            onShutOff: null,
            error: {
                text: msg,
                detail: String(ex),
            }
        }
    );
}

export async function vmStart(vm: VM) {
    startOperationProgress(vm);
    try {
        await vmDomainMethod<void>(vm, 'Create', 'u', 0);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to start"), vm.name), ex);
    }
}

async function onInstall(vm: VM) {
    try {
        await domainInstall({ vm });
    } catch (ex) {
        appState.addNotification({
            text: cockpit.format(_("VM $0 failed to get installed"), vm.name),
            detail: String(ex).split(/Traceback(.+)/)[0],
            resourceId: vm.id,
        });
    }
}

export async function vmReboot(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'Reboot', 'u', 0);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to reboot"), vm.name), ex);
    }
}

export async function vmForceReboot(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'Reset', 'u', 0);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to force reboot"), vm.name), ex);
    }
}

export async function vmShutdown(vm: VM) {
    startOperationProgress(vm);
    try {
        await vmDomainMethod<void>(vm, 'Shutdown', 'u', 0);
        if (!vm.persistent)
            cockpit.location.go(["vms"]);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to shutdown"), vm.name), ex);
    }
}

export async function vmPause(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'Suspend', '');
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to pause"), vm.name), ex);
    }
}

export async function vmResume(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'Resume', '');
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to resume"), vm.name), ex);
    }
}

export async function vmForceOff(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'Destroy', 'u', 0);
        if (!vm.persistent)
            cockpit.location.go(["vms"]);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to force shutdown"), vm.name), ex);
    }
}

export async function onSendNMI(vm: VM) {
    try {
        await vmDomainMethod<void>(vm, 'InjectNMI', 'u', 0);
    } catch (ex) {
        setVmError(vm, cockpit.format(_("VM $0 failed to send NMI"), vm.name), ex);
    }
}

export async function addTPM(vm: VM): Promise<void> {
    await virtXmlAdd(vm, "tpm", "default");
}

const onAddTPM = async (vm: VM) => {
    try {
        await addTPM(vm);
    } catch (ex) {
        appState.addNotification({
            text: cockpit.format(_("Failed to add TPM to VM $0"), vm.name),
            detail: String(ex),
            resourceId: vm.id,
        });
    }
};

export const VmActions = ({
    vm,
    vms,
    isDetailsPage = undefined
} : {
    vm : VM,
    vms?: VM[],
    isDetailsPage?: boolean | undefined,
}) => {
    const Dialogs = useDialogs();
    const [virtCloneAvailable, setVirtCloneAvailable] = useState(false);

    useEffect(() => {
        cockpit.script('type virt-clone', [], { err: 'ignore' })
                .then(() => setVirtCloneAvailable(true));
    }, []);

    const id = `${vmId(vm.name)}-${vm.connectionName}`;
    const state = vm.state;
    const hasInstallPhase = vm.metadata && vm.metadata.hasInstallPhase;
    const dropdownItems = [];

    let shutdown;

    if (domainCanPause(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-pause`}
                          id={`${id}-pause`}
                          onClick={() => vmPause(vm)}>
                {_("Pause")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-pause" />);
    }

    if (domainCanResume(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-resume`}
                          id={`${id}-resume`}
                          onClick={() => vmResume(vm)}>
                {_("Resume")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-resume" />);
    }

    if (domainCanShutdown(state)) {
        shutdown = (
            <Button key='action-shutdown'
                    size="sm"
                    variant="secondary"
                    isLoading={isOperationInProgress(vm)}
                    isDisabled={isOperationInProgress(vm)}
                    id={`${id}-shutdown-button`}
                    onClick={() => Dialogs.show(
                        <ConfirmDialog idPrefix={id}
                            title={fmt_to_fragments(_("Shut down $0?"), <b>{vm.name}</b>)}
                            titleIcon={PowerOffIcon}
                            vm={vm}
                            actionsList={[
                                {
                                    variant: "primary",
                                    handler: () => vmShutdown(vm),
                                    name: _("Shut down"),
                                    id: "off",
                                },
                                {
                                    variant: "secondary",
                                    handler: () => vmReboot(vm),
                                    name: _("Reboot"),
                                    id: "reboot",
                                },
                            ]} />
                    )}>
                {_("Shut down")}
            </Button>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-off`}
                          id={`${id}-off`}
                          onClick={() => Dialogs.show(
                              <ConfirmDialog idPrefix={id}
                                  title={fmt_to_fragments(_("Shut down $0?"), <b>{vm.name}</b>)}
                                  titleIcon={PowerOffIcon}
                                  vm={vm}
                                  actionsList={[
                                      {
                                          variant: "primary",
                                          handler: () => vmShutdown(vm),
                                          name: _("Shut down"),
                                          id: "off",
                                      },
                                  ]} />
                          )}>
                {_("Shut down")}
            </DropdownItem>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-forceOff`}
                          id={`${id}-forceOff`}
                          onClick={() => Dialogs.show(
                              <ConfirmDialog idPrefix={id}
                                  title={fmt_to_fragments(_("Force shut down $0?"), <b>{vm.name}</b>)}
                                  titleIcon={PowerOffIcon}
                                  vm={vm}
                                  actionsList={[
                                      {
                                          variant: "primary",
                                          handler: () => vmForceOff(vm),
                                          name: _("Force shut down"),
                                          id: "forceOff",
                                      },
                                  ]} />
                          )}>
                {_("Force shut down")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-shutdown" />);
        dropdownItems.push(
            <DropdownItem key={`${id}-sendNMI`}
                          id={`${id}-sendNMI`}
                          onClick={() => Dialogs.show(
                              <ConfirmDialog idPrefix={id}
                                  title={fmt_to_fragments(_("Send non-maskable interrupt to $0?"), <b>{vm.name}</b>)}
                                  vm={vm}
                                  actionsList={[
                                      {
                                          variant: "primary",
                                          handler: () => onSendNMI(vm),
                                          name: _("Send non-maskable interrupt"),
                                          id: "sendNMI",
                                      },
                                  ]} />
                          )}>
                {_("Send non-maskable interrupt")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-sendnmi" />);
    }

    if (domainCanReset(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-reboot`}
                          id={`${id}-reboot`}
                          onClick={() => Dialogs.show(
                              <ConfirmDialog idPrefix={id}
                                  title={fmt_to_fragments(_("Reboot $0?"), <b>{vm.name}</b>)}
                                  titleIcon={RedoIcon}
                                  vm={vm}
                                  actionsList={[
                                      {
                                          variant: "primary",
                                          handler: () => vmReboot(vm),
                                          name: _("Reboot"),
                                          id: "reboot",
                                      },
                                  ]} />
                          )}>
                {_("Reboot")}
            </DropdownItem>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-forceReboot`}
                          id={`${id}-forceReboot`}
                          onClick={() => Dialogs.show(
                              <ConfirmDialog idPrefix={id}
                                  title={fmt_to_fragments(_("Force reboot $0?"), <b>{vm.name}</b>)}
                                  vm={vm}
                                  titleIcon={RedoIcon}
                                  actionsList={[
                                      {
                                          variant: "primary",
                                          handler: () => vmForceReboot(vm),
                                          name: _("Force reboot"),
                                          id: "forceReboot",
                                      },
                                  ]} />
                          )}>
                {_("Force reboot")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-reset" />);
    }

    let run = null;
    if (domainCanRun(state, hasInstallPhase)) {
        run = (
            <Button key='action-run'
                    size="sm"
                    variant={isDetailsPage ? 'primary' : 'secondary'}
                    isLoading={isOperationInProgress(vm)}
                    isDisabled={isOperationInProgress(vm)}
                    onClick={() => vmStart(vm)} id={`${id}-run`}>
                {_("Run")}
            </Button>
        );
    }

    let install = null;
    if (domainCanInstall(state, hasInstallPhase)) {
        install = (
            <Button
                key='action-install'
                variant="secondary"
                size="sm"
                isLoading={!!vm.installInProgress}
                isDisabled={!!vm.installInProgress}
                onClick={() => onInstall(vm)} id={`${id}-install`}
            >
                {_("Install")}
            </Button>
        );
    }

    const cloneItem = (
        <DropdownItem isDisabled={!virtCloneAvailable}
                      key={`${id}-clone`}
                      id={`${id}-clone`}
                      onClick={() => Dialogs.show(<CloneDialog name={vm.name}
                                                               connectionName={vm.connectionName} />)}>

            {_("Clone")}
        </DropdownItem>
    );

    if (state == "shut off") {
        if (virtCloneAvailable)
            dropdownItems.push(cloneItem);
        else
            dropdownItems.push(
                <Tooltip key={`${id}-clone-tooltip`} id='virt-clone-not-available-tooltip'
                         content={_("virt-install package needs to be installed on the system in order to clone VMs")}>
                    <span>
                        {cloneItem}
                    </span>
                </Tooltip>
            );
    }

    if (vm.state !== "shut off") {
        dropdownItems.push(
            <DropdownItem key={`${id}-migrate`}
                          id={`${id}-migrate`}
                          onClick={() => Dialogs.show(<MigrateDialog vm={vm} connectionName={vm.connectionName} />)}>
                {_("Migrate")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-migrate" />);
    }

    if (vm.inactiveXML?.hasSpice && canReplaceSpice()) {
        dropdownItems.push(
            <DropdownItem key={`${id}-replace-spice`}
                          id={`${id}-replace-spice`}
                          onClick={() => Dialogs.show(<ReplaceSpiceDialog vm={vm} vms={vms} />)}>
                {_("Replace SPICE devices")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-spice" />);
    }

    if (domainCanRename(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-rename`}
                          id={`${id}-rename`}
                          onClick={() => Dialogs.show(<RenameDialog vmName={vm.name}
                                                                    vmId={vm.id}
                                                                    connectionName={vm.connectionName} />)}>
                {_("Rename")}
            </DropdownItem>
        );
    }

    if (isDetailsPage) {
        dropdownItems.push(
            <DropdownItem key={`${id}-edit-description`}
                          id={`${id}-edit-description`}
                          onClick={() => Dialogs.show(<EditDescriptionDialog vm={vm} />)}>
                {_("Edit description")}
            </DropdownItem>
        );
    }

    if (domainCanRename(state) || isDetailsPage)
        dropdownItems.push(<Divider key="separator-rename" />);

    if (!vm.hasTPM && !vm.inactiveXML?.hasTPM && vm.capabilities?.supportsTPM) {
        dropdownItems.push(
            <DropdownItem key={`${id}-add-tpm`}
                          id={`${id}-add-tpm`}
                          onClick={() => onAddTPM(vm)}>
                {_("Add TPM")}
            </DropdownItem>
        );
        dropdownItems.push(<Divider key="separator-add-tpm" />);
    }

    if (state !== undefined) {
        if (!vm.persistent) {
            dropdownItems.push(
                <Tooltip key={`${id}-delete`} id={`${id}-delete-tooltip`} content={_("This VM is transient. Shut it down if you wish to delete it.")}>
                    <DropdownItem id={`${id}-delete`}
                                  className='pf-m-danger'
                                  isAriaDisabled>
                        {_("Delete")}
                    </DropdownItem>
                </Tooltip>
            );
        } else {
            dropdownItems.push(
                <DropdownItem className='pf-m-danger' key={`${id}-delete`} id={`${id}-delete`}
                              onClick={() => Dialogs.show(<DeleteDialog vm={vm} />)}>
                    {_("Delete")}
                </DropdownItem>
            );
        }
    }

    return (
        <div className='btn-group'>
            {run}
            {shutdown}
            {install}
            <KebabDropdown
                toggleButtonId={`${id}-action-kebab`}
                position='right'
                dropdownItems={dropdownItems}
            />
        </div>
    );
};

export const VmRestartDialog = ({ vm } : { vm: VM }) => {
    async function onRestart(force: boolean) {
        startOperationProgress(vm);
        appState.updateVm(vm, { onShutOff: vmStart });
        try {
            await vmDomainMethod<void>(vm, force ? 'Destroy' : 'Shutdown', 'u', 0);
        } catch (ex) {
            setVmError(vm, cockpit.format(_("VM $0 failed to shutdown"), vm.name), ex);
        }
    }

    return (
        <ConfirmDialog idPrefix="vm-restart-dialog"
            title={fmt_to_fragments(_("Shutdown and restart $0?"), <b>{vm.name}</b>)}
            vm={vm}
            titleIcon={RedoIcon}
            actionsList={[
                {
                    variant: "primary",
                    handler: () => onRestart(false),
                    name: _("Shutdown and restart"),
                    id: "restart",
                },
                {
                    variant: "secondary",
                    handler: () => onRestart(true),
                    name: _("Force shutdown and restart"),
                    id: "force-restart",
                },
            ]} />
    );
};
