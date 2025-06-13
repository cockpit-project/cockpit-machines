/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
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
import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider";
import { Menu, MenuContent, MenuList, MenuItem } from "@patternfly/react-core/dist/esm/components/Menu";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Panel, PanelFooter, PanelMain, PanelMainBody } from "@patternfly/react-core/dist/esm/components/Panel";
import { Content, } from "@patternfly/react-core/dist/esm/components/Content";
import { PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';
import { fmt_to_fragments } from 'utils.jsx';

import { NeedsShutdownAlert } from '../common/needsShutdown.jsx';
import { InfoPopover } from '../common/infoPopover.jsx';
import { domainReplaceSpice } from '../../libvirtApi/domain.js';

import './vmReplaceSpiceDialog.css';

const _ = cockpit.gettext;

const selectionId = vm => vm.connectionName + vm.id;

export const ReplaceSpiceDialog = ({ vm, vms }) => {
    const spiceVMs = vms?.filter(vm => vm.inactiveXML?.hasSpice);
    // sort spiceVMs by name, put the current VM first
    spiceVMs?.sort((a, b) => (a === vm) ? -1 : (b === vm) ? 1 : a.name.localeCompare(b.name));
    const isMultiple = spiceVMs?.length > 1;

    const Dialogs = useDialogs();
    const [error, dialogErrorSet] = useState(null);
    const [inProgress, setInProgress] = useState(false);
    const defaultSelected = isMultiple ? [selectionId(spiceVMs[0])] : null;
    const [selected, setSelected] = useState(defaultSelected);

    async function onReplace() {
        setInProgress(true);

        try {
            if (isMultiple) {
                // convert them serially, to avoid hammering libvirt with too many parallel requests
                for (const sel of spiceVMs)
                    if (selected.includes(selectionId(sel)))
                        await domainReplaceSpice({ connectionName: sel.connectionName, id: sel.id });
            } else {
                await domainReplaceSpice({ connectionName: vm.connectionName, id: vm.id });
            }
            Dialogs.close();
        } catch (ex) {
            // we don't know of any case where this would fail, so this is all belt-and-suspenders
            // still, give the user some hint how to go on
            console.warn("Failed to replace SPICE devices:", ex);
            setInProgress(false);
            dialogErrorSet({
                dialogError: _("Failed to replace SPICE devices"),
                dialogErrorDetail: fmt_to_fragments(
                    _("Please see $0 how to reconfigure your VM manually."),
                    <a href="https://access.redhat.com/solutions/6955095" target="_blank" rel="noopener noreferrer">
                        https://access.redhat.com/solutions/6955095
                    </a>),
            });
        }
    }

    let vmSelect = null;

    if (isMultiple) {
        const onSelect = (_ev, item) => setSelected(
            selected.includes(item)
                ? selected.filter(id => id !== item)
                : [...selected, item]
        );
        const menuItems = spiceVMs.map(vm => <MenuItem key={selectionId(vm)}
                                                       hasCheckbox
                                                       itemId={selectionId(vm)}
                                                       isSelected={selected.includes(selectionId(vm))}>{vm.name}</MenuItem>);
        menuItems.splice(1, 0, <Divider component="li" key="divider" />);
        menuItems.splice(2, 0, <MenuItem isDisabled key="heading">{_("Other VMs using SPICE")}</MenuItem>);

        const allSelected = selected.length === spiceVMs.length;

        vmSelect = (
            <Panel variant="bordered" isScrollable className="spice-replace-dialog-panel">
                <PanelMain>
                    <PanelMainBody>
                        <Menu id="replace-spice-dialog-other" selected={selected} onSelect={onSelect} isPlain>
                            <MenuContent><MenuList>{menuItems}</MenuList></MenuContent>
                        </Menu>
                    </PanelMainBody>
                </PanelMain>
                <PanelFooter>
                    <Button id="replace-spice-dialog-select-all" variant='link'
                            onClick={() => setSelected(allSelected ? defaultSelected : spiceVMs.map(selectionId))}>
                        {allSelected ? _("Deselect others") : _("Select all")}
                    </Button>
                </PanelFooter>
            </Panel>
        );
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}>
            <ModalHeader title={isMultiple ? _("Replace SPICE devices") : cockpit.format(_("Replace SPICE devices in VM $0"), vm.name)} />
            <ModalBody>
                { vm.state === 'running' && !error && <NeedsShutdownAlert idPrefix="spice-modal" /> }
                {error && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} />}
                <Content>
                    <Content component="p">
                        {isMultiple
                            ? _("Replace SPICE on selected VMs.")
                            : _("Replace SPICE on the virtual machine.") }
                        <InfoPopover aria-label={_("SPICE conversion")}
                            position={PopoverPosition.top}
                            headerContent={_("SPICE conversion")}
                            bodyContent={
                                <Content component="ul" className="spice-replace-dialog-popover-list">
                                    <Content component="li">{_("Convert SPICE graphics console to VNC")}</Content>
                                    <Content component="li">{_("Convert QXL video card to VGA")}</Content>
                                    <Content component="li">{_("Remove SPICE audio and host devices")}</Content>
                                </Content>
                            } />
                    </Content>
                    <Content component="p">
                        {_("This is intended for a host which does not support SPICE due to upgrades or live migration.")}
                    </Content>
                    <Content component="p">
                        {_("It can also be used to enable the inline graphical console in the browser, which does not support SPICE.")}
                    </Content>
                </Content>
                { vmSelect }
            </ModalBody>
            <ModalFooter>
                <Button variant='primary'
                        id="replace-spice-dialog-confirm"
                        isDisabled={inProgress}
                        isLoading={inProgress}
                        onClick={onReplace}>
                    {_("Replace")}
                </Button>
                <Button variant='link' onClick={Dialogs.close}>
                    {_("Cancel")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
