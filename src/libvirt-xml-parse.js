import {
    convertToUnit,
    logDebug,
    rephraseUI,
    units,
} from './helpers.js';

const METADATA_NAMESPACE = "https://github.com/cockpit-project/cockpit-machines";

export function getDiskElemByTarget(domxml, targetOriginal) {
    const domainElem = getElem(domxml);

    if (!domainElem) {
        console.warn(`Can't parse dumpxml, input: "${domainElem}"`);
        return;
    }

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

export function getIfaceElemByMac(domxml, mac) {
    const domainElem = getElem(domxml);

    if (!domainElem) {
        console.warn(`Can't parse dumpxml, input: "${domainElem}"`);
        return;
    }

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

export function getDoc(xml) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "application/xml");

    if (!xmlDoc) {
        console.warn(`Can't parse dumpxml, input: "${xml}"`);
        return;
    }

    return xmlDoc;
}

export function getElem(xml) {
    const xmlDoc = getDoc(xml);

    return xmlDoc.firstElementChild;
}

export function parsePoolCapabilities(capsXML) {
    const poolCapsElem = getElem(capsXML);
    const poolElements = poolCapsElem.getElementsByTagName("pool");

    return Array.prototype.reduce.call(poolElements, function(result, item) {
        const type = item.getAttribute('type');
        const supported = item.getAttribute('supported');
        result[type] = { supported };
        return result;
    }, {});
}

export function getDomainCapMaxVCPU(capsXML) {
    const domainCapsElem = getElem(capsXML);
    const vcpuElem = domainCapsElem.getElementsByTagName("vcpu") && domainCapsElem.getElementsByTagName("vcpu")[0];
    return vcpuElem && vcpuElem.getAttribute('max');
}

export function getDomainCapLoader(capsXML) {
    const domainCapsElem = getElem(capsXML);
    const osElem = domainCapsElem.getElementsByTagName("os") && domainCapsElem.getElementsByTagName("os")[0];
    return osElem && osElem.getElementsByTagName("loader");
}

export function getDomainCapCPUCustomModels(capsXML) {
    const domainCapsElem = getElem(capsXML);
    const cpuElem = domainCapsElem.getElementsByTagName("cpu") && domainCapsElem.getElementsByTagName("cpu")[0];
    const modeElems = cpuElem && cpuElem.getElementsByTagName("mode");
    const customModeElem = modeElems && Array.prototype.find.call(modeElems, modeElem => modeElem.getAttribute("name") == "custom");
    return customModeElem && Array.prototype.map.call(customModeElem.getElementsByTagName("model"), modelElem => modelElem.textContent);
}

export function getDomainCapCPUHostModel(capsXML) {
    const domainCapsElem = getElem(capsXML);
    const cpuElem = domainCapsElem.getElementsByTagName("cpu") && domainCapsElem.getElementsByTagName("cpu")[0];
    const modeElems = cpuElem && cpuElem.getElementsByTagName("mode");
    const hostModelModeElem = modeElems && Array.prototype.find.call(modeElems, modeElem => modeElem.getAttribute("name") == "host-model");
    return hostModelModeElem && Array.prototype.map.call(hostModelModeElem.getElementsByTagName("model"), modelElem => modelElem.textContent)[0];
}

export function getDomainCapDiskBusTypes(capsXML) {
    const domainCapsElem = getElem(capsXML);
    const devicesCapsElem = domainCapsElem.getElementsByTagName("devices") && domainCapsElem.getElementsByTagName("devices")[0];
    const diskCapsElem = devicesCapsElem.getElementsByTagName("disk") && devicesCapsElem.getElementsByTagName("disk")[0];
    const enumElems = diskCapsElem && diskCapsElem.getElementsByTagName("enum");
    const busElem = enumElems && Array.prototype.find.call(enumElems, enumElem => enumElem.getAttribute("name") == "bus");
    return busElem && Array.prototype.map.call(busElem.getElementsByTagName("value"), valueElem => valueElem.textContent);
}

export function getSingleOptionalElem(parent, name) {
    const subElems = parent.getElementsByTagName(name);
    return subElems.length > 0 ? subElems[0] : undefined; // optional
}

export function parseDomainSnapshotDumpxml(snapshot) {
    const snapElem = getElem(snapshot);

    const nameElem = getSingleOptionalElem(snapElem, 'name');
    const descElem = getSingleOptionalElem(snapElem, 'description');
    const parentElem = getSingleOptionalElem(snapElem, 'parent');

    const name = nameElem ? nameElem.childNodes[0].nodeValue : undefined;
    const description = descElem ? descElem.childNodes[0].nodeValue : undefined;
    const parentName = parentElem ? parentElem.getElementsByTagName("name")[0].childNodes[0].nodeValue : undefined;
    const state = snapElem.getElementsByTagName("state")[0].childNodes[0].nodeValue;
    const creationTime = snapElem.getElementsByTagName("creationTime")[0].childNodes[0].nodeValue;

    return { name, description, state, creationTime, parentName };
}

export function parseDomainDumpxml(connectionName, domXml, objPath) {
    const domainElem = getElem(domXml);
    if (!domainElem) {
        return;
    }

    const osElem = domainElem.getElementsByTagNameNS("", "os")[0];
    const currentMemoryElem = domainElem.getElementsByTagName("currentMemory")[0];
    const memoryElem = domainElem.getElementsByTagName("memory")[0];
    const memoryBackingElem = domainElem.getElementsByTagName("memoryBacking")[0];
    const vcpuElem = domainElem.getElementsByTagName("vcpu")[0];
    const cpuElem = domainElem.getElementsByTagName("cpu")[0];
    const vcpuCurrentAttr = vcpuElem.attributes.getNamedItem('current');
    const devicesElem = domainElem.getElementsByTagName("devices")[0];
    const osTypeElem = osElem.getElementsByTagName("type")[0];
    const osBootElems = osElem.getElementsByTagName("boot");
    const metadataElem = getSingleOptionalElem(domainElem, "metadata");

    const name = domainElem.getElementsByTagName("name")[0].childNodes[0].nodeValue;
    const id = objPath;
    const osType = osTypeElem.nodeValue;
    const osBoot = parseDumpxmlForOsBoot(osBootElems);
    const arch = osTypeElem.getAttribute("arch");
    const emulatedMachine = osTypeElem.getAttribute("machine");
    const firmware = osElem.getAttribute("firmware");
    const loaderElem = getSingleOptionalElem(osElem, "loader");

    const currentMemoryUnit = currentMemoryElem.getAttribute("unit");
    const currentMemory = convertToUnit(currentMemoryElem.childNodes[0].nodeValue, currentMemoryUnit, units.KiB);
    const memoryUnit = memoryElem.getAttribute("unit");
    const memory = convertToUnit(memoryElem.childNodes[0].nodeValue, memoryUnit, units.KiB);

    const vcpus = parseDumpxmlForVCPU(vcpuElem, vcpuCurrentAttr);

    const disks = parseDumpxmlForDisks(devicesElem);
    const cpu = parseDumpxmlForCpu(cpuElem);
    const displays = parseDumpxmlForConsoles(devicesElem);
    const interfaces = parseDumpxmlForInterfaces(devicesElem);
    const redirectedDevices = parseDumpxmlForRedirectedDevices(devicesElem);
    const hostDevices = parseDumpxmlForHostDevices(devicesElem);
    const filesystems = parseDumpxmlForFilesystems(devicesElem);

    const hasInstallPhase = parseDumpxmlMachinesMetadataElement(metadataElem, 'has_install_phase') === 'true';
    const installSourceType = parseDumpxmlMachinesMetadataElement(metadataElem, 'install_source_type');
    const installSource = parseDumpxmlMachinesMetadataElement(metadataElem, 'install_source');
    const osVariant = parseDumpxmlMachinesMetadataElement(metadataElem, 'os_variant');

    const metadata = {
        hasInstallPhase,
        installSourceType,
        installSource,
        osVariant,
    };

    return {
        connectionName,
        name,
        id,
        osType,
        osBoot,
        firmware,
        loader: loaderElem ? loaderElem.textContent : undefined,
        arch,
        currentMemory,
        memory,
        memoryBacking: !!memoryBackingElem,
        vcpus,
        disks,
        emulatedMachine,
        cpu,
        displays,
        interfaces,
        redirectedDevices,
        hostDevices,
        filesystems,
        metadata,
    };
}

export function parseDumpxmlForOsBoot(osBootElems) {
    const osBoot = [];

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

export function parseDumpxmlForVCPU(vcpuElem, vcpuCurrentAttr) {
    const vcpus = {};
    vcpus.count = (vcpuCurrentAttr && vcpuCurrentAttr.value) ? vcpuCurrentAttr.value : vcpuElem.childNodes[0].nodeValue;
    vcpus.placement = vcpuElem.getAttribute("placement");
    vcpus.max = vcpuElem.childNodes[0].nodeValue;
    return vcpus;
}

export function parseDumpxmlForCpu(cpuElem) {
    if (!cpuElem) {
        return { topology: {} };
    }

    const cpu = {};

    cpu.mode = cpuElem.getAttribute('mode');
    if (cpu.mode === 'custom') {
        const modelElem = getSingleOptionalElem(cpuElem, 'model');
        if (modelElem) {
            cpu.model = modelElem.childNodes[0].nodeValue; // content of the domain/cpu/model element
        }
    }

    cpu.topology = {};

    const topologyElem = getSingleOptionalElem(cpuElem, 'topology');

    if (topologyElem) {
        cpu.topology.sockets = topologyElem.getAttribute('sockets');
        cpu.topology.threads = topologyElem.getAttribute('threads');
        cpu.topology.cores = topologyElem.getAttribute('cores');
    }

    return cpu;
}

export function parseDumpxmlForConsoles(devicesElem) {
    const displays = [];
    const graphicsElems = devicesElem.getElementsByTagName("graphics");
    if (graphicsElems) {
        for (let i = 0; i < graphicsElems.length; i++) {
            const graphicsElem = graphicsElems[i];
            const display = {
                type: graphicsElem.getAttribute('type'),
                port: graphicsElem.getAttribute('port'),
                tlsPort: graphicsElem.getAttribute('tlsPort'),
                address: graphicsElem.getAttribute('listen'),
                password: graphicsElem.getAttribute('passwd'),
                autoport: graphicsElem.getAttribute('autoport'),
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
    }

    // console type='pty'
    const consoleElems = devicesElem.getElementsByTagName("console");
    if (consoleElems) {
        for (let i = 0; i < consoleElems.length; i++) {
            const consoleElem = consoleElems[i];
            if (consoleElem.getAttribute('type') === 'pty') {
                const aliasElem = getSingleOptionalElem(consoleElem, 'alias');
                displays.push({ type: 'pty', alias: aliasElem ? aliasElem.getAttribute('name') : undefined });
            }
        }
    }

    return displays;
}

export function parseDumpxmlForDisks(devicesElem) {
    const disks = {};
    const diskElems = devicesElem.getElementsByTagName('disk');
    if (diskElems) {
        for (let i = 0; i < diskElems.length; i++) {
            const diskElem = diskElems[i];

            const targetElem = diskElem.getElementsByTagName('target')[0];

            const driverElem = getSingleOptionalElem(diskElem, 'driver');
            const sourceElem = getSingleOptionalElem(diskElem, 'source');
            const serialElem = getSingleOptionalElem(diskElem, 'serial');
            const aliasElem = getSingleOptionalElem(diskElem, 'alias');
            const readonlyElem = getSingleOptionalElem(diskElem, 'readonly');
            const shareableElem = getSingleOptionalElem(diskElem, 'shareable');
            const bootElem = getSingleOptionalElem(diskElem, 'boot');

            const sourceHostElem = sourceElem ? getSingleOptionalElem(sourceElem, 'host') : undefined;

            const disk = { // see https://libvirt.org/formatdomain.html#elementsDisks
                target: targetElem.getAttribute('dev'), // identifier of the disk, i.e. sda, hdc
                driver: {
                    name: driverElem ? driverElem.getAttribute('name') : undefined, // optional
                    type: driverElem ? driverElem.getAttribute('type') : undefined,
                    cache: driverElem ? driverElem.getAttribute('cache') : undefined, // optional
                    discard: driverElem ? driverElem.getAttribute('discard') : undefined, // optional
                    io: driverElem ? driverElem.getAttribute('io') : undefined, // optional
                    errorPolicy: driverElem ? driverElem.getAttribute('error_policy') : undefined, // optional
                },
                bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                type: diskElem.getAttribute('type'), // i.e.: file
                device: diskElem.getAttribute('device'), // i.e. cdrom, disk
                source: {
                    file: sourceElem ? sourceElem.getAttribute('file') : undefined, // optional file name of the disk
                    dev: sourceElem ? sourceElem.getAttribute('dev') : undefined,
                    pool: sourceElem ? sourceElem.getAttribute('pool') : undefined,
                    volume: sourceElem ? sourceElem.getAttribute('volume') : undefined,
                    protocol: sourceElem ? sourceElem.getAttribute('protocol') : undefined,
                    name: sourceElem ? sourceElem.getAttribute('name') : undefined,
                    host: {
                        name: sourceHostElem ? sourceHostElem.getAttribute('name') : undefined,
                        port: sourceHostElem ? sourceHostElem.getAttribute('port') : undefined,
                    },
                    startupPolicy: sourceElem ? sourceElem.getAttribute('startupPolicy') : undefined, // optional startupPolicy of the disk

                },
                bus: targetElem.getAttribute('bus'), // i.e. scsi, ide
                serial: serialElem ? serialElem.getAttribute('serial') : undefined, // optional serial number
                aliasName: aliasElem ? aliasElem.getAttribute('name') : undefined, // i.e. scsi0-0-0-0, ide0-1-0
                readonly: !!readonlyElem,
                shareable: !!shareableElem,
                removable: targetElem.getAttribute('removable'),
            };

            if (disk.target) {
                disks[disk.target] = disk;
                logDebug(`parseDumpxmlForDisks(): disk device found: ${JSON.stringify(disk)}`);
            } else {
                console.warn(`parseDumpxmlForDisks(): mandatory properties are missing in dumpxml, found: ${JSON.stringify(disk)}`);
            }
        }
    }

    return disks;
}

export function parseDumpxmlForFilesystems(devicesElem) {
    const filesystems = [];
    const filesystemElems = devicesElem.getElementsByTagName('filesystem');

    if (filesystemElems) {
        for (let i = 0; i < filesystemElems.length; i++) {
            const filesystemElem = filesystemElems[i];

            const sourceElem = getSingleOptionalElem(filesystemElem, 'source');
            const targetElem = getSingleOptionalElem(filesystemElem, 'target');
            const accessElem = getSingleOptionalElem(filesystemElem, 'readonly');

            const filesystem = { // https://libvirt.org/formatdomain.html#filesystems
                accessmode: filesystemElem.getAttribute('accessmode'),
                readonly: !!accessElem,
                source: {
                    dir: sourceElem.getAttribute('dir'),
                    name: sourceElem.getAttribute('name'),
                    socket: sourceElem.getAttribute('socket'),
                    file: sourceElem.getAttribute('file'),
                },
                target : {
                    dir: targetElem.getAttribute('dir'),
                },
            };
            filesystems.push(filesystem);
        }
    }
    return filesystems;
}

export function parseDumpxmlForRedirectedDevices(devicesElem) {
    const redirdevs = [];
    const redirdevElems = devicesElem.getElementsByTagName('redirdev');

    if (redirdevElems) {
        for (let i = 0; i < redirdevElems.length; i++) {
            const redirdevElem = redirdevElems[i];

            const addressElem = redirdevElem.getElementsByTagName('address')[0];
            const sourceElem = getSingleOptionalElem(redirdevElem, 'source');
            const bootElem = getSingleOptionalElem(redirdevElem, 'boot');

            const dev = { // see https://libvirt.org/formatdomain.html#elementsRedir
                bus: redirdevElem.getAttribute('bus'),
                type: redirdevElem.getAttribute('type'),
                bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                address: {
                    type: addressElem.getAttribute('type'),
                    bus: addressElem.getAttribute('bus'),
                    port: addressElem.getAttribute('port'),
                },
                source: {
                    mode: sourceElem ? sourceElem.getAttribute('mode') : undefined,
                    host: sourceElem ? sourceElem.getAttribute('host') : undefined,
                    service: sourceElem ? sourceElem.getAttribute('service') : undefined,
                },
            };
            redirdevs.push(dev);
        }
    }
    return redirdevs;
}

// TODO Parse more attributes. Right now it parses only necessary
export function parseDumpxmlForHostDevices(devicesElem) {
    const hostdevs = [];
    const hostdevElems = devicesElem.getElementsByTagName('hostdev');

    if (hostdevElems) {
        for (let i = 0; i < hostdevElems.length; i++) {
            const hostdevElem = hostdevElems[i];
            const bootElem = getSingleOptionalElem(hostdevElem, 'boot');
            const type = hostdevElem.getAttribute('type');
            const mode = hostdevElem.getAttribute('mode');
            let dev;

            switch (type) {
            case "usb": {
                const addressElem = getSingleOptionalElem(hostdevElem, 'address');
                const sourceElem = getSingleOptionalElem(hostdevElem, 'source');

                let vendorElem, productElem;
                if (sourceElem) {
                    vendorElem = sourceElem.getElementsByTagName('vendor')[0];
                    productElem = sourceElem.getElementsByTagName('product')[0];
                }
                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    address: {
                        port: addressElem ? addressElem.getAttribute('port') : undefined,
                    },
                    source: {
                        vendor: {
                            id: vendorElem ? vendorElem.getAttribute('id') : undefined,
                        },
                        product: {
                            id: productElem ? productElem.getAttribute('id') : undefined,
                        },
                        device: addressElem.getAttribute('device'),
                        bus: addressElem.getAttribute('bus'),
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "pci": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const addressElem = sourceElem.getElementsByTagName('address')[0];

                let vendorElem, productElem;
                if (sourceElem) {
                    vendorElem = sourceElem.getElementsByTagName('vendor')[0];
                    productElem = sourceElem.getElementsByTagName('product')[0];
                }
                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        address: {
                            vendor: {
                                id: vendorElem ? vendorElem.getAttribute('id') : undefined,
                            },
                            product: {
                                id: productElem ? productElem.getAttribute('id') : undefined,
                            },
                            domain: addressElem.getAttribute('domain'),
                            bus: addressElem.getAttribute('bus'),
                            slot: addressElem.getAttribute('slot'),
                            func: addressElem.getAttribute('function'),
                        },
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "scsi": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const addressElem = getSingleOptionalElem(sourceElem, 'address');
                const adapterElem = getSingleOptionalElem(sourceElem, 'adapter');
                const protocol = sourceElem.getAttribute('protocol');
                let name;
                if (protocol === "iscsi")
                    name = sourceElem.getAttribute('name');

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        protocol: protocol,
                        name: name,
                        address: {
                            bus: addressElem ? addressElem.getAttribute('bus') : undefined,
                            target: addressElem ? addressElem.getAttribute('target') : undefined,
                            unit: addressElem ? addressElem.getAttribute('unit') : undefined,
                        },
                        adapter: {
                            name: adapterElem ? adapterElem.getAttribute('name') : undefined,
                        },
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "scsi_host": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        protocol: sourceElem.getAttribute('protocol'),
                        wwpn: sourceElem.getAttribute('wwpn'),
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "mdev": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const addressElem = sourceElem.getElementsByTagName('address')[0];

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        address: {
                            uuid: addressElem.getAttribute('uuid'),
                        },
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "storage": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const blockElem = sourceElem.getElementsByTagName('block')[0];

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        block: blockElem.childNodes[0].nodeValue
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "misc": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const charElem = sourceElem.getElementsByTagName('char')[0];

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        char: charElem.childNodes[0].nodeValue
                    },
                };
                hostdevs.push(dev);
                break;
            }
            case "net": {
                const sourceElem = hostdevElem.getElementsByTagName('source')[0];
                const interfaceElem = sourceElem.getElementsByTagName('interface')[0];

                dev = {
                    type: type,
                    mode: mode,
                    bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                    source: {
                        interface: interfaceElem.childNodes[0].nodeValue
                    },
                };
                hostdevs.push(dev);
                break;
            }
            }
        }
    }
    return hostdevs;
}

export function parseDumpxmlForInterfaces(devicesElem) {
    const interfaces = [];
    const interfaceElems = devicesElem.getElementsByTagName('interface');
    if (interfaceElems) {
        for (let i = 0; i < interfaceElems.length; i++) {
            const interfaceElem = interfaceElems[i];

            const targetElem = interfaceElem.getElementsByTagName('target')[0];
            const macElem = getSingleOptionalElem(interfaceElem, 'mac');
            const modelElem = getSingleOptionalElem(interfaceElem, 'model');
            const aliasElem = getSingleOptionalElem(interfaceElem, 'alias');
            const sourceElem = getSingleOptionalElem(interfaceElem, 'source');
            const driverElem = getSingleOptionalElem(interfaceElem, 'driver');
            const virtualportElem = getSingleOptionalElem(interfaceElem, 'virtualport');
            const addressElem = getSingleOptionalElem(interfaceElem, 'address');
            const linkElem = getSingleOptionalElem(interfaceElem, 'link');
            const mtuElem = getSingleOptionalElem(interfaceElem, 'mtu');
            const localElem = addressElem ? getSingleOptionalElem(addressElem, 'local') : null;
            const bootElem = getSingleOptionalElem(interfaceElem, 'boot');

            const networkInterface = { // see https://libvirt.org/formatdomain.html#elementsNICS
                type: interfaceElem.getAttribute('type'), // Only one required parameter
                managed: interfaceElem.getAttribute('managed'),
                name: interfaceElem.getAttribute('name') ? interfaceElem.getAttribute('name') : undefined, // Name of interface
                target: targetElem ? targetElem.getAttribute('dev') : undefined,
                mac: macElem.getAttribute('address'), // MAC address
                model: modelElem ? modelElem.getAttribute('type') : undefined, // Device model
                aliasName: aliasElem ? aliasElem.getAttribute('name') : undefined,
                virtualportType: virtualportElem ? virtualportElem.getAttribute('type') : undefined,
                driverName: driverElem ? driverElem.getAttribute('name') : undefined,
                state: linkElem ? linkElem.getAttribute('state') : 'up', // State of interface, up/down (plug/unplug)
                mtu: mtuElem ? mtuElem.getAttribute('size') : undefined,
                bootOrder: bootElem ? bootElem.getAttribute('order') : undefined,
                source: {
                    bridge: sourceElem ? sourceElem.getAttribute('bridge') : undefined,
                    network: sourceElem ? sourceElem.getAttribute('network') : undefined,
                    portgroup: sourceElem ? sourceElem.getAttribute('portgroup') : undefined,
                    dev: sourceElem ? sourceElem.getAttribute('dev') : undefined,
                    mode: sourceElem ? sourceElem.getAttribute('mode') : undefined,
                    address: sourceElem ? sourceElem.getAttribute('address') : undefined,
                    port: sourceElem ? sourceElem.getAttribute('port') : undefined,
                    local: {
                        address: localElem ? localElem.getAttribute('address') : undefined,
                        port: localElem ? localElem.getAttribute('port') : undefined,
                    },
                },
                address: {
                    bus: addressElem ? addressElem.getAttribute('bus') : undefined,
                    function: addressElem ? addressElem.getAttribute('function') : undefined,
                    slot: addressElem ? addressElem.getAttribute('slot') : undefined,
                },
            };
            interfaces.push(networkInterface);
        }
    }
    return interfaces;
}

export function parseDumpxmlMachinesMetadataElement(metadataElem, name) {
    if (!metadataElem) {
        return null;
    }
    const subElems = metadataElem.getElementsByTagNameNS(METADATA_NAMESPACE, name);

    return subElems.length > 0 ? subElems[0].textContent : null;
}

export function parseIfaceDumpxml(ifaceXml) {
    const retObj = {};
    const ifaceElem = getElem(ifaceXml);

    retObj.type = ifaceElem.getAttribute("type");

    return retObj;
}

export function parseNetDumpxml(netXml) {
    const retObj = {};
    const netElem = getElem(netXml);
    if (!netElem) {
        return;
    }

    retObj.uuid = netElem.getElementsByTagName("uuid")[0].childNodes[0].nodeValue;

    const forwardElem = netElem.getElementsByTagName("forward")[0];
    const bridgeElem = netElem.getElementsByTagName("bridge")[0];

    if (bridgeElem)
        retObj.bridge = { name: bridgeElem.getAttribute("name") };

    const ipElems = netElem.getElementsByTagName("ip");
    retObj.ip = parseNetDumpxmlForIp(ipElems);

    const mtuElem = netElem.getElementsByTagName("mtu")[0];
    retObj.mtu = mtuElem ? mtuElem.getAttribute("size") : undefined;

    // if mode is not specified, "nat" is assumed, see https://libvirt.org/formatnetwork.html#elementsConnect
    if (forwardElem) {
        const ifaceElem = forwardElem.getElementsByTagName("interface")[0];
        if (ifaceElem)
            retObj.interface = { interface: { dev: ifaceElem.getAttribute("dev") } };

        retObj.forward = { mode: (forwardElem.getAttribute("mode") || "nat") };
    }

    return retObj;
}

function parseNetDumpxmlForIp(ipElems) {
    const ip = [];

    for (let i = 0; i < ipElems.length; i++) {
        const ipElem = ipElems[i];

        let family = ipElem.getAttribute("family");
        if (!family)
            family = "ipv4";
        const address = ipElem.getAttribute("address");
        const netmask = ipElem.getAttribute("netmask");
        const prefix = ipElem.getAttribute("prefix");
        const dhcpElem = ipElem.getElementsByTagName("dhcp")[0];

        let rangeElem;
        let bootp;
        const dhcpHosts = [];
        if (dhcpElem) {
            rangeElem = dhcpElem.getElementsByTagName("range")[0];
            const hostElems = dhcpElem.getElementsByTagName("host");

            for (let i = 0; i < hostElems.length; i++) {
                const host = {
                    ip : hostElems[i].getAttribute("ip"),
                    name : hostElems[i].getAttribute("name"),
                    mac : hostElems[i].getAttribute("mac"),
                    id : hostElems[i].getAttribute("id"),
                };
                dhcpHosts.push(host);
            }

            const bootpElem = dhcpElem.getElementsByTagName("bootp")[0];
            if (bootpElem)
                bootp = { file: bootpElem.getAttribute("file") };
        }

        const tmp = {
            address: address,
            family: family,
            netmask: netmask,
            prefix: prefix,
            dhcp : {
                range : {
                    start : rangeElem ? rangeElem.getAttribute("start") : undefined,
                    end : rangeElem ? rangeElem.getAttribute("end") : undefined,
                },
                hosts: dhcpHosts,
                bootp,
            },
        };

        ip.push(tmp);
    }

    return ip;
}

export function parseNodeDeviceDumpxml(nodeDevice) {
    const deviceElem = getElem(nodeDevice);
    if (!deviceElem) {
        return;
    }

    const name = deviceElem.getElementsByTagName("name")[0].childNodes[0].nodeValue;
    const pathElem = getSingleOptionalElem(deviceElem, 'path');
    const path = pathElem ? pathElem.childNodes[0].nodeValue : undefined;
    const parentElem = getSingleOptionalElem(deviceElem, 'parent');
    const parentName = parentElem ? parentElem.childNodes[0].nodeValue : undefined;
    const capabilityElem = deviceElem.getElementsByTagName("capability")[0];

    const capability = {};

    capability.type = capabilityElem.getAttribute("type");
    if (capability.type == 'net')
        capability.interface = capabilityElem.getElementsByTagName("interface")[0].childNodes[0].nodeValue;
    else if (capability.type == 'storage')
        capability.block = capabilityElem.getElementsByTagName("block")[0].childNodes[0].nodeValue;
    else if (capability.type == 'misc')
        capability.char = capabilityElem.getElementsByTagName("char")[0].childNodes[0].nodeValue;
    else if (capability.type == 'usb_device' || capability.type == 'pci') {
        capability.product = {};
        capability.vendor = {};

        const productElem = capabilityElem.getElementsByTagName("product")[0];
        const vendorElem = capabilityElem.getElementsByTagName("vendor")[0];
        if (productElem) {
            capability.product.id = productElem.getAttribute("id");
            capability.product._value = productElem.childNodes[0] ? productElem.childNodes[0].nodeValue : undefined;
        }
        if (vendorElem) {
            capability.vendor.id = vendorElem.getAttribute("id");
            capability.vendor._value = vendorElem.childNodes[0] ? vendorElem.childNodes[0].nodeValue : undefined;
        }

        if (capability.type == "pci") {
            const domainElem = capabilityElem.getElementsByTagName("domain")[0];
            const busElem = capabilityElem.getElementsByTagName("bus")[0];
            const functionElem = capabilityElem.getElementsByTagName("function")[0];
            const slotElem = capabilityElem.getElementsByTagName("slot")[0];

            capability.domain = domainElem.childNodes[0] ? domainElem.childNodes[0].nodeValue : undefined;
            capability.bus = busElem.childNodes[0] ? busElem.childNodes[0].nodeValue : undefined;
            capability.function = functionElem.childNodes[0] ? functionElem.childNodes[0].nodeValue : undefined;
            capability.slot = slotElem.childNodes[0] ? slotElem.childNodes[0].nodeValue : undefined;
        } else if (capability.type == "usb_device") {
            const deviceElem = capabilityElem.getElementsByTagName("device")[0];
            const busElem = capabilityElem.getElementsByTagName("bus")[0];

            capability.device = deviceElem.childNodes[0] ? deviceElem.childNodes[0].nodeValue : undefined;
            capability.bus = busElem.childNodes[0] ? busElem.childNodes[0].nodeValue : undefined;
        }
    } else if (capability.type == 'scsi') {
        capability.bus = {};
        capability.lun = {};
        capability.target = {};

        const busElem = capabilityElem.getElementsByTagName("bus")[0];
        const lunElem = capabilityElem.getElementsByTagName("lun")[0];
        const targetElem = capabilityElem.getElementsByTagName("target")[0];

        if (busElem)
            capability.bus._value = busElem.childNodes[0] ? busElem.childNodes[0].nodeValue : undefined;
        if (lunElem)
            capability.lun._value = lunElem.childNodes[0] ? lunElem.childNodes[0].nodeValue : undefined;
        if (targetElem)
            capability.target._value = targetElem.childNodes[0] ? targetElem.childNodes[0].nodeValue : undefined;
    } else if (capability.type == 'scsi_host') {
        capability.host = {};
        capability.uniqueId = {};

        const hostElem = capabilityElem.getElementsByTagName("host")[0];
        const unique_idElem = capabilityElem.getElementsByTagName("unique_id")[0];

        if (hostElem)
            capability.host._value = hostElem.childNodes[0] ? hostElem.childNodes[0].nodeValue : undefined;
        if (unique_idElem)
            capability.uniqueId._value = unique_idElem.childNodes[0] ? unique_idElem.childNodes[0].nodeValue : undefined;
    } else if (capability.type == 'mdev') {
        const uuidElem = capabilityElem.getElementsByTagName("uuid")[0];

        if (uuidElem)
            capability.uuid = uuidElem.childNodes[0] ? uuidElem.childNodes[0].nodeValue : undefined;
    }

    return { name, path, parent: parentName, capability };
}

export function parseStoragePoolDumpxml(connectionName, storagePoolXml, objPath) {
    const storagePoolElem = getElem(storagePoolXml);
    if (!storagePoolElem) {
        return;
    }

    const result = { connectionName };
    result.type = storagePoolElem.getAttribute('type');
    result.name = storagePoolElem.getElementsByTagName('name')[0].childNodes[0].nodeValue;
    result.id = objPath;
    result.uuid = storagePoolElem.getElementsByTagName("uuid")[0].childNodes[0].nodeValue;
    result.capacity = storagePoolElem.getElementsByTagName('capacity')[0].childNodes[0].nodeValue;
    result.available = storagePoolElem.getElementsByTagName('available')[0].childNodes[0].nodeValue;
    result.allocation = storagePoolElem.getElementsByTagName('allocation')[0].childNodes[0].nodeValue;

    // Fetch path property if target is contained for this type of pool
    if (['dir', 'fs', 'netfs', 'logical', 'disk', 'iscsi', 'scsi', 'mpath', 'zfs'].indexOf(result.type) > -1) {
        const targetElem = storagePoolElem.getElementsByTagName('target')[0];
        result.target = { path: getSingleOptionalElem(targetElem, 'path').childNodes[0].nodeValue };
    }
    const sourceElem = storagePoolElem.getElementsByTagName('source')[0];
    if (sourceElem) {
        result.source = {};

        const hostElem = sourceElem.getElementsByTagName('host');
        if (hostElem[0])
            result.source.host = { name: hostElem[0].getAttribute('name') };

        const deviceElem = sourceElem.getElementsByTagName('device');
        if (deviceElem[0])
            result.source.device = { path: deviceElem[0].getAttribute('path') };

        const dirElem = sourceElem.getElementsByTagName('dir');
        if (dirElem[0])
            result.source.dir = { path: dirElem[0].getAttribute('path') };

        const sourceNameElem = sourceElem.getElementsByTagName('name');
        if (sourceNameElem[0])
            result.source.name = sourceNameElem[0].childNodes[0].nodeValue;

        const formatElem = sourceElem.getElementsByTagName('format');
        if (formatElem[0])
            result.source.format = { type: formatElem[0].getAttribute('type') };
    }

    return result;
}

export function parseStorageVolumeDumpxml(connectionName, storageVolumeXml, objPath) {
    const storageVolumeElem = getElem(storageVolumeXml);
    if (!storageVolumeElem) {
        return;
    }
    const type = storageVolumeElem.getAttribute('type');
    const name = storageVolumeElem.getElementsByTagName('name')[0].childNodes[0].nodeValue;
    const id = objPath;
    const targetElem = storageVolumeElem.getElementsByTagName('target')[0];
    const path = getSingleOptionalElem(targetElem, 'path').childNodes[0].nodeValue;
    const capacity = storageVolumeElem.getElementsByTagName('capacity')[0].childNodes[0].nodeValue;
    const allocation = storageVolumeElem.getElementsByTagName('allocation')[0].childNodes[0].nodeValue;
    const physicalElem = storageVolumeElem.getElementsByTagName('physical')[0];
    const physical = physicalElem ? physicalElem.childNodes[0].nodeValue : NaN;
    const formatElem = storageVolumeElem.getElementsByTagName('format')[0];
    const format = formatElem ? formatElem.getAttribute('type') : undefined;
    return {
        connectionName,
        name,
        id,
        type,
        path,
        capacity,
        allocation,
        physical,
        format,
    };
}
