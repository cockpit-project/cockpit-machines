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

import * as python from "python.js";

import downloadRhelImageScript from 'raw-loader!../scripts/rhsm/download_file_and_report_progress.py';
import getRhelImageUrlScript from 'raw-loader!../scripts/rhsm/get_rhel_image_url.py';
import getAccessTokenScript from 'raw-loader!../scripts/rhsm/get_access_token.py';

import {
    logDebug,
} from "../helpers.js";

/*
 * Provider for Red Hat Subscription Manage API.
 * See https://access.redhat.com/management/api/rhsm
 */

export function downloadRhelImage(accessToken, url, fileName, downloadDir, isSystem) {
    logDebug(`Download rhel image: ${url}, ${fileName}, ${downloadDir}, ${isSystem}`);

    const args = JSON.stringify({
        accessToken,
        url,
        fileName,
        downloadDir
    });

    return python.spawn(downloadRhelImageScript, args, { err: "message", superuser: isSystem && "require", environ: ['LC_ALL=C.UTF-8'] });
}

export function getAccessToken(offlineToken) {
    logDebug(`Get access token`);

    const args = JSON.stringify({ offlineToken });
    return python.spawn(getAccessTokenScript, args, { err: "message", environ: ['LC_ALL=C.UTF-8'] });
}

export function getRhelImageUrl(accessToken, rhelVersion, arch) {
    logDebug(`Download rhel image, ${rhelVersion}, ${arch}`);

    const args = JSON.stringify({
        accessToken,
        rhelVersion,
        arch,
    });

    return python.spawn(getRhelImageUrlScript, args, { err: "message", environ: ['LC_ALL=C.UTF-8'] });
}
