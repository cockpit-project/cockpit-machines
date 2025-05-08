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

export type opt_string = string | null | undefined;

/** General **/

export type ConnectionName = "session" | "system";

/** Capabilities **/

export interface GuestCapabilities {
    osType: opt_string;
    arch: opt_string;
    features?: {
        diskSnapshot: boolean;
        externalSnapshot: boolean;
    };
}

export interface Capabilities {
    guests: GuestCapabilities[];
}

/** Virtual Machines **/

export interface VMDisk {
    target: opt_string;
    driver: {
        name: opt_string;
        type: opt_string;
        cache: opt_string;
        discard: opt_string;
        io: opt_string;
        errorPolicy: opt_string;
    };
    bootOrder: opt_string;
    type: opt_string;
    snapshot: opt_string;
    device: opt_string;
    source: {
        file: opt_string;
        dir: opt_string;
        dev: opt_string;
        pool: opt_string;
        volume: opt_string;
        protocol: opt_string;
        name: opt_string;
        host: {
            name: opt_string;
            port: opt_string;
        },
        startupPolicy: opt_string;
    };
    bus: opt_string;
    serial: opt_string;
    aliasName: opt_string;
    readonly: boolean;
    shareable: boolean;
    removable: opt_string;
}

export interface VMInterface {
    type: opt_string;
    managed: opt_string;
    name: opt_string;
    target: opt_string;
    mac: opt_string;
    model: opt_string;
    aliasName: opt_string;
    virtualportType: opt_string;
    driverName: opt_string;
    state: opt_string;
    mtu: opt_string;
    bootOrder: opt_string;
    source: {
        bridge: opt_string;
        network: opt_string;
        portgroup: opt_string;
        dev: opt_string;
        mode: opt_string;
        address: opt_string;
        port: opt_string;
        local: {
            address: opt_string;
            port: opt_string;
        },
    },
    address: {
        bus: opt_string;
        function: opt_string;
        slot: opt_string;
        domain: opt_string;
    },
}

export interface VMRedirectedDevice {
    bus: opt_string;
    type: opt_string;
    bootOrder: opt_string;
    address: {
        type: opt_string;
        bus: opt_string;
        port: opt_string;
    },
    source: {
        mode: opt_string;
        host: opt_string;
        service: opt_string;
    },
}

export interface VMHostDeviceBase {
    type: string;
    bootOrder: opt_string;
    mode: opt_string;
    driver: opt_string;
}

export interface VMHostDeviceUsb extends VMHostDeviceBase {
    type: "usb";
    address: {
        port: opt_string;
    };
    source: {
        vendor: {
            id: opt_string;
        };
        product: {
            id: opt_string;
        };
        device: opt_string;
        bus: opt_string;
    };
}

export interface VMHostDevicePci extends VMHostDeviceBase {
    type: "pci";
    source: {
        address: {
            vendor: {
                id: opt_string;
            },
            product: {
                id: opt_string;
            },
            domain: opt_string;
            bus: opt_string;
            slot: opt_string;
            func: opt_string;
        };
    };
}

export interface VMHostDeviceScsi extends VMHostDeviceBase {
    type: "scsi";
    source: {
        protocol: opt_string;
        name: opt_string;
        address: {
            bus: opt_string;
            target: opt_string;
            unit: opt_string;
        },
        adapter: {
            name: opt_string;
        };
    };
}

export interface VMHostDeviceScsiHost extends VMHostDeviceBase {
    type: "scsi_host";
    source: {
        protocol: opt_string;
        wwpn: opt_string;
    };
}

export interface VMHostDeviceMdev extends VMHostDeviceBase {
    type: "mdev";
    source: {
        address: {
            uuid: opt_string;
        };
    };
}

export interface VMHostDeviceStorage extends VMHostDeviceBase {
    type: "storage";
    source: {
        block: opt_string;
    };
}

export interface VMHostDeviceMisc extends VMHostDeviceBase {
    type: "misc";
    source: {
        char: opt_string;
    };
}

export interface VMHostDeviceNet extends VMHostDeviceBase {
    type: "net";
    source: {
        interface: opt_string;
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
    mode?: opt_string;
    model?: opt_string;
    topology: {
        sockets?: opt_string;
        threads?: opt_string;
        cores?: opt_string;
    };
}

export interface VMVcpus {
    count: opt_string;
    placement: opt_string;
    max: opt_string;
}

export interface VMGraphics {
    type: opt_string;
    port: opt_string;
    tlsPort: opt_string;
    address: opt_string;
    password: opt_string;
    autoport: opt_string;
}

export interface VMPty {
    type: "pty";
    alias: opt_string;
}

export type VMConsole = VMGraphics | VMPty;

export interface VMFilesystem {
    accessmode: opt_string;
    readonly: boolean;
    source: {
        dir: opt_string;
        name: opt_string;
        socket: opt_string;
        file: opt_string;
    },
    target: {
        dir: opt_string;
    },
}

export interface VMWatchdog {
    model?: opt_string;
    action?: opt_string;
}

export interface VMVsock {
    cid: {
        auto?: opt_string;
        address?: opt_string;
    };
}

export interface VMMetadata {
    hasInstallPhase: boolean;
    installSourceType: opt_string;
    installSource: opt_string;
    osVariant: opt_string;
    rootPassword: opt_string;
    userLogin: opt_string;
    userPassword: opt_string;
}

export interface VMSnapshot {
    name: opt_string,
    description: opt_string,
    state: opt_string,
    creationTime: opt_string,
    parentName: opt_string,
    memoryPath: opt_string,
    isCurrent?: boolean,
}

export interface VMXML {
    connectionName: ConnectionName;
    uuid: string;
    name: string;
    description: opt_string;
    id: string;

    osType: opt_string;
    osBoot: VMOsBoot[];
    firmware: opt_string;
    loader: opt_string;
    arch: opt_string;
    currentMemory: number,
    memory: number;
    memoryBacking: boolean;
    vcpus: VMVcpus,
    disks: Record<string, VMDisk>;
    emulatedMachine: opt_string;
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
    inactiveXML: VMXML;

    state: VMState;
    persistent: boolean;
    autostart: boolean;
    usagePolling?: boolean;

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
        maxVcpu: opt_string;
        cpuModels: null | (opt_string)[];
        cpuHostModel: opt_string;
        supportedDiskBusTypes: null | (opt_string)[];
        supportsSpice: boolean;
        supportsTPM: boolean;
    };

    rssMemory: number | undefined;
    cpuTime: number | undefined;
    actualTimeInMs: number | undefined;
    disksStats: Record<string, VMDiskStat> | undefined;

    snapshots: VMSnapshot[] | -1;
}

/** Storage Pools **/

export interface StorageVolume {
    connectionName: ConnectionName;
    id: opt_string;
    name: string;
    type: opt_string;
    path: opt_string;
    capacity: opt_string;
    allocation: opt_string;
    physical: opt_string | number;
    format: opt_string;
}

export interface StoragePool {
    connectionName: ConnectionName;
    id: string;
    type: opt_string;
    name: opt_string;
    uuid: opt_string;
    capacity: opt_string;
    available: opt_string;
    allocation: opt_string;
    target?: {
        path: opt_string;
    };
    source?: {
        host?: {
            name: opt_string;
        };
        device?: {
            path: opt_string;
        };
        dir?: {
            path: opt_string;
        };
        name?: opt_string;
        format?: {
            type: opt_string;
        };
    };
    active?: boolean;
    persistent?: boolean;
    autostart?: boolean;
    volumes?: StorageVolume[] | undefined;
}

export type StoragePoolCapabilites = Record<string, { supported: opt_string}>;

/** Networks **/

export interface NetworkDhcpHost {
    ip: opt_string;
    name: opt_string;
    mac: opt_string;
    id: opt_string;
}

export interface NetworkIp {
    address: opt_string;
    family: opt_string;
    netmask: opt_string;
    prefix: opt_string;
    dhcp: {
        range: {
            start: opt_string;
            end: opt_string;
        },
        hosts: NetworkDhcpHost[];
        bootp: { file: opt_string; } | undefined;
    };
}

export interface NetworkXML {
    uuid: opt_string;
    bridge?: {
        name: opt_string;
    };
    ip: NetworkIp[];
    mtu: opt_string;
    forward?: {
        mode: string;
    };
    interface?: {
        interface: {
            dev: opt_string;
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
    type?: opt_string;

    // type == 'net'
    interface?: opt_string;

    // type == 'storage'
    block?: opt_string;

    // type == 'misc'
    char?: opt_string;

    // type == 'usb_device' or 'pci'
    product?: {
        id?: opt_string;
        _value?: opt_string;
    };
    vendor?: {
        id?: opt_string;
        _value?: opt_string;
    };
    domain?: opt_string;
    bus?: opt_string | { _value?: opt_string }; // latter from 'scsi'
    function?: opt_string;
    slot?: opt_string;
    device?: opt_string;

    // type == 'scsi'
    // see above for 'bus'
    lun?: { _value?: opt_string };
    target?: { _value?: opt_string };

    // type == 'scsi_host'
    host?: { _value?: opt_string };
    uniqueId?: { _value?: opt_string };

    // type == 'mdev'
    uuid?: opt_string;
}

export interface NodeDeviceXML {
    name: opt_string;
    path: opt_string;
    parent: opt_string;
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

export interface Interface {
    name: string;
    MAC: string;
    Active: boolean;
}
