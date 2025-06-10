/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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

import { Button, ButtonProps } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { DropdownItem } from "@patternfly/react-core/dist/esm/components/Dropdown";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import cockpit from 'cockpit';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs, DialogsContext, Dialogs } from 'dialogs.jsx';

const _ = cockpit.gettext;

export interface DeleteResourceModalProps {
    title: string;
    errorMessage: string;
    objectDescription?: { name: string, value: React.ReactNode }[];
    actionName?: string;
    actionNameSecondary?: string;
    actionDescription: string;
    deleteHandler: () => Promise<void>;
    deleteHandlerSecondary?: () => Promise<void>;
}

interface DeleteResourceModalState {
    dialogError: string | undefined;
    dialogErrorDetail?: string;
    inProgress: boolean;
}

export class DeleteResourceModal extends React.Component<DeleteResourceModalProps, DeleteResourceModalState> {
    static contextType = DialogsContext;
    context!: Dialogs;

    constructor(props: DeleteResourceModalProps) {
        super(props);

        this.state = {
            dialogError: undefined,
            inProgress: false,
        };

        this.delete = this.delete.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    delete(deleteHandler: () => Promise<void>): void {
        const Dialogs = this.context;
        this.setState({ inProgress: true });
        deleteHandler()
                .then(Dialogs.close, exc => {
                    this.setState({ inProgress: false });
                    this.dialogErrorSet(this.props.errorMessage, exc.message);
                });
    }

    dialogErrorSet(text: string, detail: string): void {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    render() {
        const Dialogs = this.context;
        const {
            title, objectDescription, actionName, actionDescription,
            actionNameSecondary, deleteHandlerSecondary
        } = this.props;

        return (
            <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
                   id="delete-resource-modal">
                <ModalHeader title={title} titleIconVariant="warning" />
                <ModalBody>
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    <DescriptionList className={this.state.dialogError ? "pf-v6-u-pt-md" : ""} isHorizontal>
                        {actionDescription || cockpit.format(_("Confirm this action"))}
                        {objectDescription && objectDescription.flatMap(row => row.value
                            ? <DescriptionListGroup id={`delete-resource-modal-${row.name.toLowerCase().replace(/ /g, "-")}`} key={row.name}>
                                <DescriptionListTerm>{row.name}</DescriptionListTerm>
                                <DescriptionListDescription>{row.value}</DescriptionListDescription>
                            </DescriptionListGroup>
                            : [])}
                    </DescriptionList>
                </ModalBody>
                <ModalFooter>
                    <Button variant='danger'
                        id="delete-resource-modal-primary"
                        isLoading={this.state.inProgress}
                        isDisabled={this.state.inProgress}
                        onClick={() => this.delete(this.props.deleteHandler)}>
                        {actionName || _("Delete")}
                    </Button>
                    {actionNameSecondary && deleteHandlerSecondary &&
                    <Button variant='secondary'
                        id="delete-resource-modal-secondary"
                        isLoading={this.state.inProgress}
                        isDisabled={this.state.inProgress}
                        onClick={() => this.delete(deleteHandlerSecondary)}
                        isDanger>
                        {actionNameSecondary}
                    </Button>}
                    <Button variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}

interface DeleteResourceButtonProps {
    objectId: string,
    disabled?: boolean,
    overlayText?: string,
    actionName: string,
    dialogProps: DeleteResourceModalProps,
    isLink?: boolean,
    isInline?: boolean,
    isSecondary?: boolean,
    className?: string,
    isDropdownItem?: boolean,
}

export const DeleteResourceButton = ({
    objectId,
    disabled = false,
    overlayText,
    actionName,
    dialogProps,
    isLink = false,
    isInline = false,
    isSecondary = false,
    className = "",
    isDropdownItem
}: DeleteResourceButtonProps) => {
    const Dialogs = useDialogs();

    let variant: ButtonProps["variant"] = "danger";
    if (isSecondary)
        variant = "secondary";
    if (isLink)
        variant = "link";

    const button = (isDropdownItem
        ? (
            <DropdownItem className={className ? `pf-m-danger ${className}` : "pf-m-danger"}
                          id={`delete-${objectId}`}
                          key={`delete-${objectId}`}
                          isDisabled={disabled}
                          onClick={() => Dialogs.show(<DeleteResourceModal {...dialogProps} />)}>
                {actionName || _("Delete")}
            </DropdownItem>
        )
        : (
            <Button id={`delete-${objectId}`}
                    className={className}
                    variant={variant}
                    isDanger={isLink || isSecondary}
                    isInline={isInline}
                    onClick={() => Dialogs.show(<DeleteResourceModal {...dialogProps} />)}
                    isDisabled={disabled}>
                {actionName || _("Delete")}
            </Button>
        )
    );

    if (disabled) {
        return (
            <Tooltip id={`delete-${objectId}-tooltip`}
                     content={overlayText}>
                <span>{button}</span>
            </Tooltip>
        );
    } else {
        return button;
    }
};
