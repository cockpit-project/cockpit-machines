/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
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
import cockpit from 'cockpit';
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
// import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { DialogsContext } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { VideoTypeRow } from './videoBody.jsx';
import { domainAttachVideo, domainGet } from '../../../libvirtApi/domain.js';

import './video.css';

const _ = cockpit.gettext;

export class AddVIDEO extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            videoType: "vnc",
            password: "",
            permanent: false,
            addVideoInProgress: false,
        };
        this.add = this.add.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
    }

    onValueChanged(key, value) {
        const stateDelta = { [key]: value };

        this.setState(stateDelta);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    add() {
        const Dialogs = this.context;
        const { vm } = this.props;

        this.setState({ addVideoInProgress: true });
        const videoParams = {
            connectionName: vm.connectionName,
            vmName: vm.name,
            videoType: this.state.videoType,
            permanent: this.state.permanent,
            password: this.state.password || "",
        };

        domainAttachVideo(videoParams)
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch(exc => this.dialogErrorSet(_("Video device settings could not be saved"), exc.message))
                .finally(() => this.setState({ addVideoInProgress: false }));
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm } = this.props;

        const defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <VideoTypeRow idPrefix={idPrefix}
                                 dialogValues={this.state}
                                 onValueChanged={this.onValueChanged}
                                 osTypeArch={vm.arch}
                                 osTypeMachine={vm.emulatedMachine} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-dialog`} isOpen onClose={Dialogs.close} className='video-add'
                title={_("Add virtual video device")}
                footer={
                    <>
                        <Button isLoading={this.state.addVideoInProgress}
                                isDisabled={false}
                                id={`${idPrefix}-add`}
                                variant='primary'
                                onClick={this.add}>
                            {_("Add")}
                        </Button>
                        <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                            {_("Cancel")}
                        </Button>
                    </>
                }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                {defaultBody}
            </Modal>
        );
    }
}

AddVIDEO.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
};

export default AddVIDEO;
