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
import React from 'react';
import PropTypes from 'prop-types';

import cockpit from 'cockpit';

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { ExclamationCircleIcon } from "@patternfly/react-icons";

const _ = cockpit.gettext;

const LibvirtSlate = ({ loadingResources }) => {
    if (loadingResources)
        return <EmptyStatePanel title={ _("Loading resources") } loading />;

    return (
        <EmptyStatePanel icon={ ExclamationCircleIcon }
                         title={ _("Virtualization service (libvirt) is not active") }
                         action={_("Troubleshoot")}
                         actionVariant="link"
                         onAction={() => cockpit.jump("/system/services")} />
    );
};

LibvirtSlate.propTypes = {
    loadingResources: PropTypes.bool.isRequired,
};

export default LibvirtSlate;
