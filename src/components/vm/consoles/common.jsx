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
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { fmt_to_fragments } from 'utils.jsx';
import { domainDesktopConsole } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

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

export function console_launch(vm, consoleDetail) {
    // fire download of the .vv file
    domainDesktopConsole({ name: vm.name, consoleDetail: { ...consoleDetail, address: connection_address() } });
}

export const RemoteConnectionInfo = ({ hide, url, onEdit }) => {
    function CDD(term, description) {
        // What is this? Java?
        return (
            <>
                <Content component={ContentVariants.dt}>{term}</Content>
                <Content component={ContentVariants.dd}>{description}</Content>
            </>
        );
    }

    return (
        <>
            <Content component={ContentVariants.p}>
                {fmt_to_fragments(_("Clicking \"Launch viewer\" will download a $0 file and launch the Remote Viewer application on your system."), <code>.vv</code>)}
            </Content>
            <Content component={ContentVariants.p}>
                {_("Remote Viewer is available for most operating systems. To install it, search for \"Remote Viewer\" in GNOME Software, KDE Discover, or run the following:")}
            </Content>
            <Content component={ContentVariants.dl}>
                {CDD(_("RHEL, CentOS"), <code>sudo yum install virt-viewer</code>)}
                {CDD(_("Fedora"), <code>sudo dnf install virt-viewer</code>)}
                {CDD(_("Ubuntu, Debian"), <code>sudo apt-get install virt-viewer</code>)}
                {CDD(_("Windows"),
                     fmt_to_fragments(
                         _("Download the MSI from $0"),
                         <a href="https://virt-manager.org/download" target="_blank" rel="noopener noreferrer">
                             virt-manager.org
                         </a>))}
            </Content>
            { url &&
            <>
                <Content component={ContentVariants.p}>
                    {_("Other remote viewer applications can connect to the following address:")}
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
                    {_("Set port and password")}
                </Button>
            }
        </>
    );
};
