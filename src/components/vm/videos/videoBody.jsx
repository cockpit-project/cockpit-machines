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
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Popover, PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";
import { Text, TextContent, TextVariants } from "@patternfly/react-core/dist/esm/components/Text";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { ExternalLinkSquareAltIcon, OutlinedQuestionCircleIcon } from '@patternfly/react-icons';


import cockpit from 'cockpit';

import './video.css';

const _ = cockpit.gettext;

export const VideoTypeRow = ({ idPrefix, onValueChanged, dialogValues, osTypeArch, osTypeMachine }) => {
    const availableTypes = [
        { name: 'vnc', desc: 'vnc' }
    ];
    const defaultType = dialogValues.videoType;

    return (
        <>
            <FormGroup fieldId={`${idPrefix}-type`} label={_("Type")}>
                <FormSelect id={`${idPrefix}-type`}
                            onChange={(_event, value) => onValueChanged('videoType', value)}
                            data-value={defaultType}
                            value={defaultType}>
                    {availableTypes
                            .map(videoType => {
                                return (
                                    <FormSelectOption value={videoType.name} key={videoType.name}
                                                      label={videoType.name} />
                                );
                            })
                    }
                </FormSelect>
            </FormGroup>
            <FormGroup fieldId={`${idPrefix}-password`} label={_("Password")}>
                <TextInput id={`${idPrefix}-password`}
                           value={dialogValues.videoPassword}
                           type="password"
                           onChange={(event) => onValueChanged('videoPassword', event.target.value)} />
            </FormGroup>
        </>
    );
};

VideoTypeRow.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    osTypeArch: PropTypes.string.isRequired,
    osTypeMachine: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
};
