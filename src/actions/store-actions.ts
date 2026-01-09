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
import {
    UNDEFINE_NETWORK,
    UPDATE_ADD_NETWORK,
} from '../constants/store-action-types.js';

import type {
    ConnectionName,
    Network,
} from '../types';

/**
 * All actions dispatchable by in the application
 */

/** --- Store action creators -----------------------------------------
 *
 *  The naming convention for action creator names is: <verb><Noun>
 *  with the present tense.
 */

export function undefineNetwork({
    connectionName,
    id
} : {
    connectionName: ConnectionName,
    id: string,
}) {
    return {
        type: UNDEFINE_NETWORK,
        payload: {
            connectionName,
            id,
        }
    };
}

export function updateOrAddNetwork(props: Partial<Network>, updateOnly?: boolean) {
    return {
        type: UPDATE_ADD_NETWORK,
        payload: { network: props, updateOnly },
    };
}
