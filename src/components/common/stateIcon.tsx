/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2020 Red Hat, Inc.
 */
import React from 'react';

import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Label, LabelProps } from "@patternfly/react-core/dist/esm/components/Label";
import { PendingIcon } from '@patternfly/react-icons';

import {
    rephraseUI,
} from "../../helpers.js";

import "./stateIcon.scss";

interface StateIconProps {
    state: string,
    valueId: string,
    additionalState?: React.ReactNode,
}

export const StateIcon = ({
    state,
    valueId,
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
            <Label {...(stateMap[state] && stateMap[state].color) ? { color: stateMap[state].color } : {}}
                   icon={stateMap[state] && stateMap[state].icon}
                   className={"resource-state-text resource-state--" + (state || "").toLowerCase().replace(' ', '-')}
                   id={valueId}>
                {rephraseUI('resourceStates', state)}
            </Label>
            {additionalState}
        </Flex>
    );

    return label;
};
