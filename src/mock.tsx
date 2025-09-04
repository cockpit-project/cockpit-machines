/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2025 Red Hat, Inc.
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

import type { UIVM } from './types';

import store from './store.js';
import { addUiVm } from './actions/store-actions.js';

function testMockAddUiVm(name: string) {
    const vm: UIVM = {
        name,
        connectionName: "system",
        isUi: true,
        createInProgress: true,
    };

    store.dispatch(addUiVm(vm));
}

export function initTestMock() {
    // @ts-expect-error - Monkey patching the global object
    window.testMock = {
        addUiVm: testMockAddUiVm,
    };
}
