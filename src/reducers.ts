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

// @cockpit-ts-relaxed

import { combineReducers } from 'redux';
import { isObjectEmpty } from './helpers.js';
import {
    UNDEFINE_NETWORK,
    UPDATE_ADD_NETWORK,
} from './constants/store-action-types.js';

import type {
    Network,
} from './types';

// --- helpers -------------------
function getFirstIndexOfResource(state, field, value, connectionName) {
    return state.findIndex(e => {
        return e && e.connectionName === connectionName && e[field] === value;
    });
}

function replaceResource({ state, updatedResource, index }) {
    return state.slice(0, index)
            .concat(updatedResource)
            .concat(state.slice(index + 1));
}

// --- reducers ------------------
function networks(state: Network[] | undefined, action): Network[] {
    state = state || [];

    switch (action.type) {
    case UNDEFINE_NETWORK: {
        const { connectionName, id } = action.payload;

        return state
                .filter(network => (connectionName !== network.connectionName || id != network.id));
    }
    case UPDATE_ADD_NETWORK: {
        const { network, updateOnly } = action.payload;

        if (isObjectEmpty(network))
            return [...state, network]; // initialize network to empty object

        const connectionName = network.connectionName;
        const index = network.id
            ? getFirstIndexOfResource(state, 'id', network.id, connectionName)
            : getFirstIndexOfResource(state, 'name', network.name, connectionName);
        if (index < 0) {
            if (!updateOnly) {
                const initObjIndex = state.findIndex(obj => isObjectEmpty(obj));
                if (initObjIndex >= 0)
                    state.splice(initObjIndex, 1); // remove empty initial object
                return [...state, network];
            } else {
                return state;
            }
        }

        const updatedNetwork = Object.assign({}, state[index], network);
        return replaceResource({ state, updatedResource: updatedNetwork, index });
    }
    default:
        return state;
    }
}

export default combineReducers({
    networks,
});
