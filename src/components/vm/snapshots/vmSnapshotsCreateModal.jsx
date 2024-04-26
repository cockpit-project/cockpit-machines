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
import cockpit from "cockpit";
import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { InfoAltIcon } from '@patternfly/react-icons';
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio/index.js";
import { Split } from "@patternfly/react-core/dist/esm/layouts/Split/index.js";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { ModalError } from "cockpit-components-inline-notification.jsx";
import { FileAutoComplete } from "cockpit-components-file-autocomplete.jsx";
import { snapshotCreate, snapshotGetAll } from "../../../libvirtApi/snapshot.js";
import { getSortedBootOrderDevices, LIBVIRT_SYSTEM_CONNECTION } from "../../../helpers.js";
import { domainGet } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

let current_user = null;
cockpit.user().then(user => { current_user = user });

const NameRow = ({ onValueChanged, name, validationError }) => {
    return (
        <FormGroup
            label={_("Name")}
            fieldId="snapshot-create-dialog-name">
            <TextInput value={name}
                validated={validationError ? "error" : "default"}
                id="snapshot-create-dialog-name"
                onChange={(_, value) => onValueChanged("name", value)} />
            <FormHelper helperTextInvalid={validationError} />
        </FormGroup>
    );
};

const TypeRow = ({ onValueChanged, isDiskOnly }) => {
    return (
        <FormGroup id="snapshot-create-dialog-type" hasNoPaddingTop
                   label={_("Type")}
                   labelIcon={
                       <Popover
                           bodyContent={
                               <Flex direction={{ default: 'column' }}>
                                   <FlexItem>
                                       <h4 className="popover-headline">{_("Full system")}</h4>
                                       <p>{_("A full system snapshot can be used to revert the virtual machine to its exact current state where all its processes have the same run-time state as now. It might require significant extra storage to save the memory state.")}</p>
                                   </FlexItem>
                                   <FlexItem>
                                       <h4 className="popover-headline">{_("Disk only")}</h4>
                                       <p>{_("This type of snapshot only saves the storage devices of the virtual machine, and not the state of running processes.")}</p>
                                   </FlexItem>
                               </Flex>}>
                           <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                               <InfoAltIcon />
                           </button>
                       </Popover>}>
            <Split hasGutter>
                <Radio isChecked={!isDiskOnly}
                       id="snapshot-create-dialog-type-full"
                       onChange={() => onValueChanged("isDiskOnly", false)}
                       label={_("Full system")} />
                <Radio isChecked={isDiskOnly}
                       id="snapshot-create-dialog-type-disk-only"
                       onChange={() => onValueChanged("isDiskOnly", true)}
                       label={_("Disk only")} />
            </Split>
        </FormGroup>
    );
};

const DescriptionRow = ({ onValueChanged, description }) => {
    return (
        <FormGroup fieldId="snapshot-create-dialog-description" label={_("Description")}>
            <TextArea value={description}
                id="snapshot-create-dialog-description"
                onChange={(_, value) => onValueChanged("description", value)}
                resizeOrientation="vertical"
            />
        </FormGroup>
    );
};

function getDefaultMemoryPath(vm, snapName) {
    // Choosing a default path where memory snapshot should be stored might be tricky. Ideally we want
    // to store it in the same directory where the primary disk (the disk which is first booted) is stored
    // If howver no such disk can be found, we should fallback to libvirt's default /var/lib/libvirt
    const devices = getSortedBootOrderDevices(vm).filter(d => d.bootOrder &&
                                                              d.device.device === "disk" &&
                                                              d.device.type === "file" &&
                                                              d.device.source.file);
    if (devices.length > 0) {
        const primaryDiskPath = devices[0].device.source.file;
        const directory = primaryDiskPath.substring(0, primaryDiskPath.lastIndexOf("/") + 1);
        return directory + snapName;
    } else {
        if (vm.connectionName === LIBVIRT_SYSTEM_CONNECTION)
            return "/var/lib/libvirt/memory/" + snapName;
        else if (current_user)
            return current_user.home + "/.local/share/libvirt/memory/" + snapName;
    }

    return "";
}

const MemoryPathRow = ({ onValueChanged, memoryPath, validationError }) => {
    return (
        <FormGroup id="snapshot-create-dialog-memory-path" label={_("Memory file")}>
            <FileAutoComplete
                onChange={value => onValueChanged("memoryPath", value)}
                superuser="try"
                isOptionCreatable
                value={memoryPath} />
            <FormHelper helperTextInvalid={validationError} />
        </FormGroup>
    );
};

export class CreateSnapshotModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        // cut off seconds, subseconds, and timezone
        const now = new Date().toISOString()
                .replace(/:[^:]*$/, '');
        const snapName = props.vm.name + '_' + now;
        this.state = {
            name: snapName,
            description: "",
            isDiskOnly: false,
            memoryPath: getDefaultMemoryPath(props.vm, snapName),
            inProgress: false,
        };

        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onValidate = this.onValidate.bind(this);
        this.onCreate = this.onCreate.bind(this);
    }

    onValueChanged(key, value) {
        this.setState({ [key]: value });
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onValidate() {
        const { name, isDiskOnly, memoryPath } = this.state;
        const { vm, isExternal } = this.props;
        const validationError = {};

        if (vm.snapshots.findIndex(snap => snap.name === name) > -1)
            validationError.name = _("Name already exists");
        else if (!name)
            validationError.name = _("Name can not be empty");

        if (isExternal && vm.state === "running" && !isDiskOnly && !memoryPath)
            validationError.memory = _("Memory file can not be empty");

        return validationError;
    }

    onCreate() {
        const Dialogs = this.context;
        const { vm, isExternal } = this.props;
        const { name, description, isDiskOnly, memoryPath } = this.state;
        const validationError = this.onValidate();

        if (!Object.keys(validationError).length) {
            this.setState({ inProgress: true });
            snapshotCreate({
                vm,
                name,
                description,
                isExternal,
                memoryPath: isExternal && vm.state === "running" && !isDiskOnly && memoryPath,
            })
                    .then(() => {
                        // VM Snapshots do not trigger any events so we have to refresh them manually
                        snapshotGetAll({ connectionName: vm.connectionName, domainPath: vm.id });
                        // Creating an external snapshot might change
                        // the disk configuration of a VM without event.
                        domainGet({ connectionName: vm.connectionName, id: vm.id });
                        Dialogs.close();
                    })
                    .catch(exc => {
                        this.setState({ inProgress: false });
                        this.dialogErrorSet(_("Snapshot failed to be created"), exc.message);
                    });
        }
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, isExternal, vm } = this.props;
        const { name, description, isDiskOnly, memoryPath } = this.state;
        const validationError = this.onValidate();

        const body = (
            <Form onSubmit={e => e.preventDefault()} isHorizontal>
                <NameRow name={name} validationError={validationError.name} onValueChanged={this.onValueChanged} />
                {isExternal && vm.state === 'running' &&
                    <TypeRow isDiskOnly={isDiskOnly} onValueChanged={this.onValueChanged} />}
                {isExternal && vm.state === 'running' && !isDiskOnly &&
                    <MemoryPathRow memoryPath={memoryPath} onValueChanged={this.onValueChanged}
                                   validationError={validationError.memory} />}
                <DescriptionRow description={description} onValueChanged={this.onValueChanged} />
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id={`${idPrefix}-modal`} isOpen onClose={Dialogs.close}
                   title={_("Create snapshot")}
                   footer={
                       <>
                           <Button variant="primary" isLoading={this.state.inProgress} onClick={this.onCreate}
                                   isDisabled={this.state.inProgress || Object.keys(validationError).length > 0}>
                               {_("Create")}
                           </Button>
                           <Button variant="link" onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                {body}
            </Modal>
        );
    }
}
