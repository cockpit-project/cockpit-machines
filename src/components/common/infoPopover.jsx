/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2025 Red Hat, Inc.
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
import { Icon } from "@patternfly/react-core/dist/esm/components/Icon";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { HelpIcon } from "@patternfly/react-icons";

const _ = cockpit.gettext;

export const InfoPopover = ({ ...props }) => {
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
