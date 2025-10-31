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

import type { VM, VMGraphics } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody, EmptyStateFooter, EmptyStateActions } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Split, SplitItem } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { useDialogs } from 'dialogs';

import { canReplaceSpice, ReplaceSpiceDialog } from '../vmReplaceSpiceDialog.jsx';
import { LaunchViewerButton, connection_address } from './common';

const _ = cockpit.gettext;

const SpiceFooter = ({
    vm,
    spice
} : {
    vm: VM,
    spice: VMGraphics | null,
}) => {
    return (
        <div className="vm-console-footer">
            <Split>
                <SplitItem isFilled />
                <SplitItem>
                    <LaunchViewerButton
                        vm={vm}
                        {...spice &&
                            { url: cockpit.format("spice://$0:$1", connection_address(), spice.port) }}
                    />
                </SplitItem>
            </Split>
        </div>
    );
};

const Spice = ({
    vm,
    isActive = false,
    isExpanded,
    spice
} : {
    vm: VM,
    isActive?: boolean,
    isExpanded: boolean,
    spice: VMGraphics | null,
}) => {
    const Dialogs = useDialogs();

    function replace_spice() {
        Dialogs.show(<ReplaceSpiceDialog vm={vm} vms={[vm]} />);
    }

    return (
        <>
            <EmptyState>
                <EmptyStateBody>
                    {_("This machine has a SPICE graphical console that can not be shown here.")}
                </EmptyStateBody>
                { !isActive &&
                    <EmptyStateBody>
                        {_("Start the virtual machine to launch remote viewer.")}
                    </EmptyStateBody>
                }
                { canReplaceSpice() &&
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button
                                variant="link"
                                onClick={replace_spice}
                            >
                                {_("Replace with VNC")}
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                }
            </EmptyState>
            { !isExpanded && <SpiceFooter vm={vm} spice={spice} /> }
        </>
    );
};

export const SpiceActive = ({
    vm,
    isExpanded,
    spice
} : {
    vm: VM,
    isExpanded: boolean,
    spice: VMGraphics,
}) => {
    return <Spice isActive vm={vm} isExpanded={isExpanded} spice={spice} />;
};

export const SpiceInactive = ({
    vm,
    isExpanded
} : {
    vm: VM,
    isExpanded: boolean,
}) => {
    return <Spice vm={vm} isExpanded={isExpanded} spice={null} />;
};
