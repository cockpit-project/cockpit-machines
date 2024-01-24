/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2023 Red Hat, Inc.
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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { useDialogs } from 'dialogs.jsx';
import { distanceToNow } from 'timeformat.js';

import { domainGetStartTime } from '../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const ConfirmDialog = ({ idPrefix, actionsList, title, titleIcon, vm }) => {
    const Dialogs = useDialogs();
    const [startTime, setStartTime] = useState();

    useEffect(() => {
        domainGetStartTime({ connectionName: vm.connectionName, vmName: vm.name })
                .then(res => setStartTime(res))
                .catch(e => console.error(JSON.stringify(e)));
    }, [vm]);

    const actions = actionsList.map(action =>
        <Button variant={action.variant}
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
            title={title}
            titleIconVariant={titleIcon}
            isOpen
            footer={actions}>
            {startTime
                ? <DescriptionList isHorizontal isFluid>
                    <DescriptionListGroup>
                        <DescriptionListTerm>{_("Uptime")}</DescriptionListTerm>
                        <DescriptionListDescription id="uptime">{distanceToNow(startTime)}</DescriptionListDescription>
                    </DescriptionListGroup>
                </DescriptionList>
                /* for tests */
                : <span className="uptime-not-available" />
            }
        </Modal>
    );
};
