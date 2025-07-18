/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2022 Red Hat, Inc.
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
