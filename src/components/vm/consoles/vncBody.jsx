/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
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
import PropTypes from 'prop-types';
import { FormGroup, TextInput } from "@patternfly/react-core";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const VncRow = ({ idPrefix, onValueChanged, dialogValues }) => {
    return (
        <>
            <FormGroup fieldId={`${idPrefix}-address`} label={_("VNC address")}>
                <TextInput id={`${idPrefix}-address`}
                           value={dialogValues.vncAddress}
                           type="text"
                           onChange={(event) => onValueChanged('vncAddress', event.target.value)} />
            </FormGroup>
            <FormGroup fieldId={`${idPrefix}-port`} label={_("VNC port")}>
                <TextInput id={`${idPrefix}-port`}
                           value={dialogValues.vncPort}
                           type="number"
                           onChange={(event) => onValueChanged('vncPort', event.target.value)} />
            </FormGroup>
            <FormGroup fieldId={`${idPrefix}-password`} label={_("VNC password")}>
                <TextInput id={`${idPrefix}-password`}
                           value={dialogValues.vncPassword}
                           type="password"
                           onChange={(event) => onValueChanged('vncPassword', event.target.value)} />
            </FormGroup>
        </>
    );
};

VncRow.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
};
