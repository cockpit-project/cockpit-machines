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
import { Form } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { VideoTypeAndSourceRow, VideoTypeRow } from './videoBody.jsx';
import { domainChangeVideoSettings, domainGet } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export class EditVIDEOModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dialogError: undefined,
            videoType: props.video.type,
            saveDisabled: false,
            videoPassword: props.video.password || "",
        };

        this.save = this.save.bind(this);
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

    save() {
        const Dialogs = this.context;
        const { vm, video } = this.props;

        const videoParams = {
            vmName: vm.name,
            connectionName: vm.connectionName,
            persistent: vm.persistent,
            videoType: this.state.videoType,
            password: this.state.videoPassword || "",
            hotplug: vm.state === "running",
        };

        domainChangeVideoSettings(videoParams)
                .then(() => {
                    domainGet({ connectionName: vm.connectionName, id: vm.id });
                    Dialogs.close();
                })
                .catch((exc) => {
                    this.dialogErrorSet(_("Video device settings could not be saved"), exc.message);
                });
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, vm, video, availableSources } = this.props;

        const defaultBody = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <VideoTypeRow idPrefix={idPrefix}
                                 dialogValues={this.state}
                                 onValueChanged={this.onValueChanged}
                                 osTypeArch={vm.arch}
                                 osTypeMachine={vm.emulatedMachine} />
            </Form>
        );
        const showWarning = () => {
        };

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal-window`} isOpen onClose={Dialogs.close} className='video-edit'
                   title={cockpit.format(_("$0 virtual video device settings"), video)}
                   footer={
                       <>
                           <Button isDisabled={this.state.saveDisabled} id={`${idPrefix}-save`} variant='primary' onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button id={`${idPrefix}-cancel`} variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <>
                    { showWarning() }
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    {defaultBody}
                </>
            </Modal>
        );
    }
}
EditVIDEOModal.propTypes = {
    availableSources: PropTypes.object.isRequired,
    idPrefix: PropTypes.string.isRequired,
    vm: PropTypes.object.isRequired,
};
