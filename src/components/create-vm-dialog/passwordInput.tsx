/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import cockpit from "cockpit";
import React, { useState, useId } from 'react';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { InputGroup, InputGroupItem } from '@patternfly/react-core/dist/esm/components/InputGroup/index.js';
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover/index.js";
import { EyeIcon, EyeSlashIcon, HelpIcon } from '@patternfly/react-icons';
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Progress, ProgressMeasureLocation, ProgressSize, type ProgressProps } from "@patternfly/react-core/dist/esm/components/Progress/index.js";

import {
    DialogField,
    DialogHelperText, OptionalFormGroup,
    DialogTextInput,
} from "cockpit/dialog";

import 'cockpit-components-password.scss';

const _ = cockpit.gettext;

/* XXX - This is a reimplementation of (half of) PasswordFormFields,
         just so that we can control the ids better.  This might be
         going too far.

   What we gain from this rewrite:

   - Validation failures are shown as errors, not as warnings.

   - It's a "controlled component" now without internal state for the
     actual password.

   - We can use the dialog kit to do the debouncing etc.

   - The FormGroup is optional.

   - The code for determining the password strength display is no
     longer split between the password_quality function and the
     component.

   - We can put our standard ouiaId on the TextInput and use the
     standard set_TextInput helper function.
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
    const id = useId();

    function onPasswordChange() {
        field.get_async(async value => {
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
            fieldId={id}
        >
            <InputGroup>
                <InputGroupItem isFill>
                    <DialogTextInput
                        field={field.notify(onPasswordChange)}
                        className="check-passwords"
                        type={passwordHidden ? "password" : "text"}
                        id={id}
                        ouiaId={field.ouia_id()}
                        autoComplete="new-password"
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
