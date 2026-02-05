/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2020 Red Hat, Inc.
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

import type { DetailedError } from '../../types';

import "./stateIcon.scss";

const _ = cockpit.gettext;

interface StateIconProps {
    state: string,
    valueId: string,
    error: DetailedError | null | undefined,
    dismissError: () => void,
    additionalState?: React.ReactNode,
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

    if (error)
        return (
            <Popover headerContent={error.text} bodyContent={error.detail} className="ct-popover-alert">
                {label}
            </Popover>
        );
    else
        return label;
};
