/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2020 Red Hat, Inc.
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

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Label, LabelProps } from "@patternfly/react-core/dist/esm/components/Label";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { ErrorCircleOIcon, PendingIcon } from '@patternfly/react-icons';

import {
    rephraseUI,
} from "../../helpers.js";

import type { VMError } from '../../types';

import "./stateIcon.scss";

const _ = cockpit.gettext;

interface StateIconProps {
    state: string,
    valueId: string,
    error: VMError | null | undefined,
    dismissError: () => void,
    additionalState: React.ReactNode,
}

export const StateIcon = ({
    state,
    valueId,
    error,
    dismissError,
    additionalState
}: StateIconProps) => {
    if (state === undefined) {
        return (<div />);
    }
    const stateMap: Record<string, { color?: LabelProps["color"], icon?: React.ReactNode }> = {
        /* VM states */
        running: { color: "green" },
        crashed: { color: "red" },
        dying: { color: "red" },
        'Creating VM': { icon: <PendingIcon /> },
        /* Storage Pool/Network States  */
        active: { color: "green" },
    };

    const label = (
        <Flex spaceItems={{ default: "spaceItemsXs" }}>
            {error &&
            <Label color="red"
                icon={<ErrorCircleOIcon />}
                className="resource-state-text"
                closeBtnAriaLabel={_("Close")}
                onClose={dismissError}
                id={`${valueId}-error`}>
                <>
                    {_("Failed")}
                    <Button variant="link" isInline>{_("view more...")}</Button>
                </>
            </Label>}
            <Label {...(stateMap[state] && stateMap[state].color) ? { color: stateMap[state].color } : {}}
                   icon={stateMap[state] && stateMap[state].icon}
                   className={"resource-state-text resource-state--" + (state || "").toLowerCase().replace(' ', '-')}
                   id={valueId}>
                {rephraseUI('resourceStates', state)}
            </Label>
            {additionalState}
        </Flex>
    );

    if (error) {
        console.warn("virtual machine state error: ", error.text, error.detail);
        return (
            <Popover headerContent={error.text} bodyContent={error.detail} className="ct-popover-alert">
                {label}
            </Popover>
        );
    } else {
        return label;
    }
};

export default StateIcon;
