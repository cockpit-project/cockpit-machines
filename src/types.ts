/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2025 Red Hat, Inc.
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

export interface VirtInstallCapabilities {
    virtInstallAvailable: boolean,
    cloudInitSupported?: boolean | undefined,
    downloadOSSupported?: boolean | undefined,
    unattendedSupported?: boolean | undefined,
    unattendedUserLogin?: boolean | undefined,
}

export interface VirtXmlCapabilities {
    convert_to_vnc: boolean;
}

/** Virtual Machines **/

export interface DetailedError {
    text: string;
    detail: string;
}

export type VMDiskDevice = "floppy" | "disk" | "cdrom" | "lun";

export interface VMDisk {
    target: string;
    driver: {
        name: optString;
        type: optString;
        cache: string;
        discard: optString;
        io: optString;
        errorPolicy: optString;
    };
    bootOrder: optString;
    type: optString;
    snapshot: optString;
    device: VMDiskDevice;
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

export interface VMInterfacePortForwardRange {
    start: optString;
    end: optString;
    to: optString;
    exclude: optString;
}

export interface VMInterfacePortForward {
    address: optString;
    dev: optString;
    proto: optString;
    range: VMInterfacePortForwardRange[];
}

export interface VMInterface {
    type: string;
    managed: optString;
    name: optString;
    target: optString;
    mac: optString;
    model: optString;
    backend: optString;
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
    portForward: VMInterfacePortForward[],
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
    mode: string;
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
        dir: string;
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
    name: string,
    description: optString,
    state: string,
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
    hasPollingMemBalloon: boolean;
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
    physical: number,
    capacity: number,
    allocation: number,
}

export interface DomainLoaderCapabilities {
    supported: boolean,
    firmware_values: string[],
    type_values: string[],
    readonly_values: string[],
    secure_values: string[],
}

export interface DomainCapabilities {
    loader: DomainLoaderCapabilities;
    maxVcpu: optString;
    cpuModels: string[];
    cpuHostModel: optString;
    supportedDiskBusTypes: string[];
    supportsSpice: boolean;
    supportsTPM: boolean;
    interfaceBackends: string[];
}

export interface VM extends VMXML {
    isUi?: undefined; // To discriminate from UIVM, see below

    inactiveXML: VMXML;

    state: VMState;
    persistent: boolean;
    autostart: boolean;

    error?: DetailedError | null;
    installInProgress?: boolean;

    // An operation (shut down or start) has been initiated from this
    // state. If the current state is still the same, we show a
    // spinner.
    operationInProgressFromState?: VMState | undefined;

    capabilities: DomainCapabilities;

    memoryUsed?: number | undefined;
    hasPollingMemBalloonFailure?: boolean | undefined;
    cpuTime?: number | undefined;
    cpuUsage?: number | undefined;
    actualTimeInMs?: number | undefined;
    disksStats?: Record<string, VMDiskStat> | undefined;

    // "false" means "not supported", "undefined" means "not yet loaded"
    snapshots?: VMSnapshot[] | undefined | false;
}

/** "Fake" VMs for the UI only **/

export interface UIVMProps {
    error?: undefined;
    createInProgress?: boolean;
    downloadProgress?: string | undefined;
}

export interface UIVM extends UIVMProps {
    isUi: true;
    connectionName: ConnectionName;
    name: string;
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
    volumes: StorageVolume[];

    error?: DetailedError | null | undefined;
}

export type StoragePoolCapabilites = Record<string, { supported: optString}>;

/** Networks **/

export interface NetworkDhcpHost {
    ip: string;
    name: optString;
    mac: string;
    id: optString;
}

export interface NetworkIp {
    address: optString;
    family: string;
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
        dev: optString;
    };
}

export interface Network extends NetworkXML {
    connectionName: ConnectionName;
    id: string;
    name: string;
    active?: boolean;
    persistent?: boolean;
    autostart?: boolean;
    error?: DetailedError | null;
}

/** Node Devices **/

export interface NodeDeviceCapabilityNet {
    type: "net";
    interface: optString;
}

export interface NodeDeviceCapabilityStorage {
    type: "storage";
    block: optString;
}

export interface NodeDeviceCapabilityMisc {
    type: "misc";
    char: optString;
}

export interface NodeDeviceCapabilityUsbDevice {
    type: "usb_device";
    product: {
        id: optString;
        _value: optString;
    };
    vendor: {
        id: optString;
        _value: optString;
    };
    bus: optString;
    device: optString;
}

export interface NodeDeviceCapabilityPci {
    type: "pci";
    product: {
        id: optString;
        _value: optString;
    };
    vendor: {
        id: optString;
        _value: optString;
    };
    class: optString;
    domain: optString;
    bus: optString;
    function: optString;
    slot: optString;
}

export interface NodeDeviceCapabilityScsi {
    type: "scsi";
    bus: optString;
    lun: optString;
    target: optString;
}

export interface NodeDeviceCapabilityScsiHost {
    type: "scsi_host";
    host: optString;
    uniqueId: optString;
}

export interface NodeDeviceCapabilityMdev {
    type: "mdev";
    uuid: optString;
}

export type NodeDeviceCapability =
    NodeDeviceCapabilityNet
        | NodeDeviceCapabilityStorage
        | NodeDeviceCapabilityMisc
        | NodeDeviceCapabilityUsbDevice
        | NodeDeviceCapabilityPci
        | NodeDeviceCapabilityScsi
        | NodeDeviceCapabilityScsiHost
        | NodeDeviceCapabilityMdev;

export interface NodeDeviceXML {
    name: optString;
    path: optString;
    parent: optString;
    capability: NodeDeviceCapability;
}

export interface NodeDevice extends NodeDeviceXML {
    connectionName: ConnectionName;
    pciSlotName?: string;
    pciClass?: optString;
}

/** Interface **/

export interface NodeInterface {
    name: string;
    MAC: string;
    Active: boolean;
}

/** OSInfo **/

interface OSInfoResources {
    ram?: number;
    storage?: number;
}

interface OSInfoMedia {
    unattendedInstallable: boolean;
    profiles: string;
}

export interface OSInfo {
    // All of these are the empty string when no value is available.
    id: string;
    shortId: string;
    name: string;
    version: string;
    family: string;
    vendor: string;
    releaseDate: string;
    eolDate: string;
    codename: string;

    recommendedResources: OSInfoResources;
    minimumResources: OSInfoResources;

    profiles: string[];
    unattendedInstallable: boolean;
    medias: Record<string, OSInfoMedia>;
    treeInstallable: boolean;
}
