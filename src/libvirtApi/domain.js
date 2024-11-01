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
import * as python from 'python.js';

import store from '../store.js';
import VMS_CONFIG from '../config.js';

import installVmScript from '../scripts/install_machine.py';
import {
    deleteUnlistedVMs,
    undefineVm,
    updateOrAddVm,
} from '../actions/store-actions.js';
import {
    getDiskXML,
} from '../libvirt-xml-create.js';
import {
    setVmCreateInProgress,
    setVmInstallInProgress,
    updateImageDownloadProgress,
    clearVmUiState,
} from '../components/create-vm-dialog/uiState.js';
import {
    DOMAINSTATE,
    fileDownload,
    getHostDevSourceObject,
    getNodeDevSource,
    LIBVIRT_SYSTEM_CONNECTION,
    logDebug,
} from '../helpers.js';
import {
    getDiskElemByTarget,
    getDoc,
    getDomainCapLoader,
    getDomainCapMaxVCPU,
    getDomainCapCPUCustomModels,
    getDomainCapCPUHostModel,
    getDomainCapDiskBusTypes,
    getDomainCapSupportsSpice,
    getDomainCapSupportsTPM,
    getSingleOptionalElem,
    parseDomainDumpxml,
    getHostDevElemBySource,
} from '../libvirt-xml-parse.js';
import {
    changeMedia,
    updateBootOrder,
    updateDisk,
    updateMaxMemory,
    replaceSpice,
} from '../libvirt-xml-update.js';
import { storagePoolRefresh } from './storagePool.js';
import { snapshotGetAll } from './snapshot.js';
import { downloadRhelImage, getRhelImageUrl } from './rhel-images.js';
import { call, Enum, timeout, resolveUiState } from './helpers.js';
import { CLOUD_IMAGE, DOWNLOAD_AN_OS, LOCAL_INSTALL_MEDIA_SOURCE, needsRHToken } from "../components/create-vm-dialog/createVmDialogUtils.js";

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
export const domainSerialConsoleCommand = ({ vm, alias }) => {
    if (vm.displays.find(display => display.type == 'pty'))
        return ['virsh', ...VMS_CONFIG.Virsh.connections[vm.connectionName].params, 'console', vm.name, alias || ''];
    else
        return false;
};

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
    permanent,
    hotplug,
    cacheMode,
    shareable,
    busType,
    serial,
}) {
    const xmlDesc = getDiskXML(type, file, device, poolName, volumeName, format, target, cacheMode, shareable, busType, serial);

    return domainAttachDevice({ connectionName, vmId, permanent, hotplug, xmlDesc });
}

export function domainAttachHostDevices({ connectionName, vmName, live, devices }) {
    const options = { err: "message" };
    const args = ["virt-xml", "-c", `qemu:///${connectionName}`, vmName];

    devices.forEach(dev => {
        const source = getNodeDevSource(dev);
        if (!source)
            return Promise.reject(new Error(`domainAttachHostDevices: could not determine device's source identifier`));

        args.push("--add-device", "--hostdev", source);
    });

    if (connectionName === "system")
        options.superuser = "try";
    if (live)
        args.push("--update");

    return cockpit.spawn(args, options);
}

export function domainAttachIface({ connectionName, vmName, mac, permanent, hotplug, sourceType, source, model }) {
    const macArg = mac ? "mac=" + mac + "," : "";
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--add-device', '--network', `${macArg}type=${sourceType},source=${source},source.mode=bridge,model=${model}`];
    const options = { err: "message" };

    if (connectionName === "system")
        options.superuser = "try";

    if (hotplug) {
        args.push("--update");
        if (!permanent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export function domainChangeInterfaceSettings({
    vmName,
    connectionName,
    hotplug,
    persistent,
    macAddress,
    newMacAddress,
    networkType,
    networkSource,
    networkModel,
    state,
}) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    let networkParams = "";
    if (state) {
        networkParams = `link.state=${state}`;
    } else {
        if (newMacAddress)
            networkParams += `mac=${newMacAddress},`;
        if (networkType) {
            networkParams += `type=${networkType},`;
            if (networkType == `direct`)
                networkParams += `source.mode=bridge,`;
        }
        if (networkSource)
            networkParams += `source=${networkSource},`;
        if (networkModel)
            networkParams += `model=${networkModel},`;
    }

    const args = [
        "virt-xml", "-c", `qemu:///${connectionName}`,
        vmName, "--edit", `mac=${macAddress}`, "--network",
        networkParams
    ];

    if (hotplug) {
        args.push("--update");
        if (!persistent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export async function domainChangeAutostart ({
    connectionName,
    vmName,
    autostart,
}) {
    const [domainPath] = await call(
        connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainLookupByName',
        [vmName], { timeout, type: 's' });
    await call(
        connectionName, domainPath, 'org.freedesktop.DBus.Properties', 'Set',
        ['org.libvirt.Domain', 'Autostart', cockpit.variant('b', autostart)],
        { timeout, type: 'ssv' });
}

export async function domainChangeBootOrder({
    id: objPath,
    connectionName,
    devices,
}) {
    const [domXml] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const updatedXML = updateBootOrder(domXml, devices);
    await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
}

export async function domainCreate({
    connectionName,
    memorySize,
    os,
    osVersion,
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
    accessToken,
    loggedUser,
    sshKeys,
}) {
    // shows dummy vm  until we get vm from virsh (cleans up inProgress)
    setVmCreateInProgress(vmName, connectionName, { openConsoleTab: startVm });

    if (startVm) {
        setVmInstallInProgress({ name: vmName, connectionName });
    }

    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    const args = {
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
        sshKeys,
    };

    logDebug(`CREATE_VM(${vmName}): install_machine.py '${JSON.stringify(args)}'`);

    const hashPasswords = async args => {
        if (args.sourceType === CLOUD_IMAGE) {
            const promises = [];
            const options = { err: "message" };
            if (args.userPassword)
                promises.push(cockpit.spawn(['openssl', 'passwd', '-5', args.userPassword], options));
            if (args.rootPassword)
                promises.push(cockpit.spawn(['openssl', 'passwd', '-5', args.rootPassword], options));

            const ret = await Promise.all(promises);
            if (args.userPassword)
                args.userPassword = ret.shift().trim();
            if (args.rootPassword)
                args.rootPassword = ret.shift().trim();
        }
    };

    try {
        /* try to download RHEL image */
        if (sourceType == DOWNLOAD_AN_OS && needsRHToken(os)) {
            const options = { err: "message" };
            if (connectionName === "system")
                options.superuser = "try";

            const arch = (await cockpit.spawn(['uname', '-m'], options)).trim();
            const outObj = JSON.parse(await getRhelImageUrl(accessToken, osVersion, arch));
            const url = outObj.url;
            const filename = outObj.filename;
            const isSystem = connectionName === LIBVIRT_SYSTEM_CONNECTION;
            const downloadDir = isSystem ? "/var/lib/libvirt/images/" : loggedUser.home + "/.local/share/libvirt/images/";
            args.sourceType = LOCAL_INSTALL_MEDIA_SOURCE;
            args.source = downloadDir + filename;

            let buffer = "";
            await downloadRhelImage(accessToken, url, filename, downloadDir, isSystem)
                    .stream(progress => {
                        buffer += progress;
                        const chunks = buffer.split("\n");
                        buffer = chunks.pop();

                        if (chunks.length > 0)
                            updateImageDownloadProgress(vmName, connectionName, chunks.pop());
                    });
        }

        await hashPasswords(args);
        await python.spawn(installVmScript, [JSON.stringify(args)], opts);
    } catch (ex) {
        clearVmUiState(vmName, connectionName);
        throw ex;
    }
}

export function domainCreateFilesystem({ connectionName, vmName, source, target, xattr }) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    let xattrOption = "";
    if (xattr)
        xattrOption = ",binary.xattr=on";

    return cockpit.spawn(
        [
            'virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--add-device', '--filesystem',
            `type=mount,accessmode=passthrough,driver.type=virtiofs,source.dir=${source},target.dir=${target}${xattrOption}`
        ],
        options
    );
}

export async function domainDelete({
    connectionName,
    id: objPath,
    live,
}) {
    if (live)
        await call(connectionName, objPath, 'org.libvirt.Domain', 'Destroy', [0], { timeout, type: 'u' });

    try {
        const flags = Enum.VIR_DOMAIN_UNDEFINE_MANAGED_SAVE | Enum.VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA | Enum.VIR_DOMAIN_UNDEFINE_NVRAM;

        await call(connectionName, objPath, 'org.libvirt.Domain', 'Undefine', [flags], { timeout, type: 'u' });
    } catch (ex) {
        // Transient domains get undefined after shut off
        if (!live || !ex.message.includes("Domain not found"))
            throw ex;
    }
}

export function domainDeleteStorage({
    connectionName,
    storage,
    storagePools
}) {
    const storageVolPromises = [];

    storage.forEach(disk => {
        switch (disk.type) {
        case 'file': {
            logDebug(`deleteStorage: deleting file storage ${disk.source.file}`);

            storageVolPromises.push(
                call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StorageVolLookupByPath', [disk.source.file], { timeout, type: 's' })
                        .then(([volPath]) => call(connectionName, volPath, 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' }))
                        .catch(ex => {
                            if (!ex.message.includes("no storage vol with matching"))
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
            logDebug(`deleteStorage: deleting volume storage ${disk.source.volume} on pool ${disk.source.pool}`);
            storageVolPromises.push(
                call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName', [disk.source.pool], { timeout, type: 's' })
                        .then(([objPath]) => call(connectionName, objPath, 'org.libvirt.StoragePool', 'StorageVolLookupByName', [disk.source.volume], { timeout, type: 's' }))
                        .then(([volPath]) => call(connectionName, volPath, 'org.libvirt.StorageVol', 'Delete', [0], { timeout, type: 'u' }))
            );
            const pool = storagePools.find(pool => pool.connectionName === connectionName && pool.name === disk.source.pool);
            if (pool)
                storageVolPromises.push(storagePoolRefresh({ connectionName, objPath: pool.id }));
            break;
        }
        default:
            logDebug("Disks of type $0 are currently ignored during VM deletion".format(disk.type));
        }
    });

    if (storage.length > 0 && storageVolPromises.length == 0)
        return Promise.reject(new Error("Could not find storage file to delete."));

    return Promise.allSettled(storageVolPromises).then(results => {
        const rejectedMsgs = results.filter(result => result.status == "rejected").map(result => result.reason?.message);
        if (rejectedMsgs.length > 0) {
            return Promise.reject(rejectedMsgs.join(", "));
        } else {
            return Promise.resolve();
        }
    });
}

export function domainDeleteFilesystem({ connectionName, vmName, target }) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    return cockpit.spawn(
        ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--remove-device', '--filesystem', `target.dir=${target}`],
        options
    );
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

export async function domainDetachDisk({
    connectionName,
    id: vmPath,
    target,
    live = false,
    persistent
}) {
    let detachFlags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    if (live)
        detachFlags |= Enum.VIR_DOMAIN_AFFECT_LIVE;

    const [domXml] = await call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
    const diskXML = getDiskElemByTarget(domXml, target);

    const [domInactiveXml] = await call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });

    const diskInactiveXML = getDiskElemByTarget(domInactiveXml, target);
    if (diskInactiveXML && persistent)
        detachFlags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

    await call(connectionName, vmPath, 'org.libvirt.Domain', 'DetachDevice', [diskXML, detachFlags], { timeout, type: 'su' });
}

// Cannot use virt-xml until https://github.com/virt-manager/virt-manager/issues/357 is fixed
export async function domainDetachHostDevice({ connectionName, vmId, live, dev }) {
    const source = getHostDevSourceObject(dev);
    if (!source)
        throw new Error("domainDetachHostDevice: could not determine device's source identifier");

    // hostdev's <address bus=... device=...> may be different between live XML and offline XML (or it may be present in live XML but missing in offline XML)
    // therefore we need to call DetachDevice twice with different hostdevXMLs, once for live XML and once for offline XML
    const [domInactiveXml] = await call(connectionName, vmId, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const hostdevInactiveXML = getHostDevElemBySource(domInactiveXml, source);
    if (hostdevInactiveXML)
        await call(connectionName, vmId, 'org.libvirt.Domain', 'DetachDevice', [hostdevInactiveXML, Enum.VIR_DOMAIN_AFFECT_CONFIG], { timeout, type: 'su' });

    if (live) {
        const [domXml] = await call(connectionName, vmId, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
        const hostdevXML = getHostDevElemBySource(domXml, source);

        await call(connectionName, vmId, 'org.libvirt.Domain', 'DetachDevice', [hostdevXML, Enum.VIR_DOMAIN_AFFECT_LIVE], { timeout, type: 'su' });
    }
}

export function domainDetachIface({ connectionName, index, vmName, live, persistent }) {
    const options = { err: "message" };
    // Normally we should identify a vNIC to detach by a number of slot, bus, function and domain.
    // Such detachment is however broken in virt-xml, so instead let's detach it by the index of <interface> in array of VM's XML <devices>
    // This serves as workaround for https://github.com/virt-manager/virt-manager/issues/356
    // virt-xml counts devices starting from 1, so we have to increase index by 1
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--remove-device', '--network', `${index + 1}`];

    if (connectionName === "system")
        options.superuser = "try";

    if (live) {
        args.push("--update");
        if (!persistent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export function domainRemoveVsock({ connectionName, vmName, permanent, hotplug }) {
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--remove-device', '--vsock', '1'];

    const options = { err: "message" };

    if (connectionName === "system")
        options.superuser = "try";

    if (hotplug) {
        args.push("--update");
        if (!permanent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export function domainRemoveWatchdog({ connectionName, vmName, permanent, hotplug, model }) {
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, '--remove-device', '--watchdog', `model=${model}`];
    const options = { err: "message" };

    if (connectionName === "system")
        options.superuser = "try";

    if (hotplug) {
        args.push("--update");
        if (!permanent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export async function domainEjectDisk({
    connectionName,
    id: vmPath,
    target,
    eject,
    file,
    pool,
    volume,
    live = false,
    persistent,
    force
}) {
    let updateFlags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    if (live)
        updateFlags |= Enum.VIR_DOMAIN_AFFECT_LIVE;
    if (force)
        updateFlags |= Enum.VIR_DOMAIN_DEVICE_MODIFY_FORCE;

    // Switch to using virt-xml once 'force' flag is implemented: https://github.com/virt-manager/virt-manager/issues/442
    const [domXml] = await call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
    const diskXML = changeMedia({ domXml, target, eject, file, pool, volume });

    const [domInactiveXml] = await call(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const diskInactiveXML = getDiskElemByTarget(domInactiveXml, target);
    if (diskInactiveXML && persistent)
        updateFlags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

    await call(connectionName, vmPath, 'org.libvirt.Domain', 'UpdateDevice', [diskXML, updateFlags], { timeout, type: 'su' });
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
export async function domainGet({
    id: objPath,
    connectionName,
}) {
    const props = {};

    try {
        const [domainXML] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE], { timeout, type: 'u' });
        const [domInactiveXml] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE | Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
        props.inactiveXML = parseDomainDumpxml(connectionName, domInactiveXml, objPath);
        props.connectionName = connectionName;
        props.id = objPath;

        const [returnProps] = await call(connectionName, objPath, "org.freedesktop.DBus.Properties", "GetAll", ["org.libvirt.Domain"], { timeout, type: 's' });

        /* Sometimes not all properties are returned, for example when some domain got deleted while part
        * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
        */
        if ("Name" in returnProps)
            props.name = returnProps.Name.v.v;
        if ("Persistent" in returnProps)
            props.persistent = returnProps.Persistent.v.v;
        if ("Autostart" in returnProps)
            props.autostart = returnProps.Autostart.v.v;
        props.ui = resolveUiState(props.name, props.connectionName);

        const dumpxmlParams = parseDomainDumpxml(connectionName, domainXML, objPath);
        Object.assign(props, dumpxmlParams);

        const domCaps = await domainGetCapabilities({ connectionName, arch: dumpxmlParams.arch, model: dumpxmlParams.emulatedMachine });
        props.capabilities = {
            loaderElems: getDomainCapLoader(domCaps),
            maxVcpu: getDomainCapMaxVCPU(domCaps),
            cpuModels: getDomainCapCPUCustomModels(domCaps),
            cpuHostModel: getDomainCapCPUHostModel(domCaps),
            supportedDiskBusTypes: getDomainCapDiskBusTypes(domCaps),
            supportsSpice: getDomainCapSupportsSpice(domCaps),
            supportsTPM: getDomainCapSupportsTPM(domCaps),
        };

        const [state] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetState', [0], { timeout, type: 'u' });
        const stateStr = DOMAINSTATE[state[0]];

        if (!domainIsRunning(stateStr))
            props.actualTimeInMs = -1;

        logDebug(`${props.name}.GET_VM(${objPath}, ${connectionName}): update props ${JSON.stringify(props)}`);

        store.dispatch(updateOrAddVm({ state: stateStr, ...props }));

        clearVmUiState(props.name, connectionName);

        await snapshotGetAll({ connectionName, domainPath: objPath });
    } catch (ex) {
        // "not found" is an expected error, as this runs on Stopped/Undefined events; so be quiet about these
        if (ex.message.startsWith("Domain not found"))
            logDebug(`GET_VM: domain ${connectionName} ${objPath} went away, undefining: ${ex.toString()}`);
        else
            console.warn(`GET_VM failed for ${objPath}, undefining: ${ex.toString()}`);
        // but undefine either way -- if we  can't get info about the VM, don't show it
        store.dispatch(undefineVm({ connectionName, id: objPath }));
    }
}

export async function domainGetAll({ connectionName }) {
    try {
        const [objPaths] = await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListDomains', [0],
                                      { timeout, type: 'u' });
        store.dispatch(deleteUnlistedVMs(connectionName, [], objPaths));
        await Promise.all(objPaths.map(path => domainGet({ connectionName, id: path })));
    } catch (ex) {
        console.warn('GET_ALL_VMS action failed:', ex.toString());
        throw ex;
    }
}

export function domainGetCapabilities({ connectionName, arch, model }) {
    return call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'GetDomainCapabilities', ['', arch, model, '', 0], { timeout, type: 'ssssu' });
}

export async function domainGetStartTime({
    connectionName,
    vmName,
}) {
    const loggedUser = await cockpit.user();
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    /* The possible paths of logfiles path, as of libvirt 9.3.0 are defined in:
        * https://gitlab.com/libvirt/libvirt/-/blob/v9.3.0/src/qemu/qemu_conf.c#L153
        * There libvirt defines 3 possible directories where they can be located
        * - /root/log/qemu/ - That is however only relevant for "qemu:///embed", and not cockpit's use case
        * - /var/log/libvirt/qemu/ - For privileged (qemu:///system) VMs
        * - ~/.cache/libvirt/qemu/logs - For non-privileged  (qemu:///session) VMs
        */
    const logFile = connectionName === "system" ? `/var/log/libvirt/qemu/${vmName}.log` : `${loggedUser.home}/.cache/libvirt/qemu/log/${vmName}.log`;

    try {
        // Use libvirt APIs for getting VM start up time when it's implemented:
        // https://gitlab.com/libvirt/libvirt/-/issues/481
        const line = await cockpit.script(`grep ': starting up' '${logFile}' | tail -1`, options);

        // Line from a log with a start up time is expected to look like this:
        // 2023-05-05 11:22:03.043+0000: starting up libvirt version: 8.6.0, package: 3.fc37 (Fedora Project, 2022-08-09-13:54:03, ), qemu version: 7.0.0qemu-7.0.0-9.fc37, kernel: 6.0.6-300.fc37.x86_64, hostname: fedora

        // Alternatively regex line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g) can be used
        const timeStr = line.split(': starting up')[0];
        const date = new Date(timeStr);
        return isNaN(date) ? null : date;
    } catch (ex) {
        console.log("Unable to detect domain start time:", ex);
        return null;
    }
}

export function domainInstall({ vm }) {
    logDebug(`INSTALL_VM(${vm.name}):`);
    // shows dummy vm until we get vm from virsh (cleans up inProgress)
    // vm should be returned even if script fails
    setVmInstallInProgress(vm);

    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (vm.connectionName === 'system')
        opts.superuser = 'try';

    const args = JSON.stringify({
        connectionName: vm.connectionName,
        os: vm.metadata.osVariant,
        source: vm.metadata.installSource,
        sourceType: vm.metadata.installSourceType,
        rootPassword: vm.metadata.rootPassword,
        userLogin: vm.metadata.userLogin,
        userPassword: vm.metadata.userPassword,
        type: "install",
        vmName: vm.name,
    });

    return python.spawn(installVmScript, [args], opts)
            .catch(ex => {
                console.error(JSON.stringify(ex));
                return Promise.reject(ex);
            })
            .finally(() => setVmInstallInProgress({ name: vm.name, connectionName: vm.connectionName }, false));
}

export function domainInsertDisk({
    connectionName,
    vmName,
    target,
    diskType,
    file,
    poolName,
    volumeName,
    live = false,
}) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    let source;
    if (diskType === "file")
        source = `source.file=${file},type=file`;
    else if (diskType === "volume")
        source = `source.pool=${poolName},source.volume=${volumeName},type=volume`;
    else
        throw new Error(`Disk insertion is not supported for ${diskType} disks`);

    const args = [
        "virt-xml", "-c", `qemu:///${connectionName}`,
        vmName, "--edit", `target.dev=${target}`,
        "--disk", source,
    ];

    if (live)
        args.push("--update");

    return cockpit.spawn(args, options);
}

export function domainInterfaceAddresses({ connectionName, objPath }) {
    return Promise.allSettled([
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'lease',
                        ...res
                    };
                }),
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'arp',
                        ...res
                    };
                }),
        call(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'agent',
                        ...res
                    };
                }),
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

function shlex_quote(str) {
    // yay, command line apis...
    return "'" + str.replaceAll("'", "'\"'\"'") + "'";
}

async function domainSetXML(vm, option, values) {
    const opts = { err: "message" };
    if (vm.connectionName === 'system')
        opts.superuser = 'try';

    // We don't pass the arguments for virt-xml through a shell, but
    // virt-xml does its own parsing with the Python shlex module. So
    // we need to do the equivalent of shlex.quote here.

    const args = [];
    for (const key in values)
        args.push(shlex_quote(key + '=' + values[key]));

    await cockpit.spawn([
        'virt-xml', '-c', `qemu:///${vm.connectionName}`, '--' + option, args.join(','), vm.uuid, '--edit'
    ], opts);
}

export async function domainSetDescription(vm, description) {
    // The description will appear in a "open" message for a "spawn"
    // channel, and excessive lengths will crash the session with a
    // protocol error. So let's limit it to a reasonable length here.
    if (description.length > 32000)
        description = description.slice(0, 32000);
    await domainSetXML(vm, "metadata", { description });
}

export function domainSetCpuMode({
    name,
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

export function domainSetMemoryBacking({ connectionName, vmName, type }) {
    const options = { err: "message" };
    if (connectionName === "system")
        options.superuser = "try";

    return cockpit.spawn(
        ['virt-xml', '-c', `qemu:///${connectionName}`, '--memorybacking', `access.mode=shared,source.type=${type}`, vmName, '--edit'],
        options
    );
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

export async function domainSetMaxMemory({
    id: objPath,
    connectionName,
    maxMemory // in KiB
}) {
    const [domXml] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
    const updatedXML = updateMaxMemory(domXml, maxMemory);
    await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
}

export async function domainSetOSFirmware({ connectionName, objPath, loaderType }) {
    const [domXml] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
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

    await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [s.serializeToString(doc)], { timeout, type: 's' });
}

export function domainSetVCPUSettings ({
    name,
    connectionName,
    count,
    max,
    sockets,
    cores,
    threads,
}) {
    const opts = { err: "message", environ: ['LC_ALL=C.UTF-8'] };
    if (connectionName === 'system')
        opts.superuser = 'try';

    return cockpit.spawn([
        'virt-xml', '-c', `qemu:///${connectionName}`, '--vcpu', `${max},vcpu.current=${count},sockets=${sockets},cores=${cores},threads=${threads}`, name, '--edit'
    ], opts);
}

export function domainSetVsock({ connectionName, vmName, permanent, hotplug, auto, address, isVsockAttached }) {
    const cidAddressStr = address ? `,cid.address=${address}` : "";
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, isVsockAttached ? '--edit' : '--add-device', '--vsock', `cid.auto=${auto}${cidAddressStr}`];
    const options = { err: "message" };

    if (connectionName === "system")
        options.superuser = "try";

    // Only attaching new vsock device to running VM works
    // Editing existing vsock device on running VM (live XML config) is not possible, in such situation we only change offline XML config
    if (hotplug && !isVsockAttached) {
        args.push("--update");
        if (!permanent)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
}

export function domainSetWatchdog({ connectionName, vmName, defineOffline, hotplug, action, isWatchdogAttached }) {
    const args = ['virt-xml', '-c', `qemu:///${connectionName}`, vmName, isWatchdogAttached ? '--edit' : '--add-device', '--watchdog', `action=${action}`];
    const options = { err: "message" };

    if (connectionName === "system")
        options.superuser = "try";

    // Only attaching new watchdog device to running VM works
    // Editing existing watchdog device on running VM (live XML config) is not possible, in such situation we only change offline XML config
    if (hotplug && !isWatchdogAttached) {
        args.push("--update");
        if (!defineOffline)
            args.push("--no-define");
    }

    return cockpit.spawn(args, options);
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

export async function domainUpdateDiskAttributes({ connectionName, objPath, target, readonly, shareable, busType, existingTargets, cache }) {
    const [domXml] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const updatedXML = updateDisk({ diskTarget: target, domXml, readonly, shareable, busType, existingTargets, cache });
    await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
}

export async function domainReplaceSpice({ connectionName, id: objPath }) {
    /* Ideally this would be done by virt-xml, but it doesn't offer that functionality yet
     * see https://issues.redhat.com/browse/RHEL-17436 */
    const [domXML] = await call(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const updatedXML = replaceSpice(domXML);

    // check that updatedXML is valid; if not, throw; it needs to be updated manually
    await (cockpit.spawn(["virt-xml-validate", "-"], { err: "message" }).input(updatedXML));

    try {
        await call(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedXML], { timeout, type: 's' });
    } catch (ex) { // not-covered: unreachable, belt-and-suspenders
        // if this fails, libvirt should keep the original XML
        console.warn("domainReplaceSpice defining updated XML failed:", updatedXML); // not-covered: see above
        throw ex; // not-covered: see above
    }
}

export async function domainAddTPM({ connectionName, vmName }) {
    const args = ["virt-xml", "-c", `qemu:///${connectionName}`, "--add-device", "--tpm", "default", vmName];
    return cockpit.spawn(args, { err: "message", superuser: connectionName === "system" ? "try" : null })
            // RHEL 8 does not support --tpm default; arch (and likely other system setups) fails with
            // unsupported configuration: TPM version '2.0' is not supported
            .catch(ex => {
                if (ex.message?.includes("Unknown TPM backend type") || ex.message?.includes("unsupported configuration"))
                    console.log("Failed to add TPM:", ex);
                else
                    return Promise.reject(ex);
            });
}
