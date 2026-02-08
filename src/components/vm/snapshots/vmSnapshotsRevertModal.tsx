/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2020 Red Hat, Inc.
 */

import React from 'react';

import type { VM, VMSnapshot } from '../../../types';
import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack";

import cockpit from 'cockpit';
import { DialogsContext } from 'dialogs.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { snapshotRevert } from '../../../libvirtApi/snapshot.js';
import { domainGet } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

interface RevertSnapshotModalProps {
    idPrefix: string,
    vm: VM,
    snap: VMSnapshot,
}

interface RevertSnapshotModalState {
    dialogError: string | undefined,
    dialogErrorDetail?: string,
    inProgress: boolean,
    inProgressForce: boolean,
    defaultRevertFailed: boolean,
}

export class RevertSnapshotModal extends React.Component<RevertSnapshotModalProps, RevertSnapshotModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: RevertSnapshotModalProps) {
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

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, snap } = this.props;

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-snapshot-${snap.name}-modal`} isOpen onClose={Dialogs.close}>
                <ModalHeader title={cockpit.format(_("Revert to snapshot $0"), snap.name)} />
                <ModalBody>
                    <Stack hasGutter>
                        {this.state.dialogError &&
                            <ModalError
                                dialogError={this.state.dialogError}
                                {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                            />
                        }
                        <StackItem>{ cockpit.format(_("Reverting to this snapshot will take the VM back to the time of the snapshot and the current state will be lost, along with any data not captured in a snapshot")) }</StackItem>
                    </Stack>
                </ModalBody>
                <ModalFooter>
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
                </ModalFooter>
            </Modal>
        );
    }
}
