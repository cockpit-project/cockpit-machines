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
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { DownloadIcon } from "@patternfly/react-icons";
import { fmt_to_fragments } from 'utils.jsx';
import { InfoPopover } from '../../common/infoPopover';

import { domainDesktopConsole } from '../../../libvirtApi/domain.js';
import { StateObject } from './state';

const _ = cockpit.gettext;

export class ConsoleState extends StateObject {
    connected: boolean = true;

    setConnected(val: boolean) {
        this.connected = val;
        this.update();
    }
}

export function connection_address() {
    let address;
    if (cockpit.transport.host == "localhost") {
        const app = cockpit.transport.application();
        if (app.startsWith("cockpit+=")) {
            address = app.substr(9);
        } else {
            address = window.location.hostname;
        }
    } else {
        address = cockpit.transport.host;
        const pos = address.indexOf("@");
        if (pos >= 0) {
            address = address.substr(pos + 1);
        }
    }
    return address;
}

export function console_launch(vm: VM, consoleDetail: VMGraphics) {
    // fire download of the .vv file
    domainDesktopConsole({ name: vm.name, consoleDetail: { ...consoleDetail, address: connection_address() } });
}

const RemoteConnectionInfo = ({
    hide,
    url = null,
    onEdit = null,
    editLabel = null,
} : {
    hide: () => void,
    url?: null | string,
    onEdit?: null | (() => void),
    editLabel?: null | string,
}) => {
    return (
        <>
            <Content component={ContentVariants.p}>
                {fmt_to_fragments(_("Clicking \"Launch viewer\" will download a $0 file and launch the Remote Viewer application on your system."), <code>.vv</code>)}
            </Content>
            <Content component={ContentVariants.p}>
                {_("Remote Viewer is available for most operating systems. To install it, search for \"Remote Viewer\" in GNOME Software, KDE Discover, or run the following:")}
            </Content>
            <Content component={ContentVariants.dl}>
                <Content component={ContentVariants.dt}>RHEL, CentOS</Content>
                <Content component={ContentVariants.dd}>
                    <code>sudo yum install virt-viewer</code>
                </Content>
                <Content component={ContentVariants.dt}>Fedora</Content>
                <Content component={ContentVariants.dd}>
                    <code>sudo dnf install virt-viewer</code>
                </Content>
                <Content component={ContentVariants.dt}>Ubuntu, Debian</Content>
                <Content component={ContentVariants.dd}>
                    <code>sudo apt-get install virt-viewer</code>
                </Content>
                <Content component={ContentVariants.dt}>SLE, openSUSE</Content>
                <Content component={ContentVariants.dd}>
                    <code>sudo zypper install virt-viewer</code>
                </Content>
                <Content component={ContentVariants.dt}>Windows</Content>
                <Content component={ContentVariants.dd}>
                    {fmt_to_fragments(
                        _("Download the MSI from $0"),
                        <a href="https://virt-manager.org/download" target="_blank" rel="noopener noreferrer">
                            virt-manager.org
                        </a>)}
                </Content>
            </Content>
            { url &&
            <>
                <Content component={ContentVariants.hr} />
                <Content component={ContentVariants.p}>
                    {_("Remote viewer applications can connect to the following address:")}
                </Content>
                <ClipboardCopy
                    hoverTip={_("Copy to clipboard")}
                    clickTip={_("Successfully copied to clipboard!")}
                    variant="inline-compact"
                >
                    {url}
                </ClipboardCopy>
                <Content component={ContentVariants.p} />
            </>
            }
            { onEdit &&
                <Button isInline variant="link" onClick={() => { hide(); onEdit() }}>
                    {editLabel}
                </Button>
            }
        </>
    );
};

const RemoteConnectionPopover = ({
    url = null,
    onEdit = null,
    editLabel = null,
} : {
    url?: null | string,
    onEdit?: null | (() => void),
    editLabel?: null | string,
}) => {
    return (
        <InfoPopover
            // Without a "id", the popover changes its aria attributes on each page render,
            // which might disturb screen readers.
            id="remote-viewer-info"
            className="ct-remote-viewer-popover"
            headerContent={_("Remote viewer")}
            bodyContent={(hide) =>
                <RemoteConnectionInfo
                    hide={hide}
                    url={url}
                    onEdit={onEdit}
                    editLabel={editLabel}
                />
            }
        />
    );
};

export const LaunchViewerButton = ({
    vm,
    console,
    url = null,
    onEdit = null,
    editLabel = null,
} : {
    vm: VM,
    console: VMGraphics | null,
    url?: null | string,
    onEdit?: null | (() => void),
    editLabel?: null | string,
}) => {
    return (
        <Flex columnGap={{ default: 'columnGapSm' }}>
            <RemoteConnectionPopover
                url={url}
                onEdit={onEdit}
                editLabel={editLabel}
            />
            <Button
                icon={<DownloadIcon />}
                variant="secondary"
                onClick={() => console && console_launch(vm, console)}
                isDisabled={!console}
            >
                {_("Launch viewer")}
            </Button>
        </Flex>
    );
};
