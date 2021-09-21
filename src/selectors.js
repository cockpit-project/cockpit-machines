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
/*
 * Selectors are pattern that enables to decouple the View layer from the exact layout of
 * the state in Redux store. This also enables to put derived (computed) data on the same level
 * as the objects stored in the store directly.
 *
 * Reference: https://redux.js.org/recipes/computing-derived-data/
 */

export function getRefreshInterval(state) {
    return state.config.refreshInterval;
}

export function getLibvirtServiceState(state) {
    return state.systemInfo.libvirtService.activeState;
}

export function usagePollingEnabled(state, name, connectionName) {
    const vm = state.vms.find(vm => vm.connectionName === connectionName && vm.name === name);
    return vm ? vm.usagePolling : false; // VM got undefined
}
