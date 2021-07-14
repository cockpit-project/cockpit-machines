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
import 'patternfly/patternfly-cockpit.scss';
import 'polyfills'; // once per application

import React from 'react';
import ReactDOM from 'react-dom';

import cockpit from 'cockpit';
import store from './store.js';
import App from './app.jsx';
import { logDebug } from './helpers.js';
import getLibvirtServiceNameScript from 'raw-loader!./scripts/get_libvirt_service_name.sh';

function render(name) {
    ReactDOM.render(
        <App name={name} />,
        document.getElementById('app')
    );
}

function renderApp() {
    return cockpit.script(getLibvirtServiceNameScript, null, { err: "message", environ: ['LC_ALL=C.UTF-8'] })
            .then(serviceName => {
                const match = serviceName.match(/([^\s]+)/);
                const name = match ? match[0] : null;
                if (name) {
                    // re-render app every time the state changes
                    store.subscribe(() => render(name));

                    // do initial render
                    render(name);
                }
            })
            .fail((exception, data) => {
                console.error(`initialize failed: getting libvirt service name returned error: "${JSON.stringify(exception)}", data: "${JSON.stringify(data)}"`);
            });
}

/**
 * Start the application.
 */
function appMain() {
    logDebug('index.js: initial state: ' + JSON.stringify(store.getState()));
    renderApp();
}

(function() {
    document.addEventListener("DOMContentLoaded", function() {
        appMain();
    });
}());
