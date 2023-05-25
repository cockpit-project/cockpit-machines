/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2022 Red Hat, Inc.
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

import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";

import { domainEjectDisk, domainGet } from '../../../libvirtApi/domain.js';
import cockpit from 'cockpit';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { useDialogs } from 'dialogs.jsx';

const _ = cockpit.gettext;

export const MediaEjectModal = ({ idPrefix, vm, disk }) => {
    const [dialogErrorDetail, setDialogErrorDetail] = useState(undefined);
    const [inProgress, setInProgress] = useState(false);
    const [inProgressForce, setInProgressForce] = useState(false);
    const [defaultEjectionFailed, setDefaultEjectionFailed] = useState(false);

    const Dialogs = useDialogs();

    const onDelete = () => {
        const params = {
            connectionName: vm.connectionName,
            id: vm.id,
            target: disk.target,
            eject: true,
            live: vm.state === 'running',
            persistent: vm.persistent,
            force: defaultEjectionFailed
        };
        if (disk.type === "file") {
            params.file = disk.source.file;
        } else if (disk.type === "volume") {
            params.pool = disk.source.pool;
            params.volume = disk.source.volume;
        } else {
            setDialogErrorDetail(`Disk ejection is not supported for ${disk.type} disks`);
            return;
        }

        if (!defaultEjectionFailed) {
            setInProgress(true);
        } else {
            setInProgressForce(true);
            setDialogErrorDetail(undefined);
        }

        return domainEjectDisk(params)
                .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }))
                .then(Dialogs.close)
                .catch(exc => {
                    setInProgress(false);
                    setInProgressForce(false);
                    setDefaultEjectionFailed(true);
                    setDialogErrorDetail(exc.message);
                });
    };

    let description;
    if (disk.type === "file") {
        description = <DescriptionListDescription id={`${idPrefix}-modal-description-file`} className="ct-monospace">{disk.source.file}</DescriptionListDescription>;
    } else if (disk.type === "volume") {
        description = (
            <>
                <DescriptionListGroup id={`${idPrefix}-modal-description-pool`} key={disk.source.pool}>
                    <DescriptionListTerm>{_("Pool")}</DescriptionListTerm>
                    <DescriptionListDescription>{disk.source.pool}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup id={`${idPrefix}-modal-description-volume`} key={disk.source.volume}>
                    <DescriptionListTerm>{_("Volume")}</DescriptionListTerm>
                    <DescriptionListDescription>{disk.source.volume}</DescriptionListDescription>
                </DescriptionListGroup>
            </>
        );
    }

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
               id={idPrefix + "-modal"}
               title={_("Eject disc from VM?")}
               footer={
                   <>
                       <Button variant='primary' isLoading={inProgress} isDisabled={inProgress || defaultEjectionFailed} onClick={onDelete}>
                           { _("Eject")}
                       </Button>
                       { defaultEjectionFailed &&
                       <Button variant='danger' isLoading={inProgressForce} isDisabled={inProgress} onClick={onDelete}>
                           { _("Force eject")}
                       </Button>}
                       <Button variant='link' onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }>
            {dialogErrorDetail && <ModalError dialogError={cockpit.format(_("Media could not be ejected from $0"), vm.name)} dialogErrorDetail={dialogErrorDetail} />}
            <DescriptionList className={dialogErrorDetail && "pf-v5-u-pt-md"} isHorizontal>
                {cockpit.format(_("Media will be ejected from $0:"), vm.name)}
                {description}
            </DescriptionList>
        </Modal>
    );
};
