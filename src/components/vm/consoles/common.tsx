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

import React, { useState } from 'react';
import cockpit from 'cockpit';

import type { VM, VMGraphics } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { DownloadIcon, ExternalLinkAltIcon } from "@patternfly/react-icons";
import { MenuToggle, MenuToggleAction, MenuToggleElement } from "@patternfly/react-core/dist/esm/components/MenuToggle";
import { Dropdown, DropdownList, DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";

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

export function console_launch(vm: VM, consoleDetail: VMGraphics, download: boolean) {
    if (!download) {
        // Launch via direct link
        // XXX - figure out TLS
        const protocol = consoleDetail.type;
        const host = connection_address();
        const port = consoleDetail.tlsPort || consoleDetail.port;
        // We use our parent (the Shell) in order to avoid Content-Security-Policy issues.
        window.parent.location = `${protocol}://${host}:${port}`;
    } else {
        domainDesktopConsole({ name: vm.name, consoleDetail: { ...consoleDetail, address: connection_address() } });
    }
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
    url = null,
    onEdit = null,
    editLabel = null,
} : {
    vm: VM,
    url?: null | string,
    onEdit?: null | (() => void),
    editLabel?: null | string,
}) => {
    const vnc = vm.displays.find((d): d is VMGraphics => d.type == "vnc");
    const spice = vm.displays.find((d): d is VMGraphics => d.type == "spice");

    const [active, setActive] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    interface LaunchAction {
        title: string;
        desc: string;
        download: boolean;
        console: VMGraphics;
    }

    const actions: LaunchAction[] = [];

    if (vnc) {
        actions.push(
            {
                title: _("Launch VNC viewer"),
                desc: _("By downloading a console.vv file"),
                download: true,
                console: vnc,
            },
            {
                title: _("Launch VNC viewer"),
                desc: _("Via a vnc://... URL"),
                download: false,
                console: vnc,
            }
        );
    }

    if (spice) {
        actions.push(
            {
                title: _("Launch SPICE viewer"),
                desc: _("By downloading a console.vv file"),
                download: true,
                console: spice,
            },
            {
                title: _("Launch SPICE viewer"),
                desc: _("Via a spice://... URL"),
                download: false,
                console: spice,
            }
        );
    }

    function launch(action: LaunchAction) {
        console_launch(vm, action.console, action.download);
    }

    return (
        <Flex columnGap={{ default: 'columnGapSm' }}>
            <RemoteConnectionPopover
                url={url}
                onEdit={onEdit}
                editLabel={editLabel}
            />
            <Dropdown
                isOpen={isOpen}
                onSelect={
                    (_event, val) => {
                        if (typeof val == "number")
                            setActive(val);
                        setIsOpen(false);
                    }
                }
                onOpenChange={(isOpen: boolean) => setIsOpen(isOpen)}
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsOpen(!isOpen)}
                        isExpanded={isOpen}
                        variant="secondary"
                        splitButtonItems={[
                            <MenuToggleAction
                                key="action"
                                onClick={() => launch(actions[active])}
                            >
                                {actions[active].download ? <DownloadIcon /> : <ExternalLinkAltIcon />}
                                {"\n"}
                                {actions[active].title}
                            </MenuToggleAction>
                        ]}
                    />)}
            >
                <DropdownList>
                    {
                        actions.map((a, idx) => (
                            <DropdownItem key={idx} value={idx} description={a.desc} isSelected={idx == active}>
                                {a.title}
                            </DropdownItem>
                        ))
                    }
                </DropdownList>
            </Dropdown>
        </Flex>
    );
};
