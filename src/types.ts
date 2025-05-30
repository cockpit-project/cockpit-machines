/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2025 Red Hat, Inc.
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

/* These are types for the data structures produced when parsing the
   libvirt XML documents.

   Most leaf elements are optional strings, which need type

      string | null | undefined

   The "null" is from getAttr, and the "undefined" comes from using
   the optional chaining operator "?.".  With a little better
   abstraction, this could be normalized to "string | undefined", but
   as a first step, let's define a shorter name for this.
 */

export type optString = string | null | undefined;

/** General **/

export type ConnectionName = "session" | "system";

/** Capabilities **/

export interface GuestCapabilities {
    osType: optString;
    arch: optString;
    features?: {
        diskSnapshot: boolean;
        externalSnapshot: boolean;
    };
}

export interface HypervisorCapabilities {
    guests: GuestCapabilities[];
}

/** Virtual Machines **/

export interface DetailedError {
    text: string;
    detail: string;
}

export interface VMDisk {
    target: optString;
    driver: {
        name: optString;
        type: optString;
        cache: optString;
        discard: optString;
        io: optString;
        errorPolicy: optString;
    };
    bootOrder: optString;
    type: optString;
    snapshot: optString;
    device: optString;
    source: {
        file: optString;
        dir: optString;
        dev: optString;
        pool: optString;
        volume: optString;
        protocol: optString;
        name: optString;
        host: {
            name: optString;
            port: optString;
        },
        startupPolicy: optString;
    };
    bus: optString;
    serial: optString;
    aliasName: optString;
    readonly: boolean;
    shareable: boolean;
    removable: optString;
}

export interface VMInterface {
    type: optString;
    managed: optString;
    name: optString;
    target: optString;
    mac: optString;
    model: optString;
    aliasName: optString;
    virtualportType: optString;
    driverName: optString;
    state: optString;
    mtu: optString;
    bootOrder: optString;
    source: {
        bridge: optString;
        network: optString;
        portgroup: optString;
        dev: optString;
        mode: optString;
        address: optString;
        port: optString;
        local: {
            address: optString;
            port: optString;
        },
    },
    address: {
        bus: optString;
        function: optString;
        slot: optString;
        domain: optString;
    },
}

export interface VMRedirectedDevice {
    bus: optString;
    type: optString;
    bootOrder: optString;
    address: {
        type: optString;
        bus: optString;
        port: optString;
    },
    source: {
        mode: optString;
        host: optString;
        service: optString;
    },
}

export interface VMHostDeviceBase {
    type: string;
    bootOrder: optString;
    mode: optString;
    driver: optString;
}

export interface VMHostDeviceUsb extends VMHostDeviceBase {
    type: "usb";
    address: {
        port: optString;
    };
    source: {
        vendor: {
            id: optString;
        };
        product: {
            id: optString;
        };
        device: optString;
        bus: optString;
    };
}

export interface VMHostDevicePci extends VMHostDeviceBase {
    type: "pci";
    source: {
        address: {
            vendor: {
                id: optString;
            },
            product: {
                id: optString;
            },
            domain: optString;
            bus: optString;
            slot: optString;
            func: optString;
        };
    };
}

export interface VMHostDeviceScsi extends VMHostDeviceBase {
    type: "scsi";
    source: {
        protocol: optString;
        name: optString;
        address: {
            bus: optString;
            target: optString;
            unit: optString;
        },
        adapter: {
            name: optString;
        };
    };
}

export interface VMHostDeviceScsiHost extends VMHostDeviceBase {
    type: "scsi_host";
    source: {
        protocol: optString;
        wwpn: optString;
    };
}

export interface VMHostDeviceMdev extends VMHostDeviceBase {
    type: "mdev";
    source: {
        address: {
            uuid: optString;
        };
    };
}

export interface VMHostDeviceStorage extends VMHostDeviceBase {
    type: "storage";
    source: {
        block: optString;
    };
}

export interface VMHostDeviceMisc extends VMHostDeviceBase {
    type: "misc";
    source: {
        char: optString;
    };
}

export interface VMHostDeviceNet extends VMHostDeviceBase {
    type: "net";
    source: {
        interface: optString;
    };
}

export type VMHostDevice =
    VMHostDeviceUsb |
    VMHostDevicePci |
    VMHostDeviceScsi |
    VMHostDeviceScsiHost |
    VMHostDeviceMdev |
    VMHostDeviceStorage |
    VMHostDeviceMisc |
    VMHostDeviceNet;

export interface VMOsBoot {
    order: number;
    type: string;
}

export interface VMCpu {
    mode?: optString;
    model?: optString;
    topology: {
        sockets?: optString;
        threads?: optString;
        cores?: optString;
    };
}

export interface VMVcpus {
    count: optString;
    placement: optString;
    max: optString;
}

export interface VMGraphics {
    type: optString;
    port: optString;
    tlsPort: optString;
    address: optString;
    password: optString;
    autoport: optString;
}

export interface VMPty {
    type: "pty";
    alias: optString;
}

export type VMConsole = VMGraphics | VMPty;

export interface VMFilesystem {
    accessmode: optString;
    readonly: boolean;
    source: {
        dir: optString;
        name: optString;
        socket: optString;
        file: optString;
    },
    target: {
        dir: optString;
    },
}

export interface VMWatchdog {
    model?: optString;
    action?: optString;
}

export interface VMVsock {
    cid: {
        auto?: optString;
        address?: optString;
    };
}

export interface VMMetadata {
    hasInstallPhase: boolean;
    installSourceType: optString;
    installSource: optString;
    osVariant: optString;
    rootPassword: optString;
    userLogin: optString;
    userPassword: optString;
}

export interface VMSnapshot {
    name: optString,
    description: optString,
    state: optString,
    creationTime: optString,
    parentName: optString,
    memoryPath: optString,
    isCurrent?: boolean,
}

export interface VMXML {
    connectionName: ConnectionName;
    uuid: string;
    name: string;
    description: optString;
    id: string;

    osType: optString;
    osBoot: VMOsBoot[];
    firmware: optString;
    loader: optString;
    arch: optString;
    currentMemory: number,
    memory: number;
    memoryBacking: boolean;
    vcpus: VMVcpus,
    disks: Record<string, VMDisk>;
    emulatedMachine: optString;
    cpu: VMCpu;
    displays: VMConsole[];
    interfaces: VMInterface[];
    redirectedDevices: VMRedirectedDevice[];
    hostDevices: VMHostDevice[];
    filesystems: VMFilesystem[];
    watchdog: VMWatchdog;
    vsock: VMVsock;
    metadata: VMMetadata;
    hasSpice: boolean;
    hasTPM: boolean;
}

export type VMState =
    "no state" |
    "running" |
    "blocked" |
    "paused" |
    "shutdown" |
    "shut off" |
    "crashed" |
    "pmsuspended";

export interface VMDiskStat {
    physical: number | string,
    capacity: number | string,
    allocation: number | string,
}

export interface VM extends VMXML {
    isUi?: undefined; // To discriminate from UIVM, see below

    inactiveXML: VMXML;

    state: VMState;
    persistent: boolean;
    autostart: boolean;
    usagePolling?: boolean;

    error?: DetailedError | null;

    // Unused
    ui: {
        initiallyExpanded: boolean | undefined;
        initiallyOpenedConsoleTab: boolean | undefined;
    };

    // Unused, and probably confused with "ui" above.
    expanded?: boolean;
    openConsoleTab?: boolean;
    installInProgress?: boolean;

    capabilities: {
        loaderElems: HTMLCollection | undefined;
        maxVcpu: optString;
        cpuModels: null | (optString)[];
        cpuHostModel: optString;
        supportedDiskBusTypes: null | (optString)[];
        supportsSpice: boolean;
        supportsTPM: boolean;
    };

    rssMemory: number | undefined;
    cpuTime: number | undefined;
    actualTimeInMs: number | undefined;
    disksStats: Record<string, VMDiskStat> | undefined;

    snapshots: VMSnapshot[] | -1;
}

/** "Fake" VMs for the UI only **/

export interface UIVM {
    isUi: true;
    connectionName: ConnectionName;
    name: string;
    error?: undefined;
    expanded?: boolean;
    openConsoleTab?: boolean;
    createInProgress?: boolean;
    downloadProgress?: string | undefined;
}

/** Storage Pools **/

export interface StorageVolume {
    connectionName: ConnectionName;
    id: optString;
    name: string;
    type: optString;
    path: optString;
    capacity: optString;
    allocation: optString;
    physical: optString | number;
    format: optString;

    // XXX - private for StoragePoolVolumesTab
    selected?: boolean;
}

export interface StoragePool {
    connectionName: ConnectionName;
    id: string;
    name: string;
    type: string;
    uuid: optString;
    capacity: optString;
    available: optString;
    allocation: optString;
    target?: {
        path: optString;
    };
    source?: {
        host?: {
            name: optString;
        };
        device?: {
            path: optString;
        };
        dir?: {
            path: optString;
        };
        name?: optString;
        format?: {
            type: optString;
        };
    };
    active?: boolean;
    persistent?: boolean;
    autostart?: boolean;
    volumes?: StorageVolume[] | undefined;

    error?: DetailedError | null | undefined;
}

export type StoragePoolCapabilites = Record<string, { supported: optString}>;

/** Networks **/

export interface NetworkDhcpHost {
    ip: optString;
    name: optString;
    mac: optString;
    id: optString;
}

export interface NetworkIp {
    address: optString;
    family: optString;
    netmask: optString;
    prefix: optString;
    dhcp: {
        range: {
            start: optString;
            end: optString;
        },
        hosts: NetworkDhcpHost[];
        bootp: { file: optString; } | undefined;
    };
}

export interface NetworkXML {
    uuid: optString;
    bridge?: {
        name: optString;
    };
    ip: NetworkIp[];
    mtu: optString;
    forward?: {
        mode: string;
    };
    interface?: {
        interface: {
            dev: optString;
        };
    };
}

export interface Network extends NetworkXML {
    connectionName: ConnectionName;
    id: string;
    name?: string;
    active?: boolean;
    persistent?: boolean;
    autostart?: boolean;
}

/** Node Devices **/

export interface NodeDeviceCapability {
    type?: optString;

    // type == 'net'
    interface?: optString;

    // type == 'storage'
    block?: optString;

    // type == 'misc'
    char?: optString;

    // type == 'usb_device' or 'pci'
    product?: {
        id?: optString;
        _value?: optString;
    };
    vendor?: {
        id?: optString;
        _value?: optString;
    };
    domain?: optString;
    bus?: optString | { _value?: optString }; // latter from 'scsi'
    function?: optString;
    slot?: optString;
    device?: optString;

    // type == 'scsi'
    // see above for 'bus'
    lun?: { _value?: optString };
    target?: { _value?: optString };

    // type == 'scsi_host'
    host?: { _value?: optString };
    uniqueId?: { _value?: optString };

    // type == 'mdev'
    uuid?: optString;
}

export interface NodeDeviceXML {
    name: optString;
    path: optString;
    parent: optString;
    capability: NodeDeviceCapability;
}

export interface NodeDevice extends NodeDeviceXML {
    connectionName: ConnectionName;
    pciSlotName?: string;
    class?: string;
    busnum?: string;
    devnum?: string;
}

/** Interface **/

export interface NodeInterface {
    name: string;
    MAC: string;
    Active: boolean;
}
