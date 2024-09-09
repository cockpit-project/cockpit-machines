/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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
import store from './store.js';

const _ = cockpit.gettext;

export const LIBVIRT_SESSION_CONNECTION = 'session';
export const LIBVIRT_SYSTEM_CONNECTION = 'system';

export function dummyVmsFilter(vms, uiVms) {
    return uiVms.filter(uiVm => vms.find(vm => vm.name == uiVm.name && vm.connectionName == uiVm.connectionName) === undefined);
}

export function toReadableNumber(number) {
    if (number < 1) {
        return Math.floor(number * 100) / 100;
    } else {
        const fixed1 = Math.floor(number * 10) / 10;
        return (number - fixed1 === 0) ? Math.floor(number) : fixed1;
    }
}

export const diskBusTypes = {
    cdrom: ['sata', 'scsi', 'usb'],
    disk: ['sata', 'scsi', 'usb', 'virtio'],
    floppy: ['sata', 'scsi', 'usb', 'virtio'],
    lun: ['sata', 'scsi', 'usb', 'virtio'],
};

export const diskCacheModes = ['default', 'none', 'writethrough', 'writeback', 'directsync', 'unsafe'];

export const units = {
    B: {
        name: "B",
        base1024Exponent: 0,
    },
    KiB: {
        name: "KiB",
        base1024Exponent: 1,
    },
    MiB: {
        name: "MiB",
        base1024Exponent: 2,
    },
    GiB: {
        name: "GiB",
        base1024Exponent: 3,
    },
    TiB: {
        name: "TiB",
        base1024Exponent: 4,
    },
    PiB: {
        name: "PiB",
        base1024Exponent: 5,
    },
    EiB: {
        name: "EiB",
        base1024Exponent: 6,
    },
};

const logUnitMap = {
    0: units.B,
    1: units.KiB,
    2: units.MiB,
    3: units.GiB,
    4: units.TiB,
    5: units.PiB,
    6: units.EiB,
};

function getPowerOf1024(exponent) {
    return exponent === 0 ? 1 : Math.pow(1024, exponent);
}

function getLogarithmOfBase1024(value) {
    return value > 0 ? (Math.floor(Math.log(value) / Math.log(1024))) : 0;
}

export function getBestUnit(input, inputUnit) {
    return logUnitMap[getLogarithmOfBase1024(convertToUnitVerbose(input, inputUnit, units.B).value)];
}

export function convertToBestUnit(input, inputUnit) {
    return convertToUnitVerbose(input, inputUnit,
                                logUnitMap[getLogarithmOfBase1024(convertToUnitVerbose(input, inputUnit, units.B).value)]);
}

export function convertToUnit(input, inputUnit, outputUnit) {
    return convertToUnitVerbose(input, inputUnit, outputUnit).value;
}

export function convertToUnitVerbose(input, inputUnit, outputUnit) {
    const result = {
        value: 0,
        unit: units.B.name,
    };

    input = Number(input);
    if (isNaN(input)) {
        console.error('input is not a number');
        return result;
    }

    if (input < 0) {
        console.error(`input == ${input} cannot be less than zero`);
        return result;
    }

    const inUnit = units[(typeof inputUnit === 'string' ? inputUnit : inputUnit.name)];
    const outUnit = units[(typeof outputUnit === 'string' ? outputUnit : outputUnit.name)];

    if (!inUnit || !outUnit) {
        console.error(`unknown unit ${!inUnit ? inputUnit : outputUnit}`);
        return result;
    }

    const exponentDiff = inUnit.base1024Exponent - outUnit.base1024Exponent;
    if (exponentDiff < 0) {
        result.value = input / getPowerOf1024(-1 * exponentDiff);
    } else {
        result.value = input * getPowerOf1024(exponentDiff);
    }
    result.unit = outUnit.name;

    return result;
}

export function isEmpty(str) {
    return (!str || str.length === 0);
}

export function isObjectEmpty(obj) {
    if (!obj)
        return false;

    return Object.keys(obj).length === 0;
}

export function arrayEquals(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }

    const diff = arr1.filter((v, index) => {
        return v !== arr2[index];
    });
    return diff.length === 0;
}

export function logDebug() {
    if (window.debugging === "all" || window.debugging?.includes("machines"))
        console.debug.apply(console, arguments);
}

export function digitFilter(event, allowDots = false) {
    const accept = (allowDots && event.key === '.') || (event.key >= '0' && event.key <= '9') ||
                 event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Tab' ||
                 event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
                 event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
                 (event.key === 'a' && event.ctrlKey) ||
                 event.key === 'Home' || event.key === 'End';

    if (!accept)
        event.preventDefault();

    return accept;
}

export function getTodayYearShifted(yearDifference) {
    const result = new Date();
    result.setFullYear(result.getFullYear() + yearDifference);
    return result;
}

export const DOMAINSTATE = [
    "no state",
    "running",
    "blocked",
    "paused",
    "shutdown",
    "shut off",
    "crashed",
    "pmsuspended",
];

const transform = {
    autostart: {
        false: _("disabled"),
        true: _("enabled"),
    },
    connections: {
        system: _("System"),
        session: _("User session"),
    },
    resourceStates: {
        running: _("Running"),
        idle: _("Idle"),
        paused: _("Paused"),
        shutdown: _("Shutting down"),
        'shut off': _("Shut off"),
        crashed: _("Crashed"),
        dying: _("Dying"),
        pmsuspended: _("Suspended (PM)"),
        blocked: _("Blocked"),
        'no state': _("No state"),
    },
    bootableDisk: {
        disk: _("disk"),
        cdrom: _("cdrom"),
        interface: _("network"),
        hd: _("disk"),
        redirdev: _("redirected device"),
        hostdev: _("host device"),
    },
    cpuMode: {
        custom: _("custom"),
        'host-model': _("host"),
        'host-passthrough': _("host passthrough")
    },
    networkType: {
        direct: _("direct"),
        network: _("network"),
        bridge: _("bridge"),
        user: _("user"),
        ethernet: _("ethernet"),
        hostdev: _("hostdev"),
        mcast: _("mcast"),
        server: _("server"),
        udp: _("udp"),
        vhostuser: _("vhostuser"),
    },
    networkForward: {
        open: _("Open"),
        nat: "NAT",
        none: _("None (isolated network)"),
        route: "Routed",
        bridge: "Bridge",
        private: _("Private"),
        vepa: "VEPA",
        passthrough: "Passthrough",
        hostdev: "Hostdev",
    },
    networkManaged: {
        yes: _("yes"),
        no: _("no"),
    },
    networkState: {
        up: _("up"),
        down: _("down"),
    },
    watchdogAction: {
        reset: _("Reset"),
        shutdown: _("Gracefully shutdown"),
        poweroff: _("Power off"),
        pause: _("Pause"),
        none: _("Do nothing"),
        dump: _("Dump core"),
        "inject-nmi": _("Inject a non-maskable interrupt"),
    },
};

export function rephraseUI(key, original) {
    if (!(key in transform)) {
        logDebug(`rephraseUI(key='${key}', original='${original}'): unknown key`);
        return original;
    }

    if (!(original in transform[key])) {
        logDebug(`rephraseUI(key='${key}', original='${original}'): unknown original value`);
        return original;
    }

    return transform[key][original];
}

/**
 * Download given content as a file in the browser
 *
 * @param data Content of the file
 * @param fileName
 * @param mimeType
 * @returns {*}
 */
export function fileDownload({ data, fileName = 'myFile.dat', mimeType = 'application/octet-stream' }) {
    if (!data) {
        console.error('fileDownload(): no data to download');
        return false;
    }

    const a = document.createElement('a');
    a.id = 'dynamically-generated-file';
    a.href = `data:${mimeType},${encodeURIComponent(data)}`;
    document.body.appendChild(a); // if not used further then at least within integration tests

    // Workaround since I can't get CSP working for this
    /*
    if ('download' in a) { // html5 A[download]
        logDebug('fileDownload() is using A.HREF');
        a.setAttribute('download', fileName);
        a.click();
    } else */ { // do iframe dataURL download
        logDebug('fileDownload() is using IFRAME');
        const f = document.createElement('iframe');
        document.body.appendChild(f);
        f.setAttribute("hidden", "hidden");
        const nicerText = '\n[...............................GraphicsConsole]\n';
        f.src = `data:${mimeType},${encodeURIComponent(data + nicerText)}`;
        window.setTimeout(() => document.body.removeChild(f), 333);
    }

    window.setTimeout(() => { // give test browser some time ...
        logDebug('removing temporary A.HREF for filedownload');
        document.body.removeChild(a);
    }, 5000);
    return true;
}

export function vmId(vmName) {
    return `vm-${vmName}`;
}

export function networkId(poolName, connectionName) {
    return `network-${poolName}-${connectionName}`;
}

export function storagePoolId(poolName, connectionName) {
    return `pool-${poolName}-${connectionName}`;
}

export function findMatchingNodeDevices(hostdev, nodeDevices) {
    let nodeDevs = [];
    switch (hostdev.type) {
    case "usb": {
        const vendorId = hostdev.source.vendor.id;
        const productId = hostdev.source.product.id;
        const device = hostdev.source.device;
        const bus = hostdev.source.bus;

        nodeDevs = nodeDevices.filter(d => {
            // vendor and product are properties used to identify correct device. But vendor and product
            // are not unique, and in some cases, multiple host devices with same vendor and product can exist.
            // In such cases, optional properties (bus, device) are used in addition to product and vendor to identify correct device
            // But there are cases when usb and device are not specified.
            // If there are 2 usb devices without specified bus/device and same vendor/product,
            // it's impossible to identify which one is the one referred in VM's XML, so we return an array of all matching
            if (vendorId &&
                productId &&
                d.capability.vendor &&
                d.capability.product &&
                d.capability.vendor.id == vendorId &&
                d.capability.product.id == productId) {
                if ((!bus && !device) ||
                    (bus && device && d.capability.bus == bus && d.capability.device == device))
                    return true;
            }
            return false;
        });
        break;
    }
    case "pci": {
        // convert hexadecimal number in string to decimal number in string
        const domain = parseInt(hostdev.source.address.domain, 16).toString();
        const bus = parseInt(hostdev.source.address.bus, 16).toString();
        const slot = parseInt(hostdev.source.address.slot, 16).toString();
        const func = parseInt(hostdev.source.address.func, 16).toString();

        nodeDevs = nodeDevices.filter(d => {
            // pci device is identified by bus, slot, domain, function
            if (bus &&
                slot &&
                func &&
                domain &&
                d.capability.bus == bus &&
                d.capability.slot == slot &&
                d.capability.function == func &&
                d.capability.domain == domain)
                return true;
            return false;
        });
        break;
    }
    case "scsi": {
        const bus = hostdev.source.address.bus;
        const target = hostdev.source.address.target;
        const unit = hostdev.source.address.unit;

        nodeDevs = nodeDevices.filter(d => {
            if ((bus && target && unit) &&
                d.capability.bus &&
                d.capability.lun &&
                d.capability.target &&
                d.capability.bus._value == bus &&
                d.capability.lun._value == unit &&
                d.capability.target._value == target)
                return true;
            return false;
        });
        break;
    }
    case "scsi_host": {
        // TODO implement scsi_host
        break;
    }
    case "mdev": {
        const uuid = hostdev.source.address.uuid;

        nodeDevs = nodeDevices.filter(d => {
            if ((uuid) &&
                d.capability.uuid == uuid)
                return true;
            return false;
        });
        break;
    }
    case "storage": {
        const block = hostdev.source.block;

        nodeDevs = nodeDevices.filter(d => {
            if ((block) &&
                d.capability.block == block)
                return true;
            return false;
        });
        break;
    }
    case "misc": {
        const ch = hostdev.source.char;

        nodeDevs = nodeDevices.filter(d => {
            if ((ch) &&
                d.capability.char == ch)
                return true;
            return false;
        });
        break;
    }
    case "net": {
        const iface = hostdev.source.interface;

        nodeDevs = nodeDevices.filter(d => {
            if ((iface) &&
                d.capability.interface == iface)
                return true;
            return false;
        });
        break;
    }
    }

    return nodeDevs;
}

/**
 * Return and array of all devices which can possibly be assigned boot order:
 * disks, interfaces, redirected devices, host devices
 *
 * @param {object} vm
 * @returns {array}
 */
export function getBootOrderDevices(vm) {
    const devices = [];

    // Create temporary arrays of devices
    const disks = Object.values(vm.disks);
    const ifaces = Object.values(vm.interfaces);

    // Some disks and interfaces may have boot order in vm's XML os->boot (legacy)
    if (vm.osBoot) {
        for (let i = 0; i < vm.osBoot.length; i++) {
            const boot = vm.osBoot[i];

            if (boot.type === "disk" || boot.type === "fd" || boot.type === "cdrom") {
                // Find specific device, and remove it from array, only devices without boot order stay
                const dev = disks.find(disk => {
                    // Disk is default value, if device property is not defined
                    // See: www.libvirt.org/formatdomain.html#elementsDisks
                    const type = disk.device ? disk.device : "disk";
                    return disk.device == type || !disk.device;
                });

                if (dev) {
                    disks.splice(disks.indexOf(dev), 1);
                    devices.push({
                        device: dev,
                        bootOrder: i + 1, // bootOrder begins at 1
                        type: "disk"
                    });
                }
            } else if (boot.type === "network") {
                const dev = ifaces[0];
                if (dev) {
                    ifaces.splice(0, 1);
                    devices.push({
                        device: dev,
                        bootOrder: i + 1, // bootOrder begins at 1
                        type: "network"
                    });
                }
            }
        }
    }

    // if boot order was defined in os->boot (old way), array contains only devices without boot order
    // in case of boot order defined in devices->boot (new way), array contains all devices
    for (let i = 0; i < disks.length; i++) {
        const disk = disks[i];

        devices.push({
            device: disk,
            bootOrder: disk.bootOrder,
            type: "disk"
        });
    }

    // if boot order was defined in os->boot (old way), array contains only devices without boot order
    // in case of boot order defined in devices->boot (new way), array contains all devices
    for (let i = 0; i < ifaces.length; i++) {
        const iface = ifaces[i];

        devices.push({
            device: iface,
            bootOrder: iface.bootOrder,
            type: "network"
        });
    }

    // redirected devices cannot have boot order defined in os->boot
    Object.values(vm.redirectedDevices)
            .forEach(redirdev => {
                devices.push({
                    device: redirdev,
                    bootOrder: redirdev.bootOrder,
                    type: "redirdev"
                });
            });

    // host devices cannot have boot order defined in os->boot
    Object.values(vm.hostDevices)
            .forEach(hostdev => {
                devices.push({
                    device: hostdev,
                    bootOrder: hostdev.bootOrder,
                    type: "hostdev"
                });
            });

    return devices;
}

/**
 * Sorts all devices according to their boot order ascending. Devices with no boot order
 * will be at the end of the array.
 *
 * @param {object} vm
 * @returns {array} = sorted array
 */
export function getSortedBootOrderDevices(vm) {
    const devices = getBootOrderDevices(vm);

    devices.sort((a, b) => {
        // If both devices have boot order, sort them by value of their boot order
        if (typeof a.bootOrder !== 'undefined' && typeof b.bootOrder !== 'undefined')
            return a.bootOrder - b.bootOrder;
        // If device A doesn't have boot order and device B has boot order, B must come before A
        else if (typeof a.bootOrder === 'undefined' && typeof b.bootOrder !== 'undefined')
            return 1;
        // If device A has boot order and device B doesn't have boot order, A must come before B
        else if (typeof a.bootOrder !== 'undefined' && typeof b.bootOrder === 'undefined')
            return -1;
        else
        // If both devices don't have boot order, don't sort them
            return 0;
    });

    return devices;
}

function getVmDisksMap(vms, connectionName) {
    const vmDisksMap = {};

    for (const vm of vms) {
        if (vm.connectionName != connectionName)
            continue;

        if (!(vm.name in vmDisksMap))
            vmDisksMap[vm.name] = [];

        for (const disk in vm.disks) {
            const diskProps = vm.disks[disk];

            if (diskProps.type == 'volume')
                vmDisksMap[vm.name].push({ type: 'volume', pool: diskProps.source.pool, volume: diskProps.source.volume });
            else if (diskProps.type == 'file')
                vmDisksMap[vm.name].push({ type: 'file', source: diskProps.source.file });
            /* Other disk types should be handled as well when we allow their creation from cockpit UI */
        }
    }
    return vmDisksMap;
}

/**
 * Returns a string which represent disk target of volume in VM using the said volume.
 *
 * @param {object} vm
 * @param {object} storagePool
 * @param {string} volumeName
 * @returns {string}
 */
export function getStorageVolumeDiskTarget(vm, storagePool, volumeName) {
    const disks = vm.disks || [];
    const targetPath = storagePool.target ? storagePool.target.path : '';
    const volumePath = targetPath + '/' + volumeName;

    for (const i in disks) {
        const disk = disks[i];
        if ((disk.type == 'volume' && disk.source.volume == volumeName && disk.source.pool == storagePool.name) ||
            (disk.type == 'file' && disk.source.file == volumePath))
            return disk.target;
    }
}

/**
 * Returns a object of key-value pairs of Storage Volume names mapping
 * to arrays of VM names using the relevant Storage Volume
 *
 * @param {object} vms
 * @param {object} storagePool
 * @returns {object}
 */
export function getStorageVolumesUsage(vms, storagePool) {
    if (!storagePool)
        return false;

    // Get a dictionary of vmName -> disks for a specific connection
    const vmDisksMap = getVmDisksMap(vms, storagePool.connectionName);
    const volumes = storagePool.volumes || [];

    // And make it a dictionary of volumeName -> array of Domains using volume
    const isVolumeUsed = {};
    for (const i in volumes) {
        const volumeName = volumes[i].name;
        const targetPath = storagePool.target ? storagePool.target.path : '';
        const volumePath = [targetPath, volumeName].join('/');
        isVolumeUsed[volumeName] = [];

        for (const vmName in vmDisksMap) {
            const disks = vmDisksMap[vmName];

            for (const i in disks) {
                const disk = disks[i];
                if (disk.type == 'volume' && disk.volume == volumeName && disk.pool == storagePool.name)
                    isVolumeUsed[volumeName].push(vmName);

                if (disk.type == 'file' && disk.source == volumePath)
                    isVolumeUsed[volumeName].push(vmName);
            }
        }
    }

    return isVolumeUsed;
}

/**
 * Returns a list of potential physical devices suitable as network devices
 * by merging all network node devices and interfaces.
 *
 * @returns {array}
 */
export function getNetworkDevices() {
    const { nodeDevices, interfaces } = store.getState();
    const devs = [];

    nodeDevices.forEach(dev => {
        if (dev.capability.type === "net")
            devs.push(dev.capability.interface);
    });

    interfaces.forEach(iface => {
        devs.push(iface.name);
    });

    const uniq = [...new Set(devs)];
    uniq.sort();

    return uniq;
}

export function getDefaultVolumeFormat(pool) {
    // For the valid volume format types for different pool types see https://libvirt.org/storage.html
    if (['disk'].indexOf(pool.type) > -1)
        return 'none';

    if (['dir', 'fs', 'netfs', 'gluster', 'vstorage'].indexOf(pool.type) > -1)
        return 'qcow2';

    return null;
}

/**
 * Returns an identifying value which can be used as disk name.
 * Can be file path, url, pool/volume or disk device type (fallback)
 *
 * @param {object} disk
 * @returns {string}
 */
export function getDiskFullName(disk) {
    let name;

    if (["file", "block", "dir"].includes(disk.type)) {
        // file path
        let path;
        if (disk.type === "file")
            path = disk.source.file;
        else if (disk.type === "block")
            path = disk.source.dev;
        else if (disk.type === "dir")
            path = disk.source.dir;

        name = path;
    } else if (disk.type === "network") {
        // url
        name = disk.source.name;
    } else if (disk.type === "volume") {
        // pool/volume
        name = disk.source.pool + '/' + disk.source.volume;
    }

    // fallback
    if (name === undefined)
        name = disk.device;

    return name;
}

/**
 * Returns a shortened pretty version of disk name.
 * File path or pool/volume gets parsed, rest is unmodified.
 *
 * @param {object} disk
 * @returns {string}
 */
export function getDiskPrettyName(disk) {
    let name = getDiskFullName(disk);

    if (["file", "block", "dir"].includes(disk.type) || disk.type === "volume") {
        const parts = name.split('/');
        name = parts[parts.length - 1];
    }

    return name;
}

export function getNextAvailableTarget(existingTargets, busType) {
    let i = 0;
    let prefix = 'vd';
    if (busType !== 'virtio')
        prefix = 'sd';

    while (i < 26) {
        const target = prefix + `${String.fromCharCode(97 + i)}`;
        if (!existingTargets.includes(target))
            return target;
        i++;
    }
}

export function getNodeDevSource(dev) {
    let source;

    if (dev.capability.type === "pci") {
        let domain = Number(dev.capability.domain);
        let bus = Number(dev.capability.bus);
        let slot = Number(dev.capability.slot);
        let func = Number(dev.capability.function);

        domain = domain.toString(16).padStart(4, '0');
        bus = bus.toString(16).padStart(2, '0');
        slot = slot.toString(16).padStart(2, '0');
        func = func.toString(16).padStart(1, '0');

        source = `${domain}:${bus}:${slot}.${func}`;
    } else if (dev.capability.type === "usb_device") {
        const device = dev.devnum;
        const bus = dev.busnum;

        source = `${bus}.${device}`;
    } else {
        console.warn(`getNodeDevSource: unsupported device type '${dev.type}'`);
    }

    return source;
}

export function getHostDevSourceObject(dev) {
    let source;

    if (dev.type === "pci") {
        const domain = dev.source.address.domain;
        const bus = dev.source.address.bus;
        const slot = dev.source.address.slot;
        const func = dev.source.address.func;
        // In pci devices vendor and product is optional
        const vendor = dev.source.vendor && dev.source.vendor.id;
        const product = dev.source.product && dev.source.product.id;

        source = { domain, bus, slot, func, vendor, product };
    } else if (dev.type === "usb") {
        const device = dev.source.device;
        const bus = dev.source.bus;
        const vendor = dev.source.vendor.id;
        const product = dev.source.product.id;

        source = { vendor, product, bus, device };
    } else {
        console.warn(`getHostDevSourceObject: unsupported device type '${dev.type}'`);
    }

    return source;
}

export function getVmStoragePools(connectionName) {
    const { storagePools } = store.getState();
    return storagePools.filter(sp => sp && sp.name && sp.connectionName == connectionName && sp.active);
}

export function nicLookupByMAC(interfacesList, mac) {
    return interfacesList.filter(iface => iface.mac == mac)[0];
}

export function getIfaceSourceName(iface) {
    const mapper = {
        direct: source => source.dev,
        network: source => source.network,
        bridge: source => source.bridge,
        mcast: source => ({ address: source.address, port: source.port }),
        server: source => ({ address: source.address, port: source.port }),
        client: source => ({ address: source.address, port: source.port }),
        udp: source => ({ address: source.address, port: source.port }),
    };

    return mapper[iface.type] && mapper[iface.type](iface.source);
}

export function canDeleteDiskFile(disk) {
    return disk.type === "volume" || (disk.type === "file" && disk.source.file);
}

export function getStoragePoolPath(storagePools, poolName, connectionName) {
    const pool = storagePools.find(pool => pool.name === poolName && pool.connectionName === connectionName);

    return pool?.target?.path;
}

export function vmSupportsExternalSnapshots(config, vm) {
    // External snapshot should only be used if the VM's os types/architecture allow it
    // and if snapshot features are present among guest capabilities:
    // https://libvirt.org/formatcaps.html#guest-capabilities
    if (!config.capabilities?.guests.some(guest => guest.osType === vm.osType &&
                                                   guest.arch === vm.arch &&
                                                   guest.features.externalSnapshot)) {
        logDebug(`vmSupportsExternalSnapshots: vm ${vm.name} has no external snapshot support`);
        return false;
    }

    // If at least one disk has internal snapshot preference specified, use internal snapshot for all disk,
    // as mixing internal and external is not allowed
    const disks = Object.values(vm.disks);
    if (disks.some(disk => disk.snapshot === "internal")) {
        logDebug(`vmSupportsExternalSnapshots: vm ${vm.name} has internal snapshot preference specified`);
        return false;
    }

    // HACK - https://gitlab.com/libvirt/libvirt/-/issues/631
    //
    // Currently external snapshots work only for disks of type
    // "file".  We work around this by making internal snapshots
    // instead in that case. The workaround here should be removed
    // when the bug is fixed. Also see:
    //
    //     https://github.com/cockpit-project/cockpit-machines/pull/1554
    //
    if (!disks.every(disk => disk.type === "file")) {
        logDebug(`vmSupportsExternalSnapshots: vm ${vm.name} has unsupported disk type`);
        return false;
    }

    return true;
}

export function vmHasVFIOHostDevs(vm) {
    return !!vm.hostDevices.find(hd => hd.driver === "vfio");
}
