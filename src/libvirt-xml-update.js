import { getDoc, getElem, getSingleOptionalElem } from './libvirt-common.js';
import { getNextAvailableTarget, logDebug } from './helpers.js';

export function updateDisk({ domXml, diskTarget, readonly, shareable, busType, existingTargets, cache }) {
    const s = new XMLSerializer();
    const doc = getDoc(domXml);
    const domainElem = doc.firstElementChild;
    if (!domainElem)
        throw new Error("updateBootOrder: domXML has no domain element");

    const deviceElem = domainElem.getElementsByTagName("devices")[0];
    const disks = deviceElem.getElementsByTagName("disk");

    for (let i = 0; i < disks.length; i++) {
        const disk = disks[i];
        const target = disk.getElementsByTagName("target")[0].getAttribute("dev");
        if (target == diskTarget) {
            let shareAbleElem = getSingleOptionalElem(disk, "shareable");
            if (!shareAbleElem && shareable) {
                shareAbleElem = doc.createElement("shareable");
                disk.appendChild(shareAbleElem);
            } else if (shareAbleElem && !shareable) {
                shareAbleElem.remove();
            }

            let readOnlyElem = getSingleOptionalElem(disk, "readonly");
            if (!readOnlyElem && readonly) {
                readOnlyElem = doc.createElement("readonly");
                disk.appendChild(readOnlyElem);
            } else if (readOnlyElem && !readonly) {
                readOnlyElem.remove();
            }

            const targetElem = disk.getElementsByTagName("target")[0];
            const oldBusType = targetElem.getAttribute("bus");
            if (busType && oldBusType !== busType) {
                targetElem.setAttribute("bus", busType);
                const newTarget = getNextAvailableTarget(existingTargets, busType);
                targetElem.setAttribute("dev", newTarget);

                const addressElem = getSingleOptionalElem(disk, "address");
                addressElem.remove();
            }

            const driverElem = disk.getElementsByTagName("driver")[0];
            if (cache)
                driverElem.setAttribute("cache", cache);
        }
    }

    return s.serializeToString(doc);
}

export function updateBootOrder(domXml, devices) {
    const s = new XMLSerializer();
    const doc = getDoc(domXml);
    const domainElem = doc.firstElementChild;
    if (!domainElem)
        throw new Error("updateBootOrder: domXML has no domain element");

    const deviceElem = domainElem.getElementsByTagName("devices")[0];
    const disks = deviceElem.getElementsByTagName("disk");
    const interfaces = deviceElem.getElementsByTagName("interface");
    const hostdevs = deviceElem.getElementsByTagName("hostdev");
    const redirdevs = deviceElem.getElementsByTagName("redirdev");

    if (devices) {
        // only boot option in devices shall be used, boot options in OS therefore has to be removed
        const osBootElems = domainElem.getElementsByTagName("os")[0].getElementsByTagName("boot");
        while (osBootElems.length)
            osBootElems[0].remove();
    }

    // Update Disks
    for (let i = 0; i < disks.length; i++) {
        const disk = disks[i];
        const target = disk.getElementsByTagName("target")[0].getAttribute("dev");
        const index = devices.findIndex(t => t.device.target === target);

        let bootElem = getSingleOptionalElem(disk, "boot");
        if (index >= 0) { // it will have bootorder
            if (!bootElem) {
                bootElem = doc.createElement("boot");
                disk.appendChild(bootElem);
            }
            bootElem.setAttribute("order", index + 1);
        } else {
            if (bootElem) // it's has boot order, but it's ought to not have one, so we delete it
                bootElem.remove();
        }
    }

    // Update interfaces
    for (let i = 0; i < interfaces.length; i++) {
        const iface = interfaces[i];
        const mac = iface.getElementsByTagName("mac")[0].getAttribute("address");
        const index = devices.findIndex(t => t.device.mac === mac);

        let bootElem = getSingleOptionalElem(iface, "boot");
        if (index >= 0) { // it will have bootorder
            if (!bootElem) {
                bootElem = doc.createElement("boot");
                iface.appendChild(bootElem);
            }
            bootElem.setAttribute("order", index + 1);
        } else {
            if (bootElem) // it's has boot order, but it's ought to not have one, so we delete it
                bootElem.remove();
        }
    }

    // Update redirected devices
    for (let i = 0; i < redirdevs.length; i++) {
        const redirdev = redirdevs[i];
        const port = redirdev.getElementsByTagName("address")[0].getAttribute("port");
        const index = devices.findIndex(t => {
            if (t.device.address)
                return t.device.address.port === port;
        });

        let bootElem = getSingleOptionalElem(redirdev, "boot");
        if (index >= 0) { // it will have bootorder
            if (!bootElem) {
                bootElem = doc.createElement("boot");
                redirdev.appendChild(bootElem);
            }
            bootElem.setAttribute("order", index + 1);
        } else {
            if (bootElem) // it's has boot order, but it's ought to not have one, so we delete it
                bootElem.remove();
        }
    }

    // Update host devices
    for (let i = 0; i < hostdevs.length; i++) {
        const hostdev = hostdevs[i];
        const type = hostdev.getAttribute("type");
        const sourceElem = hostdev.getElementsByTagName("source")[0];
        let bootElem = getSingleOptionalElem(hostdev, "boot");
        let index;

        if (type === "usb") {
            const vendorElem = getSingleOptionalElem(sourceElem, "vendor");
            const productElem = getSingleOptionalElem(sourceElem, "product");
            const addressElem = getSingleOptionalElem(hostdev, "address");

            if (vendorElem && productElem) {
                const vendorId = vendorElem.getAttribute('id');
                const productId = productElem.getAttribute('id');

                index = devices.findIndex(t => {
                    if (t.device.source.vendor && t.device.source.product)
                        return t.device.source.vendor.id === vendorId && t.device.source.product.id === productId;
                    else
                        return false;
                });
            } else if (addressElem) {
                const port = addressElem.getAttribute('port');

                index = devices.findIndex(t => {
                    if (t.device.source.address)
                        return t.device.address.port === port;
                    else
                        return false;
                });
            }
        } else if (type === "pci") {
            const addressElem = hostdev.getElementsByTagName("address")[0];

            const domain = addressElem.getAttribute('domain');
            const bus = addressElem.getAttribute('bus');
            const slot = addressElem.getAttribute('slot');
            const func = addressElem.getAttribute('function');

            index = devices.findIndex(t => {
                if (t.device.source.address)
                    return t.device.source.address.domain === domain &&
                           t.device.source.address.bus === bus &&
                           t.device.source.address.slot === slot &&
                           t.device.source.address.func === func;
                else
                    return false;
            });
        } else if (type === "scsi") {
            const addressElem = getSingleOptionalElem(sourceElem, "address");
            const adapterElem = getSingleOptionalElem(sourceElem, "adapter");

            const protocol = addressElem.getAttribute('protocol');
            const name = addressElem.getAttribute('name');

            if (addressElem && adapterElem) {
                const bus = addressElem.getAttribute('bus');
                const target = addressElem.getAttribute('target');
                const unit = addressElem.getAttribute('unit');
                const adapterName = adapterElem.getAttribute('name');

                index = devices.findIndex(t => {
                    if (t.device.source.address && t.device.source.adapter)
                        return t.device.source.address.bus === bus &&
                               t.device.source.address.target === target &&
                               t.device.source.address.unit === unit &&
                               t.device.source.adapter.adapterName === adapterName;
                    else
                        return false;
                });
            } else if (protocol && name) {
                index = devices.findIndex(t => {
                    if (t.device.source.address)
                        return t.device.source.protocol === protocol &&
                               t.device.source.name === name;
                    else
                        return false;
                });
            }
        } else if (type === "scsi_host") {
            const wwpn = sourceElem.getAttribute('wwpn');
            const protocol = sourceElem.getAttribute('protocol');

            index = devices.findIndex(t => t.device.source.wwpn === wwpn &&
                                           t.device.source.protocol === protocol);
        } else if (type === "mdev") {
            const addressElem = hostdev.getElementsByTagName("address")[0];
            const uuid = addressElem.getAttribute('uuid');

            index = devices.findIndex(t => {
                if (t.device.source.address)
                    return t.device.source.address.uuid === uuid;
                else
                    return false;
            });
        }

        if (index >= 0) { // it will have bootorder
            if (!bootElem) {
                bootElem = doc.createElement("boot");
                hostdev.appendChild(bootElem);
            }
            bootElem.setAttribute("order", index + 1);
        } else {
            if (bootElem) // it's has boot order, but it's ought to not have one, so we delete it
                bootElem.remove();
        }
    }

    return s.serializeToString(doc);
}

/**
 * Returns updated XML description of the network interface specified by mac address.
 * @param  {String} domXml      Domain XML description.
 * @param  {String} macAddress  MAC Address of the network interface we will update.
 * @param  {String} state       Desired state; one of up/down.
 * @return {String}             Updated XML description of the device we will update or null on error.
 */
export function updateNetworkIface({ domXml, macAddress, newMacAddress, networkState, networkModelType, networkType, networkSource }) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(domXml, "application/xml");

    if (!xmlDoc) {
        console.warn(`Can't parse dumpxml, input: "${domXml}"`);
        return null;
    }

    const domainElem = xmlDoc.getElementsByTagName("domain")[0];
    const devicesElem = domainElem.getElementsByTagName("devices")[0];
    const interfaceElems = devicesElem.getElementsByTagName('interface');

    if (interfaceElems) {
        for (let i = 0; i < interfaceElems.length; i++) {
            const interfaceElem = interfaceElems[i];
            const macElem = getSingleOptionalElem(interfaceElem, 'mac');
            if (macElem === undefined)
                return null;
            const mac = macElem.getAttribute('address');

            if (mac !== macAddress)
                continue;

            if (networkState) {
                let linkElem = getSingleOptionalElem(interfaceElem, 'link');
                if (linkElem === undefined) {
                    linkElem = xmlDoc.createElement('link');
                    interfaceElem.appendChild(linkElem);
                }
                linkElem.setAttribute('state', networkState);
            }

            const typeChanged = networkType !== interfaceElem.getAttribute('type', networkType);
            if (networkType) {
                interfaceElem.setAttribute('type', networkType);
            }

            if (networkSource && networkType) {
                let sourceElem = getSingleOptionalElem(interfaceElem, 'source');
                // Source elements of different iface types might contain differently named attributes,
                // so we delete whole element and create a new one
                if (typeChanged && sourceElem) {
                    sourceElem.remove();
                    sourceElem = undefined;
                }
                if (!sourceElem) {
                    sourceElem = xmlDoc.createElement("source");
                    interfaceElem.appendChild(sourceElem);
                }
                if (networkType === 'network')
                    sourceElem.setAttribute('network', networkSource);
                else if (networkType === 'direct')
                    sourceElem.setAttribute('dev', networkSource);
                else if (networkType === 'bridge')
                    sourceElem.setAttribute('bridge', networkSource);
            }

            if (networkModelType) {
                const modelElem = getSingleOptionalElem(interfaceElem, 'model');
                modelElem.setAttribute('type', networkModelType);
            }

            const returnXML = (new XMLSerializer()).serializeToString(interfaceElem);

            logDebug(`updateNetworkIface: Updated XML: "${returnXML}"`);

            return returnXML;
        }
    }
    console.warn("Can't update network interface element in domXml");
    return null;
}

/*
 * This function is used to define only offline attribute of memory.
 */
export function updateMaxMemory(domXml, maxMemory) {
    const doc = getDoc(domXml);
    const domainElem = doc.firstElementChild;
    const s = new XMLSerializer();

    const memElem = domainElem.getElementsByTagName("memory")[0];
    memElem.textContent = `${maxMemory}`;

    return s.serializeToString(doc);
}

export function updateVCPUSettings(domXml, count, max, sockets, cores, threads) {
    const s = new XMLSerializer();
    const doc = getDoc(domXml);
    const domainElem = doc.firstElementChild;
    if (!domainElem)
        throw new Error("updateVCPUSettings: domXML has no domain element");

    let cpuElem = domainElem.getElementsByTagName("cpu")[0];
    if (!cpuElem) {
        cpuElem = doc.createElement("cpu");
        domainElem.appendChild(cpuElem);
    }
    let topologyElem = cpuElem.getElementsByTagName("topology")[0];
    if (!topologyElem) {
        topologyElem = doc.createElement("topology");
        cpuElem.appendChild(topologyElem);
    }
    topologyElem.setAttribute("sockets", sockets);
    topologyElem.setAttribute("threads", threads);
    topologyElem.setAttribute("cores", cores);

    let vcpuElem = domainElem.getElementsByTagName("vcpu")[0];
    if (!vcpuElem) {
        vcpuElem = doc.createElement("vcpu");
        domainElem.appendChild(vcpuElem);
        vcpuElem.setAttribute("placement", "static");
    }

    vcpuElem.setAttribute("current", count);
    vcpuElem.textContent = max;

    return s.serializeToString(doc);
}
