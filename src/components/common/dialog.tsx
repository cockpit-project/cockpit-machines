/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

/* Common dialog input elements that are compatible with
   "cockpit/dialog".
 */

import cockpit from "cockpit";
import React, { useId } from 'react';

import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";

import {
    DialogField,
    DialogHelperText, OptionalFormGroup,
    DialogTextInput,
    DialogDropdownSelect,
} from "cockpit/dialog";

import { convertToUnit, units } from "../../helpers.js";

const _ = cockpit.gettext;

export interface SizeValue {
    size: string,
    unit: string,
}

export const SizeInput = ({
    label,
    field,
    max,
    warning,
    explanation,
} : {
    label: React.ReactNode,
    field: DialogField<SizeValue>,
    max: number,
    warning?: React.ReactNode;
    explanation?: React.ReactNode;
}) => {
    const id = useId();
    const { unit } = field.get();
    const maxSize = parseFloat(convertToUnit(max, units.B, unit).toFixed(2));

    return (
        <OptionalFormGroup
            label={label}
            fieldId={id}
        >
            <InputGroup>
                {/* We don't do anything special while the user is
                    typing, like rejecting certain key strokes, or
                    converting the value to a integer and back to a
                    string.  That would all be too surprising. If the
                    entered text is not a number, then the value will
                    be the empty string, which needs to be rejected
                    during validation.
                  */}
                <DialogTextInput
                    className="ct-machines-size-input"
                    id={id}
                    field={field.sub("size")}
                    type="number"
                    inputMode='numeric'
                    step={1}
                    min={0}
                    max={maxSize}
                />
                <DialogDropdownSelect
                    className="ct-machines-select-unit"
                    field={field.sub("unit")}
                    options={[
                        { value: units.MiB.name, label: _("MiB") },
                        { value: units.GiB.name, label: _("GiB") },
                    ]}
                />
            </InputGroup>
            <DialogHelperText field={field} warning={warning} explanation={explanation} />
        </OptionalFormGroup>
    );
};
