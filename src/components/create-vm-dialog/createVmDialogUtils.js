/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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

import cockpit from 'cockpit';
import React from 'react';
import { ExclamationTriangleIcon, OutlinedClockIcon } from "@patternfly/react-icons";

import {
    getTodayYearShifted,
} from "../../helpers.js";

import * as python from "python.js";
import autoDetectOSScript from './autoDetectOS.py';

const _ = cockpit.gettext;

const ACCEPT_RELEASE_DATES_AFTER = getTodayYearShifted(-3);
const ACCEPT_EOL_DATES_AFTER = getTodayYearShifted(-1);
const RHSM_TOKEN = "rhsm-offline-token";

export const URL_SOURCE = 'url';
export const LOCAL_INSTALL_MEDIA_SOURCE = 'file';
export const CLOUD_IMAGE = 'cloud';
export const DOWNLOAD_AN_OS = 'os';
export const EXISTING_DISK_IMAGE_SOURCE = 'disk_image';
export const PXE_SOURCE = 'pxe';
export const NONE = 0;
export const RUN = 1;
export const EDIT = 2;

/*
 * Uses libosinfo to autodetect an OS based on its media/treeinfo.
 * treeinfo detection currently works only for rpm based distros.
 * @param {string} url - A URL pointing to the media or the tree.
 */
export function autodetectOS(url) {
    // HACK: osinfo-detect uses GIO to read the tree info file over http. cockpit-bridge used to unset GIO env variables
    // which blocked us from using GIO calls over cockpit-bridge.
    // Overwrite the env vars here, until commit https://github.com/cockpit-project/cockpit/commit/86c1fcb46291c83d6c6903e60fe4bee82598d3a9
    // exists in all supported distros.
    return python.spawn(autoDetectOSScript, url, { environ: ['GIO_USE_VFS=gvfs', 'LC_ALL=C.UTF-8'], err: 'message' });
}

export function getOSStringRepresentation(os) {
    let appendix = '';

    if (os.version && !os.name.includes(os.version)) {
        appendix += os.version;
    }
    if (os.codename) {
        appendix += (appendix ? ' ' : '') + os.codename;
    }
    if (appendix) {
        appendix = ` (${appendix})`;
    }

    return `${os.name}${appendix}`;
}

export function filterReleaseEolDates(os) {
    // Filter out all OSes their EOL date exists and is olrder than allowed
    // or their EOL date does not exist but their release date is too old
    return !(
        (os.eolDate && compareDates(ACCEPT_EOL_DATES_AFTER, os.eolDate) < 0) ||
        (!os.eolDate && os.releaseDate && compareDates(ACCEPT_RELEASE_DATES_AFTER, os.releaseDate) < 0)
    );
}

export function getOSDescription(os) {
    if (os.eolDate && compareDates(ACCEPT_EOL_DATES_AFTER, os.eolDate) < 0)
        return <span><ExclamationTriangleIcon /> {cockpit.format(_("Vendor support ended $0"), os.eolDate)}</span>;
    if (!os.eolDate && os.releaseDate && compareDates(ACCEPT_RELEASE_DATES_AFTER, os.releaseDate) < 0)
        return <span><OutlinedClockIcon /> {cockpit.format(_("Released $0"), os.releaseDate)}</span>;
    return null;
}

export function compareDates(a, b, emptyFirst = false) {
    if (!a) {
        if (!b) {
            return 0;
        }
        return emptyFirst ? -1 : 1;
    }
    if (!b) {
        return emptyFirst ? 1 : -1;
    }

    return new Date(b).getTime() - new Date(a).getTime();
}

export function correctSpecialCases(os) {
    if (os.shortId === 'win8') {
        os.releaseDate = '2012-08-01';
    }

    if (os.shortId === 'win8.1') {
        os.releaseDate = '2014-04-08';
    }

    if (os.shortId === 'msdos6.22') {
        os.releaseDate = '1994-06-01';
    }

    // linux
    if (os.shortId.toLowerCase().includes('centos7')) {
        os.eolDate = '2024-06-30';
    }

    if (os.shortId === 'freebsd2.2.9') {
        os.releaseDate = '2006-04-01'; // april fools prank
    }

    if (os.shortId === 'openbsd4.2') {
        os.releaseDate = '2007-11-01';
    }

    if (os.shortId === 'openbsd4.3') {
        os.releaseDate = '2008-05-01';
    }

    if (os.shortId === 'openbsd4.4') {
        os.releaseDate = '2008-11-01';
    }

    if (os.shortId === 'openbsd4.5') {
        os.releaseDate = '2009-05-01';
    }

    if (os.shortId === 'openbsd4.8') {
        os.releaseDate = '2010-11-01';
    }

    if (os.shortId === 'openbsd4.9') {
        os.releaseDate = '2011-05-01';
    }

    if (os.shortId === 'openbsd5.0') {
        os.releaseDate = '2011-11-01';
    }

    return os;
}

export function needsRHToken(osName) {
    return osName.startsWith("rhel");
}

export function isDownloadableOs(os) {
    return os.treeInstallable ||
        (needsRHToken(os.shortId) &&
        !os.version.endsWith("unknown") &&
        // RHSM API supports only rhel versions >= 8: https://access.redhat.com/management/api/rhsm#/images/listImageDownloadsByVersionArch
        (os.version.localeCompare("8.0", undefined, { numeric: true, sensitivity: 'base' }) >= 0));
}

export function saveOfflineToken(offlineToken) {
    return localStorage.setItem(RHSM_TOKEN, offlineToken);
}

export function loadOfflineToken(setToken) {
    return setToken(localStorage.getItem(RHSM_TOKEN));
}

export function removeOfflineToken() {
    return localStorage.removeItem(RHSM_TOKEN);
}
