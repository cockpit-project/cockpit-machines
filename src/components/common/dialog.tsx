/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2025 Red Hat, Inc.
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
 * along with Cockpit; If not, see <https://www.gnu.org/licenses/>.
 */

/** Dialog Implementation Convenience Kit **/

/* TODOs:

   - progress reporting
   - action cancelling
   - async, debounced validation
   - async init
   - different validation rules for different actions
 */

/* This is a framework for conveniently implementing dialogs. It is
   meant to save us from having to think through all the details every
   time of how a dialog should work exactly and allow us to just get
   on with the business logic.

   The framework has two parts (like git): plumbing and porcelain.

   The plumbing takes care of the state management of dialog values,
   asynchronous and debounced input validation, progress feedback and
   errors from actions, etc. It's basically a couple of rather
   complicated JavaScript classes that work in the background.  This
   is the part we don't want to implement from scratch for every
   dialog.

   The porcelain is a set of React components that integrates with the
   plumbing. They are usually very straightforward and easy to
   write. If none of the existing ones work for you, just write a new
   one that does. But they are boilerplatey, so having common ones for
   common things like text input fields makes a lot of sense, too.

   Here is an example of a simple dialog that prompts for some text
   and writes it to the journal:

    interface LoggerValues {
        text: string;
    }

    const LoggerDialog = () => {
        const Dialogs = useDialogs();

        const init: LoggerValues = {
            text: "",
        };

        function validate() {
            dlg.value("text").validate(v => {
                if (!v)
                    return "Text can not be empty";
            });
        }

        async function apply(values: LoggerValues) {
            await cockpit.spawn(["logger", values.text]);
        }

        const dlg = useDialogState(init, validate);

        return (
            <Modal position="top" variant="medium" isOpen onClose={Dialogs.close}>
                <ModalHeader title="Logger" />
                <ModalBody>
                    <ErrorMessage dialog={dlg} />
                    <Form>
                        <FormGroup label="Log message">
                            <TextInput
                                value={dlg.value("text").get()}
                                onChange={(_event, val) => dlg.value("text").set(val)}
                            />
                            <FormHelper helperTextInvalid={dlg.value("text").validation_text()} />
                        </FormGroup>
                    </Form>
                </ModalBody>
                <ModalFooter>
                    <ActionButton dialog={dlg} action={apply} onClose={Dialogs.close}>
                        Log
                    </ActionButton>
                    <CancelButton dialog={dlg} onClose={Dialogs.close}/>
                </ModalFooter>
            </Modal>
        );
    };

    const LoggerButton = () => {
        const Dialogs = useDialogs();

        return (
            <Button onClick={() => Dialogs.show(<LoggerDialog />)}>Open logger dialog</Button>
        );
    };

   This uses some porcelain for the error message and footer buttons,
   but none for the text input field.  There is a "DialogTextInput"
   porcelain component that could have been used to make this example
   even more concise. But we didn't use it here just to show how input
   form elements hook into the plumbing.

   PLUMBING API

   Here is a speedrun of the plumbing API:

   - dlg = useDialogState(init, validate)

   This is a hook (for function components) that creates a new
   instance of the plumbing machinery.  It also causes the current
   component to re-render appropriately.

   The values of the input fields of a dialog are stored in a
   JavaScript object, and that object is initialized to "init".  The
   actual values of a dialog can be anything, strings, number, other
   objects, arrays, etc, to an arbitrary depth.

   The "init" parameter can directly be a JavaScript object that
   contains the values, or a function that computes them.

   The "validate" parameter is a function that performs input
   validation. It has to follow a very specific code pattern, which is
   explained below.

   There is a variant of useDialogState for asynchronous
   initialization, called useDialogState_async. It takes a async init
   function and returns null until that function has resolved.  You
   should render a spinner in the dialog while "dlg" is null.

   The return value of useDialogState, "dlg", has a number of fields
   and methods.

   - value = dlg.value(name)
   - value = dlg.value(name, update_func)

   This returns a handle for a specific field of the dialog
   values. Using handles like this becomes convenient when there are
   nested values, and when writing reusable porcelain components. They
   also work well with TypeScript. For simple dialogs they might feel
   a bit clunky.

   The second argument, "update_func", is optional. If given, it
   should be a function and that function will be called whenever the
   dialog value is changed via the returned handle (and the returned
   handle only).

   - value.get()

   Get the current value of a value handle.

   - value.validation_text()

   Get the current validation error message for this value. This is
   "null" when there is no message.

   - value.set(val)

   Set the current value of a value handle. This will re-render the
   dialog, and do input validation as necessary and all the other
   things that you don't need to think about.

   - value.sub(name_or_index)
   - value.sub(name_or_index, update_func)

   Get a handle for a nested value. When the current value is an
   object, you should pass the name of a nested field. If it is an
   array, pass the index of the desired element.  See "dlg.value"
   above for more information about handles.

   - value.add(val)

   If the current value is an array, append "val" at the end.

   - value.remove(index)

   If the current value is an array, remove the element at "index".

   - value.map(func)

   If the current value is an array, map "func" over value handles for
   its elements. This is nice for creating React components for
   arrays.

   - value.forEach(func)

   If the current value is an array, call "func" with value handles
   for each of its elements, in order. This is nice for "validate"
   functions.

   Now back to the fields and methods of the dialog state.

   - dlg.actions_disabled
   - dlg.cancel_disabled

   Boolean flags that indicate which parts of the dialog should be
   disabled. The porcelain should of course look at these and do the
   right thing.

   - dlg.error

   The most recent error thrown by an action function.  This can be
   any kind of JavaScript value, but the idea is that it is something
   with a "message" field, or a DialogError instance.  The
   ErrorMessage porcelain component will do the right thing with these
   kind of error values.

   - dlg.run_action(func)

   Performs input validation (if necessary) and if f that was
   successful, calls "func" and puts the dialog in a "busy" state
   while it runs. When "func" throws an error, it is caught and stored
   in "dlg.error".

   Let's now finally talk about input validation.

   Input validation is done by a single, central function for the
   whole dialog.  This has been done so that there is a central place
   that establishes the "shape" of the dialog values. This is
   important for dialogs that have expander areas or other optional
   things.

   If such an optional part of the values has failed validation
   earlier, but has subsequently been removed from the dialog by the
   user, the plumbing needs to know that it should now ignore this
   failed validation. But the code that knows what is currently in the
   dialog is the render function that instantiates all the field input
   components (like TextInput). This hacker here has found no reliable
   and non-magical way to connect what the render function actually
   does with the plumbing machinery. So everyone has to write a big
   validate function now that duplicates this, sorry!

   The formal job of the validation function is to call the "validate"
   method (or "validate_async") of all relevant dialog value handles.
   If and only if the render function instantiates a component for a
   dialog value, should the validate function visit it.

   - value.validate(v => ...)

   This might call the given function with the current value of the
   handle. If it passes validation, the function should return
   null. If it fails, the function should return a string with the
   appropriate message. This message will be available from the
   "value.validation_text" method and should be shown be the React
   component for this value, of course.

   The "v => ..." function is only called when necessary, when the
   value has actually changed. This might save you from some
   accidentally quadratic complexities.

   - value.validate_async(debounce, async v >= ...)

   Calls the given async function when appropriate.  TODO - implement
   this and nail down the details.

   TESTING

   Our automated tests will want to drive the dialogs created by this
   framework, of course.  To support this, the various DOM elements
   instantiated for a dialog should be decorated with structured "id"
   attributes. The code that instantiates an element can get suitable
   IDs for dialog value handles with the following function:

   - value.id(tag)

   This will return a unique and predictable string for the value
   handle that will also include "tag". This is suitable for the "id"
   attribute of DOM elements associated with "value".  The "tag"
   parameter can be used to generate multiple IDs if a value has
   multiple interesting DOM elements.  The "tag" parameter defaults to
   "field", see below.

   There is a support library for use by the tests that can generate
   the same IDs, and there are also some guidelines for how to use
   these IDs:

   - The main input element (text input, form select, ...) should use
     the "field" tag.

   - The validation text should use the "validation" tag.

   - A set of radio buttons should use a different tag for each
     button. Whatever makes sense in the specific case.

   - ...

   PORCELAIN GALLERY

   Here are some noteworthy React components that integrate with the
   plumbing API.

   - <ErrorMessage dialog={dlg} />

   This creates an appropriate Alert for "dlg.error", if it is set. It
   works well with instances of DialogError, and all usual errors
   thrown by the Cockpit API.

   If given one the of Cockpit API errors, the title of the Alert will
   be a generic "Failed" text. If you want more control, use a
   DialogError.

   A DialogError contains a title and details, and the details can
   come from another error.  For example:

       try {
           await cockpit.spawn(["/bin/frob", "--bars"])
       } catch (ex) {
           throw DialogError.fromError("Failed to frob the bars", ex);
       }

   You can also construct a DialogError directly from title and
   details:

       throw new DialogError("Failed to frob", <pre>...</pre>);

   In that case, the details can be any React node.

   - <ActionButton dialog={dlg} action={func} onClose={close_func}>Apply<ActionButton>

   This will produce a action button for a dialog that correctly disables
   itself according to the state of "dlg".

   When clicked, "func" will be run via "dlg.run_action". If "func"
   completes successfully, "close_func" is called to close the dialog.

   - <CancelButton dialog={dlg} onClose={close_func}>Cancel</CancelButton>

   This will produce a cancel button for a dialog that correctly
   disables itself according to the state of "dlg".

   Clicking it will either just close the dialog by calling
   "close_func", or run the cancel function provided by the currently
   running action function (if there is any).

   - <DialogTextInput label="Name" value={dlg.value("name")} ... />

   This will produce a TextInput in a (optional) FormGroup that will
   manage the given value handle.  The "label" property is optional
   and omitting it will also omit the FormGroup.

  - <DialogCheckbox label= value= .../>

  For a single checkbox that drives a boolean.

  - <DialogRadioSelect label= value= options= .../>

  For a group of radio buttons.  The options can be disabled and have
  explanations.

  WRITING COMPLEX PORCELAIN COMPONENTS

  Here is a pattern that you might want to follow when writing
  complicated components. Even if they are not meant to be reused
  much, it pays of to try to encapsulate their behavior.

  First, declare the type of the value that the component works with.
  For example:

    export interface Person {
      country: string,
      first: string,
      last: string,

      _countries: string[],
      _worldNames: Record<string, Set<string>>,
    }

  Your component will be given a DialogValue<PersonName>.  The value
  can include private state for the component. In fact, your component
  should not have any other properties than "value"! Anything needed
  should be passed into a "init" function:

    export function init_Person(namesOfTheWorld: Record<string, Set<string>>) {
      const _countries: Object.keys(namesOfTheWorld).sort();
      const country: _countries[0];

      return {
        country,
        first: "",
        last: "",

        _countries,
        _worldNames: namesOfTheWorld,
      };
    }

  This way, everything is available during initialization and
  validation, and it is clear that everything is fixed during
  initialization.

  Then write a validation function for the value:

    export validate_Person(value: DialogValue<PersonValue>) {
      value.sub("first").validate(v => {
        if (!v)
          return "First name can't be empty";
      })
    }

  And of course the component itself:

    export const Person = ({ value } : { value: DialogValue<PersonValue> }) => {
      ...
    }

  It would be used in a dialog like this:

    interface DialogValues {
      person: PersonValue;
    }

    function init() {
      return {
        person: init_Person(...)
      }
    }

    function validate() {
      validate_Person(dlg.value("person"));
    }

    const dlg = useDialogState(init, validate);

    return (
      ...
      <Person value={dlg.value("person")} />
      ...
    );

 */

import React from "react";
import { useObject, useOn } from 'hooks';
import { EventEmitter } from 'cockpit/event';

import cockpit from "cockpit";

import { Button, type ButtonProps } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { FormGroup, type FormGroupProps, FormHelperText } from "@patternfly/react-core/dist/esm/components/Form";
import { TextInput, type TextInputProps } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { FormSelect, type FormSelectProps } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";

const _ = cockpit.gettext;

type ArrayElement<ArrayType> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

interface DialogValidationState {
    cached_value: unknown;
    cached_result: string | undefined;
    // TODO - all the stuff for async
}

function toSpliced<T>(arr: T[], start: number, deleteCount: number, ...rest: T[]): T[] {
    const copy = [...arr];
    copy.splice(start, deleteCount, ...rest);
    return copy;
}

export class DialogValue<T> {
    /* eslint-disable no-use-before-define */
    dialog: DialogState<unknown>;
    /* eslint-enable */
    getter: () => T;
    setter: (val: T) => void;
    path: string;

    constructor(dialog: DialogState<unknown>, getter: () => T, setter: (val: T) => void, path: string) {
        this.dialog = dialog;
        this.getter = getter;
        this.setter = setter;
        this.path = path;
    }

    validation_text(): string | undefined {
        return this.dialog.validation[this.path];
    }

    get(): T {
        return this.getter();
    }

    set(val: T): void {
        this.setter(val);
    }

    id(tag: string = "field"): string {
        return "dialog-" + tag + "-" + this.path;
    }

    map<X>(func: (val: DialogValue<ArrayElement<T>>, index: number) => X): X[] {
        const val = this.get();
        if (Array.isArray(val)) {
            return val.map((_, i) => func(this.sub(i as keyof T) as DialogValue<ArrayElement<T>>, i));
        } else
            return [];
    }

    forEach(func: (val: DialogValue<ArrayElement<T>>, index: number) => void): void {
        const val = this.get();
        if (Array.isArray(val)) {
            val.forEach((_, i) => func(this.sub(i as keyof T) as DialogValue<ArrayElement<T>>, i));
        }
    }

    remove(index: number) {
        const val = this.get();
        if (Array.isArray(val)) {
            for (let j = index; j < val.length - 1; j++)
                this.dialog.rename_validation_state(this.path, j + 1, j);
            this.set(toSpliced(val, index, 1) as T);
        }
    }

    add(item: ArrayElement<T>) {
        const val = this.get();
        if (Array.isArray(val)) {
            this.set(val.concat(item) as T);
        }
    }

    sub<K extends keyof T>(tag: K, update_func?: ((val: T[K]) => void) | undefined): DialogValue<T[K]> {
        return new DialogValue<T[K]>(
            this.dialog,
            () => this.get()[tag],
            (val) => {
                const container = this.get();
                if (Array.isArray(container) && typeof tag == "number")
                    this.set(toSpliced(container, tag, 1, val) as T);
                else
                    this.set({ ...container, [tag]: val });
                if (update_func)
                    update_func(val);
            },
            this.path + "." + String(tag));
    }

    validate(func: (val: T) => string | undefined): void {
        const val = this.get();
        let v: string | undefined;
        if (this.path in this.dialog.validation_state &&
            Object.is(this.dialog.validation_state[this.path].cached_value, val)) {
            v = this.dialog.validation_state[this.path].cached_result;
            console.log("CACHE HIT", this.path, v);
        } else {
            v = func(val);
            if (!(this.path in this.dialog.validation_state)) {
                this.dialog.validation_state[this.path] = {
                    cached_value: val,
                    cached_result: v
                };
            } else {
                const state = this.dialog.validation_state[this.path];
                state.cached_value = val;
                state.cached_result = v;
            }
            console.log("VALIDATE", this.path, v);
        }
        if (v) {
            this.dialog.validation[this.path] = v;
            this.dialog.validation_failed = true;
            this.dialog.online_validation = true;
            this.dialog.update();
        }
    }
}

interface DialogStateEvents {
    changed(): void;
}

export class DialogState<V> extends EventEmitter<DialogStateEvents> {
    values: V;
    validation: Record<string, string | undefined> = { };
    validation_state: Record<string, DialogValidationState> = { };

    // internal
    busy: boolean = false;
    validation_failed: boolean = false;
    online_validation: boolean = false;

    // for fields and buttons
    actions_disabled: boolean = false;
    cancel_disabled: boolean = false;

    error: unknown = null;

    /* eslint-disable no-use-before-define */
    validate_callback: (dlg: DialogState<V>) => void;
    /* eslint-enable */

    // for DialogValue

    update() {
        this.actions_disabled = this.busy || this.validation_failed;
        this.cancel_disabled = this.busy;
        this.emit("changed");
    }

    trigger_validation(): void {
        this.validation = { };
        this.validation_failed = false;
        this.validate_callback(this);
        this.update();
    }

    rename_validation_state(path: string, from: number, to: number) {
        const from_path = path + "." + String(from);
        const to_path = path + "." + String(to);
        if (from_path in this.validation_state) {
            console.log("RENAME", from_path, to_path);
            this.validation_state[to_path] = this.validation_state[from_path];
            delete this.validation_state[from_path];
        }
        for (const k in this.validation_state) {
            if (k.indexOf(from_path + ".") == 0) {
                const to = to_path + k.substring(from_path.length);
                console.log("RENAME.", k, to);
                this.validation_state[to] = this.validation_state[k];
                delete this.validation_state[k];
            }
        }
    }

    // For buttons

    async run_action(func: (vals: V) => Promise<void>) {
        this.error = null;
        this.busy = true;
        this.update();
        if (!await this.validate()) {
            this.busy = false;
            this.update();
            return;
        }

        try {
            cockpit.assert(this.values);
            await func(this.values);
        } catch (ex) {
            console.error(String(ex));
            this.error = ex;
        }

        this.busy = false;
        this.update();
    }

    // PUBLIC

    constructor(init: V, validate: (dlg: DialogState<V>) => void) {
        super();
        this.validate_callback = validate;
        this.values = init;
    }

    value<K extends keyof V>(tag: K, update_func?: ((val: V[K]) => void) | undefined): DialogValue<V[K]> {
        return new DialogValue<V[K]>(
            this as DialogState<unknown>,
            () => this.values![tag],
            (val) => {
                console.log("TOP SET", tag, val);
                this.values = { ...this.values, [tag]: val };
                this.update();
                if (this.online_validation)
                    this.trigger_validation();
                if (update_func)
                    update_func(val);
            },
            String(tag));
    }

    async validate(): Promise<boolean> {
        this.trigger_validation();
        // TODO - wait for the asyncs to be done
        return Object.keys(this.validation).length == 0;
    }
}

export function useDialogState<V extends object>(
    init: V | (() => V),
    validate: (dlg: DialogState<V>) => void
) : DialogState<V> {
    const dlg = useObject(() => {
        if (typeof init == "function")
            return new DialogState(init(), validate);
        else
            return new DialogState(init, validate);
    }, null, []);
    useOn(dlg, "changed");
    return dlg;
}

// export function useDialogState_async<V>(...)

// Common elements

export class DialogError {
    title: string;
    details: React.ReactNode;

    constructor(title: string, details: React.ReactNode) {
        this.title = title;
        this.details = details;
    }

    toString() {
        return this.title + ": " + String(this.details);
    }

    static fromError(title: string, err: unknown) {
        if (err && typeof err == "object" && "message" in err && typeof err.message == "string")
            return new DialogError(title, err.message);
        else
            return new DialogError(title, String(err));
    }
}

export function DialogErrorMessage<V>({
    dialog,
} : {
    dialog: DialogState<V>
}) {
    if (!dialog.error)
        return null;

    let title: string;
    let details: React.ReactNode;

    const err = dialog.error;
    if (err instanceof DialogError) {
        title = err.title;
        details = err.details;
    } else if (err && typeof err == "object" && "message" in err && typeof err.message == "string") {
        title = _("Failed");
        details = err.message;
    } else {
        title = _("Failed");
        details = String(err);
    }

    return (
        <Alert
            id="dialog-error-message"
            variant='danger'
            isInline
            title={title}
        >
            {details}
        </Alert>
    );
}

export function DialogActionButton<V>({
    dialog,
    children,
    action,
    onClose = undefined,
    ...props
} : {
    dialog: DialogState<V> | null,
    children: React.ReactNode,
    action: (values: V) => Promise<void>,
    onClose?: undefined | (() => void)
} & Omit<ButtonProps, "id" | "action" | "isLoading" | "isDisabled" | "variant" | "onClick">) {
    return (
        <Button
            id="dialog-apply"
            isLoading={!!dialog && dialog.busy}
            isDisabled={!dialog || dialog.actions_disabled}
            variant="primary"
            onClick={() => {
                cockpit.assert(dialog);
                dialog.run_action(vals => action(vals).then(onClose || (() => {})));
            }}
            {...props}
        >
            {children}
        </Button>
    );
}

export function DialogCancelButton<V>({
    dialog,
    onClose,
    ...props
} : {
    dialog: DialogState<V>,
    onClose: () => void
} & Omit<ButtonProps, "id" | "isDisabled" | "variant" | "onClick">) {
    return (
        <Button
            id="dialog-cancel"
            isDisabled={dialog.cancel_disabled}
            variant="link"
            onClick={onClose}
            {...props}
        >
            {_("Cancel")}
        </Button>
    );
}

/* Common dialog field implementations.
 */

export function DialogHelperText<V>({
    value,
    explanation = null,
} : {
    value: DialogValue<V>,
    explanation?: React.ReactNode;
}) {
    let text: React.ReactNode = value.validation_text();
    let variant: "error" | "default" = "error";
    if (!text) {
        text = explanation;
        variant = "default";
    }

    if (!text)
        return null;

    return (
        <FormHelperText>
            <HelperText>
                <HelperTextItem id={value.id("validation")} variant={variant}>
                    {text}
                </HelperTextItem>
            </HelperText>
        </FormHelperText>
    );
}

export const OptionalFormGroup = ({
    label,
    children,
    ...props
} : {
    label: React.ReactNode,
    children: React.ReactNode,
} & Omit<FormGroupProps, "label" | "children">) => {
    if (label) {
        return (
            <FormGroup
                label={label}
                {...props}
            >
                {children}
            </FormGroup>
        );
    } else {
        return children;
    }
};

export const DialogTextInput = ({
    label = null,
    value,
    excuse = null,
    isDisabled = false,
    ...props
} : {
    label?: React.ReactNode,
    value: DialogValue<string>,
    excuse?: null | string,
    isDisabled?: boolean,
} & Omit<TextInputProps, "id" | "label" | "value" | "onChange">) => {
    return (
        <OptionalFormGroup label={label} fieldId={value.id()}>
            <TextInput
                id={value.id()}
                value={value.get()}
                onChange={(_event, val) => value.set(val)}
                isDisabled={!!excuse || isDisabled}
                {...props}
            />
            <DialogHelperText explanation={excuse} value={value} />
        </OptionalFormGroup>
    );
};

export const DialogCheckbox = ({
    field_label = null,
    checkbox_label,
    value,
} : {
    field_label?: React.ReactNode,
    checkbox_label: string,
    value: DialogValue<boolean>,
}) => {
    return (
        <OptionalFormGroup label={field_label} hasNoPaddingTop>
            <Checkbox
                id={value.id()}
                isChecked={value.get()}
                label={checkbox_label}
                onChange={(_event, checked) => value.set(checked)}
            />
            <DialogHelperText value={value} />
        </OptionalFormGroup>
    );
};

export function DialogFormSelect<T>({
    label = null,
    value,
    children,
    ...props
} : {
    label?: React.ReactNode,
    value: DialogValue<T>,
    children: React.ReactNode,
} & Omit<FormSelectProps, "children" | "label" | "ref">) {
    return (
        <OptionalFormGroup label={label}>
            <FormSelect
                id={value.id()}
                onChange={(_event, val) => value.set(val)}
                value={value.get()}
                {...props}
            >
                {children}
            </FormSelect>
            <DialogHelperText value={value} />
        </OptionalFormGroup>
    );
}

export interface DialogRadioSelectOption<T extends string> {
    value: T,
    label: React.ReactNode,
    explanation?: React.ReactNode,
    excuse?: undefined | null | string,
}

export function DialogRadioSelect<T extends string>({
    label = null,
    value,
    options,
    explanation = null,
    isInline = false,
} : {
    label?: React.ReactNode,
    value: DialogValue<T>,
    options: DialogRadioSelectOption<T>[],
    explanation?: React.ReactNode,
    isInline?: boolean,
}) {
    function makeLabel(o: DialogRadioSelectOption<T>, i: number) {
        const exc = o.excuse ? <> ({o.excuse})</> : null;
        const pad = (i < options.length - 1) ? <><br />{"\u00A0"}</> : null;
        const exp = o.explanation ? <><br /><small>{o.explanation}{pad}</small></> : null;
        return <>{o.label}{exc}{exp}</>;
    }

    return (
        <OptionalFormGroup
            label={label}
            hasNoPaddingTop
            isInline={isInline}
            id={value.id()}
            data-value={value.get()}
        >
            {
                options.map((o, i) =>
                    <Radio
                        key={o.value}
                        id={value.id(o.value)}
                        name={o.value}
                        isChecked={value.get() == o.value}
                        label={makeLabel(o, i)}
                        onChange={() => value.set(o.value)}
                        isDisabled={!!o.excuse}
                    />
                )
            }
            <DialogHelperText explanation={explanation} value={value} />
        </OptionalFormGroup>
    );
}
