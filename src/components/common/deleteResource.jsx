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
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { DropdownItem } from "@patternfly/react-core/dist/esm/deprecated/components/Dropdown";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import cockpit from 'cockpit';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs, DialogsContext } from 'dialogs.jsx';

const _ = cockpit.gettext;

export class DeleteResourceModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            inProgress: false,
        };

        this.delete = this.delete.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    delete(deleteHandler) {
        const Dialogs = this.context;
        this.setState({ inProgress: true });
        deleteHandler()
                .then(Dialogs.close, exc => {
                    this.setState({ inProgress: false });
                    this.dialogErrorSet(this.props.errorMessage, exc.message);
                });
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    render() {
        const Dialogs = this.context;
        const { title, objectDescription, actionName, actionDescription, actionNameSecondary } = this.props;

        return (
            <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
                   id="delete-resource-modal"
                   title={title}
                   titleIconVariant="warning"
                   footer={
                       <>
                           <Button variant='danger'
                               id="delete-resource-modal-primary"
                               isLoading={this.state.inProgress}
                               isDisabled={this.state.inProgress}
                               onClick={() => this.delete(this.props.deleteHandler)}>
                               {actionName || _("Delete")}
                           </Button>
                           {actionNameSecondary &&
                           <Button variant='secondary'
                               id="delete-resource-modal-secondary"
                               isLoading={this.state.inProgress}
                               isDisabled={this.state.inProgress}
                               onClick={() => this.delete(this.props.deleteHandlerSecondary)}
                               isDanger>
                               {actionNameSecondary}
                           </Button>}
                           <Button variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                <DescriptionList className={this.state.dialogError && "pf-v5-u-pt-md"} isHorizontal>
                    {actionDescription || cockpit.format(_("Confirm this action"))}
                    {objectDescription && objectDescription.flatMap(row => row.value
                        ? <DescriptionListGroup id={`delete-resource-modal-${row.name.toLowerCase().replace(/ /g, "-")}`} key={row.name}>
                            <DescriptionListTerm>{row.name}</DescriptionListTerm>
                            <DescriptionListDescription>{row.value}</DescriptionListDescription>
                        </DescriptionListGroup>
                        : [])}
                </DescriptionList>
            </Modal>
        );
    }
}

DeleteResourceModal.propTypes = {
    title: PropTypes.string.isRequired,
    errorMessage: PropTypes.string.isRequired,
    objectDescription: PropTypes.array,
    deleteHandler: PropTypes.func.isRequired
};

export const DeleteResourceButton = ({ objectId, disabled, overlayText, actionName, dialogProps, isLink, isInline, isSecondary, className, isDropdownItem }) => {
    const Dialogs = useDialogs();

    let variant = "danger";
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
DeleteResourceButton.propTypes = {
    objectId: PropTypes.string.isRequired,
    disabled: PropTypes.bool,
    overlayText: PropTypes.string,
    actionName: PropTypes.string,
    dialogProps: PropTypes.object.isRequired,
};
