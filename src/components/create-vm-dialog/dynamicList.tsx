/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React, { useId } from 'react';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { FormFieldGroup, FormFieldGroupHeader } from "@patternfly/react-core/dist/esm/components/Form";

import {
    DialogField,
    DialogHelperText,
} from "cockpit/dialog";

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
    const id = useId();
    return (
        <FormFieldGroup
            header={
                <FormFieldGroupHeader
                    titleText={{ text: label, id }}
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
