/*

MIT License

Copyright (c) 2025 Red Hat, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

 */

/* This started as a copy of the VncConsole component of @patternfly/react-console.

   https://github.com/patternfly/react-console/blob/main/packages/module/src/components/VncConsole/VncConsole.tsx

   It was stripped down to only contain the raw RFB widget from novnc.
   Actions, CSS, and handling of the connected/disconnected state was
   removed.
 */

import React from 'react';

import { initLogging } from '@novnc/novnc/lib/util/logging';
import RFB_module from '@novnc/novnc/lib/rfb';
const RFB = RFB_module.default;

export const VncConsole = ({
    children,
    host,
    port = '80',
    path = '',
    encrypt = false,
    resizeSession = true,
    clipViewport = false,
    dragViewport = false,
    scaleViewport = false,
    viewOnly = false,
    shared = false,
    credentials,
    repeaterID = '',
    vncLogging = 'warn',
    consoleContainerId,
    onConnected = (element) => {},
    onDisconnected = () => {},
    onInitFailed,
    onSecurityFailure,
}) => {
    const rfb = React.useRef();

    const novncElem = React.useRef(null);

    const _onDisconnected = React.useCallback(
        (e) => {
            onDisconnected(e);
        },
        [onDisconnected]
    );

    const _onSecurityFailure = React.useCallback(
        (e) => {
            onSecurityFailure(e);
        },
        [onSecurityFailure]
    );

    const addEventListeners = React.useCallback(() => {
        if (rfb.current) {
            rfb.current?.addEventListener('disconnect', _onDisconnected);
            rfb.current?.addEventListener('securityfailure', _onSecurityFailure);
        }
    }, [rfb, _onDisconnected, _onSecurityFailure]);

    const removeEventListeners = React.useCallback(() => {
        if (rfb.current) {
            rfb.current.removeEventListener('disconnect', _onDisconnected);
            rfb.current.removeEventListener('securityfailure', _onSecurityFailure);
        }
    }, [rfb, _onDisconnected, _onSecurityFailure]);

    const connect = React.useCallback(() => {
        const protocol = encrypt ? 'wss' : 'ws';
        const url = `${protocol}://${host}:${port}/${path}`;

        const options = {
            repeaterID,
            shared,
            credentials
        };
        rfb.current = new RFB(novncElem.current, url, options);
        addEventListeners();
        rfb.current.viewOnly = viewOnly;
        rfb.current.clipViewport = clipViewport;
        rfb.current.dragViewport = dragViewport;
        rfb.current.scaleViewport = scaleViewport;
        rfb.current.resizeSession = resizeSession;
    }, [
        addEventListeners,
        host,
        path,
        port,
        resizeSession,
        clipViewport,
        dragViewport,
        scaleViewport,
        viewOnly,
        encrypt,
        rfb,
        repeaterID,
        shared,
        credentials
    ]);

    React.useEffect(() => {
        initLogging(vncLogging);
        try {
            connect();
            onConnected(novncElem.current);
        } catch (e) {
            onInitFailed && onInitFailed(e);
            rfb.current = undefined;
        }

        return () => {
            disconnect();
            removeEventListeners();
            rfb.current = undefined;
        };
    }, [connect, onInitFailed, onConnected, removeEventListeners, vncLogging]);

    const disconnect = () => {
        if (!rfb.current) {
            return;
        }
        rfb.current.disconnect();
    };

    return (
        <div className="vm-console-vnc">
            <div id={consoleContainerId} ref={novncElem} />
        </div>
    );
};
