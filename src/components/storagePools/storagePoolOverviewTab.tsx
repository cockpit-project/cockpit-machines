/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2018 Red Hat, Inc.
 */
import React, { useEffect, useState } from 'react';

import type { StoragePool } from '../../types';

import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";

import { storagePoolId } from '../../helpers.js';
import { getInstallMediaPools, setInstallMediaPool } from '../../libvirtApi/installMediaPools.js';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

// Pool types whose target is a plain host directory that can hold ISO images.
const INSTALL_MEDIA_POOL_TYPES = ['dir', 'netfs'];

const InstallMediaSwitch = ({ storagePool, idPrefix } : { storagePool: StoragePool, idPrefix: string }) => {
    // null while the on-disk config is still loading, so the Switch stays disabled
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const { connectionName, uuid } = storagePool;

    useEffect(() => {
        let active = true;
        getInstallMediaPools(connectionName).then(pools => {
            if (active)
                setEnabled(!!uuid && pools.includes(uuid));
        });
        return () => { active = false };
    }, [connectionName, uuid]);

    const onChange = (_event: React.FormEvent, checked: boolean) => {
        if (!uuid)
            return;
        // optimistic update; revert if the write fails
        setEnabled(checked);
        setInstallMediaPool(connectionName, uuid, checked).catch(ex => {
            console.warn("Could not update installation-media pool config:", String(ex));
            setEnabled(!checked);
        });
    };

    return (
        <Switch id={`${idPrefix}-install-media-switch`}
                label={_("Use for installation media")}
                isChecked={!!enabled}
                isDisabled={enabled === null || !uuid}
                onChange={onChange} />
    );
};

export const StoragePoolOverviewTab = ({ storagePool } : { storagePool: StoragePool }) => {
    const idPrefix = `${storagePoolId(storagePool.name, storagePool.connectionName)}`;

    return (
        <DescriptionList isHorizontal>
            { storagePool.source && storagePool.source.host && <DescriptionListGroup>
                <DescriptionListTerm> {_("Host")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-host`}>
                    {storagePool.source.host.name}
                </DescriptionListDescription>
            </DescriptionListGroup> }

            { storagePool.source && storagePool.source.device && <DescriptionListGroup>
                <DescriptionListTerm> {_("Source path")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-source-path`}> {storagePool.source.device.path} </DescriptionListDescription>
            </DescriptionListGroup> }

            { storagePool.source && storagePool.source.dir && <DescriptionListGroup>
                <DescriptionListTerm> {_("Source path")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-source-path`}> {storagePool.source.dir.path} </DescriptionListDescription>
            </DescriptionListGroup> }

            { storagePool.source && storagePool.source.name && <DescriptionListGroup>
                <DescriptionListTerm> {_("Source")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-source-path`}> {storagePool.source.name} </DescriptionListDescription>
            </DescriptionListGroup> }

            { storagePool.source && storagePool.source.format && <DescriptionListGroup>
                <DescriptionListTerm> {_("Source format")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-source-format`}> {storagePool.source.format.type} </DescriptionListDescription>
            </DescriptionListGroup> }

            { storagePool.target && storagePool.target.path && <DescriptionListGroup>
                <DescriptionListTerm> {_("Target path")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-target-path`}> {storagePool.target.path} </DescriptionListDescription>
            </DescriptionListGroup> }

            <DescriptionListGroup>
                <DescriptionListTerm> {_("Persistent")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-persistent`}> {storagePool.persistent ? _("yes") : _("no")} </DescriptionListDescription>
            </DescriptionListGroup>

            {storagePool.persistent && <DescriptionListGroup>
                <DescriptionListTerm> {_("Autostart")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-autostart`}> {storagePool.autostart ? _("yes") : _("no")} </DescriptionListDescription>
            </DescriptionListGroup>}

            <DescriptionListGroup>
                <DescriptionListTerm> {_("Type")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-type`}> {storagePool.type} </DescriptionListDescription>
            </DescriptionListGroup>

            {INSTALL_MEDIA_POOL_TYPES.includes(storagePool.type) && storagePool.uuid && <DescriptionListGroup>
                <DescriptionListTerm> {_("Installation media")} </DescriptionListTerm>
                <DescriptionListDescription>
                    <InstallMediaSwitch storagePool={storagePool} idPrefix={idPrefix} />
                </DescriptionListDescription>
            </DescriptionListGroup>}
        </DescriptionList>
    );
};
