/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2018 Red Hat, Inc.
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

import { LIBVIRT_SYSTEM_CONNECTION, LIBVIRT_SESSION_CONNECTION, rephraseUI } from '../../helpers.js';
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import cockpit from 'cockpit';
import './machinesConnectionSelector.css';

import type { ConnectionName } from '../../types';

import { InfoPopover } from '../common/infoPopover.jsx';

const _ = cockpit.gettext;

interface MachinesConnectionSelectorProps {
    onValueChanged: (prop: "connectionName", value: ConnectionName) => void,
    loggedUser: cockpit.UserInfo,
    connectionName: ConnectionName,
    id: string,
    showInfoHelper?: boolean,
}

export const MachinesConnectionSelector = ({
    onValueChanged,
    loggedUser,
    connectionName,
    id,
    showInfoHelper
}: MachinesConnectionSelectorProps) => {
    if (loggedUser.id == 0)
        return null;

    return (
        <FormGroup label={_("Connection")}
                   isInline
                   id={id}
                   className="machines-connection-selector"
                   {...showInfoHelper
                       ? {
                           labelHelp:
                           <InfoPopover id="machines-connection-selector-popover"
                                bodyContent={<>
                                    <Content>
                                        <Content component={ContentVariants.h4}>{rephraseUI("connections", LIBVIRT_SYSTEM_CONNECTION)}</Content>
                                        <Content component="ul">
                                            <Content component="li">
                                                {_("Ideal for server VMs")}
                                            </Content>
                                            <Content component="li">
                                                {_("VM will launch with root permissions")}
                                            </Content>
                                            <Content component="li">
                                                {_("Ideal networking support")}
                                            </Content>
                                            <Content component="li">
                                                {_("Permissions denied for disk images in home directories")}
                                            </Content>
                                        </Content>
                                    </Content>
                                    <Content>
                                        <Content component={ContentVariants.h4}>{rephraseUI("connections", LIBVIRT_SESSION_CONNECTION)}</Content>
                                        <Content component="ul">
                                            <Content component="li">
                                                {_("Good choice for desktop virtualization")}
                                            </Content>
                                            <Content component="li">
                                                {_("VM launched with unprivileged limited access, with the process and PTY owned by your user account")}
                                            </Content>
                                            <Content component="li">
                                                {_("Restrictions in networking (SLIRP-based emulation) and PCI device assignment")}
                                            </Content>
                                            <Content component="li">
                                                {_("Disk images can be stored in user home directory")}
                                            </Content>
                                        </Content>
                                    </Content>
                                </>}
                           />
                       }
                       : {}
                   }>
            <Radio isChecked={connectionName === LIBVIRT_SYSTEM_CONNECTION}
                   onChange={() => onValueChanged('connectionName', LIBVIRT_SYSTEM_CONNECTION)}
                   name="connectionName"
                   id="connectionName-system"
                   label={rephraseUI("connections", LIBVIRT_SYSTEM_CONNECTION)} />
            <Radio isChecked={connectionName == LIBVIRT_SESSION_CONNECTION}
                   onChange={() => onValueChanged('connectionName', LIBVIRT_SESSION_CONNECTION)}
                   name="connectionName"
                   id="connectionName-session"
                   label={rephraseUI("connections", LIBVIRT_SESSION_CONNECTION)} />
        </FormGroup>
    );
};
