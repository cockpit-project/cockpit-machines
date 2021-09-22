/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2021 Red Hat, Inc.
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

/*
 * Provider for Libvirt using libvirt-dbus API.
 * See https://github.com/libvirt/libvirt-dbus
 */
import cockpit from 'cockpit';
import store from '../store.js';
import VMS_CONFIG from '../config.js';

import installVmScript from 'raw-loader!../scripts/install_machine.py';
import {
    prepareDisksParam,
    prepareDisplaysParam,
    prepareNICParam,
    prepareVcpuParam,
    prepareMemoryParam,
} from '../libvirtUtils.js';
import {
    deleteUnlistedVMs,
    updateOrAddVm,
    updateVm,
} from '../actions/store-actions.js';
import {
    getDiskXML,
    getFilesystemXML,
    getMemoryBackingXML,
} from '../libvirt-xml-create.js';
import {
    finishVmCreateInProgress,
    setVmCreateInProgress,
    setVmInstallInProgress,
    clearVmUiState,
} from '../components/create-vm-dialog/uiState.js';
import {
    convertToUnit,
    DOMAINSTATE,
    fileDownload,
    getNodeDevSource,
    logDebug,
    units,
} from '../helpers.js';
import {
    getDiskElemByTarget,
    getDoc,
    getElem,
    getSingleOptionalElem,
    parseDumpxml,
} from '../libvirt-xml-parse.js';
import {
    deleteFilesystem as deleteFilesystemXML,
    updateBootOrder,
    updateDisk,
    updateMaxMemory,
    updateNetworkIface,
} from '../libvirt-xml-update.js';
import { storagePoolRefresh } from './storagePool.js';
import { snapshotGetAll } from './snapshot.js';
import { call, Enum, timeout, resolveUiState } from './helpers.js';

export const domainCanConsole = (vmState) => vmState == 'running';
export const domainCanDelete = (vmState, vmId) => true;
export const domainCanInstall = (vmState, hasInstallPhase) => vmState != 'running' && hasInstallPhase;
export const domainCanReset = (vmState) => vmState == 'running' || vmState == 'idle' || vmState == 'paused';
export const domainCanRun = (vmState, hasInstallPhase) => !hasInstallPhase && vmState == 'shut off';
export const domainCanSendNMI = (vmState) => domainCanReset(vmState);
export const domainCanShutdown = (vmState) => domainCanReset(vmState);
export const domainCanPause = (vmState) => vmState == 'running';
export const domainCanRename = (vmState) => vmState == 'shut off';
export const domainCanResume = (vmState) => vmState == 'paused';
export const domainIsRunning = (vmState) => domainCanReset(vmState);
export const domainSerialConsoleCommand = ({ vm }) => vm.displays.pty ? ['virsh', ...VMS_CONFIG.Virsh.connections[vm.connectionName].params, 'console', vm.name] : false;

let pythonPath;

function buildConsoleVVFile(consoleDetail) {
    return '[virt-viewer]\n' +
        `type=${consoleDetail.type}\n` +
        `host=${consoleDetail.address}\n` +
        `port=${consoleDetail.port}\n` +
        'delete-this-file=1\n' +
        'fullscreen=0\n';
}

function domainAttachDevice({ connectionName, vmId, permanent, hotplug, xmlDesc }) {
    let flags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    if (hotplug)
        flags |= Enum.VIR_DOMAIN_AFFECT_LIVE;
    if (permanent)
        flags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

    // Error handling is done from the calling side
    return call(connectionName, vmId, 'org.libvirt.Domain', 'AttachDevice', [xmlDesc, flags], { timeout, type: 'su' });
}

export function getPythonPath() {
    return cockpit.spawn(["/bin/sh", "-c", "which /usr/libexec/platform-python 2>/dev/null || which python3 2>/dev/null || which python"]).then(pyexe => { pythonPath = pyexe.trim() });
}

export function domainAttachDisk({
    connectionName,
    type,
    file,
    device,
    poolName,
    volumeName,
    format,
    target,
    vmId,
    vmName,
    permanent,
    hotplug,
    cacheMode,
    shareable,
    busType,
}) {
    const xmlDesc = getDiskXML(type, file, device, poolName, volumeName, format, target, cacheMode, shareable, busType);

    return domainAttachDevice({ connectionName, vmId, permanent, hotplug, xmlDesc });
}

export function domainAttachHostDevice({ connectionName, vmName, live, dev }) {
    const source = getNodeDevSource(dev);
    const args = ["virt-xml", "-c", `qemu:///${connectionName}`, vmName, "--add-device", "--hostdev", source];
    if (live)
        args.push("--update");

    return cockpit.spawn(
        args,
        { superuser: "try", err: "message" }
    );
}

export function domainAttachIface({ connectionName, vmName, mac, permanent, hotplug, sourceType, source, model }) {
    const macArg = mac ? "mac=" + mac + "," : "";
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    let update = "";
    if (hotplug)
        update = "--update";
    let define = "--define";
    if (hotplug && !permanent)
        define = "--no-define";

    return cockpit.script(
        `virt-xml -c qemu:///${connectionName} ${vmName} --add-device --network ${macArg}type=${sourceType},source=${source},model=${model} ${define} ${update}`,
        options
    );
}

export function domainChangeInterfaceSettings({
    name,
    id: objPath,
    connectionName,
    hotplug,
    persistent,
    macAddress,
    newMacAddress,
    networkType,
    networkSource,
    networkModel,
}) {
    /*
     * 0 -> VIR_DOMAIN_AFFECT_CURRENT
     * 1 -> VIR_DOMAIN_AFFECT_LIVE
     * 2 -> VIR_DOMAIN_AFFECT_CONFIG
     */
    let flags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    flags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

    if (newMacAddress && newMacAddress !== macAddress) {
        return domainAttachIface({
            connectionName,
            hotplug,
            vmName: name,
            mac: newMacAddress,
            permanent: persistent,
            sourceType: networkType,
            source: networkSource,
            model: networkModel
        })
                .then(() => domainDetachIface({ connectionName, mac: macAddress, vmName: name, live: hotplug, persistent }));
    } else {
        // Error handling inside the modal dialog this function is called
        return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
                .then(domXml => {
                    const updatedXml = updateNetworkIface({
                        domXml: domXml[0],
                        macAddress,
                        newMacAddress,
                        networkType,
                        networkSource,
                        networkModelType: networkModel
                    });
                    if (!updatedXml) {
                        return Promise.reject(new Error("VM CHANGE_NETWORK_SETTINGS action failed: updated device XML couldn't not be generated"));
                    } else {
                        return call(connectionName, objPath, 'org.libvirt.Domain', 'UpdateDevice', [updatedXml, flags], { timeout, type: 'su' });
                    }
                });
    }
}

export function domainChangeAutostart ({
    connectionName,
    vmName,
    autostart,
}) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainLookupByName', [vmName], { timeout, type: 's' })
            .then(domainPath => {
                const args = ['org.libvirt.Domain', 'Autostart', cockpit.variant('b', autostart)];

                return call(connectionName, domainPath[0], 'org.freedesktop.DBus.Properties', 'Set', args, { timeout, type: 'ssv' });
            });
}

export function domainChangeBootOrder({
    id: objPath,
    connectionName,
    devices,
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const updatedXML = updateBootOrder(domXml, devices);
                return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
            });
}

export function domainChangeInterfaceState({
    connectionName,
    id: objPath,
    name,
    networkMac,
    state,
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' })
            .then(domXml => {
                const updatedXml = updateNetworkIface({ domXml: domXml[0], macAddress: networkMac, networkState: state });
                // updateNetworkIface can fail but we 'll catch the exception from the API call itself that will error on null argument
                return call(connectionName, objPath, 'org.libvirt.Domain', 'UpdateDevice', [updatedXml, Enum.VIR_DOMAIN_AFFECT_CURRENT], { timeout, type: 'su' });
            });
}

export function domainCreate({
    connectionName,
    memorySize,
    os,
    profile,
    rootPassword,
    source,
    sourceType,
    startVm,
    storagePool,
    storageSize,
    storageVolume,
    unattended,
    userLogin,
    userPassword,
    vmName,
}) {
    logDebug(`CREATE_VM(${vmName}):`);
    // shows dummy vm  until we get vm from virsh (cleans up inProgress)
    setVmCreateInProgress(vmName, connectionName, { openConsoleTab: startVm });

    if (startVm) {
        setVmInstallInProgress({ name: vmName, connectionName });
    }

    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    const args = JSON.stringify({
        connectionName,
        memorySize,
        os,
        profile,
        rootPassword,
        source,
        sourceType,
        startVm,
        storagePool,
        storageSize,
        storageVolume,
        type: "create",
        unattended,
        userLogin,
        userPassword,
        vmName,
    });

    return cockpit
            .spawn([pythonPath, "--", "-", args], opts)
            .input(installVmScript)
            .then(() => {
                finishVmCreateInProgress(vmName, connectionName);
                clearVmUiState(vmName, connectionName);
            })
            .fail(ex => {
                clearVmUiState(vmName, connectionName); // inProgress cleanup
                console.info(`spawn 'vm creation' returned error: "${JSON.stringify(ex)}"`);
            });
}

export function domainCreateFilesystem({ connectionName, objPath, source, target, xattr }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const xmlDesc = getFilesystemXML(source, target, xattr);
                if (!xmlDesc) {
                    return Promise.reject(new Error("Could not generate filesystem device XML"));
                } else {
                    const doc = getDoc(domXml);
                    const domainElem = doc.firstElementChild;
                    const deviceElem = domainElem.getElementsByTagName("devices")[0];
                    const filesystemElem = getElem(xmlDesc);
                    const s = new XMLSerializer();

                    deviceElem.appendChild(filesystemElem);

                    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [s.serializeToString(doc)], { timeout, type: 's' });
                }
            });
}

export function domainDelete({
    name,
    connectionName,
    id: objPath,
    options,
    storagePools
}) {
    function destroy() {
        return call(connectionName, objPath, 'org.libvirt.Domain', 'Destroy', [0], { timeout, type: 'u' });
    }

    function undefine() {
        const storageVolPromises = [];
        const flags = Enum.VIR_DOMAIN_UNDEFINE_MANAGED_SAVE | Enum.VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA | Enum.VIR_DOMAIN_UNDEFINE_NVRAM;

        for (let i = 0; i < options.storage.length; i++) {
            const disk = options.storage[i];

            switch (disk.type) {
            case 'file': {
                storageVolPromises.push(
                    call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StorageVolLookupByPath', [disk.source.file], { timeout, type: 's' })
                            .then(volPath => call(connectionName, volPath[0], 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' }))
                            .catch(ex => {
                                if (!ex.message.includes("no storage vol with matching path"))
                                    return Promise.reject(ex);
                                else
                                    return cockpit.file(disk.source.file, { superuser: "try" }).replace(null); // delete key file
                            })
                );
                const pool = storagePools.find(pool => pool.connectionName === connectionName && pool.volumes.some(vol => vol.path === disk.source.file));
                if (pool)
                    storageVolPromises.push(storagePoolRefresh({ connectionName, objPath: pool.id }));
                break;
            }
            case 'volume': {
                storageVolPromises.push(
                    call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [disk.source.pool], { timeout, type: 's' })
                            .then(objPath => call(connectionName, objPath[0], 'org.libvirt.StoragePool', 'StorageVolLookupByName', [disk.source.volume], { timeout, type: 's' }))
                            .then(volPath => call(connectionName, volPath[0], 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' }))
                );
                const pool = storagePools.find(pool => pool.connectionName === connectionName && pool.name === disk.source.pool);
                if (pool)
                    storageVolPromises.push(storagePoolRefresh({ connectionName, objPath: pool.id }));
                break;
            }
            default:
                logDebug("Disks of type $0 are currently ignored during VM deletion".format(disk.type));
            }
        }

        return Promise.all(storageVolPromises)
                .then(() => {
                    return call(connectionName, objPath, 'org.libvirt.Domain', 'Undefine', [flags], { timeout, type: 'u' });
                });
    }

    if (options.destroy) {
        return undefine().then(destroy());
    } else {
        return undefine()
                .catch(ex => {
                    // Transient domains get undefined after shut off
                    if (!ex.message.includes("Domain not found"))
                        return Promise.reject(ex);
                });
    }
}

export function domainDeleteFilesystem({ connectionName, objPath, target }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const xmlDesc = deleteFilesystemXML(domXml[0], target);
                if (!xmlDesc)
                    return Promise.reject(new Error("Could not delete filesystem device"));
                else
                    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [xmlDesc], { timeout, type: 's' });
            });
}

/*
 * Basic, but working.
 * TODO: provide support for more complex scenarios, like with TLS or proxy
 *
 * To try with virt-install: --graphics spice,listen=[external host IP]
 */
export function domainDesktopConsole({
    name,
    consoleDetail
}) {
    logDebug(`CONSOLE_VM(name='${name}'), detail = `, consoleDetail);
    fileDownload({
        data: buildConsoleVVFile(consoleDetail),
        fileName: 'console.vv',
        mimeType: 'application/x-virt-viewer'
    });
}

export function domainDetachDisk({
    name,
    connectionName,
    id: vmPath,
    target,
    live = false,
    persistent
}) {
    let diskXML;
    let detachFlags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    if (live)
        detachFlags |= Enum.VIR_DOMAIN_AFFECT_LIVE;

    return call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' })
            .then(domXml => {
                const getXMLFlags = Enum.VIR_DOMAIN_XML_INACTIVE;
                diskXML = getDiskElemByTarget(domXml[0], target);

                return call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [getXMLFlags], { timeout, type: 'u' });
            })
            .then(domInactiveXml => {
                const diskInactiveXML = getDiskElemByTarget(domInactiveXml[0], target);
                if (diskInactiveXML && persistent)
                    detachFlags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

                return call(connectionName, vmPath, 'org.libvirt.Domain', 'DetachDevice', [diskXML, detachFlags], { timeout, type: 'su' });
            });
}

export function domainDetachHostDevice({ connectionName, vmName, live, dev }) {
    const source = getNodeDevSource(dev);
    const args = ["virt-xml", "-c", `qemu:///${connectionName}`, vmName, "--remove-device", "--hostdev", source];
    if (live)
        args.push("--update");

    return cockpit.spawn(
        args,
        { superuser: "try", err: "message" }
    );
}

export function domainDetachIface({ connectionName, mac, vmName, live, persistent }) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    let update = "";
    if (live)
        update = "--update";
    let define = "--define";
    if (live && !persistent)
        define = "--no-define";

    return cockpit.script(
        `virt-xml -c qemu:///${connectionName} ${vmName} --remove-device --network mac=${mac} ${define} ${update}`,
        options
    );
}

export function domainForceOff({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Destroy', [0], { timeout, type: 'u' });
}

export function domainForceReboot({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Reset', [0], { timeout, type: 'u' });
}

/*
 * Read VM properties of a single VM
 *
 * @param VM object path
 * @returns {Function}
 */
export function domainGet({
    id: objPath,
    connectionName,
    updateOnly,
}) {
    let props = {};
    let domainXML;

    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE], { timeout, type: 'u' })
            .then(domXml => {
                domainXML = domXml[0];
                return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE | Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
            })
            .then(domInactiveXml => {
                const dumpInactiveXmlParams = parseDumpxml(connectionName, domInactiveXml[0], objPath);
                props.inactiveXML = dumpInactiveXmlParams;
                return call(connectionName, objPath, 'org.libvirt.Domain', 'GetState', [0], { timeout, type: 'u' });
            })
            .then(state => {
                const stateStr = DOMAINSTATE[state[0][0]];
                props = Object.assign(props, {
                    connectionName,
                    id: objPath,
                    state: stateStr,
                });

                if (!domainIsRunning(stateStr))
                    props.actualTimeInMs = -1;

                return call(connectionName, objPath, "org.freedesktop.DBus.Properties", "GetAll", ["org.libvirt.Domain"], { timeout, type: 's' });
            })
            .then(function(returnProps) {
                /* Sometimes not all properties are returned, for example when some domain got deleted while part
                 * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
                 */
                if ("Name" in returnProps[0])
                    props.name = returnProps[0].Name.v.v;
                if ("Persistent" in returnProps[0])
                    props.persistent = returnProps[0].Persistent.v.v;
                if ("Autostart" in returnProps[0])
                    props.autostart = returnProps[0].Autostart.v.v;
                props.ui = resolveUiState(props.name, props.connectionName);

                logDebug(`${this.name}.GET_VM(${objPath}, ${connectionName}): update props ${JSON.stringify(props)}`);

                const dumpxmlParams = parseDumpxml(connectionName, domainXML, objPath);
                if (updateOnly)
                    store.dispatch(updateVm(Object.assign({}, props, dumpxmlParams)));
                else
                    store.dispatch(updateOrAddVm(Object.assign({}, props, dumpxmlParams)));

                snapshotGetAll({ connectionName, domainPath: objPath });
            })
            .catch(ex => console.warn("GET_VM action failed for path", objPath, ex.toString()));
}

export function domainGetAll({ connectionName }) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListDomains', [0], { timeout, type: 'u' })
            .then(objPaths => {
                store.dispatch(deleteUnlistedVMs(connectionName, [], objPaths[0]));
                return Promise.all(objPaths[0].map(path => domainGet({ connectionName, id:path })));
            })
            .catch(ex => {
                console.warn('GET_ALL_VMS action failed:', ex.toString());
                return Promise.reject(ex);
            });
}

export function domainGetCapabilities({ connectionName, arch, model }) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'GetDomainCapabilities', ['', arch, model, '', 0], { timeout, type: 'ssssu' });
}

export function domainInstall({ onAddErrorNotification, vm }) {
    logDebug(`INSTALL_VM(${name}):`);
    // shows dummy vm until we get vm from virsh (cleans up inProgress)
    // vm should be returned even if script fails
    setVmInstallInProgress(vm);

    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (vm.connectionName === 'system')
        opts.superuser = 'try';

    const args = JSON.stringify({
        autostart: vm.autostart,
        connectionName: vm.connectionName,
        disks: prepareDisksParam(vm.disks),
        firmware: vm.firmware == "efi" ? 'uefi' : '',
        graphics: prepareDisplaysParam(vm.displays),
        memorySize: prepareMemoryParam(convertToUnit(vm.currentMemory, units.KiB, units.MiB), convertToUnit(vm.memory, units.KiB, units.MiB)),
        os: vm.metadata.osVariant,
        source: vm.metadata.installSource,
        sourceType: vm.metadata.installSourceType,
        type: "install",
        vcpu: prepareVcpuParam(vm.vcpus, vm.cpu),
        vmName: vm.name,
        vnics: prepareNICParam(vm.interfaces),
    });

    return cockpit
            .spawn([pythonPath, "--", "-", args], opts)
            .input(installVmScript)
            .finally(() => clearVmUiState(vm.name, vm.connectionName));
}

export function domainInterfaceAddresses({ connectionName, objPath }) {
    return Promise.allSettled([
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE, 0], { timeout, type: 'uu' }),
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP, 0], { timeout, type: 'uu' }),
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT, 0], { timeout, type: 'uu' })
    ]);
}

export function domainMigrateToUri({ connectionName, objPath, destUri, storage, temporary }) {
    // direct migration is not supported by QEMU, so it's opposite, the P2P migration should always be used
    let flags = Enum.VIR_MIGRATE_PEER2PEER | Enum.VIR_MIGRATE_LIVE;

    if (!temporary)
        flags = flags | Enum.VIR_MIGRATE_PERSIST_DEST;

    if (storage === "copy")
        flags = flags | Enum.VIR_MIGRATE_NON_SHARED_DISK;

    if (!temporary)
        flags = flags | Enum.VIR_MIGRATE_UNDEFINE_SOURCE;

    return call(connectionName, objPath, 'org.libvirt.Domain', 'MigrateToURI3', [destUri, {}, flags], { type: 'sa{sv}u' });
}

export function domainPause({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Suspend', [], { timeout, type: '' });
}

export function domainReboot({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Reboot', [0], { timeout, type: 'u' });
}

export function domainRename({
    connectionName,
    id: objPath,
    newName,
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Rename', [newName, 0], { timeout, type: 'su' });
}

export function domainResume({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Resume', [], { timeout, type: '' });
}

export function domainSendKey({ connectionName, id, keyCodes }) {
    const holdTime = 0;
    const flags = 0;

    return call(connectionName, id, 'org.libvirt.Domain', 'SendKey', [Enum.VIR_KEYCODE_SET_LINUX, holdTime, keyCodes, flags], { timeout, type: "uuauu" });
}

export function domainSendNMI({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'InjectNMI', [0], { timeout, type: 'u' });
}

export function domainSetCpuMode({
    name,
    id: objPath,
    connectionName,
    mode,
    model,
}) {
    const modelStr = model ? `,model=${model}` : "";
    const opts = { err: "message", environ: ['LC_ALL=C'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    return cockpit.spawn([
        'virt-xml', '-c', `qemu:///${connectionName}`, '--cpu', `clearxml=true,mode=${mode}${modelStr}`, name, '--edit'
    ], opts);
}

export function domainSetMemoryBacking({ connectionName, objPath, type, memory }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const doc = getDoc(domXml);
                const domainElem = doc.firstElementChild;
                const s = new XMLSerializer();

                if (!domainElem)
                    throw new Error("setMemoryBacking: domXML has no domain element");

                let memoryBackingElem = domainElem.getElementsByTagName("memoryBacking");
                if (memoryBackingElem.length)
                    return Promise.resolve();

                memoryBackingElem = getMemoryBackingXML(type, memory);

                domainElem.appendChild(getElem(memoryBackingElem));

                return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [s.serializeToString(doc)], { timeout, type: 's' });
            });
}

export function domainSetMemory({
    id: objPath,
    connectionName,
    memory, // in KiB
    isRunning
}) {
    let flags = Enum.VIR_DOMAIN_AFFECT_CONFIG;
    if (isRunning)
        flags |= Enum.VIR_DOMAIN_AFFECT_LIVE;

    return call(connectionName, objPath, 'org.libvirt.Domain', 'SetMemory', [memory, flags], { timeout, type: 'tu' });
}

export function domainSetMaxMemory({
    id: objPath,
    connectionName,
    maxMemory // in KiB
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' })
            .then(domXml => {
                const updatedXML = updateMaxMemory(domXml[0], maxMemory);
                return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
            });
}

export function domainSetOSFirmware({ connectionName, objPath, loaderType }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const s = new XMLSerializer();
                const doc = getDoc(domXml);
                const domainElem = doc.firstElementChild;

                if (!domainElem)
                    throw new Error("setOSFirmware: domXML has no domain element");

                const osElem = domainElem.getElementsByTagNameNS("", "os")[0];
                const loaderElem = getSingleOptionalElem(osElem, "loader");

                if (loaderElem)
                    loaderElem.remove();

                if (!loaderType)
                    osElem.removeAttribute("firmware");
                else
                    osElem.setAttribute("firmware", loaderType);

                domainElem.appendChild(osElem);

                return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [s.serializeToString(doc)], { timeout, type: 's' });
            });
}

export function domainSetVCPUSettings ({
    name,
    connectionName,
    count,
    max,
    sockets,
    cores,
    threads,
    isRunning
}) {
    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    return cockpit.spawn([
        'virt-xml', '-c', `qemu:///${connectionName}`, '--vcpu', `${max},vcpu.current=${count},sockets=${sockets},cores=${cores},threads=${threads}`, name, '--edit'
    ], opts);
}

export function domainShutdown({
    connectionName,
    id: objPath
}) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Shutdown', [0], { timeout, type: 'u' });
}

export function domainStart({ connectionName, id: objPath }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Create', [0], { timeout, type: 'u' });
}

export function domainUpdateDiskAttributes({ connectionName, objPath, target, readonly, shareable, busType, existingTargets, cache }) {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' })
            .then(domXml => {
                const updatedXML = updateDisk({ diskTarget: target, domXml, readonly, shareable, busType, existingTargets, cache });
                return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
            });
}
