/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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
import PropTypes from 'prop-types';

import cockpit from 'cockpit';
import {
    startLibvirt,
    enableLibvirt,
} from "../libvirt-common.js";

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { Button, Checkbox } from "@patternfly/react-core";
import { ExclamationCircleIcon } from "@patternfly/react-icons";
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';

const _ = cockpit.gettext;

const LibvirtSlate = ({ loadingResources, libvirtService }) => {
    const [actionInProgress, setActionInProgress] = useState(false);
    const [error, setError] = useState();
    const [errorDetail, setErrorDetail] = useState();
    const [libvirtEnabled, setLibvirtEnabled] = useState(true);

    const startService = () => {
        setActionInProgress(true);

        enableLibvirt({
            enable: libvirtEnabled,
            serviceName: libvirtService.unit.Id
        })
                .then(() => {
                    startLibvirt({
                        serviceName: libvirtService.unit.Id
                    }).catch(ex => { setError(_("Failed to start virtualization service")); setErrorDetail(ex.message) });
                }, ex => { setError(_("Failed to enable virtualization service")); setErrorDetail(ex.message) })
                .always(() => setActionInProgress(false));
    };

    const goToServicePage = () => {
        const name = libvirtService.unit.Id ? libvirtService.unit.Id : 'libvirtd.service'; // fallback
        cockpit.jump("/system/services#/" + name);
    };

    if (libvirtService.state === null)
        return <EmptyStatePanel title={ _("Connecting to virtualization service") } loading />;

    const name = libvirtService.unit.Id;

    if (loadingResources)
        return <EmptyStatePanel title={ _("Loading resources") } loading />;

    const detail = (
        <Checkbox id="enable-libvirt"
                  isDisabled={!name}
                  isChecked={libvirtEnabled}
                  label={_("Automatically start libvirt on boot")}
                  onChange={setLibvirtEnabled} />
    );

    const troubleshoot_btn = (
        <Button variant="link" onClick={ goToServicePage }>
            { _("Troubleshoot") }
        </Button>);

    return (
        <>
            {error
                ? <InlineNotification type='danger' text={error}
                                      detail={errorDetail}
                                      onDismiss={() => setError(undefined)} /> : null}
            <EmptyStatePanel icon={ ExclamationCircleIcon }
                             title={ _("Virtualization service (libvirt) is not active") }
                             paragraph={ detail }
                             action={ name ? _("Start libvirt") : null }
                             isActionInProgress={actionInProgress}
                             onAction={ startService }
                             secondary={ troubleshoot_btn } />
        </>
    );
};

LibvirtSlate.propTypes = {
    libvirtService: PropTypes.object.isRequired,
    loadingResources: PropTypes.bool.isRequired,
};

export default LibvirtSlate;
