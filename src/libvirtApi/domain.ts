/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2021 Red Hat, Inc.
 */

/*
 * Provider for Libvirt using libvirt-dbus API.
 * See https://github.com/libvirt/libvirt-dbus
 */
import cockpit from 'cockpit';
import * as python from 'python.js';

import { appState } from '../state';

import type {
    optString,
    ConnectionName,
    DomainCapabilities,
    VM, VMState, VMGraphics, VMDisk, VMHostDevice,
    NodeDevice,
    StoragePool,
} from '../types';
import type { BootOrderDevice } from '../helpers.js';

import installVmScript from '../scripts/install_machine.py';

import {
    setVmCreateInProgress,
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
    getDoc,
    getElem,
    getDiskElemByTarget,
    getDomainCapLoader,
    getDomainCapMaxVCPU,
    getDomainCapCPUCustomModels,
    getDomainCapCPUHostModel,
    getDomainCapDiskBusTypes,
    getDomainCapSupportsSpice,
    getDomainCapSupportsTPM,
    getDomainCapInterfaceBackends,
    getSingleOptionalElem,
    parseDomainDumpxml,
    getHostDevElemBySource,
} from '../libvirt-xml-parse.js';
import {
    changeMedia,
    updateBootOrder,
    updateMaxMemory,
} from '../libvirt-xml-update.js';
import { storagePoolRefresh } from './storagePool.js';
import { snapshotGetAll } from './snapshot.js';
import { downloadRhelImage, getRhelImageUrl } from './rhel-images.js';
import { DBusProps, get_boolean_prop, call, Enum, timeout } from './helpers.js';
import { CLOUD_IMAGE, DOWNLOAD_AN_OS, LOCAL_INSTALL_MEDIA_SOURCE, needsRHToken } from "../components/create-vm-dialog/createVmDialogUtils.js";

export const domainCanInstall = (vmState: VMState, hasInstallPhase: boolean) => vmState != 'running' && hasInstallPhase;
export const domainCanReset = (vmState: VMState) => vmState == 'running' || vmState == 'blocked' || vmState == 'paused';
export const domainIsRunning = (vmState: VMState) => domainCanReset(vmState);

export const domainCanConsole = (vmState: VMState) => vmState == 'running';
export const domainSerialConsoleCommand = ({ vm, alias } : { vm: VM, alias: optString }) => {
    if (vm.displays.find(display => display.type == 'pty'))
        return ['virsh', '-c', `qemu:///${vm.connectionName}`, 'console', vm.name, alias || ''];
    else
        return [];
};

function buildConsoleVVFile(consoleDetail: VMGraphics): string {
    return '[virt-viewer]\n' +
        `type=${consoleDetail.type}\n` +
        `host=${consoleDetail.address}\n` +
        `port=${consoleDetail.port}\n` +
        'delete-this-file=1\n' +
        'fullscreen=0\n';
}

function spawn(connectionName: ConnectionName, args: string[]): cockpit.Spawn<string> {
    return cockpit.spawn(
        args,
        {
            err: "message",
            ...(connectionName === "system" ? { superuser: "try" } : { })
        });
}

function script(connectionName: ConnectionName, script: string): cockpit.Spawn<string> {
    return cockpit.script(
        script,
        undefined,
        {
            err: "message",
            ...(connectionName === "system" ? { superuser: "try" } : { })
        });
}

function shlex_quote(str: string): string {
    // yay, command line apis...
    return "'" + str.replaceAll("'", "'\"'\"'") + "'";
}

/* Running virt-xml

   The virtXmlAdd, virtXmlEdit, etc family of functions can be used to
   run virt-xml with various actions, options, and values. A typical
   invocation looks like this:

       virtXmlAdd(vm, "graphics", { type: "vnc", port: 5900 });

   This will result in running

       virt-xml <vm-uuid> --add-device --graphics type=vnc,port=5900

   The values are turned into the CSV style of virt-xml in the
   'obvious' way, according to these rules:

   Properties with "null", "false", or "undefined" as their values are
   not added to the result at all.  The value "true" is added as the
   string "yes".

       { type: null, password: "", tls: true }
       ->
       password=,tls=yes

   A property name can be the empty string. In that case its value is
   added with the parent name.

       { source: { "": "abc", mode: "123" } }
       ->
       source=abc,source.mode=123

   Arrays are encoded by appending consecutive numbers to the parent.

       { port: [ "a", "b", "c" ] }
       ->
       port0=a,port1=b,port2=c

   Top-level values that are neither objects nor arrays are allowed
   and are encoded without any property name.

       "vnc"
       ->
       vnc

   Functions that use a location, namely virtXmlEdit and
   virtXmlRemove, accept numbers in addition to a match value, just
   like virt-xml itself.  For example,

       virtXmlEdit(vm, "disk", 1, { bus: "scsi" })

   will run

       virt-xml <vm-uuid> --edit 1 --disk bus=scsi

   Each function also has a "extra_options" argument that can be used
   to add arbitrary extra options to the virt-xml invocation.  For
   example,

       virtXmlAdd(vm, "watchdog", "default", { update: true })

   will run

       virt-xml <vm-uuid> --add-device --watchdog default --update

   This is mostly used for hot-plug and non-persistent operations, and
   there is a shortcut for that: In addition to virtXmlAdd,
   virtXmlEdit, and virtXmlRemove, there is also a "hot" variant of
   each, named virtXmlHotAdd, etc.  These function will add the right
   options to perform a hot-plug when the VM is running, and will also
   do the right thing with VMs that don't have persistent XML definitions.
*/

interface virtXmlAction {
    action: string,
    location?: undefined | number | unknown,
    option: string,
    values: unknown,
}

async function runVirtXml(
    vm: VM,
    actions: virtXmlAction[],
    extra_options: Record<string, boolean>,
): Promise<void> {
    // We don't pass the arguments for virt-xml through a shell, but
    // virt-xml does its own parsing with the Python shlex module. So
    // we need to do the equivalent of shlex.quote here.

    function encode_into(args: string[], key: string, val: unknown) {
        if (typeof val == "number" || typeof val == "string" || val === true) {
            args.push(shlex_quote((key ? key + "=" : "") + (val === true ? "yes" : val)));
        } else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++)
                encode_into(args, key + String(i), val[i]);
        } else if (val && typeof val == "object") {
            for (const [k, v] of Object.entries(val)) {
                encode_into(args, (key && k) ? key + "." + k : key || k, v);
            }
        }
    }

    const args: string[] = [];

    function add_option(opt: string) {
        args.push("--" + opt);
    }

    function add_values(val: unknown) {
        if (typeof val == "number") {
            // Special case: numbers all by themselves are not
            // quoted. They are used for things like "--edit 1" or
            // "--remove-device 2".  Virt-xml doesn't recognize
            // them as numbers when we quote them as "--edit '1'",
            // for example.
            args.push(String(val));
        } else {
            const a: string[] = [];
            encode_into(a, "", val);
            if (a.length > 0)
                args.push(a.join(","));
        }
    }

    for (const a of actions) {
        add_option(a.action);
        if (a.location)
            add_values(a.location);
        add_option(a.option);
        add_values(a.values);
    }

    for (const x in extra_options) {
        if (extra_options[x])
            add_option(x);
    }

    const cmd = ['virt-xml', '-c', `qemu:///${vm.connectionName}`, vm.uuid, ...args];
    await spawn(vm.connectionName, cmd);
}

export async function virtXmlAdd(
    vm: VM,
    option: string,
    values: unknown,
    extra_options: Record<string, boolean> = {}
) {
    await runVirtXml(vm, [{ action: "add-device", option, values }], extra_options);
}

export async function virtXmlEdit(
    vm: VM,
    option: string,
    location: number | unknown,
    values: unknown,
    extra_options: Record<string, boolean> = {}
) {
    await runVirtXml(vm, [{ action: "edit", location, option, values }], extra_options);
}

export async function virtXmlRemove(
    vm: VM,
    option: string,
    values: unknown,
    extra_options: Record<string, boolean> = {}
) {
    await runVirtXml(vm, [{ action: "remove-device", option, values }], extra_options);
}

function hotplugExtraOptions(vm: VM, device_persistent: boolean = true) {
    return {
        update: vm.state == "running",
        "no-define": vm.state == "running" && !(vm.persistent && device_persistent),
    };
}

export async function virtXmlHotAdd(
    vm: VM,
    option: string,
    values: unknown,
    device_persistent: boolean = true,
    extra_options: Record<string, boolean> = {}
) {
    await virtXmlAdd(vm, option, values, { ...hotplugExtraOptions(vm, device_persistent), ...extra_options });
}

export async function virtXmlHotEdit(
    vm: VM,
    option: string,
    location: number | unknown,
    values: unknown,
    device_persistent: boolean = true,
    extra_options: Record<string, boolean> = {}
) {
    await virtXmlEdit(vm, option, location, values, { ...hotplugExtraOptions(vm, device_persistent), ...extra_options });
}

export async function virtXmlHotRemove(
    vm: VM,
    option: string,
    values: unknown,
    device_persistent: boolean = true,
    extra_options: Record<string, boolean> = {}
) {
    await virtXmlRemove(vm, option, values, { ...hotplugExtraOptions(vm, device_persistent), ...extra_options });
}

/* XML Manipulation

   The domainModifyXML function calls a callback with the (inactive)
   XML definition of the given VM.  The callback can make any kind of
   modifications to that document, and when it returns true, the
   document will be saved as the new (inactive) XML of that machine.
*/

export async function domainModifyXML(vm: VM, callback: (doc: XMLDocument) => boolean) {
    const [domXml] = await call<[string]>(vm.connectionName, vm.id, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE | Enum.VIR_DOMAIN_XML_SECURE], { timeout, type: 'u' });
    const doc = getDoc(domXml);
    if (callback(doc)) {
        const s = new XMLSerializer();
        const updatedDomXml = s.serializeToString(doc);
        await call(vm.connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainDefineXML', [updatedDomXml], { timeout, type: 's' });
    }
}

export async function vmDomainMethod<R>(vm: VM, method: string, signature: string, ...args: unknown[]): Promise<R> {
    return await call<R>(vm.connectionName, vm.id, 'org.libvirt.Domain', method, args, { timeout, type: signature });
}

export async function ensureBalloonPolling(vm: VM) {
    if (vm.state == "running" && !vm.hasPollingMemBalloon && !vm.hasPollingMemBalloonFailure) {
        try {
            const args = [
                "dommemstat",
                vm.uuid,
                "--period", "10",
                "--live",
            ];
            await spawn(vm.connectionName, ["virsh", "-c", `qemu:///${vm.connectionName}`, ...args]);
            await domainGet(vm);
        } catch (exc) {
            console.warn("Failed to enable memory polling", String(exc));
            vm.hasPollingMemBalloonFailure = true;
        }
    }
}

export function domainAttachHostDevices({
    connectionName,
    vmName,
    live,
    devices
} : {
    connectionName: ConnectionName,
    vmName: string,
    live: boolean,
    devices: NodeDevice[],
}): cockpit.Spawn<string> {
    const args = ["virt-xml", "-c", `qemu:///${connectionName}`, vmName];

    devices.forEach(dev => {
        const source = getNodeDevSource(dev);
        if (!source)
            return Promise.reject(new Error(`domainAttachHostDevices: could not determine device's source identifier`));

        args.push("--add-device", "--hostdev", source);
    });

    if (live)
        args.push("--update");

    return spawn(connectionName, args);
}

export async function domainChangeAutostart ({
    connectionName,
    vmName,
    autostart,
} : {
    connectionName: ConnectionName,
    vmName: string,
    autostart: boolean,
}): Promise<void> {
    const [domainPath] = await call<[string]>(
        connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'DomainLookupByName',
        [vmName], { timeout, type: 's' });
    await call(
        connectionName, domainPath, 'org.freedesktop.DBus.Properties', 'Set',
        ['org.libvirt.Domain', 'Autostart', cockpit.variant('b', autostart)],
        { timeout, type: 'ssv' });
}

export async function domainChangeBootOrder({
    vm,
    devices,
} : {
    vm: VM,
    devices: BootOrderDevice[],
}): Promise<void> {
    await domainModifyXML(vm, doc => updateBootOrder(doc, devices));
}

interface DomainSpec {
    memorySize: number,
    os: string,
    profile: string,
    rootPassword: optString,
    source: optString,
    sourceType: string,
    startVm: boolean,
    storagePool: string,
    storageSize: number,
    storageVolume: optString,
    unattended: boolean,
    userLogin: optString,
    userPassword: optString,
    vmName: string,
    sshKeys: string[],
    extraArguments: optString,
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
    sshKeys,
    extraArguments,
} : {
    connectionName: ConnectionName,
    osVersion: string,
    accessToken: optString
} & DomainSpec): Promise<void> {
    // shows dummy vm until we get vm from virsh (cleans up inProgress)
    setVmCreateInProgress(vmName, connectionName);

    type DomainCreateScriptArgs = { connectionName: ConnectionName, type: string } & DomainSpec;

    const args: DomainCreateScriptArgs = {
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
        extraArguments,
    };

    logDebug(`CREATE_VM(${vmName}): install_machine.py '${JSON.stringify(args)}'`);

    const hashPasswords = async (args: DomainCreateScriptArgs): Promise<void> => {
        if (args.sourceType === CLOUD_IMAGE) {
            const promises = [];
            if (args.userPassword)
                promises.push(spawn("session", ['openssl', 'passwd', '-5', args.userPassword]));
            if (args.rootPassword)
                promises.push(spawn("session", ['openssl', 'passwd', '-5', args.rootPassword]));

            const ret = await Promise.all(promises);
            if (args.userPassword)
                args.userPassword = ret.shift()!.trim();
            if (args.rootPassword)
                args.rootPassword = ret.shift()!.trim();
        }
    };

    try {
        /* try to download RHEL image */
        if (sourceType == DOWNLOAD_AN_OS && needsRHToken(os)) {
            const arch = (await spawn(connectionName, ['uname', '-m'])).trim();
            const outObj = JSON.parse(await getRhelImageUrl(accessToken, osVersion, arch));
            const url = outObj.url;
            const filename = outObj.filename;
            const isSystem = connectionName === LIBVIRT_SYSTEM_CONNECTION;
            cockpit.assert(appState.loggedUser);
            const downloadDir = isSystem ? "/var/lib/libvirt/images/" : appState.loggedUser.home + "/.local/share/libvirt/images/";
            args.sourceType = LOCAL_INSTALL_MEDIA_SOURCE;
            args.source = downloadDir + filename;

            let buffer = "";
            await downloadRhelImage(accessToken, url, filename, downloadDir, isSystem)
                    .stream(progress => {
                        buffer += progress;
                        const chunks = buffer.split("\n");
                        buffer = chunks.pop() || "";

                        if (chunks.length > 0)
                            updateImageDownloadProgress(vmName, connectionName, chunks.pop());
                    });
        }

        await hashPasswords(args);
        await python.spawn(
            installVmScript,
            [JSON.stringify(args)],
            {
                err: "message",
                environ: ['LC_ALL=C.UTF-8'],
                ...(connectionName === "system" ? { superuser: "try" } : { })
            });
    } catch (ex) {
        clearVmUiState(vmName, connectionName);
        throw ex;
    }
}

export async function domainDelete({
    connectionName,
    id: objPath,
    live,
} : {
    connectionName: ConnectionName,
    id: string,
    live: boolean,
}): Promise<void> {
    if (live)
        await call(connectionName, objPath, 'org.libvirt.Domain', 'Destroy', [0], { timeout, type: 'u' });

    try {
        const flags = Enum.VIR_DOMAIN_UNDEFINE_MANAGED_SAVE | Enum.VIR_DOMAIN_UNDEFINE_SNAPSHOTS_METADATA | Enum.VIR_DOMAIN_UNDEFINE_NVRAM;

        await call(connectionName, objPath, 'org.libvirt.Domain', 'Undefine', [flags], { timeout, type: 'u' });
    } catch (ex) {
        // Transient domains get undefined after shut off
        if (!live || !String(ex).includes("Domain not found"))
            throw ex;
    }
}

export interface StorageDeleteInfo {
    volume: string | null;
    pool: StoragePool | undefined;
    file: string | null;
}

export async function getStorageDeleteInfoForDisk(vm: VM, disk: VMDisk): Promise<StorageDeleteInfo | null> {
    // When deleting a disk image (for example when deleting a VM or
    // when detaching a disk), we prefer to delete it via the libvirt
    // storage pool API. So we try to find the volume for it, even for
    // disks of type "file".
    //
    // But we can't rely on our list of storage volumes to be
    // up-to-date. So let's fetch everything explicitly.

    async function getInfoByPath(path: string): Promise<StorageDeleteInfo | null> {
        try {
            const [dbusPath] = await call<[string]>(
                vm.connectionName,
                '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StorageVolLookupByPath',
                [path],
                { timeout, type: 's' }
            );
            return {
                volume: dbusPath,
                pool: appState.storagePools.find(
                    p => p.connectionName === vm.connectionName && p.volumes.some(v => v.path === path)),
                file: null,
            };
        } catch (ex) {
            if (!String(ex).includes("no storage vol with matching"))
                throw ex;
            return null;
        }
    }

    if (disk.type == "file" && disk.source.file) {
        const info = await getInfoByPath(disk.source.file);
        if (info)
            return info;

        return {
            volume: null,
            pool: undefined,
            file: disk.source.file,
        };
    }

    if (disk.type == "block" && disk.source.dev)
        return await getInfoByPath(disk.source.dev);

    if (disk.type == "volume" && disk.source.pool && disk.source.volume) {
        const [pool] = await call<[string]>(
            vm.connectionName,
            '/org/libvirt/QEMU', 'org.libvirt.Connect', 'StoragePoolLookupByName',
            [disk.source.pool],
            { timeout, type: 's' }
        );
        const [path] = await call<[string]>(
            vm.connectionName,
            pool, 'org.libvirt.StoragePool', 'StorageVolLookupByName',
            [disk.source.volume],
            { timeout, type: 's' }
        );
        return {
            volume: path,
            pool: appState.storagePools.find(p => p.connectionName === vm.connectionName && p.name === disk.source.pool),
            file: null,
        };
    }

    return null;
}

export async function deleteStorage(vm: VM, infos: StorageDeleteInfo[]): Promise<void> {
    for (const info of infos) {
        if (info.volume) {
            await call(
                vm.connectionName,
                info.volume, 'org.libvirt.StorageVol', 'Delete',
                [0],
                { timeout, type: 'u' }
            );
        }
        if (info.file)
            await cockpit.file(info.file, { superuser: "try" }).replace(null);
        if (info.pool)
            await storagePoolRefresh({ connectionName: vm.connectionName, objPath: info.pool.id });
    }
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
} : {
    name: string,
    consoleDetail: VMGraphics,
}): void {
    logDebug(`CONSOLE_VM(name='${name}'), detail = `, consoleDetail);
    fileDownload({
        data: buildConsoleVVFile(consoleDetail),
        fileName: 'console.vv',
        mimeType: 'application/x-virt-viewer'
    });
}

// Cannot use virt-xml until https://github.com/virt-manager/virt-manager/issues/357 is fixed
export async function domainDetachHostDevice({
    connectionName,
    vmId,
    live,
    dev
} : {
    connectionName: ConnectionName,
    vmId: string,
    live: boolean,
    dev: VMHostDevice,
}): Promise<void> {
    const source = getHostDevSourceObject(dev);
    if (!source)
        throw new Error("domainDetachHostDevice: could not determine device's source identifier");

    // hostdev's <address bus=... device=...> may be different between live XML and offline XML (or it may be present in live XML but missing in offline XML)
    // therefore we need to call DetachDevice twice with different hostdevXMLs, once for live XML and once for offline XML
    const [domInactiveXml] = await call<[string]>(connectionName, vmId, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const hostdevInactiveXML = getHostDevElemBySource(domInactiveXml, source);
    if (hostdevInactiveXML)
        await call(connectionName, vmId, 'org.libvirt.Domain', 'DetachDevice', [hostdevInactiveXML, Enum.VIR_DOMAIN_AFFECT_CONFIG], { timeout, type: 'su' });

    if (live) {
        const [domXml] = await call<[string]>(connectionName, vmId, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
        const hostdevXML = getHostDevElemBySource(domXml, source);

        await call(connectionName, vmId, 'org.libvirt.Domain', 'DetachDevice', [hostdevXML, Enum.VIR_DOMAIN_AFFECT_LIVE], { timeout, type: 'su' });
    }
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
} : {
    connectionName: ConnectionName,
    id: string,
    target: string,
    eject: boolean,
    file?: string,
    pool?: string,
    volume?: string,
    live?: boolean,
    persistent: boolean,
    force: boolean,
}): Promise<void> {
    let updateFlags = Enum.VIR_DOMAIN_AFFECT_CURRENT;
    if (live)
        updateFlags |= Enum.VIR_DOMAIN_AFFECT_LIVE;
    if (force)
        updateFlags |= Enum.VIR_DOMAIN_DEVICE_MODIFY_FORCE;

    // Switch to using virt-xml once 'force' flag is implemented: https://github.com/virt-manager/virt-manager/issues/442
    const [domXml] = await call<[string]>(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [0], { timeout, type: 'u' });
    const diskXML = changeMedia({ domXml, target, eject, file, pool, volume });

    const [domInactiveXml] = await call<[string]>(connectionName, vmPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
    const diskInactiveXML = getDiskElemByTarget(domInactiveXml, target);
    if (diskInactiveXML && persistent)
        updateFlags |= Enum.VIR_DOMAIN_AFFECT_CONFIG;

    await call(connectionName, vmPath, 'org.libvirt.Domain', 'UpdateDevice', [diskXML, updateFlags], { timeout, type: 'su' });
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
} : {
    connectionName: ConnectionName,
    id: string,
}): Promise<void> {
    try {
        const [domainXML] = await call<[string]>(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE], { timeout, type: 'u' });
        const [domInactiveXml] = await call<[string]>(connectionName, objPath, 'org.libvirt.Domain', 'GetXMLDesc', [Enum.VIR_DOMAIN_XML_SECURE | Enum.VIR_DOMAIN_XML_INACTIVE], { timeout, type: 'u' });
        const inactiveXML = parseDomainDumpxml(connectionName, domInactiveXml, objPath);

        const [returnProps] = await call<[DBusProps]>(connectionName, objPath, "org.freedesktop.DBus.Properties", "GetAll", ["org.libvirt.Domain"], { timeout, type: 's' });

        /* Sometimes not all properties are returned, for example when some domain got deleted while part
        * of the properties got fetched from libvirt. Make sure that there is check before reading the attributes.
         */
        let persistent = false;
        let autostart = false;
        if ("Persistent" in returnProps)
            persistent = get_boolean_prop(returnProps, "Persistent");
        if ("Autostart" in returnProps)
            autostart = get_boolean_prop(returnProps, "Autostart");

        const dumpxmlParams = parseDomainDumpxml(connectionName, domainXML, objPath);

        const capabilities = await domainGetCapabilities({
            connectionName,
            arch: dumpxmlParams.arch,
            model: dumpxmlParams.emulatedMachine
        });

        const [state] = await call<[number[]]>(connectionName, objPath, 'org.libvirt.Domain', 'GetState', [0], { timeout, type: 'u' });
        const stateStr = DOMAINSTATE[state[0]];

        let usageDataUpdate: Partial<VM> = {};
        if (!domainIsRunning(stateStr)) {
            // Clear usage data when machine is shut off
            usageDataUpdate = {
                actualTimeInMs: undefined,
                cpuTime: undefined,
                cpuUsage: undefined,
                memoryUsed: undefined,
            };
        }

        const old_vm = appState.vms.find(vm => vm.connectionName == connectionName && vm.id == objPath);
        let operationInProgressFromState;
        if (old_vm && old_vm.operationInProgressFromState && stateStr == old_vm.operationInProgressFromState) {
            operationInProgressFromState = old_vm.operationInProgressFromState;
        }

        const vm: VM = {
            ...dumpxmlParams,
            inactiveXML,
            state: stateStr,
            persistent,
            autostart,
            capabilities,
            operationInProgressFromState,
            ...usageDataUpdate,
        };

        logDebug(`${vm.name}.GET_VM(${objPath}, ${connectionName}): update props ${JSON.stringify(vm)}`);

        appState.updateOrAddVm(vm);
        clearVmUiState(vm.name, connectionName);

        // Load snapshots in the background. This can be quite slow.
        snapshotGetAll(vm);
    } catch (ex) {
        // "not found" is an expected error, as this runs on Stopped/Undefined events; so be quiet about these
        if (String(ex).startsWith("Domain not found"))
            logDebug(`GET_VM: domain ${connectionName} ${objPath} went away, undefining: ${String(ex)}`);
        else
            console.warn(`GET_VM failed for ${objPath}, undefining: ${String(ex)}`);
        // but undefine either way -- if we  can't get info about the VM, don't show it
        appState.undefineVm({ connectionName, id: objPath });
    }
}

export async function domainGetByName({
    connectionName,
    name,
} : {
    connectionName: ConnectionName,
    name: string
}): Promise<void> {
    try {
        const [objPath] = await call<[string]>(
            connectionName, '/org/libvirt/QEMU',
            'org.libvirt.Connect', 'DomainLookupByName',
            [name], { timeout, type: 's' }
        );
        await domainGet({ connectionName, id: objPath });
    } catch (ex) {
        console.warn('GET_VM_BY_NAME action failed:', String(ex));
    }
}

export async function domainGetAll({ connectionName } : { connectionName: ConnectionName }): Promise<void> {
    try {
        const [objPaths] = await call<[string[]]>(connectionName, '/org/libvirt/QEMU', 'org.libvirt.Connect', 'ListDomains', [0],
                                                  { timeout, type: 'u' });
        appState.deleteUnlistedVMs(connectionName, objPaths);
        await Promise.all(objPaths.map(path => domainGet({ connectionName, id: path })));
    } catch (ex) {
        console.warn('GET_ALL_VMS action failed:', String(ex));
        throw ex;
    }
}

const domainCapabilitiesPromises: Record<string, Promise<DomainCapabilities>> = {};

function domainGetCapabilities({
    connectionName,
    arch,
    model
} : {
    connectionName: ConnectionName,
    arch: optString,
    model: optString,
}): Promise<DomainCapabilities> {
    async function get(): Promise<DomainCapabilities> {
        const [capsXML] =
            await call<[string]>(
                connectionName,
                '/org/libvirt/QEMU', 'org.libvirt.Connect', 'GetDomainCapabilities',
                ['', arch, model, '', 0],
                { timeout, type: 'ssssu' });

        const domCaps = getElem(capsXML);
        return {
            loader: getDomainCapLoader(domCaps),
            maxVcpu: getDomainCapMaxVCPU(domCaps),
            cpuModels: getDomainCapCPUCustomModels(domCaps),
            cpuHostModel: getDomainCapCPUHostModel(domCaps),
            supportedDiskBusTypes: getDomainCapDiskBusTypes(domCaps),
            supportsSpice: getDomainCapSupportsSpice(domCaps),
            supportsTPM: getDomainCapSupportsTPM(domCaps),
            interfaceBackends: getDomainCapInterfaceBackends(domCaps),
        };
    }

    const key = `${arch}/${model}`;
    if (!domainCapabilitiesPromises[key])
        domainCapabilitiesPromises[key] = get();
    return domainCapabilitiesPromises[key];
}

export async function domainGetStartTime({
    connectionName,
    vmName,
} : {
    connectionName: ConnectionName,
    vmName: string,
}): Promise<Date | null> {
    const quotedName = shlex_quote(vmName);
    let pidFile;
    if (connectionName == "system")
        pidFile = `/run/libvirt/qemu/${quotedName}.pid`;
    else
        pidFile = `\${XDG_RUNTIME_DIR:/run/user/$UID}/libvirt/qemu/run/${quotedName}.pid`;

    // We assume that the birth time of the PID file is (very close to)
    // the start time of the QEMU process for the machine. Reading the
    // actual start time out of /proc is too hairy and "ps
    // --date-format" is not portable enough.
    //
    // If the birth time is not available, we use the meta data change
    // time.

    const cmd = `stat -c %W:%Z ${pidFile}`;

    try {
        const result = await script(connectionName, cmd);
        const [btime, ctime] = result.trim().split(":")
                .map(s => parseInt(s));
        return new Date((btime || ctime) * 1000);
    } catch (ex) {
        console.log("Unable to detect domain start time:", String(ex));
        return null;
    }
}

export async function domainInstall({ vm } : { vm: VM }): Promise<string> {
    logDebug(`INSTALL_VM(${vm.name}):`);

    appState.updateVm(vm, { installInProgress: true });

    const args = JSON.stringify({
        connectionName: vm.connectionName,
        os: vm.metadata.osVariant,
        source: vm.metadata.installSource,
        sourceType: vm.metadata.installSourceType,
        rootPassword: vm.metadata.rootPassword,
        userLogin: vm.metadata.userLogin,
        userPassword: vm.metadata.userPassword,
        extraArguments: vm.metadata.extraArguments,
        type: "install",
        vmName: vm.name,
    });

    return python.spawn(
        installVmScript,
        [args],
        {
            err: "message",
            environ: ['LC_ALL=C.UTF-8'],
            ...(vm.connectionName === "system" ? { superuser: "try" } : { })
        })
            .catch(ex => {
                console.error(JSON.stringify(ex));
                return Promise.reject(ex);
            })
            .finally(() => appState.updateVm(vm, { installInProgress: false }));
}

/* This is the shape of the return value of the
 * "org.libvirt.Domain.InterfaceAddresses" DBus method.
 */

interface InterfaceAddress {
    length: number,
    0: string, // name
    1: string, // mac
    2: {
        length: number,
        0: number, // type
        1: string, // IP
        2: number, // prefix
    }[]
}

/* And this is how the domainInterfaceAddresses function wraps it up.
 */

interface InterfaceAddresses {
    source: string,
    0: InterfaceAddress[],
}

export function domainInterfaceAddresses({
    connectionName,
    objPath
} : {
    connectionName: ConnectionName,
    objPath: string,
}): Promise<PromiseSettledResult<InterfaceAddresses>[]> {
    return Promise.allSettled([
        call<[InterfaceAddress[]]>(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_LEASE, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'lease',
                        ...res
                    };
                }),
        call<[InterfaceAddress[]]>(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_ARP, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'arp',
                        ...res
                    };
                }),
        call<[InterfaceAddress[]]>(connectionName, objPath, 'org.libvirt.Domain', 'InterfaceAddresses', [Enum.VIR_DOMAIN_INTERFACE_ADDRESSES_SRC_AGENT, 0], { timeout, type: 'uu' })
                .then(res => {
                    return {
                        source: 'agent',
                        ...res
                    };
                }),
    ]);
}

export function domainMigrateToUri({
    connectionName,
    objPath,
    destUri,
    storage,
    temporary
} : {
    connectionName: ConnectionName,
    objPath: string,
    destUri: string,
    storage: string,
    temporary: boolean,
}): Promise<void> {
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

export function domainRename({
    connectionName,
    id: objPath,
    newName,
} : {
    connectionName: ConnectionName,
    id: string,
    newName: string,
}): Promise<void> {
    return call(connectionName, objPath, 'org.libvirt.Domain', 'Rename', [newName, 0], { timeout, type: 'su' });
}

export function domainSendKey({
    connectionName,
    id,
    keyCodes
} : {
    connectionName: ConnectionName,
    id: string,
    keyCodes: number[],
}): Promise<void> {
    const holdTime = 0;
    const flags = 0;

    return call(connectionName, id, 'org.libvirt.Domain', 'SendKey', [Enum.VIR_KEYCODE_SET_LINUX, holdTime, keyCodes, flags], { timeout, type: "uuauu" });
}

export function domainSetMemory({
    id: objPath,
    connectionName,
    memory, // in KiB
    isRunning
} : {
    id: string,
    connectionName: ConnectionName,
    memory: number, // in KiB
    isRunning: boolean,
}): Promise<void> {
    let flags = Enum.VIR_DOMAIN_AFFECT_CONFIG;
    if (isRunning)
        flags |= Enum.VIR_DOMAIN_AFFECT_LIVE;

    return call(connectionName, objPath, 'org.libvirt.Domain', 'SetMemory', [memory, flags], { timeout, type: 'tu' });
}

export async function domainSetMaxMemory({
    vm,
    maxMemory // in KiB
} : {
    vm: VM,
    maxMemory: number // in KiB
}): Promise<void> {
    await domainModifyXML(vm, doc => updateMaxMemory(doc, maxMemory));
}

export async function domainSetOSFirmware({
    vm,
    loaderType
} : {
    vm: VM,
    loaderType: optString;
}): Promise<void> {
    await domainModifyXML(vm, doc => {
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

        return true;
    });
}
