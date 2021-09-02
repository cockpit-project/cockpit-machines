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
import getLibvirtSocketNameScript from 'raw-loader!./scripts/get_libvirt_socket_name.sh';

function render(serviceName, socketName) {
    ReactDOM.render(
        <App serviceName={serviceName} socketName={socketName} />,
        document.getElementById('app')
    );
}

function renderApp() {
    return cockpit.script(getLibvirtSocketNameScript, null, { err: "message", environ: ['LC_ALL=C.UTF-8'] })
            .then(socketName => {
                const socketMatch = socketName.match(/([^\s]+)/);
                socketName = socketMatch ? socketMatch[0] : null;
                const serviceName = socketName.replace("socket", "service");
                if (serviceName && socketName) {
                    // re-render app every time the state changes
                    store.subscribe(() => render(serviceName, socketName));

                    // do initial render
                    render(serviceName, socketName);
                }
            })
            .catch(ex => console.error(`initialize failed: getting libvirt service name returned error: "${JSON.stringify(ex)}"`));
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
