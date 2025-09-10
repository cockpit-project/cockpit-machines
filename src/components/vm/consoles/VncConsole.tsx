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

import RFB from '@novnc/novnc/lib/rfb';

/* HACK - there is something weird going on with NoVNC modules and the
 * way we bundle things. The default export should be the RFB
 * class/constructor, but we get a wrapper that has the constructor in
 * its "default" field.  The hack below gives us access to the
 * constructor function but this is clearly not how this is intended
 * to be done...
 */
const RFB_constructor: typeof RFB = (RFB as unknown as { default: typeof RFB }).default;

export interface VncCredentials {
    password: string;
}

export const VncConsole = ({
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
    repeaterID = '',
    consoleContainerId,
    onConnected = () => {},
    onDisconnected = () => {},
    onInitFailed,
    onSecurityFailure,
    getCredentials,
} : {
    host: string,
    port?: string,
    path?: string,
    encrypt?: boolean,
    resizeSession?: boolean,
    clipViewport?: boolean,
    dragViewport?: boolean,
    scaleViewport?: boolean,
    viewOnly?: boolean,
    shared?: boolean,
    repeaterID?: string,
    consoleContainerId: string,
    onConnected?: (element: HTMLElement | null) => void,
    onDisconnected: (clean: boolean) => void,
    onInitFailed: (detail: unknown) => void,
    onSecurityFailure: (reason: string | undefined) => void,
    getCredentials: () => Promise<VncCredentials>,
}) => {
    const rfb = React.useRef<RFB>();

    const novncElem = React.useRef<HTMLDivElement>(null);

    const _onDisconnected = React.useCallback(
        (e: CustomEvent<{ clean: boolean }>) => {
            onDisconnected(e.detail.clean);
        },
        [onDisconnected]
    );

    const _onSecurityFailure = React.useCallback(
        (e: CustomEvent<{ status: number; reason?: string }>) => {
            onSecurityFailure(e.detail.reason);
        },
        [onSecurityFailure]
    );

    const _onCredentialsRequired = React.useCallback(
        async () => {
            if (rfb.current) {
                const creds = await getCredentials();
                rfb.current.sendCredentials({ username: "", target: "", ...creds });
            }
        },
        [getCredentials]
    );

    const addEventListeners = React.useCallback(() => {
        if (rfb.current) {
            rfb.current?.addEventListener('disconnect', _onDisconnected);
            rfb.current?.addEventListener('securityfailure', _onSecurityFailure);
            rfb.current?.addEventListener('credentialsrequired', _onCredentialsRequired);
        }
    }, [rfb, _onDisconnected, _onSecurityFailure, _onCredentialsRequired]);

    const removeEventListeners = React.useCallback(() => {
        if (rfb.current) {
            rfb.current.removeEventListener('disconnect', _onDisconnected);
            rfb.current.removeEventListener('securityfailure', _onSecurityFailure);
            rfb.current.removeEventListener('credentialsrequired', _onCredentialsRequired);
        }
    }, [rfb, _onDisconnected, _onSecurityFailure, _onCredentialsRequired]);

    const connect = React.useCallback(() => {
        const protocol = encrypt ? 'wss' : 'ws';
        const url = `${protocol}://${host}:${port}/${path}`;

        const options = {
            repeaterID,
            shared,
        };
        const rfb_object = new RFB_constructor(novncElem.current!, url, options);
        rfb_object.viewOnly = viewOnly;
        rfb_object.clipViewport = clipViewport;
        rfb_object.dragViewport = dragViewport;
        rfb_object.scaleViewport = scaleViewport;
        rfb_object.resizeSession = resizeSession;
        rfb.current = rfb_object;
        addEventListeners();
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
    ]);

    React.useEffect(() => {
        try {
            connect();
            onConnected(novncElem.current);
        } catch (e) {
            if (onInitFailed) onInitFailed(e);
            rfb.current = undefined;
        }

        return () => {
            disconnect();
            removeEventListeners();
            rfb.current = undefined;
        };
    }, [connect, onInitFailed, onConnected, removeEventListeners]);

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
