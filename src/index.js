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

import React, { createContext, useEffect, useReducer } from 'react';
import ReactDOM from 'react-dom';

import { appReducers, initialState } from './reducers';
import { initDataRetrieval } from "./actions/provider-actions.js";
import App from './app.jsx';

export const StateContext = createContext(initialState);
export const DispatchContext = React.createContext(undefined);

const AppWrapper = () => {
    const [state, dispatch] = useReducerWithThunk(appReducers, initialState);
    useEffect(() => {
        dispatch(initDataRetrieval());
    }, []);

    return (
        <StateContext.Provider value={state}>
            <DispatchContext.Provider value={dispatch}>
                <App store={state} dispatch={dispatch} />
            </DispatchContext.Provider>
        </StateContext.Provider>
    );
};

function useReducerWithThunk(reducer, initialState) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const customDispatch = (action) => {
        if (typeof action === 'function') {
            action(customDispatch);
        } else {
            dispatch(action);
        }
    };
    return [state, customDispatch];
}

function render() {
    ReactDOM.render(
        <AppWrapper />,
        document.getElementById('app')
    );
}

(function() {
    document.addEventListener("DOMContentLoaded", function() {
        render();
    });
}());
