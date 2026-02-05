/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2025 Red Hat, Inc.
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
                        console={spice}
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
