/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

/* Common dialog input elements that are compatible with
   "cockpit/dialog".
 */

import cockpit from "cockpit";
import React from 'react';

import { InputGroup } from "@patternfly/react-core/dist/esm/components/InputGroup";

import { FileAutoComplete as CockpitFileAutoComplete } from "cockpit-components-file-autocomplete.jsx";

import {
    DialogField,
    DialogHelperText, OptionalFormGroup,
    DialogTextInput,
    DialogDropdownSelect,
} from "cockpit/dialog";

import { convertToUnit, units } from "../../helpers.js";

const _ = cockpit.gettext;

export const FileAutoComplete = ({
    label,
    field,
    placeholder,
} : {
    label: React.ReactNode,
    field: DialogField<string>,
    placeholder: string,
}) => {
    return (
        <OptionalFormGroup label={label}>
            <CockpitFileAutoComplete
                id={field.id()}
                placeholder={placeholder}
                onChange={(value: string) => field.set(value)}
                value={field.get()}
                superuser="try"
            />
            <DialogHelperText field={field} />
        </OptionalFormGroup>
    );
};

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
    const { unit } = field.get();
    const maxSize = parseFloat(convertToUnit(max, units.B, unit).toFixed(2));

    return (
        <OptionalFormGroup
            label={label}
            fieldId={field.sub("size").id()}
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
