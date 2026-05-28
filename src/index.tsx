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

async function appMain() {
    await load_config();
    const root = createRoot(document.getElementById('app')!);
    root.render(<App />);
}

appMain();
