/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2022 Red Hat, Inc.
 */

import type cockpit from 'cockpit';

import * as python from "python.js";

import { optString } from '../types';

import downloadRhelImageScript from '../scripts/rhsm/download_file_and_report_progress.py';
import getRhelImageUrlScript from '../scripts/rhsm/get_rhel_image_url.py';
import getAccessTokenScript from '../scripts/rhsm/get_access_token.py';

import {
    logDebug,
} from "../helpers.js";

/*
 * Provider for Red Hat Subscription Manage API.
 * See https://access.redhat.com/management/api/rhsm
 */

export function downloadRhelImage(
    accessToken: optString,
    url: string,
    fileName: string,
    downloadDir: string,
    isSystem: boolean
): cockpit.Spawn<string> {
    logDebug(`Download rhel image: ${url}, ${fileName}, ${downloadDir}, ${isSystem}`);

    const arg = JSON.stringify({
        accessToken,
        url,
        fileName,
        downloadDir
    });

    return python.spawn(downloadRhelImageScript, [arg], {
        err: "message",
        ...(isSystem ? { superuser: "require" } : { }),
        environ: ['LC_ALL=C.UTF-8']
    });
}

export function getAccessToken(offlineToken: string): cockpit.Spawn<string> {
    logDebug(`Get access token`);

    const arg = JSON.stringify({ offlineToken });
    return python.spawn(getAccessTokenScript, [arg], { err: "message", environ: ['LC_ALL=C.UTF-8'] });
}

export function getRhelImageUrl(
    accessToken: optString,
    rhelVersion: optString,
    arch: optString
): cockpit.Spawn<string> {
    logDebug(`Download rhel image, ${rhelVersion}, ${arch}`);

    const arg = JSON.stringify({
        accessToken,
        rhelVersion,
        arch,
    });

    return python.spawn(getRhelImageUrlScript, [arg], { err: "message", environ: ['LC_ALL=C.UTF-8'] });
}
