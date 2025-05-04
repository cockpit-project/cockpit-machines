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
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { DesktopViewer } from '@patternfly/react-console';

import { getServerAddress, needsTunnel } from "./utils.js";
import cockpit from "cockpit";
import store from './../../../store.js';

const _ = cockpit.gettext;

function fmt_to_fragments(fmt) {
    const args = Array.prototype.slice.call(arguments, 1);

    function replace(part) {
        if (part[0] == "$") {
            return args[parseInt(part.slice(1))];
        } else
            return part;
    }

    return React.createElement.apply(null, [React.Fragment, { }].concat(fmt.split(/(\$[0-9]+)/g).map(replace)));
}

const DesktopConsoleDownload = ({ vnc, spice, onDesktopConsole }) => {
    // DesktopViewer prefers spice over vnc
    const address = (spice && spice.address) || (vnc && vnc.address);
    const serverAddress = getServerAddress();
    const loggedUser = store.getState().systemInfo.loggedUser;

    return (
        <DesktopViewer spice={spice}
                       vnc={vnc}
                       onDownload={onDesktopConsole}
                       textManualConnection={_("Manual connection")}
                       textNoProtocol={_("No connection available")}
                       textConnectWith={_("Connect with any viewer application for following protocols")}
                       textAddress={_("Address")}
                       textSpiceAddress={_("SPICE address")}
                       textVNCAddress={_("VNC address")}
                       textSpicePort={_("SPICE port")}
                       textVNCPort={_("VNC port")}
                       textSpiceTlsPort={_("SPICE TLS port")}
                       textVNCTlsPort={_("VNC TLS port")}
                       textConnectWithRemoteViewer={_("Launch remote viewer")}
                       textMoreInfo={_("Remote viewer details")}
                       textMoreInfoContent={<>
                           <p>
                               {fmt_to_fragments(_("Clicking \"Launch remote viewer\" will download a .vv file and launch $0."), <i>Remote Viewer</i>)}
                           </p>
                           {needsTunnel(address, serverAddress) && <p>
                               {_("SSH tunnel needs to be set up on client:")}
                               <CodeBlock>
                                   <CodeBlockCode>{`ssh -L 5900:localhost:5900 -N ${loggedUser.name}@${serverAddress}`}</CodeBlockCode>
                               </CodeBlock>
                           </p>}
                           <p>
                               {fmt_to_fragments(_("$0 is available for most operating systems. To install it, search for it in GNOME Software or run the following:"), <i>Remote Viewer</i>)}
                           </p>
                       </>}
        />
    );
};

export default DesktopConsoleDownload;
