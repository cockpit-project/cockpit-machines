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
import PropTypes from 'prop-types';
import {
    Button,
    Dropdown, DropdownItem, DropdownSeparator, KebabToggle,
    Tooltip,
} from '@patternfly/react-core';
import { useDialogs } from 'dialogs.jsx';

import { updateVm } from '../../actions/store-actions.js';
import {
    vmId,
} from "../../helpers.js";

import { CloneDialog } from './vmCloneDialog.jsx';
import { DeleteDialog } from "./deleteDialog.jsx";
import { MigrateDialog } from './vmMigrateDialog.jsx';
import { RenameDialog } from './vmRenameDialog.jsx';
import {
    domainCanDelete,
    domainCanInstall,
    domainCanReset,
    domainCanRename,
    domainCanResume,
    domainCanRun,
    domainCanPause,
    domainCanShutdown,
    domainForceOff,
    domainForceReboot,
    domainInstall,
    domainPause,
    domainReboot,
    domainResume,
    domainSendNMI,
    domainShutdown,
    domainStart,
} from '../../libvirtApi/domain.js';
import store from "../../store.js";

const _ = cockpit.gettext;

const VmActions = ({ vm, onAddErrorNotification, isDetailsPage }) => {
    const Dialogs = useDialogs();
    const [isActionOpen, setIsActionOpen] = useState(false);
    const [operationInProgress, setOperationInProgress] = useState(false);
    const [prevVmState, setPrevVmState] = useState(vm.state);
    const [virtCloneAvailable, setVirtCloneAvailable] = useState(false);

    useEffect(() => {
        cockpit.spawn(['which', 'virt-clone'], { err: 'ignore' })
                .then(() => setVirtCloneAvailable(true));
    }, []);

    if (vm.state !== prevVmState) {
        setPrevVmState(vm.state);
        setOperationInProgress(false);
    }

    const id = `${vmId(vm.name)}-${vm.connectionName}`;
    const state = vm.state;
    const hasInstallPhase = vm.metadata && vm.metadata.hasInstallPhase;
    const dropdownItems = [];

    const onStart = () => domainStart({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        setOperationInProgress(false);
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to start"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });
    const onInstall = () => domainInstall({ vm, onAddErrorNotification }).catch(ex => {
        onAddErrorNotification({
            text: cockpit.format(_("VM $0 failed to get installed"), vm.name),
            detail: ex.message.split(/Traceback(.+)/)[0],
            resourceId: vm.id,
        });
    });
    const onReboot = () => domainReboot({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to reboot"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });
    const onForceReboot = () => domainForceReboot({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to force reboot"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });
    const onShutdown = () => domainShutdown({ name: vm.name, id: vm.id, connectionName: vm.connectionName })
            .then(() => !vm.persistent && cockpit.location.go(["vms"]))
            .catch(ex => {
                setOperationInProgress(false);
                store.dispatch(
                    updateVm({
                        connectionName: vm.connectionName,
                        name: vm.name,
                        error: {
                            text: cockpit.format(_("VM $0 failed to shutdown"), vm.name),
                            detail: ex.message,
                        }
                    })
                );
            });
    const onPause = () => domainPause({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to pause"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });
    const onResume = () => domainResume({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to resume"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });
    const onForceoff = () => domainForceOff({ name: vm.name, id: vm.id, connectionName: vm.connectionName })
            .then(() => !vm.persistent && cockpit.location.go(["vms"]))
            .catch(ex => {
                store.dispatch(
                    updateVm({
                        connectionName: vm.connectionName,
                        name: vm.name,
                        error: {
                            text: cockpit.format(_("VM $0 failed to force shutdown"), vm.name),
                            detail: ex.message,
                        }
                    })
                );
            });
    const onSendNMI = () => domainSendNMI({ name: vm.name, id: vm.id, connectionName: vm.connectionName }).catch(ex => {
        store.dispatch(
            updateVm({
                connectionName: vm.connectionName,
                name: vm.name,
                error: {
                    text: cockpit.format(_("VM $0 failed to send NMI"), vm.name),
                    detail: ex.message,
                }
            })
        );
    });

    let shutdown;

    if (domainCanPause(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-pause`}
                          id={`${id}-pause`}
                          onClick={() => onPause()}>
                {_("Pause")}
            </DropdownItem>
        );
        dropdownItems.push(<DropdownSeparator key="separator-pause" />);
    }

    if (domainCanResume(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-resume`}
                          id={`${id}-resume`}
                          onClick={() => onResume()}>
                {_("Resume")}
            </DropdownItem>
        );
        dropdownItems.push(<DropdownSeparator key="separator-resume" />);
    }

    if (domainCanShutdown(state)) {
        shutdown = (
            <Button key='action-shutdown'
                    isSmall
                    variant={isDetailsPage ? 'primary' : 'secondary'}
                    isLoading={operationInProgress}
                    isDisabled={operationInProgress}
                    onClick={() => { setOperationInProgress(true); onShutdown() }} id={`${id}-shutdown-button`}>
                {_("Shut down")}
            </Button>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-off`}
                          id={`${id}-off`}
                          onClick={() => onShutdown()}>
                {_("Shut down")}
            </DropdownItem>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-forceOff`}
                          id={`${id}-forceOff`}
                          onClick={() => onForceoff()}>
                {_("Force shut down")}
            </DropdownItem>
        );
        dropdownItems.push(<DropdownSeparator key="separator-shutdown" />);
        dropdownItems.push(
            <DropdownItem key={`${id}-sendNMI`}
                          id={`${id}-sendNMI`}
                          onClick={() => onSendNMI()}>
                {_("Send non-maskable interrupt")}
            </DropdownItem>
        );
        dropdownItems.push(<DropdownSeparator key="separator-sendnmi" />);
    }

    if (domainCanReset(state)) {
        dropdownItems.push(
            <DropdownItem key={`${id}-reboot`}
                          id={`${id}-reboot`}
                          onClick={() => onReboot()}>
                {_("Reboot")}
            </DropdownItem>
        );
        dropdownItems.push(
            <DropdownItem key={`${id}-forceReboot`}
                          id={`${id}-forceReboot`}
                          onClick={() => onForceReboot()}>
                {_("Force reboot")}
            </DropdownItem>
        );
        dropdownItems.push(<DropdownSeparator key="separator-reset" />);
    }

    let run = null;
    if (domainCanRun(state, hasInstallPhase)) {
        run = (
            <Button key='action-run'
                    isSmall
                    variant={isDetailsPage ? 'primary' : 'secondary'}
                    isLoading={operationInProgress}
                    isDisabled={operationInProgress}
                    onClick={() => { setOperationInProgress(true); onStart() }} id={`${id}-run`}>
                {_("Run")}
            </Button>
        );
    }

    let install = null;
    if (domainCanInstall(state, hasInstallPhase)) {
        install = (<Button key='action-install' variant="secondary"
                           isLoading={vm.installInProgress}
                           isDisabled={vm.installInProgress}
                           onClick={() => onInstall()} id={`${id}-install`}>
            {_("Install")}
        </Button>);
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
        dropdownItems.push(<DropdownSeparator key="separator-migrate" />);
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
        dropdownItems.push(<DropdownSeparator key="separator-rename" />);
    }

    if (state !== undefined && domainCanDelete(state, vm.id)) {
        if (!vm.persistent) {
            dropdownItems.push(
                <Tooltip key={`${id}-delete`} id={`${id}-delete-tooltip`} content={_("This VM is transient. Shut it down if you wish to delete it.")}>
                    <DropdownItem id={`${id}-delete`}
                                  className='pf-m-danger'
                                  isDisabled>
                        {_("Delete")}
                    </DropdownItem>
                </Tooltip>
            );
        } else {
            dropdownItems.push(
                <DropdownItem className='pf-m-danger' key={`${id}-delete`} id={`${id}-delete`}
                              onClick={() => Dialogs.show(<DeleteDialog vm={vm} onAddErrorNotification={onAddErrorNotification} />)}>
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
            <Dropdown onSelect={() => setIsActionOpen(!isActionOpen)}
                      id={`${id}-action-kebab`}
                      toggle={<KebabToggle isDisabled={vm.isUi} onToggle={isOpen => setIsActionOpen(isOpen)} />}
                      isPlain
                      isOpen={isActionOpen}
                      position='right'
                      dropdownItems={dropdownItems} />
        </div>
    );
};

VmActions.propTypes = {
    vm: PropTypes.object.isRequired,
    onAddErrorNotification: PropTypes.func.isRequired,
};

export default VmActions;
