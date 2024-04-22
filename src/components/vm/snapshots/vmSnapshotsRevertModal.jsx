/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2020 Red Hat, Inc.
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
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack";

import cockpit from 'cockpit';
import { DialogsContext } from 'dialogs.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { snapshotRevert } from '../../../libvirtApi/snapshot.js';
import { domainGet } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export class RevertSnapshotModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            inProgress: false,
            inProgressForce: false,
            defaultRevertFailed: false,
        };

        this.revert = this.revert.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    revert() {
        const Dialogs = this.context;
        const { vm, snap } = this.props;

        if (!this.state.defaultRevertFailed)
            this.setState({ inProgress: true });
        else
            this.setState({ inProgressForce: true, dialogError: undefined });

        snapshotRevert({
            connectionName: vm.connectionName,
            domainPath: vm.id,
            snapshotName: snap.name,
            force: this.state.defaultRevertFailed
        })
                .then(
                    () => {
                        // Reverting an external snapshot might change the disk
                        // configuration of a VM without event.
                        domainGet({ connectionName: vm.connectionName, id: vm.id });
                        Dialogs.close();
                    },
                    exc => {
                        this.setState({
                            defaultRevertFailed: true,
                            inProgress: false,
                            inProgressForce: false
                        });
                        this.dialogErrorSet(_("Could not revert to snapshot"), exc.message);
                    });
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, snap } = this.props;

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-snapshot-${snap.name}-modal`} isOpen onClose={Dialogs.close}
                   title={cockpit.format(_("Revert to snapshot $0"), snap.name)}
                   footer={
                       <>
                           <Button variant='primary'
                                   isLoading={this.state.inProgress}
                                   isDisabled={this.state.inProgress || this.state.defaultRevertFailed}
                                   onClick={this.revert}>
                               {_("Revert")}
                           </Button>
                           { this.state.defaultRevertFailed &&
                           <Button variant='danger'
                                   isLoading={this.state.inProgressForce}
                                   isDisabled={this.state.inProgress || this.state.inProgressForce}
                                   onClick={this.revert}>
                               {_("Force revert")}
                           </Button>}
                           <Button variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <Stack hasGutter>
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    <StackItem>{ cockpit.format(_("Reverting to this snapshot will take the VM back to the time of the snapshot and the current state will be lost, along with any data not captured in a snapshot")) }</StackItem>
                </Stack>
            </Modal>
        );
    }
}

RevertSnapshotModal.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
    snap: PropTypes.object.isRequired,
};
