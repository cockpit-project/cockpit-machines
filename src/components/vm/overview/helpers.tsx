/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2020 Red Hat, Inc.
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
import React from 'react';
import cockpit from 'cockpit';

import type { optString } from '../../../types';

import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";

const _ = cockpit.gettext;

export const WATCHDOG_INFO_MESSAGE = _("Watchdogs act when systems stop responding. To use this virtual watchdog device, the guest system also needs to have an additional driver and a running watchdog service.");
export const VSOCK_INFO_MESSAGE = _("Virtual socket support enables communication between the host and guest over a socket. It still requires special vsock-aware software to communicate over the socket.");
export const SOCAT_EXAMPLE_HEADER = _("An example of vsock-aware software is socat");
export const SOCAT_EXAMPLE = (
    <>
        <FlexItem>
            {_("On the host")}
            <CodeBlock>
                <CodeBlockCode>socat VSOCK-LISTEN:1234 VSOCK-CONNECT:[vsock_identifier]:1234</CodeBlockCode>
            </CodeBlock>
        </FlexItem>
        <FlexItem>
            {_("Inside the VM")}
            <CodeBlock>
                <CodeBlockCode>nc --vsock -l 1234</CodeBlockCode>
            </CodeBlock>
        </FlexItem>
    </>
);

export function labelForFirmwarePath(path: optString, guest_arch: optString) {
    /* Copied from virt-manager code:
     * Mapping of UEFI binary names to their associated architectures.
     */
    const uefi_arch_patterns: Record<string, string[]> = {
        i686: [
            ".*ovmf-ia32.*", // fedora, gerd's firmware repo
        ],
        x86_64: [
            ".*OVMF_CODE.fd", // RHEL
            ".*ovmf-x64/OVMF.*.fd", // gerd's firmware repo
            ".*ovmf-x86_64-.*", // SUSE
            ".*ovmf.*", ".*OVMF.*", // generic attempt at a catchall
        ],
        aarch64: [
            ".*AAVMF_CODE.fd", // RHEL
            ".*aarch64/QEMU_EFI.*", // gerd's firmware repo
            ".*aarch64.*", // generic attempt at a catchall
        ],
        armv7l: [
            ".*arm/QEMU_EFI.*", // fedora, gerd's firmware repo
        ],
    };
    if (!path) {
        if (guest_arch && ["i686", "x86_64"].includes(guest_arch))
            return "bios";
        else
            return "unknown";
    } else {
        for (const arch in uefi_arch_patterns) {
            for (let i = 0; i < uefi_arch_patterns[arch].length; i++) {
                const pathRegExp = uefi_arch_patterns[arch][i];
                if (path.match(pathRegExp))
                    return "efi";
            }
        }
        return "custom";
    }
}

export function supportsUefiXml(loaderElem: Element) {
    /* Return True if libvirt advertises support for proper UEFI setup  */
    const enums = loaderElem.getElementsByTagName("enum");
    const readonly = Array.prototype.filter.call(enums, enm => enm.getAttribute("name") == "readonly");

    return Array.prototype.filter.call(readonly[0].getElementsByTagName("value"), value => value.textContent == "yes").length > 0;
}
