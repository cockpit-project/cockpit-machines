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
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { ExpandableSection, ExpandableSectionToggle } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainRemoveWatchdog, domainSetWatchdog } from "../../../libvirtApi/domain.js";
import { rephraseUI } from "../../../helpers.js";
import { NeedsShutdownAlert, NeedsShutdownTooltip, needsShutdownWatchdog } from "../../common/needsShutdown.jsx";
import { WATCHDOG_INFO_MESSAGE } from './helpers.jsx';

const _ = cockpit.gettext;

const WatchdogModalAlert = ({ dialogError }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!dialogError)
        return;

    if (dialogError.variant === "warning") {
        return (
            <Alert variant="warning"
                title={dialogError.text}
                actionLinks={<>
                    <ExpandableSectionToggle onToggle={() => setIsExpanded(!isExpanded)}
                        isExpanded={isExpanded}>
                        {isExpanded ? _("Show less") : _("Show more")}
                    </ExpandableSectionToggle>
                    <ExpandableSection isExpanded={isExpanded}
                        isDetached>
                        {dialogError.expandableDetail}
                    </ExpandableSection>
                </>}
                isInline>
                {dialogError.detail}
            </Alert>
        );
    }

    return <ModalError dialogError={dialogError.text} dialogErrorDetail={dialogError.detail} />;
};

export const WatchdogModal = ({ vm, isWatchdogAttached, idPrefix }) => {
    const [dialogError, setDialogError] = useState();
    const [watchdogAction, setWatchdogAction] = useState(vm.watchdog.action || "no-device");
    const [inProgress, setInProgress] = useState(false);
    const [offerColdplug, setOfferColdplug] = useState(false);

    const Dialogs = useDialogs();

    const setWatchdogColdplug = () => {
        return domainSetWatchdog({
            connectionName: vm.connectionName,
            vmName: vm.name,
            action: watchdogAction,
            defineOffline: true,
            hotplug: false,
            isWatchdogAttached,
        })
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to configure watchdog"), detail: exc.message, variant: "danger" }));
    };

    const setWatchdogHotplug = () => {
        return domainSetWatchdog({
            connectionName: vm.connectionName,
            vmName: vm.name,
            action: watchdogAction,
            defineOffline: false,
            hotplug: true,
            isWatchdogAttached,
        })
                .then(vm.persistent ? setWatchdogColdplug : Promise.resolve)
                .catch(exc => {
                    if (vm.persistent)
                        setOfferColdplug(true);

                    setDialogError({
                        text: _("Could not dynamically add watchdog"),
                        detail: _("Adding a watchdog will require a reboot to take effect."),
                        expandableDetail: exc.message,
                        variant: vm.persistent ? "warning" : "danger"
                    });
                });
    };

    const save = (coldplug) => {
        setInProgress(true);

        let handler = setWatchdogHotplug;

        if ((coldplug || vm.state !== "running") && vm.persistent)
            handler = setWatchdogColdplug;

        return handler()
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
                .then(Dialogs.close, exc => setDialogError({ text: _("Failed to detach watchdog"), detail: exc.message, variant: "danger" }))
                .finally(() => setInProgress(false));
    };

    const supportedActions = ["reset", "poweroff", "inject-nmi", "pause"];

    const needsShutdown = () => {
        if (vm.state === 'running' && isWatchdogAttached && vm.watchdog.action !== watchdogAction)
            return <NeedsShutdownAlert idPrefix={idPrefix} />;
    };

    return (
        <Modal id={`${idPrefix}-watchdog-modal`}
               position="top"
               variant="small"
               onClose={Dialogs.close}
               title={isWatchdogAttached ? _("Edit watchdog device type") : _("Add watchdog device type")}
               description={WATCHDOG_INFO_MESSAGE}
               isOpen
               footer={
                   <>
                       <Button variant='primary'
                               id="watchdog-dialog-apply"
                               onClick={() => save(false)}
                               isLoading={inProgress && !offerColdplug}
                               isDisabled={inProgress || offerColdplug}>
                           {isWatchdogAttached ? _("Save") : _("Add")}
                       </Button>
                       {offerColdplug && <Button variant='secondary'
                               id="watchdog-dialog-apply-next-boot"
                               onClick={() => save(true)}
                               isLoading={inProgress}
                               isDisabled={inProgress}>
                           {_("Apply on next boot")}
                       </Button>}
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
            {needsShutdown()}
            <WatchdogModalAlert dialogError={dialogError} />
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <FormGroup role="radiogroup"
                           label={_("Action")}
                           fieldId="watchdog-action"
                           hasNoPaddingTop
                           isStack>
                    {supportedActions.map(action => (
                        <Radio label={rephraseUI("watchdogAction", action)}
                               key={action}
                               id={action}
                               isChecked={watchdogAction === action}
                               onChange={() => setWatchdogAction(action)}
                               isLabelWrapped />)
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

export const WatchdogLink = ({ vm, idPrefix, onAddErrorNotification }) => {
    const Dialogs = useDialogs();

    const isWatchdogAttached = Object.keys(vm.watchdog).length > 0;

    function open() {
        Dialogs.show(<WatchdogModal vm={vm} isWatchdogAttached={isWatchdogAttached} idPrefix={idPrefix} onAddErrorNotification={onAddErrorNotification} />);
    }

    return (
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem id={`${idPrefix}-watchdog-state`}>
                {isWatchdogAttached ? rephraseUI("watchdogAction", vm.watchdog.action) : _("none")}
            </FlexItem>
            { needsShutdownWatchdog(vm) && <NeedsShutdownTooltip iconId="watchdog-tooltip" tooltipId="tip-watchdog" /> }
            <Button variant="link" isInline id={`${idPrefix}-watchdog-button`} onClick={open}>
                {isWatchdogAttached ? _("edit") : _("add")}
            </Button>
        </Flex>
    );
};
