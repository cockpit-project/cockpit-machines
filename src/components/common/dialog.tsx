/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

/* Common dialog input elements that are compatible with
   "cockpit/dialog".
 */

import cockpit from "cockpit";
import React, { useState } from 'react';

import { Button, ButtonProps } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { FormFieldGroup, FormFieldGroupHeader } from "@patternfly/react-core/dist/esm/components/Form";
import { InputGroup, InputGroupItem } from '@patternfly/react-core/dist/esm/components/InputGroup/index.js';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover/index.js";
import { EyeIcon, EyeSlashIcon, HelpIcon } from '@patternfly/react-icons';
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Progress, ProgressMeasureLocation, ProgressSize, type ProgressProps } from "@patternfly/react-core/dist/esm/components/Progress/index.js";

import { FileAutoComplete as CockpitFileAutoComplete } from "cockpit-components-file-autocomplete.jsx";

import {
    DialogState,
    DialogError,
    DialogField,
    DialogHelperText, OptionalFormGroup,
    DialogTextInput,
    DialogDropdownSelect,
} from "cockpit/dialog";

import { convertToUnit, units } from "../../helpers.js";

import 'cockpit-components-password.scss';

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

/* XXX - This is a reimplementation of PasswordFormFields, just so
         that we can control the ids better.  This might be going too
         far.  We could also add password strength to PasswordInput
         from cockpit/dialog.
 */

async function password_quality(password: string): Promise<number> {
    try {
        const content = await (cockpit.spawn(['/usr/bin/pwscore'], { err: "message" }).input(password));
        return parseInt(content, 10);
    } catch (ex) {
        if (ex && typeof ex == "object" && "problem" in ex && ex.problem == "not-found")
            return -1;
        return 0;
    }
}

export const PasswordInput = ({
    label,
    labelInfo,
    field,
} : {
    label: string,
    labelInfo: string,
    field: DialogField<string>
}) => {
    const [passwordStrength, setPasswordStrength] = useState<number>(-1);
    const [passwordHidden, setPasswordHidden] = useState(true);

    function onPasswordChange(value: string) {
        field.set(value);
        field.get_async(300, async value => {
            if (value) {
                setPasswordStrength(await password_quality(value));
            } else {
                setPasswordStrength(-1);
            }
        });
    }

    let variant: ProgressProps['variant'];
    let message;
    let messageColor;
    if (passwordStrength > 66) {
        variant = "success";
        messageColor = "pf-v6-u-success-color-200";
        message = passwordStrength == 100 ? _("Excellent password") : _("Strong password");
    } else if (passwordStrength > 33) {
        variant = "warning";
        messageColor = "pf-v6-u-warning-color-200";
        message = _("Acceptable password");
    } else {
        variant = "danger";
        messageColor = "pf-v6-u-danger-color-200";
        message = _("Weak password");
    }

    let passwordStrengthValue = passwordStrength;
    if (field.get() !== "" && (passwordStrengthValue >= 0 && passwordStrengthValue < 25))
        passwordStrengthValue = 25;

    const strengthExplanation = (
        passwordStrengthValue >= 0 &&
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                <FlexItem>
                    <Progress
                        className={"pf-v6-u-pt-xs ct-password-strength-meter " + variant}
                        title={_("password quality")}
                        size={ProgressSize.sm}
                        measureLocation={ProgressMeasureLocation.none}
                        variant={variant}
                        value={passwordStrengthValue}
                    />
                </FlexItem>
                <FlexItem>
                    <div
                        className={"pf-v6-c-form__helper-text " + messageColor}
                        aria-live="polite"
                    >
                        {message}
                    </div>
                </FlexItem>
            </Flex>
    );

    return (
        <OptionalFormGroup
            label={label}
            {
                ...labelInfo && {
                    labelHelp: <Popover bodyContent={labelInfo}>
                        <Button
                                       icon={<HelpIcon />}
                                       variant="plain"
                                       aria-label="Help"
                        />
                    </Popover>
                }
            }
            fieldId={field.id()}
        >
            <InputGroup>
                <InputGroupItem isFill>
                    <TextInput
                        className="check-passwords"
                        type={passwordHidden ? "password" : "text"}
                        id={field.id()}
                        autoComplete="new-password"
                        value={field.get()}
                        onChange={(_event, value) => onPasswordChange(value)}
                        validated={field.validation_text() ? "warning" : "default"}
                    />
                </InputGroupItem>
                <InputGroupItem>
                    <Button
                        variant="control"
                        onClick={() => setPasswordHidden(!passwordHidden)}
                        aria-label={passwordHidden ? _("Show password") : _("Hide password")}
                    >
                        {passwordHidden ? <EyeIcon /> : <EyeSlashIcon />}
                    </Button>
                </InputGroupItem>
            </InputGroup>
            <DialogHelperText field={field} explanation={strengthExplanation} />
        </OptionalFormGroup>
    );
};

export function DynamicList<T>({
    field,
    label,
    actionLabel,
    emptyStateString,
    render,
    init,
} : {
    field: DialogField<T[]>,
    label: string,
    actionLabel: string,
    emptyStateString: string,
    render: (field: DialogField<T>, index: number) => React.ReactNode,
    init: T,
}) {
    return (
        <FormFieldGroup
            header={
                <FormFieldGroupHeader
                    titleText={{ text: label, id: field.id() }}
                    actions={
                        <Button
                            variant="secondary"
                            className="btn-add"
                            onClick={() => field.add(init)}
                        >
                            {actionLabel}
                        </Button>
                    }
                />
            }
            className="dynamic-form-group"
        >
            {
                field.get().length > 0
                    ? field.map(render)
                    : <EmptyState>
                        <EmptyStateBody>
                            {emptyStateString}
                        </EmptyStateBody>
                    </EmptyState>
            }
            <DialogHelperText field={field} />
        </FormFieldGroup>
    );
}

export function DialogActionButton<V>({
    dialog,
    children,
    action,
    isDisabled = false,
    variant = "main",
    onClose = undefined,
    ...props
} : {
    dialog: DialogState<V> | DialogError | null,
    children: React.ReactNode,
    action: (values: V, variant: string) => Promise<void>,
    isDisabled?: boolean,
    variant?: string,
    onClose?: undefined | (() => void)
} & Omit<ButtonProps, "id" | "action" | "isLoading" | "isDisabled" | "variant" | "onClick">) {
    const [running, setRunning] = useState(false);

    return (
        <Button
            id={variant == "main" ? "dialog-apply" : "dialog-apply-" + variant}
            isLoading={!!dialog && !(dialog instanceof DialogError) && dialog.busy && running}
            isDisabled={isDisabled || !dialog || dialog instanceof DialogError || dialog.actions_disabled}
            variant={variant == "main" ? "primary" : "secondary"}
            onClick={async () => {
                cockpit.assert(dialog && !(dialog instanceof DialogError));
                setRunning(true);
                if (await dialog.run_action(v => action(v, variant)) && onClose)
                    onClose();
                setRunning(false);
            }}
            {...props}
        >
            {children}
        </Button>
    );
}
