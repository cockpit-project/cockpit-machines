/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2021 Red Hat, Inc.
 */

import cockpit from "cockpit";

import type {
    optString,

    ConnectionName,

    HypervisorCapabilities, GuestCapabilities, DomainLoaderCapabilities,

    VMXML,
    VMOsBoot, VMCpu, VMVcpus,
    VMConsole, VMGraphics, VMWatchdog, VMVsock,
    VMDisk, VMDiskDevice, VMInterface, VMInterfacePortForward,
    VMFilesystem, VMRedirectedDevice,
    VMHostDevice, VMHostDeviceUsb, VMHostDevicePci, VMHostDeviceScsi, VMHostDeviceScsiHost,
    VMHostDeviceMdev, VMHostDeviceStorage, VMHostDeviceMisc, VMHostDeviceNet,
    VMSnapshot,

    StoragePool, StorageVolume, StoragePoolCapabilites,

    NetworkXML, NetworkIp, NetworkDhcpHost,

    NodeDeviceXML, NodeDeviceCapability,
} from './types';

import {
    convertToUnit,
    logDebug,
    rephraseUI,
    units,
    HostDevSourceObject,
} from './helpers.js';

const METADATA_NAMESPACE = "https://github.com/cockpit-project/cockpit-machines";

export function getDiskElemByTarget(domxml: string, targetOriginal: string): string | undefined {
    const domainElem = getElem(domxml);

    const devicesElem = domainElem.getElementsByTagName('devices')[0];
    const diskElems = devicesElem.getElementsByTagName('disk');

    if (diskElems) {
        for (let i = 0; i < diskElems.length; i++) {
            const diskElem = diskElems[i];
            const targetElem = diskElem.getElementsByTagName('target')[0];
            const target = targetElem.getAttribute('dev'); // identifier of the disk, i.e. sda, hdc
            if (target === targetOriginal) {
                return new XMLSerializer().serializeToString(diskElem);
            }
        }
    }
}

export function getHostDevElemBySource(domxml: string, source: HostDevSourceObject): string | undefined {
    const domainElem = getElem(domxml);

    const devicesElem = domainElem.getElementsByTagName('devices')[0];
    if (!devicesElem) {
        console.warn(`Can't parse dumpxml for host devices, devices element is not present`);
        return;
    }

    const hostdevElems = devicesElem.getElementsByTagName('hostdev');

    if (hostdevElems) {
        for (let i = 0; i < hostdevElems.length; i++) {
            const hostdevElem = hostdevElems[i];
            const type = hostdevElem.getAttribute('type');
            const sourceElem = hostdevElem.getElementsByTagName('source')[0];
            if (!sourceElem)
                continue;
            const addressElem = sourceElem.getElementsByTagName('address')[0];

            if (type === "usb" && "vendor" in source && "product" in source) {
                const vendorElem = sourceElem.getElementsByTagName('vendor')[0];
                const productElem = sourceElem.getElementsByTagName('product')[0];
                if (!vendorElem || !productElem)
                    continue;
                const vendor = vendorElem.getAttribute('id');
                const product = productElem.getAttribute('id');

                if (vendor && product && vendor === source.vendor && product === source.product) {
                    if (addressElem) {
                        // If XML does contain bus/device numbers, we have to identify correct hostdev by them
                        const bus = addressElem.getAttribute('bus');
                        const device = addressElem.getAttribute('device');

                        if (bus === source.bus && device === source.device)
                            return new XMLSerializer().serializeToString(hostdevElem);
                    } else {
                        // If XML doesn't contain bus/device numbers, we can identify only by vendor/product ids
                        return new XMLSerializer().serializeToString(hostdevElem);
                    }
                }
            }

            // PCI device
            if (type === "pci" && "bus" in source && "domain" in source && "slot" in source && "func" in source) {
                const bus = addressElem.getAttribute('bus');
                const domain = addressElem.getAttribute('domain');
                const slot = addressElem.getAttribute('slot');
                const func = addressElem.getAttribute('function');

                if (bus && domain && slot && func && domain === source.domain && slot === source.slot && bus === source.bus && func === source.func)
                    return new XMLSerializer().serializeToString(hostdevElem);
            }
        }
    }
}

export function getIfaceElemByMac(domxml: string, mac: string): string | undefined {
    const domainElem = getElem(domxml);

    const devicesElem = domainElem.getElementsByTagName('devices')[0];
    const ifaceElems = devicesElem.getElementsByTagName('interface');

    if (ifaceElems) {
        for (let i = 0; i < ifaceElems.length; i++) {
            const ifaceElem = ifaceElems[i];
            const macElem = ifaceElem.getElementsByTagName('mac')[0];
            const address = macElem.getAttribute('address'); // identifier of the iface
            if (address === mac) {
                return new XMLSerializer().serializeToString(ifaceElem);
            }
        }
    }
}

export function getDoc(xml: string): XMLDocument {
    const parser = new DOMParser();
    const xmlDoc: XMLDocument = parser.parseFromString(xml, "application/xml");
    if (!xmlDoc)
        throw new Error(`Can't parse dumpxml, input: "${xml}"`);
    return xmlDoc;
}

export function getOptionalElem(xml: string): Element | null {
    const xmlDoc = getDoc(xml);
    return xmlDoc.firstElementChild;
}

export function getElem(xml: string): Element {
    const elem = getOptionalElem(xml);
    if (!elem)
        throw new Error(`dumpxml is empty: "${xml}"`);
    return elem;
}

/* Ad-hoc parsing utilities, not used a lot yet.

   We don't use getElementsByTagName etc since those search
   recursively and we don't want that. There is an argument, however,
   that we should just use querySelector instead of the functions here
   to do the parsing.

   These functions are forgiving: You can pass "undefined" as the
   element to parse and they treat that as an empty element.

   - get_child(element, match1, match2, ...)

     Follow the given matches and return the child that they lead to.

     A match can be a string, in which case it is compared against the
     tagName property. It can be an object, in which case the fields
     of the object are compared to the values of attribute of the same
     name. (And "tag" is compared to the tagName property.) It can be
     a function, in which case a element matches when the function
     returns true for it.

   - get_children(element, match1, match2, ...)

     Similar to get_child, but for the last match, all matching
     children are collected into an array.

   - get_text(element, match1, match2, ...)

     Similar to get_child, but return the text content of the element
     found by following the matches.

   - get_attr(element, match1, match2, ..., attr)

     Similar to get_child, but return the value of attribute "attr" of
     the element found by following the matches.

   - get_texts(element, match1, match2, ...)

     Similar to get_children, but instead of the elements themselves,
     their textContent is collected into an array.

   Specialized functions for common libvirt patterns:

   - get_enum_values(element, match1, match2, ..., name)

     Same as get_texts(element, match1, match3, ..., { tag: "enum", name: name }, "value")

 */

type Match = string | Record<string, string> | ((elt: Element) => boolean);

function element_matches(element: Element, match: Match): boolean {
    if (typeof match == "string") {
        return element.tagName == match;
    } else if (typeof match == "object") {
        return Object.entries(match).every(([key, value]) => {
            if (key == "tag")
                return element.tagName == value;
            else
                return element.getAttribute(key) == value;
        });
    } else {
        return match(element);
    }
}

function get_child(parent: Element | undefined, ...matches: Match[]): Element | undefined {
    for (const match of matches) {
        if (!parent)
            return undefined;
        const children = parent.children;
        parent = undefined;
        for (let i = 0; i < children.length; i++) {
            const c = children[i];
            if (element_matches(c, match)) {
                parent = c;
                break;
            }
        }
    }
    return parent;
}

function get_children(parent: Element | undefined, ...matches: Match[]): Element[] {
    if (matches.length == 0)
        return [];

    parent = get_child(parent, ...matches.slice(0, -1));
    if (!parent)
        return [];

    const res = [];
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (element_matches(c, matches[matches.length - 1]))
            res.push(c);
    }
    return res;
}

function get_text(parent: Element | undefined, ...matches: Match[]): string | undefined {
    return get_child(parent, ...matches)?.textContent;
}

function get_attr(parent: Element | undefined, ...matches: Match[]): string | undefined {
    if (matches.length == 0)
        return undefined;
    const attr = matches[matches.length - 1];
    cockpit.assert(typeof attr == "string");
    return get_child(parent, ...matches.slice(0, -1))?.getAttribute(attr) || undefined;
}

function get_texts(parent: Element | undefined, ...matches: Match[]): string[] {
    return get_children(parent, ...matches).map(e => e.textContent);
}

function get_enum_values(parent: Element | undefined, ...matches: Match[]): string[] {
    if (matches.length == 0)
        return [];
    const name = matches[matches.length - 1];
    cockpit.assert(typeof name == "string");
    return get_texts(parent, ...matches.slice(0, -1), { tag: "enum", name }, "value");
}

export function parsePoolCapabilities(capsXML: string): StoragePoolCapabilites {
    const poolCapsElem = getElem(capsXML);
    const poolElements = get_children(poolCapsElem, "pool");

    return poolElements.reduce(function(result: StoragePoolCapabilites, item) {
        const type = item.getAttribute('type');
        const supported = item.getAttribute('supported');
        if (type)
            result[type] = { supported };
        return result;
    }, {});
}

export function getDomainCapMaxVCPU(caps: Element): optString {
    return get_attr(caps, "vcpu", "max");
}

export function getDomainCapLoader(caps: Element): DomainLoaderCapabilities {
    const loaderElem = get_child(caps, "os", "loader");
    return {
        supported: !!loaderElem,
        firmware_values: get_texts(loaderElem, "value"),
        type_values: get_enum_values(loaderElem, "type"),
        readonly_values: get_enum_values(loaderElem, "readonly"),
        secure_values: get_enum_values(loaderElem, "secure"),
    };
}

export function getDomainCapCPUCustomModels(caps: Element): string[] {
    return get_texts(caps, "cpu", { tag: "mode", name: "custom" }, "model");
}

export function getDomainCapCPUHostModel(caps: Element): optString {
    return get_text(caps, "cpu", { tag: "mode", name: "host-model" }, "model");
}

export function getDomainCapDiskBusTypes(caps: Element): string[] {
    return get_enum_values(caps, "devices", "disk", "bus");
}

export function getDomainCapSupportsSpice(caps: Element): boolean {
    const hasSpiceGraphics = get_enum_values(caps, "devices", "graphics", "type").includes("spice");
    const hasSpiceChannel = get_enum_values(caps, "devices", "channel", "type").includes("spicevmc");
    return hasSpiceGraphics || hasSpiceChannel;
}

export function getDomainCapSupportsTPM(caps: Element): boolean {
    return get_enum_values(caps, "devices", "tpm", "model").length > 0;
}

export function getDomainCapInterfaceBackends(caps: Element): string[] {
    return get_enum_values(caps, "devices", "interface", "backendType");
}

export function getSingleOptionalElem(parent: Element, name: string): Element | undefined {
    const subElems = parent.getElementsByTagName(name);
    return subElems.length > 0 ? subElems[0] : undefined; // optional
}

export function parseDomainSnapshotDumpxml(snapshot: string): VMSnapshot {
    const snapElem = getElem(snapshot);
    return {
        name: get_text(snapElem, "name") || "",
        description: get_text(snapElem, "description"),
        parentName: get_text(snapElem, "parent", "name"),
        state: get_text(snapElem, "state") || "",
        creationTime: get_text(snapElem, "creationTime"),
        memoryPath: get_attr(snapElem, "memory", "file"),
    };
}

export function parseDomainDumpxml(connectionName: ConnectionName, domXml: string, objPath: string): VMXML {
    const domainElem = getElem(domXml);

    // Shortcuts to elements that are used more than once.
    const osElem = get_child(domainElem, "os");
    const metadataElem = get_child(domainElem, "metadata");
    const currentMemoryElem = get_child(domainElem, "currentMemory");
    const memoryElem = get_child(domainElem, "memory");
    const devicesElem = get_child(domainElem, "devices");

    return {
        // General
        connectionName,
        name: get_text(domainElem, "name") || "",
        uuid: get_text(domainElem, "uuid") || "",
        description: get_text(domainElem, "description"),
        id: objPath,
        metadata: {
            hasInstallPhase: parseDumpxmlMachinesMetadataElement(metadataElem, 'has_install_phase') === 'true',
            installSourceType: parseDumpxmlMachinesMetadataElement(metadataElem, 'install_source_type'),
            installSource: parseDumpxmlMachinesMetadataElement(metadataElem, 'install_source'),
            osVariant: parseDumpxmlMachinesMetadataElement(metadataElem, 'os_variant'),
            rootPassword: parseDumpxmlMachinesMetadataElement(metadataElem, 'root_password'),
            userLogin: parseDumpxmlMachinesMetadataElement(metadataElem, 'user_login'),
            userPassword: parseDumpxmlMachinesMetadataElement(metadataElem, 'user_password'),
        },

        // OS
        osType: get_text(osElem, "type"),
        arch: get_attr(osElem, "type", "arch"),
        emulatedMachine: get_attr(osElem, "type", "machine"),
        firmware: get_attr(osElem, "firmware"),
        loader: get_text(osElem, "loader"),
        osBoot: parseDumpxmlForOsBoot(get_children(osElem, "boot")),

        // CPUs
        vcpus: parseDumpxmlForVCPU(get_child(domainElem, "vcpu")),
        cpu: parseDumpxmlForCpu(get_child(domainElem, "cpu")),

        // Memory
        currentMemory: convertToUnit(
            get_text(currentMemoryElem),
            get_attr(currentMemoryElem, "unit") || "B",
            units.KiB
        ),
        memory: convertToUnit(
            get_text(memoryElem),
            get_attr(memoryElem, "unit") || "B",
            units.KiB,
        ),
        memoryBacking: !!get_child(domainElem, "memoryBacking"),

        // Devices
        disks: parseDumpxmlForDisks(devicesElem),
        displays: parseDumpxmlForConsoles(devicesElem),
        interfaces: parseDumpxmlForInterfaces(devicesElem),
        redirectedDevices: parseDumpxmlForRedirectedDevices(devicesElem),
        hostDevices: parseDumpxmlForHostDevices(devicesElem),
        filesystems: parseDumpxmlForFilesystems(devicesElem),
        watchdog: parseDumpxmlForWatchdog(devicesElem),
        vsock: parseDumpxmlForVsock(devicesElem),
        hasSpice: parseDumpxmlForSpice(devicesElem),
        hasTPM: !!get_child(devicesElem, 'tpm'),
        hasPollingMemBalloon: !!get_attr(devicesElem, 'memballoon', 'stats', 'period'),
    };
}

export function parseDumpxmlForOsBoot(osBootElems: Element[]): VMOsBoot[] {
    const osBoot: VMOsBoot[] = [];

    for (let bootNum = 0; bootNum < osBootElems.length; bootNum++) {
        const bootElem = osBootElems[bootNum];
        const dev = bootElem.getAttribute('dev');
        if (dev) {
            osBoot.push({
                order: bootNum + 1,
                type: rephraseUI('bootableDisk', dev) // Example: hd, network, fd, cdrom
            });
        }
    }

    return osBoot; // already sorted
}

export function parseDumpxmlForVCPU(vcpuElem: Element | undefined): VMVcpus {
    const current = get_attr(vcpuElem, "current");
    const max = get_text(vcpuElem);
    return {
        count: current || max,
        placement: get_attr(vcpuElem, "placement"),
        max,
    };
}

export function parseDumpxmlForCpu(cpuElem: Element | undefined): VMCpu {
    const cpu: VMCpu = { mode: "", topology: {} };

    if (!cpuElem) {
        return cpu;
    }

    cpu.mode = get_attr(cpuElem, 'mode') || "custom";
    if (cpu.mode === 'custom') {
        cpu.model = get_text(cpuElem, 'model');
    }

    const topologyElem = get_child(cpuElem, 'topology');
    if (topologyElem) {
        cpu.topology.sockets = get_attr(topologyElem, 'sockets');
        cpu.topology.threads = get_attr(topologyElem, 'threads');
        cpu.topology.cores = get_attr(topologyElem, 'cores');
    }

    return cpu;
}

export function parseDumpxmlForConsoles(devicesElem: Element | undefined): VMConsole[] {
    const displays: VMConsole[] = [];
    const graphicsElems = get_children(devicesElem, "graphics");
    for (const graphicsElem of graphicsElems) {
        const display: VMGraphics = {
            type: get_attr(graphicsElem, 'type'),
            port: get_attr(graphicsElem, 'port'),
            tlsPort: get_attr(graphicsElem, 'tlsPort'),
            address: get_attr(graphicsElem, 'listen'),
            password: get_attr(graphicsElem, 'passwd'),
            autoport: get_attr(graphicsElem, 'autoport'),
        };
        if (display.type &&
            (display.autoport ||
                (display.address && (display.port || display.tlsPort)))) {
            displays.push(display);
            logDebug(`parseDumpxmlForConsoles(): graphics device found: ${JSON.stringify(display)}`);
        } else {
            console.warn(`parseDumpxmlForConsoles(): mandatory properties are missing in dumpxml, found: ${JSON.stringify(display)}`);
        }
    }

    // console type='pty'
    const consoleElems = get_children(devicesElem, { tag: "console", type: "pty" });
    for (const consoleElem of consoleElems) {
        displays.push({ type: 'pty', alias: get_attr(consoleElem, 'alias', 'name') });
    }

    return displays;
}

export function parseDumpxmlForCapabilities(capabilitiesXML: string): HypervisorCapabilities {
    const capabilitiesElem = getOptionalElem(capabilitiesXML);
    const capabilities: HypervisorCapabilities = { guests: [] };

    if (capabilitiesElem) {
        for (const guestElem of get_children(capabilitiesElem, 'guest')) {
            const guestCapabilities: GuestCapabilities = { // see https://libvirt.org/formatcaps.html#guest-capabilities
                osType: get_text(guestElem, 'os_type'),
                arch: get_attr(guestElem, 'arch', 'name'),
            };

            const featuresElem = get_child(guestElem, 'features');
            if (featuresElem) {
                guestCapabilities.features = {
                    diskSnapshot: get_attr(featuresElem, 'disksnapshot', 'default') === "yes",
                    externalSnapshot: !!get_child(featuresElem, 'externalSnapshot'),
                };
            }

            capabilities.guests.push(guestCapabilities);
        }
    }

    return capabilities;
}

export function parseDumpxmlForDisks(devicesElem: Element | undefined): Record<string, VMDisk> {
    const disks: Record<string, VMDisk> = {};
    const diskElems = get_children(devicesElem, "disk");
    for (let i = 0; i < diskElems.length; i++) {
        const diskElem = diskElems[i];

        const targetElem = get_child(diskElem, "target");
        const driverElem = get_child(diskElem, 'driver');
        const sourceElem = get_child(diskElem, 'source');

        const target = get_attr(targetElem, 'dev');
        if (target) {
            const disk: VMDisk = { // see https://libvirt.org/formatdomain.html#elementsDisks
                target, // identifier of the disk, i.e. sda, hdc
                driver: {
                    name: get_attr(driverElem, 'name'), // optional
                    type: get_attr(driverElem, 'type'),
                    cache: get_attr(driverElem, 'cache'), // optional
                    discard: get_attr(driverElem, 'discard'), // optional
                    io: get_attr(driverElem, 'io'), // optional
                    errorPolicy: get_attr(driverElem, 'error_policy'), // optional
                },
                bootOrder: get_attr(diskElem, 'boot', 'order'),
                type: get_attr(diskElem, 'type'), // i.e.: file
                snapshot: get_attr(diskElem, 'snapshot'), // i.e.: internal, external
                device: (get_attr(diskElem, 'device') || "disk") as VMDiskDevice, // i.e. cdrom, disk
                source: {
                    file: get_attr(sourceElem, 'file'), // optional file name of the disk
                    dir: get_attr(sourceElem, 'dir'),
                    dev: get_attr(sourceElem, 'dev'),
                    pool: get_attr(sourceElem, 'pool'),
                    volume: get_attr(sourceElem, 'volume'),
                    protocol: get_attr(sourceElem, 'protocol'),
                    name: get_attr(sourceElem, 'name'),
                    host: {
                        name: get_attr(sourceElem, 'host', 'name'),
                        port: get_attr(sourceElem, 'host', 'port'),
                    },
                    startupPolicy: get_attr(sourceElem, 'startupPolicy'), // optional startupPolicy of the disk

                },
                bus: get_attr(targetElem, 'bus'), // i.e. scsi, ide
                serial: get_text(diskElem, 'serial'), // optional serial number
                aliasName: get_attr(diskElem, 'alias', 'name'), // i.e. scsi0-0-0-0, ide0-1-0
                readonly: !!get_child(diskElem, 'readonly'),
                shareable: !!get_child(diskElem, 'shareable'),
                removable: get_attr(targetElem, 'removable'),
            };

            disks[disk.target] = disk;
            logDebug(`parseDumpxmlForDisks(): disk device found: ${JSON.stringify(disk)}`);
        } else {
            console.warn(`parseDumpxmlForDisks(): mandatory target property missing in dumpxml for ${new XMLSerializer().serializeToString(diskElem)}`);
        }
    }

    return disks;
}

export function parseDumpxmlForWatchdog(devicesElem: Element | undefined): VMWatchdog {
    const watchdogElem = get_child(devicesElem, 'watchdog');

    if (watchdogElem) {
        return { // https://libvirt.org/formatdomain.html#watchdog-device
            model: get_attr(watchdogElem, 'model'),
            action: get_attr(watchdogElem, 'action'),
        };
    } else {
        return {};
    }
}

export function parseDumpxmlForVsock(devicesElem: Element | undefined): VMVsock {
    const vsockElem = get_child(devicesElem, 'vsock');
    const cid: VMVsock["cid"] = {};

    if (vsockElem) {
        const cidElem = get_child(vsockElem, 'cid');
        if (cidElem) {
            // https://libvirt.org/formatdomain.html#vsock
            cid.auto = get_attr(cidElem, 'auto');
            cid.address = get_attr(cidElem, 'address');
        }
    }

    return { cid };
}

function parseDumpxmlForSpice(devicesElem: Element | undefined): boolean {
    const spiceElem = get_child(devicesElem, device => {
        // also catch spicevmc
        if (get_attr(device, "type")?.startsWith("spice"))
            return true;
        // qxl video is also related to SPICE
        if (device.tagName === "video" && get_attr(device, "model", "type") === "qxl")
            return true;
        return false;
    });

    return !!spiceElem;
}

export function parseDumpxmlForFilesystems(devicesElem: Element | undefined): VMFilesystem[] {
    const filesystems: VMFilesystem[] = [];
    for (const filesystemElem of get_children(devicesElem, 'filesystem')) {
        const sourceElem = get_child(filesystemElem, 'source');
        const target = get_attr(filesystemElem, 'target', 'dir');
        if (target) {
            const filesystem: VMFilesystem = { // https://libvirt.org/formatdomain.html#filesystems
                accessmode: get_attr(filesystemElem, 'accessmode'),
                readonly: !!get_child(filesystemElem, 'readonly'),
                source: {
                    dir: get_attr(sourceElem, 'dir'),
                    name: get_attr(sourceElem, 'name'),
                    socket: get_attr(sourceElem, 'socket'),
                    file: get_attr(sourceElem, 'file'),
                },
                target: {
                    dir: target,
                },
            };
            filesystems.push(filesystem);
        }
    }

    return filesystems;
}

export function parseDumpxmlForRedirectedDevices(devicesElem: Element | undefined): VMRedirectedDevice[] {
    const redirdevs: VMRedirectedDevice[] = [];
    for (const redirdevElem of get_children(devicesElem, 'redirdev')) {
        const addressElem = get_child(redirdevElem, 'address');
        const sourceElem = get_child(redirdevElem, 'source');
        const dev: VMRedirectedDevice = { // see https://libvirt.org/formatdomain.html#elementsRedir
            bus: get_attr(redirdevElem, 'bus'),
            type: get_attr(redirdevElem, 'type'),
            bootOrder: get_attr(redirdevElem, 'boot', 'order'),
            address: {
                type: get_attr(addressElem, 'type'),
                bus: get_attr(addressElem, 'bus'),
                port: get_attr(addressElem, 'port'),
            },
            source: {
                mode: get_attr(sourceElem, 'mode'),
                host: get_attr(sourceElem, 'host'),
                service: get_attr(sourceElem, 'service'),
            },
        };
        redirdevs.push(dev);
    }

    return redirdevs;
}

export function parseDumpxmlForHostDevices(devicesElem: Element | undefined): VMHostDevice[] {
    const hostdevs: VMHostDevice[] = [];
    for (const hostdevElem of get_children(devicesElem, 'hostdev')) {
        const type = get_attr(hostdevElem, 'type');
        const mode = get_attr(hostdevElem, 'mode');
        const bootOrder = get_attr(hostdevElem, 'boot', 'order');
        const driver = get_attr(hostdevElem, 'driver', 'name');
        const sourceElem = get_child(hostdevElem, 'source');
        const addressElem = get_child(sourceElem, 'address');

        switch (type) {
        case "usb": {
            const dev: VMHostDeviceUsb = {
                type,
                mode,
                bootOrder,
                driver,
                address: {
                    port: get_attr(hostdevElem, 'address', 'port'),
                },
                source: {
                    vendor: {
                        id: get_attr(sourceElem, 'vendor', 'id'),
                    },
                    product: {
                        id: get_attr(sourceElem, 'product', 'id'),
                    },
                    device: get_attr(sourceElem, 'address', 'device'),
                    bus: get_attr(sourceElem, 'address', 'bus'),
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "pci": {
            const dev: VMHostDevicePci = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    address: {
                        domain: get_attr(addressElem, 'domain'),
                        bus: get_attr(addressElem, 'bus'),
                        slot: get_attr(addressElem, 'slot'),
                        func: get_attr(addressElem, 'function'),
                    },
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "scsi": {
            const protocol = get_attr(sourceElem, 'protocol');
            let name;
            if (protocol === "iscsi")
                name = get_attr(sourceElem, 'name');

            const dev: VMHostDeviceScsi = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    protocol,
                    name,
                    address: {
                        bus: get_attr(addressElem, 'bus'),
                        target: get_attr(addressElem, 'target'),
                        unit: get_attr(addressElem, 'unit'),
                    },
                    adapter: {
                        name: get_attr(sourceElem, 'adapter', 'name'),
                    },
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "scsi_host": {
            const dev: VMHostDeviceScsiHost = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    protocol: get_attr(sourceElem, 'protocol'),
                    wwpn: get_attr(sourceElem, 'wwpn'),
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "mdev": {
            const dev: VMHostDeviceMdev = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    address: {
                        uuid: get_attr(addressElem, 'uuid'),
                    },
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "storage": {
            const dev: VMHostDeviceStorage = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    block: get_text(sourceElem, 'block'),
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "misc": {
            const dev: VMHostDeviceMisc = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    char: get_text(sourceElem, 'char'),
                },
            };
            hostdevs.push(dev);
            break;
        }
        case "net": {
            const dev: VMHostDeviceNet = {
                type,
                mode,
                bootOrder,
                driver,
                source: {
                    interface: get_text(sourceElem, 'interface'),
                },
            };
            hostdevs.push(dev);
            break;
        }
        }
    }

    return hostdevs;
}

function parsePortForwards(interfaceElem: Element): VMInterfacePortForward[] {
    return get_children(interfaceElem, 'portForward').map(forwardElem => (
        {
            address: get_attr(forwardElem, "address"),
            dev: get_attr(forwardElem, "dev"),
            proto: get_attr(forwardElem, "proto"),
            range: get_children(forwardElem, 'range').map(rangeElem => (
                {
                    start: get_attr(rangeElem, "start"),
                    end: get_attr(rangeElem, "end"),
                    to: get_attr(rangeElem, "to"),
                    exclude: get_attr(rangeElem, "exclude"),
                }
            )),
        }
    ));
}

export function parseDumpxmlForInterfaces(devicesElem: Element | undefined): VMInterface[] {
    const interfaces: VMInterface[] = [];
    for (const interfaceElem of get_children(devicesElem, 'interface')) {
        const sourceElem = get_child(interfaceElem, 'source');
        const addressElem = get_child(interfaceElem, 'address');

        const networkInterface: VMInterface = { // see https://libvirt.org/formatdomain.html#elementsNICS
            type: get_attr(interfaceElem, 'type') || "", // Only one required parameter
            managed: get_attr(interfaceElem, 'managed'),
            name: get_attr(interfaceElem, 'name'), // Name of interface
            target: get_attr(interfaceElem, 'target', 'dev'),
            mac: get_attr(interfaceElem, 'mac', 'address'), // MAC address
            model: get_attr(interfaceElem, 'model', 'type'), // Device model
            backend: get_attr(interfaceElem, 'backend', 'type'), // User mode backend, such as "passt"
            aliasName: get_attr(interfaceElem, 'alias', 'name'),
            virtualportType: get_attr(interfaceElem, 'virtualport', 'type'),
            driverName: get_attr(interfaceElem, 'driver', 'name'),
            state: get_attr(interfaceElem, 'link', 'state') || 'up', // State of interface, up/down (plug/unplug)
            mtu: get_attr(interfaceElem, 'mtu', 'size'),
            bootOrder: get_attr(interfaceElem, 'boot', 'order'),
            source: {
                bridge: get_attr(sourceElem, 'bridge'),
                network: get_attr(sourceElem, 'network'),
                portgroup: get_attr(sourceElem, 'portgroup'),
                dev: get_attr(sourceElem, 'dev'),
                mode: get_attr(sourceElem, 'mode'),
                address: get_attr(sourceElem, 'address'),
                port: get_attr(sourceElem, 'port'),
                local: {
                    address: get_attr(sourceElem, 'local', 'address'),
                    port: get_attr(sourceElem, 'local', 'port'),
                },
            },
            address: {
                bus: get_attr(addressElem, 'bus'),
                function: get_attr(addressElem, 'function'),
                slot: get_attr(addressElem, 'slot'),
                domain: get_attr(addressElem, 'domain'),
            },
            portForward: parsePortForwards(interfaceElem),
        };
        interfaces.push(networkInterface);
    }

    return interfaces;
}

export function parseDumpxmlMachinesMetadataElement(metadataElem: Element | undefined, name: string): optString {
    if (!metadataElem) {
        return null;
    }
    const subElems = metadataElem.getElementsByTagNameNS(METADATA_NAMESPACE, name);

    return subElems.length > 0 ? subElems[0].textContent : null;
}

export function parseNetDumpxml(netXml: string): NetworkXML {
    const netElem = getElem(netXml);

    let bridge;
    const bridgeElem = get_child(netElem, "bridge");
    if (bridgeElem)
        bridge = { name: get_attr(bridgeElem, "name") };

    // if mode is not specified, "nat" is assumed, see https://libvirt.org/formatnetwork.html#elementsConnect
    let forward;
    const forwardElem = get_child(netElem, "forward");
    if (forwardElem) {
        forward = {
            mode: get_attr(forwardElem, "mode") || "nat",
            dev: get_attr(forwardElem, "interface", "dev"),
        };
    }

    return {
        uuid: get_text(netElem, "uuid"),
        ip: parseNetDumpxmlForIp(get_children(netElem, "ip")),
        mtu: get_attr(netElem, "mtu", "size"),
        ...(bridge ? { bridge } : { }),
        ...(forward ? { forward } : { }),
    };
}

function parseNetDumpxmlForIp(ipElems: Element[]): NetworkIp[] {
    const ip: NetworkIp[] = [];

    for (const ipElem of ipElems) {
        let rangeElem;
        let bootp;
        const dhcpHosts: NetworkDhcpHost[] = [];
        const dhcpElem = get_child(ipElem, "dhcp");
        if (dhcpElem) {
            rangeElem = get_child(dhcpElem, "range");
            for (const hostElem of get_children(dhcpElem, "host")) {
                const host: NetworkDhcpHost = {
                    ip: get_attr(hostElem, "ip") || "",
                    name: get_attr(hostElem, "name"),
                    mac: get_attr(hostElem, "mac") || "",
                    id: get_attr(hostElem, "id"),
                };
                dhcpHosts.push(host);
            }

            const bootpElem = get_child(dhcpElem, "bootp");
            if (bootpElem)
                bootp = { file: get_attr(bootpElem, "file") };
        }

        const tmp: NetworkIp = {
            address: get_attr(ipElem, "address"),
            family: get_attr(ipElem, "family") || "ipv4",
            netmask: get_attr(ipElem, "netmask"),
            prefix: get_attr(ipElem, "prefix"),
            dhcp: {
                range: {
                    start: get_attr(rangeElem, "start"),
                    end: get_attr(rangeElem, "end"),
                },
                hosts: dhcpHosts,
                bootp,
            },
        };

        ip.push(tmp);
    }

    return ip;
}

export function parseNodeDeviceDumpxml(nodeDevice: string): NodeDeviceXML | null {
    const deviceElem = getElem(nodeDevice);

    const capabilityElem = get_child(deviceElem, "capability");
    const type = get_attr(capabilityElem, "type");
    if (!type)
        return null;

    function get_opt_id(elt: Element | undefined, tag: string) {
        return {
            id: get_attr(elt, tag, "id"),
            _value: get_text(elt, tag),
        };
    }

    let capability: NodeDeviceCapability;

    if (type == 'net') {
        capability = {
            type,
            interface: get_text(capabilityElem, "interface"),
        };
    } else if (type == 'storage') {
        capability = {
            type,
            block: get_text(capabilityElem, "block"),
        };
    } else if (type == 'misc') {
        capability = {
            type,
            char: get_text(capabilityElem, "char"),
        };
    } else if (type == 'usb_device') {
        capability = {
            type,
            product: get_opt_id(capabilityElem, "product"),
            vendor: get_opt_id(capabilityElem, "vendor"),
            device: get_text(capabilityElem, "device"),
            bus: get_text(capabilityElem, "bus"),
        };
    } else if (type == 'pci') {
        capability = {
            type,
            product: get_opt_id(capabilityElem, "product"),
            vendor: get_opt_id(capabilityElem, "vendor"),
            class: get_text(capabilityElem, "class"),
            domain: get_text(capabilityElem, "domain"),
            bus: get_text(capabilityElem, "bus"),
            function: get_text(capabilityElem, "function"),
            slot: get_text(capabilityElem, "slot"),
        };
    } else if (type == 'scsi') {
        capability = {
            type,
            bus: get_text(capabilityElem, "bus"),
            lun: get_text(capabilityElem, "lun"),
            target: get_text(capabilityElem, "target"),
        };
    } else if (type == 'scsi_host') {
        capability = {
            type,
            host: get_text(capabilityElem, "host"),
            uniqueId: get_text(capabilityElem, "unique_id"),
        };
    } else if (type == 'mdev') {
        capability = {
            type,
            uuid: get_text(capabilityElem, "uuid"),
        };
    } else {
        return null;
    }

    return {
        name: get_text(deviceElem, "name"),
        path: get_text(deviceElem, "path"),
        parent: get_text(deviceElem, "parent"),
        capability
    };
}

export function parseStoragePoolDumpxml(
    connectionName: ConnectionName,
    storagePoolXml: string,
    objPath: string)
: StoragePool {
    const storagePoolElem = getElem(storagePoolXml);

    const result: StoragePool = {
        connectionName,
        type: get_attr(storagePoolElem, 'type') || "",
        name: get_text(storagePoolElem, 'name') || "",
        id: objPath,
        uuid: get_text(storagePoolElem, "uuid"),
        capacity: get_text(storagePoolElem, 'capacity'),
        available: get_text(storagePoolElem, 'available'),
        allocation: get_text(storagePoolElem, 'allocation'),
        volumes: [],
    };

    // Fetch path property if target is contained for this type of pool
    if (['dir', 'fs', 'netfs', 'logical', 'disk', 'iscsi', 'scsi', 'mpath', 'zfs'].indexOf(result.type) > -1) {
        result.target = { path: get_text(storagePoolElem, 'target', 'path') };
    }
    const sourceElem = get_child(storagePoolElem, 'source');
    if (sourceElem) {
        result.source = {};

        const hostElem = get_child(sourceElem, 'host');
        if (hostElem)
            result.source.host = { name: get_attr(hostElem, 'name') };

        const deviceElem = get_child(sourceElem, 'device');
        if (deviceElem)
            result.source.device = { path: get_attr(deviceElem, 'path') };

        const dirElem = get_child(sourceElem, 'dir');
        if (dirElem)
            result.source.dir = { path: get_attr(dirElem, 'path') };

        result.source.name = get_text(sourceElem, 'name');

        const formatElem = get_child(sourceElem, 'format');
        if (formatElem)
            result.source.format = { type: get_attr(formatElem, 'type') };
    }

    return result;
}

export function parseStorageVolumeDumpxml(
    connectionName: ConnectionName,
    storageVolumeXml: string,
    objPath?: string)
: StorageVolume {
    const storageVolumeElem = getElem(storageVolumeXml);
    return {
        connectionName,
        name: get_text(storageVolumeElem, 'name') || "",
        id: objPath,
        type: get_attr(storageVolumeElem, 'type'),
        path: get_text(storageVolumeElem, 'target', 'path'),
        capacity: get_text(storageVolumeElem, 'capacity'),
        allocation: get_text(storageVolumeElem, 'allocation'),
        physical: get_text(storageVolumeElem, 'physical') || NaN,
        format: get_attr(storageVolumeElem, 'target', 'format', 'type'),
    };
}
