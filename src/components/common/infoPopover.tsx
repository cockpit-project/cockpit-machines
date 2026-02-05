/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2025 Red Hat, Inc.
 */
import React from 'react';
import cockpit from 'cockpit';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon";
import { Popover, PopoverProps } from "@patternfly/react-core/dist/esm/components/Popover";
import { HelpIcon } from "@patternfly/react-icons";

const _ = cockpit.gettext;

export const InfoPopover = ({ ...props }: PopoverProps) => {
    return (
        <>
            {"\n"}
            <Popover {...props}>
                <Button component="span" isInline variant="link" aria-label={_("more info")}>
                    <Icon status="info">
                        <HelpIcon />
                    </Icon>
                </Button>
            </Popover>
        </>
    );
};
