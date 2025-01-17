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

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
    FormGroup, FormHelperText, HelperText, HelperTextItem,
    Grid, GridItem,
    InputGroup, TextInput, Button
} from "@patternfly/react-core";
import { EyeIcon, EyeSlashIcon } from "@patternfly/react-icons";

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const VncRow = ({ idPrefix, onValueChanged, dialogValues, validationErrors }) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <>
            <Grid hasGutter md={6}>
                <GridItem span={6}>
                    <FormGroup fieldId={`${idPrefix}-address`} label={_("Listening address")}>
                        <TextInput id={`${idPrefix}-address`}
                            value={dialogValues.vncAddress}
                            type="text"
                            placeholder={_("default")}
                            onChange={(event) => onValueChanged('vncAddress', event.target.value)} />
                    </FormGroup>
                </GridItem>
                <GridItem span={6}>
                    <FormGroup fieldId={`${idPrefix}-port`} label={_("Listening port")}>
                        <TextInput id={`${idPrefix}-port`}
                            value={dialogValues.vncPort}
                            type="text"
                            placeholder={_("automatic")}
                            validated={validationErrors.vncPort ? "error" : null}
                            onChange={(event) => onValueChanged('vncPort', event.target.value)} />
                        { validationErrors.vncPort &&
                            <FormHelperText>
                                <HelperText>
                                    <HelperTextItem variant='error'>{validationErrors.vncPort}</HelperTextItem>
                                </HelperText>
                            </FormHelperText>
                        }
                    </FormGroup>
                </GridItem>
            </Grid>
            <FormGroup fieldId={`${idPrefix}-password`} label={_("Password")}>
                <InputGroup>
                    <TextInput
                        id={`${idPrefix}-password`}
                        type={showPassword ? "text" : "password"}
                        value={dialogValues.vncPassword}
                        onChange={(event) => onValueChanged('vncPassword', event.target.value)} />
                    <Button
                        variant="control"
                        onClick={() => setShowPassword(!showPassword)}>
                        { showPassword ? <EyeSlashIcon /> : <EyeIcon /> }
                    </Button>
                </InputGroup>
            </FormGroup>
        </>
    );
};

export function validateDialogValues(values) {
    const res = { };

    if (values.vncPort == "")
        ; // fine
    else if (!values.vncPort.match("^[0-9]+$") || Number(values.vncPort) < 5900)
        res.vncPort = _("Port must be 5900 or larger.");

    return Object.keys(res).length > 0 ? res : null;
}

VncRow.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
    validationErrors: PropTypes.object.isRequired,
};
