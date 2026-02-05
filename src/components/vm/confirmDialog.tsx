/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2023 Red Hat, Inc.
 */
import cockpit from 'cockpit';
import React, { useEffect, useState } from 'react';

import type { VM } from '../../types';

import { Button, type ButtonProps } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import {
    Modal, ModalBody, ModalFooter, ModalHeader, type ModalHeaderProps,
} from '@patternfly/react-core/dist/esm/components/Modal';
import { useDialogs } from 'dialogs.jsx';
import { distanceToNow } from 'timeformat.js';

import { domainGetStartTime } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

interface ConfirmAction {
    id: string,
    name: string,
    variant: ButtonProps["variant"],
    handler: () => void,
}

export const ConfirmDialog = ({
    idPrefix,
    actionsList,
    title,
    titleIcon,
    vm
} : {
    idPrefix: string,
    actionsList: ConfirmAction[],
    title: React.ReactNode,
    titleIcon?: ModalHeaderProps["titleIconVariant"],
    vm: VM,
}) => {
    const Dialogs = useDialogs();
    const [startTime, setStartTime] = useState<Date | null>(null);

    useEffect(() => {
        domainGetStartTime({ connectionName: vm.connectionName, vmName: vm.name })
                .then(res => setStartTime(res))
                .catch(e => console.error(JSON.stringify(e)));
    }, [vm]);

    const actions = actionsList.map(action =>
        <Button
            {...action.variant && { variant: action.variant }}
            key={action.id}
            id={`${idPrefix}-${action.id}`}
            onClick={() => {
                action.handler();
                Dialogs.close();
            }}>
            {action.name}
        </Button>
    );
    actions.push(
        <Button variant="link" key="cancel" onClick={Dialogs.close}>
            {_("Cancel")}
        </Button>
    );

    return (
        <Modal id={`${idPrefix}-confirm-action-modal`}
            position="top"
            variant="small"
            onClose={Dialogs.close}
            isOpen
        >
            <ModalHeader
                title={title}
                {...titleIcon && { titleIconVariant: titleIcon }}
            />
            <ModalBody>
                {startTime
                    ? <DescriptionList isHorizontal isFluid>
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Started")}</DescriptionListTerm>
                            <DescriptionListDescription id="uptime">{distanceToNow(startTime)}</DescriptionListDescription>
                        </DescriptionListGroup>
                    </DescriptionList>
                    /* for tests */
                    : <span className="uptime-not-available" />
                }
            </ModalBody>
            <ModalFooter>
                {actions}
            </ModalFooter>
        </Modal>
    );
};
