/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2022 Red Hat, Inc.
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
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import {
    Button,
    Flex, FlexItem,
    Form, FormGroup,
    Modal,
    Radio,
} from '@patternfly/react-core';
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainRemoveWatchdog, domainSetWatchdog } from "../../../libvirtApi/domain.js";
import { rephraseUI } from "../../../helpers.js";
import { WarningInactiveAlert, WarningInactiveTooltip } from "../../common/warningInactive.jsx";

const _ = cockpit.gettext;

export const WatchdogModal = ({ vm, isWatchdogAttached, idPrefix }) => {
    const [dialogError, setDialogError] = useState();
    const [watchdogAction, setWatchdogAction] = useState(vm.watchdog.action || "no-device");
    const [inProgress, setInProgress] = useState(false);

    const Dialogs = useDialogs();

    const save = () => {
        setInProgress(true);
        return domainSetWatchdog({
            connectionName: vm.connectionName,
            vmName: vm.name,
            hotplug: vm.state === "running",
            permanent: vm.persistent,
            action: watchdogAction,
            isWatchdogAttached,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to configure watchdog"), detail: exc.message }))
                .finally(() => setInProgress(false));
    };

    const detach = () => {
        setInProgress(true);
        return domainRemoveWatchdog({
            connectionName: vm.connectionName,
            vmName: vm.name,
            hotplug: vm.state === "running",
            permanent: vm.persistent,
            model: vm.watchdog.model,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to detach watchdog"), detail: exc.message }))
                .finally(() => setInProgress(false));
    };

    const supportedActions = ["reset", "poweroff", "inject-nmi", "pause"];

    const showWarning = () => {
        if (vm.state === 'running' && isWatchdogAttached && vm.watchdog.action !== watchdogAction)
            return <WarningInactiveAlert idPrefix={idPrefix} />;
    };

    return (
        <Modal id={`${idPrefix}-watchdog-modal`}
               position="top"
               variant="small"
               onClose={Dialogs.close}
               title={isWatchdogAttached ? _("Edit watchdog device type") : _("Add watchdog device type")}
               description={_("Watchdogs act when systems stop responding. To use this virtual watchdog device, the guest system also needs to have an additional driver and a running watchdog service.")}
               isOpen
               footer={
                   <>
                       <Button variant='primary'
                               id="watchdog-dialog-apply"
                               onClick={save}
                               isLoading={inProgress}
                               isDisabled={inProgress}>
                           {isWatchdogAttached ? _("Save") : _("Add")}
                       </Button>
                       {isWatchdogAttached &&
                       <Button variant='secondary'
                               id="watchdog-dialog-detach"
                               onClick={detach}
                               isLoading={inProgress}
                               isDisabled={inProgress}>
                           {_("Remove")}
                       </Button>}
                       <Button variant='link' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            {showWarning()}
            {dialogError && <ModalError dialogError={dialogError.text} dialogErrorDetail={dialogError.detail} />}
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <FormGroup role="radiogroup"
                           label={_("Action")}
                           fieldId="watchdog-action"
                           hasNoPaddingTop
                           isStack>
                    {supportedActions.map(action => <Radio label={rephraseUI("watchdogAction", action)}
                                                           key={action}
                                                           id={action}
                                                           isChecked={watchdogAction === action}
                                                           onChange={() => setWatchdogAction(action)}
                                                           isLabelWrapped />
                    )}
                </FormGroup>
            </Form>
        </Modal>
    );
};

WatchdogModal.propTypes = {
    vm: PropTypes.object.isRequired,
    isWatchdogAttached: PropTypes.bool.isRequired,
    idPrefix: PropTypes.string.isRequired,
};

export const WatchdogLink = ({ vm, idPrefix }) => {
    const Dialogs = useDialogs();

    const isWatchdogAttached = Object.keys(vm.watchdog).length > 0;

    function open() {
        Dialogs.show(<WatchdogModal vm={vm} isWatchdogAttached={isWatchdogAttached} idPrefix={idPrefix} />);
    }

    const watchdogActionChanged = isWatchdogAttached && vm.persistent && vm.state === "running" && vm.inactiveXML.watchdog.action !== vm.watchdog.action;

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem id={`${idPrefix}-watchdog-state`}>
                {isWatchdogAttached ? rephraseUI("watchdogAction", vm.watchdog.action) : _("none")}
            </FlexItem>
            { watchdogActionChanged && <WarningInactiveTooltip iconId="watchdog-tooltip" tooltipId="tip-watchdog" /> }
            <Button variant="link" isInline id={`${idPrefix}-watchdog-button`} onClick={open}>
                {isWatchdogAttached ? _("edit") : _("add")}
            </Button>
        </Flex>
    );
};
