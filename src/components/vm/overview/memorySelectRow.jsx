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
import cockpit from 'cockpit';
import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid";
import { Slider } from "@patternfly/react-core/dist/esm/components/Slider";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { FormHelper } from 'cockpit-components-form-helper.jsx';

import { digitFilter, units } from "../../../helpers.js";

import './memorySelectRow.css';

const _ = cockpit.gettext;

class MemorySelectRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = { memory: props.value };
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.value !== prevState.memory && !prevState.inputHasFocus)
            return { memory: parseFloat(nextProps.value).toFixed(0) };
        return null;
    }

    render() {
        const { id, value, label, minValue, maxValue, initialUnit, onValueChange, onUnitChange, isDisabled, helperText } = this.props;

        return (
            <FormGroup fieldId={id}
                       label={label}>
                <Grid hasGutter>
                    <GridItem span={12} sm={8}>
                        <Slider className='memory-slider'
                                id={id + '-slider'}
                                isDisabled={isDisabled}
                                key={id + '-slider-max-' + maxValue}
                                max={maxValue}
                                min={minValue}
                                onChange={value => onValueChange(value)}
                                showBoundaries
                                showTicks={false}
                                step={1}
                                value={value} />
                    </GridItem>
                    <GridItem span={12} sm={4}>
                        <InputGroup>
                            <TextInput id={id}
                                       className="ct-machines-size-input"
                                       type="text"
                                       inputMode="numeric"
                                       pattern="[0-9]*"
                                       value={this.state.memory}
                                       onKeyPress={digitFilter}
                                       isDisabled={isDisabled}
                                       onFocus={ () => this.setState({ inputHasFocus: true }) }
                                       onBlur={() => { onValueChange(Math.min(Math.max(minValue, this.state.memory), maxValue)); this.setState({ inputHasFocus: false }) }}
                                       onChange={(_, memory) => this.setState({ memory })} />
                            <FormSelect id={id + "-unit-select"}
                                        className="ct-machines-select-unit"
                                        value={initialUnit}
                                        isDisabled={isDisabled}
                                        onChange={onUnitChange}>
                                <FormSelectOption value={units.MiB.name} key={units.MiB.name}
                                                  label={_("MiB")} />
                                <FormSelectOption value={units.GiB.name} key={units.GiB.name}
                                                  label={_("GiB")} />
                            </FormSelect>
                        </InputGroup>
                    </GridItem>
                </Grid>
                <FormHelper helperText={helperText} />
            </FormGroup>
        );
    }
}

export default MemorySelectRow;
