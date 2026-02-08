/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2016 Red Hat, Inc.
 */
import "cockpit-dark-theme";
import 'patternfly/patternfly-6-cockpit.scss';
import 'polyfills'; // once per application

import React from 'react';
import { createRoot } from 'react-dom/client';

import { load_config } from './config.js';
import { App } from './app.jsx';

import "./machines.scss";

/**
 * Start the application.
 */
function appMain(): void {
    const root = createRoot(document.getElementById('app')!);
    root.render(<App />);
}

(function() {
    document.addEventListener("DOMContentLoaded", async function() {
        await load_config();
        appMain();
    });
}());
