/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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
import React from "react";
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody, EmptyStateFooter } from "@patternfly/react-core/dist/esm/components/EmptyState";

import { useDialogs } from 'dialogs.jsx';
import { ReplaceSpiceDialog } from '../vmReplaceSpiceDialog.jsx';

import cockpit from "cockpit";

const _ = cockpit.gettext;

const DesktopConsoleDownload = ({ vm, spice, onDesktopConsole }) => {
    const Dialogs = useDialogs();

    return (
        <>
            <div className="vm-console-main">
                <EmptyState>
                    <EmptyStateBody><b>{_("Spice")}</b> {spice.address}:{spice.port}</EmptyStateBody>
                    <EmptyStateFooter>
                        <Button variant="primary" onClick={onDesktopConsole}>
                            {_("Launch viewer")}
                        </Button>
                        <Button variant="link" onClick={() => Dialogs.show(<ReplaceSpiceDialog vm={vm} vms={[vm]} />)}>
                            {_("Replace with VNC")}
                        </Button>
                    </EmptyStateFooter>
                </EmptyState>
            </div>
        </>
    );
};

export default DesktopConsoleDownload;
