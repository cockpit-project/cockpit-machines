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
import {
    checkLibvirtStatus,
    startLibvirt,
    enableLibvirt,
} from "../libvirt-common.js";

import { EmptyStatePanel } from "cockpit-components-empty-state.jsx";
import { Button, Checkbox } from "@patternfly/react-core";
import { ExclamationCircleIcon } from "@patternfly/react-icons";
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';

const _ = cockpit.gettext;

class LibvirtSlate extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            libvirtEnabled: true,
        };

        this.startService = this.startService.bind(this);
        this.checkStatus = this.checkStatus.bind(this);
        this.goToServicePage = this.goToServicePage.bind(this);
    }

    checkStatus() {
        const service = this.props.libvirtService;

        checkLibvirtStatus({ serviceName: service.name });
    }

    startService() {
        this.setState({ actionInProgress: true });
        const service = this.props.libvirtService;

        enableLibvirt({
            enable: this.state.libvirtEnabled,
            serviceName: service.name
        })
                .then(() => {
                    startLibvirt({
                        serviceName: service.name
                    }).catch(ex => this.setState({ error: _("Failed to start virtualization service"), errorDetail: ex.message }));
                }, ex => this.setState({ error: _("Failed to enable virtualization service"), errorDetail: ex.message }))
                .always(() => this.setState({ actionInProgress: false }));
    }

    goToServicePage() {
        const name = this.props.libvirtService.name ? this.props.libvirtService.name : 'libvirtd.service'; // fallback
        cockpit.jump("/system/services#/" + name);
    }

    render() {
        const name = this.props.libvirtService.name;

        if (name && this.props.libvirtService.activeState === 'unknown')
            return <EmptyStatePanel title={ _("Connecting to virtualization service") } loading />;

        if (this.props.loadingResources)
            return <EmptyStatePanel title={ _("Loading resources") } loading />;

        this.checkStatus();
        const detail = (
            <Checkbox id="enable-libvirt"
                      isDisabled={!name}
                      isChecked={this.state.libvirtEnabled}
                      label={_("Automatically start libvirt on boot")}
                      onChange={enabled => this.setState({ libvirtEnabled: enabled })} />
        );

        const troubleshoot_btn = (
            <Button variant="link" onClick={ this.goToServicePage }>
                { _("Troubleshoot") }
            </Button>);

        return (
            <>
                {this.state.error
                    ? <InlineNotification type='danger' text={this.state.error}
                                          detail={this.state.errorDetail}
                                          onDismiss={() => this.setState({ error: undefined }) } /> : null}
                <EmptyStatePanel icon={ ExclamationCircleIcon }
                                 title={ _("Virtualization service (libvirt) is not active") }
                                 paragraph={ detail }
                                 action={ name ? _("Start libvirt") : null }
                                 isActionInProgress={this.state.actionInProgress}
                                 onAction={ this.startService }
                                 secondary={ troubleshoot_btn } />
            </>
        );
    }
}

LibvirtSlate.propTypes = {
    libvirtService: PropTypes.object.isRequired,
};

export default LibvirtSlate;
