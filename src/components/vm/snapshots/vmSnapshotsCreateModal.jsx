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
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { dirname } from "cockpit-path";
import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { DialogsContext } from 'dialogs.jsx';
import { ModalError } from "cockpit-components-inline-notification.jsx";
import { FileAutoComplete } from "cockpit-components-file-autocomplete.jsx";

import { snapshotCreate, snapshotGetAll } from "../../../libvirtApi/snapshot.js";
import { getSortedBootOrderDevices, LIBVIRT_SYSTEM_CONNECTION } from "../../../helpers.js";
import { domainGet } from '../../../libvirtApi/domain.js';

import get_available_space_sh from "./get-available-space.sh";

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

function getDefaultMemoryLocation(vm) {
    // If we find an existing external snapshot, use it's memory path
    // as the default. Otherwise, try to find the primary disk and use
    // it's location. If that fails as well, use a reasonable hard
    // coded value.

    for (const s of vm.snapshots.sort((a, b) => b.creationTime - a.creationTime)) {
        if (s.memoryPath)
            return dirname(s.memoryPath);
    }

    const devices = getSortedBootOrderDevices(vm).filter(d => d.bootOrder &&
                                                              d.device.device === "disk" &&
                                                              d.device.type === "file" &&
                                                              d.device.source.file);
    if (devices.length > 0) {
        return dirname(devices[0].device.source.file);
    } else {
        if (vm.connectionName === LIBVIRT_SYSTEM_CONNECTION)
            return "/var/lib/libvirt/memory";
        else if (current_user)
            return current_user.home + "/.local/share/libvirt/memory";
    }

    return "";
}

const MemoryLocationRow = ({ onValueChanged, memoryLocation, validationError, available, needed }) => {
    let info = "";
    let info_variant = "default";

    if (needed) {
        info = cockpit.format(_("Memory snapshot will use about $0."),
                              cockpit.format_bytes(needed));
    }
    if (available) {
        info = info + " " + cockpit.format(_("Total space available: $0."), cockpit.format_bytes(available));
        if (needed && available * 0.9 < needed)
            info_variant = "warning";
    }

    return (
        <FormGroup id="snapshot-create-dialog-memory-location" label={_("Memory state path")}>
            <FileAutoComplete
                onChange={value => onValueChanged("memoryLocation", value)}
                value={memoryLocation}
                isOptionCreatable
                onlyDirectories
                placeholder={_("Path to directory")}
                superuser="try" />
            <FormHelper helperTextInvalid={validationError}
                        helperText={info}
                        variant={validationError ? "error" : info_variant} />
        </FormGroup>
    );
};

function get_available_space(path, superuser, callback) {
    if (!path)
        callback(null);

    cockpit.script(get_available_space_sh, [path], { superuser })
            .then(output => {
                const info = JSON.parse(output);
                callback(info.free * info.unit);
            })
            .catch(exc => {
                // channel has already logged the error
                callback(null);
            });
}

export class CreateSnapshotModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        // cut off seconds, subseconds, and timezone
        const now = new Date().toISOString()
                .replace(/:[^:]*$/, '');
        const snapName = now;
        this.state = {
            name: snapName,
            description: "",
            memoryLocation: getDefaultMemoryLocation(props.vm),
            available: null,
            inProgress: false,
        };

        this.onValueChanged = this.onValueChanged.bind(this);
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.onValidate = this.onValidate.bind(this);
        this.onCreate = this.onCreate.bind(this);
    }

    updateAvailableSpace(path) {
        get_available_space(path, this.props.vm.connectionName === LIBVIRT_SYSTEM_CONNECTION,
                            val => this.setState({ available: val }));
    }

    onValueChanged(key, value) {
        this.setState({ [key]: value });
        if (key == "memoryLocation") {
            // We don't need to debounce this.  The "memoryLocation"
            // state is not changed on each keypress, but only when
            // the input is blurred.
            this.updateAvailableSpace(value);
        }
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    onValidate() {
        const { name, memoryLocation } = this.state;
        const { vm, isExternal } = this.props;
        const validationError = {};

        if (vm.snapshots.findIndex(snap => snap.name === name) > -1)
            validationError.name = _("Name already exists");
        else if (!name)
            validationError.name = _("Name can not be empty");

        if (isExternal && vm.state === "running" && !memoryLocation)
            validationError.memory = _("Memory save location can not be empty");

        return validationError;
    }

    onCreate() {
        const Dialogs = this.context;
        const { vm, isExternal } = this.props;
        const { name, description, memoryLocation } = this.state;
        const validationError = this.onValidate();

        if (!Object.keys(validationError).length) {
            this.setState({ inProgress: true });
            let mpath = null;
            if (isExternal && vm.state === "running" && memoryLocation) {
                mpath = memoryLocation;
                if (!mpath.endsWith("/"))
                    mpath = mpath + "/";
                mpath = mpath + vm.name + "." + name + ".save";
            }
            const superuser = (vm.connectionName === LIBVIRT_SYSTEM_CONNECTION) ? "require" : false;
            cockpit.spawn(["mkdir", "-p", memoryLocation], { superuser, err: "message" })
                    .then(() =>
                        snapshotCreate({
                            vm,
                            name,
                            description,
                            isExternal,
                            memoryPath: mpath,
                        }))
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

    componentDidMount() {
        this.updateAvailableSpace(this.state.memoryLocation);
    }

    estimateMemorySnapshotSize(vm) {
        /* According to experiments, the memory snapshot is smaller
           than the amount of RAM used by the virtual machine.

           RSS       File
           ----------------
           254 MB    145 MB
           636 MB    492 MB
           1.57 GB   1.4 GB
        */
        return (vm.rssMemory || vm.currentMemory) * 1024;
    }

    render() {
        const Dialogs = this.context;
        const { idPrefix, isExternal, vm } = this.props;
        const { name, description, memoryLocation, available } = this.state;
        const validationError = this.onValidate();

        const body = (
            <Form onSubmit={e => e.preventDefault()}>
                <NameRow name={name} validationError={validationError.name} onValueChanged={this.onValueChanged} />
                <DescriptionRow description={description} onValueChanged={this.onValueChanged} />
                {isExternal && vm.state === 'running' &&
                    <MemoryLocationRow memoryLocation={memoryLocation} onValueChanged={this.onValueChanged}
                                       validationError={validationError.memory}
                                       available={available}
                                       needed={this.estimateMemorySnapshotSize(vm)} />}
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
