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
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import {
    Modal
} from '@patternfly/react-core/dist/esm/deprecated/components/Modal';
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { useDialogs, DialogsContext } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainAddTPM, domainCanInstall, domainSetOSFirmware } from "../../../libvirtApi/domain.js";
import { supportsUefiXml, labelForFirmwarePath } from './helpers.jsx';

const _ = cockpit.gettext;

const xmlToState = value => value || 'bios';
const stateToXml = value => value == 'bios' ? null : value;

class FirmwareModal extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);
        this.state = {
            dialogError: null,
            firmware: xmlToState(props.vm.firmware),
        };
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.save = this.save.bind(this);
    }

    dialogErrorSet(text, detail) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    async save() {
        const Dialogs = this.context;
        const vm = this.props.vm;
        try {
            await domainSetOSFirmware({
                connectionName: vm.connectionName,
                objPath: vm.id,
                loaderType: stateToXml(this.state.firmware)
            });

            if (this.state.firmware == 'efi' && !vm.hasTPM && vm.capabilities.supportsTPM)
                await domainAddTPM({ connectionName: vm.connectionName, vmName: vm.name });

            Dialogs.close();
        } catch (exc) {
            this.dialogErrorSet(_("Failed to change firmware"), exc.message);
        }
    }

    render() {
        const Dialogs = this.context;
        return (
            <Modal position="top" variant="medium" isOpen onClose={Dialogs.close}
                   title={_("Change firmware")}
                   footer={
                       <>
                           <Button variant='primary' id="firmware-dialog-apply" onClick={this.save}>
                               {_("Save")}
                           </Button>
                           <Button variant='link' onClick={Dialogs.close}>
                               {_("Cancel")}
                           </Button>
                       </>
                   }>
                <Form isHorizontal>
                    {this.state.dialogError && <ModalError dialogError={this.state.dialogError} dialogErrorDetail={this.state.dialogErrorDetail} />}
                    <FormGroup label={_("Firmware")} fieldId="firmware-dialog-select">
                        <FormSelect onChange={(_event, value) => this.setState({ firmware: value })}
                                    id='firmware-dialog-select'
                                    value={this.state.firmware }>
                            <FormSelectOption value='bios' key='bios'
                                              label='BIOS' />
                            <FormSelectOption value='efi' key='efi'
                                              label='UEFI' />
                        </FormSelect>
                    </FormGroup>
                </Form>
            </Modal>
        );
    }
}

FirmwareModal.propTypes = {
    vm: PropTypes.object.isRequired,
};

export const FirmwareLink = ({ vm, loaderElems, idPrefix }) => {
    const Dialogs = useDialogs();

    function getOVMFBinariesOnHost(loaderElems) {
        return Array.prototype.map.call(loaderElems, loader => {
            const valueElem = loader.getElementsByTagName('value');

            if (valueElem && valueElem[0].parentNode == loader)
                return valueElem[0].textContent;
        });
    }

    let firmwareLinkWrapper;
    const hasInstallPhase = vm.metadata && vm.metadata.hasInstallPhase;
    const sourceType = vm.metadata && vm.metadata.installSourceType;
    const labelForFirmware = labelForFirmwarePath(vm.loader, vm.arch);
    let currentFirmware;

    if (vm.firmware == "efi" || labelForFirmware == "efi")
        currentFirmware = "UEFI";
    else if (labelForFirmware == "custom")
        currentFirmware = cockpit.format(_("Custom firmware: $0"), vm.loader);
    else if (labelForFirmware == "unknown")
        currentFirmware = _("Unknown firmware");
    else
        currentFirmware = "BIOS";

    /* If the VM hasn't an install phase and the VM was not imported then don't show a link, just the text */
    if (!domainCanInstall(vm.state, hasInstallPhase) && sourceType !== "disk_image") {
        firmwareLinkWrapper = <div id={`${idPrefix}-firmware`}>{currentFirmware}</div>;
    } else {
        const uefiPaths = getOVMFBinariesOnHost(loaderElems).filter(elem => elem !== undefined);
        const firmwareLink = disabled => {
            return (
                <span id={`${idPrefix}-firmware-tooltip`}>
                    <Button variant="link" isInline id={`${idPrefix}-firmware`} isDisabled={disabled}
                            onClick={() => Dialogs.show(<FirmwareModal vm={vm} />)}>
                        {currentFirmware}
                    </Button>
                </span>
            );
        };

        if (vm.state != "shut off") {
            if (vm.persistent) {
                firmwareLinkWrapper = (
                    <Tooltip id='firmware-edit-disabled-on-running' content={_("Shut off the VM in order to edit firmware configuration")}>
                        {firmwareLink(true)}
                    </Tooltip>
                );
            } else {
                firmwareLinkWrapper = (
                    <Tooltip id='firmware-edit-disabled-on-transient' content={_("Transient VMs don't support editing firmware configuration")}>
                        {firmwareLink(true)}
                    </Tooltip>
                );
            }
        } else if (!supportsUefiXml(loaderElems[0])) {
            firmwareLinkWrapper = (
                <Tooltip id='missing-uefi-support' content={_("Libvirt or hypervisor does not support UEFI")}>
                    {firmwareLink(true)}
                </Tooltip>
            );
        } else if (uefiPaths.length == 0) {
            firmwareLinkWrapper = (
                <Tooltip id='missing-uefi-images' content={_("Libvirt did not detect any UEFI/OVMF firmware image installed on the host")}>
                    {firmwareLink(true)}
                </Tooltip>
            );
        } else {
            firmwareLinkWrapper = firmwareLink(false);
        }
    }

    return firmwareLinkWrapper;
};
