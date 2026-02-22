/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */
import React, { useState, useEffect } from 'react';

import type { optString, VM, VMInterface, VMInterfacePortForward, Network } from '../../../types';

import { useDialogs, Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { DialogsContext } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { getIfaceSourceName, rephraseUI, vmId } from "../../../helpers.js";
import { AddNIC } from './nicAdd.jsx';
import { EditNICModal } from './nicEdit.jsx';
import { portForwardText } from './nicBody';
import { needsShutdownIfaceModel, needsShutdownIfaceSource, needsShutdownIfaceType, needsShutdownIfaceBackend, needsShutdownIfacePortForward, WithPending } from '../../common/needsShutdown.jsx';
import './nic.css';
import { virtXmlEdit, virtXmlHotRemove, domainInterfaceAddresses, domainGet } from '../../../libvirtApi/domain.js';
import { KebabDropdown } from "cockpit-components-dropdown";
import { ListingTable } from "cockpit-components-table.jsx";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';
import { appState } from '../../../state';

const _ = cockpit.gettext;

interface NetworkDevice {
    type?: "bridge";
}

const getNetworkDevices = async (): Promise<Record<string, NetworkDevice>> => {
    try {
        const output = await cockpit.spawn(["find", "/sys/class/net", "-type", "l", "-printf", '%f\n'],
                                           { err: "message" });

        const devs: Record<string, NetworkDevice> = {};
        for (const dev of output.trim().split('\n')) {
            devs[dev] = {};
        }

        const bridges = await cockpit.spawn(["ip", "-j", "link", "show", "type", "bridge"], { err: "message" });
        const bridgeNames: string[] = JSON.parse(bridges).map((br: { ifname: string }) => br.ifname);

        for (const br of bridgeNames) {
            if (devs[br]) {
                devs[br].type = "bridge";
            }
        }

        return devs;
    } catch (e) {
        console.warn("could not read /sys/class/net:", String(e));
        return {};
    }
};

export interface AvailableSources {
    network: string[];
    device: Record<string, NetworkDevice>;
}

export const VmNetworkActions = ({
    vm,
    networks,
} : {
    vm: VM,
    networks: Network[],
}) => {
    const Dialogs = useDialogs();
    const [networkDevices, setNetworkDevices] = useState<Record<string, NetworkDevice> | undefined>();

    useEffect(() => {
        getNetworkDevices().then(setNetworkDevices);
    }, []);

    const id = vmId(vm.name);
    const open = () => {
        cockpit.assert(networkDevices);

        const availableSources: AvailableSources = {
            network: networks.map(network => network.name),
            device: networkDevices,
        };

        Dialogs.show(
            <AddNIC
                idPrefix={`${id}-add-iface`}
                vm={vm}
                availableSources={availableSources}
            />
        );
    };

    return (
        <Button id={`${id}-add-iface-button`} variant="secondary"
            isDisabled={networkDevices === undefined}
            onClick={open}>
            {_("Add network interface")}
        </Button>
    );
};

interface NetworkManagerDeviceProxy extends cockpit.DBusProxy {
    Interface: string;
}

const NetworkSourceDescriptions = ({
    network,
    networkId,
    vm,
    hostDevices
} : {
    network: VMInterface,
    networkId: number,
    vm: VM,
    hostDevices: Record<string, NetworkManagerDeviceProxy>,
}) => {
    const id = vmId(vm.name);
    const checkDeviceAvailability = (network: string) => {
        for (const i in hostDevices) {
            if (hostDevices[i].valid && hostDevices[i].Interface == network) {
                return true;
            }
        }
        return false;
    };

    const sourceJump = (source: string) => {
        return () => {
            if (source !== null && checkDeviceAvailability(source)) {
                cockpit.jump(`/network#/${source}`, cockpit.transport.host);
            }
        };
    };

    const singleSourceElem = (source: string) => {
        let label = rephraseUI("networkType", network.type);
        label = label.charAt(0).toUpperCase() + label.slice(1);

        return (
            <>
                <DescriptionListGroup>
                    <DescriptionListTerm>
                        {label}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                        <WithPending
                            id={`${id}-network-${networkId}-source`}
                            isPending={needsShutdownIfaceSource(vm, network)}
                        >
                            {
                                checkDeviceAvailability(source)
                                    ? <Button variant="link" isInline onClick={sourceJump(source)}>{source}</Button>
                                    : source
                            }
                        </WithPending>
                    </DescriptionListDescription>
                </DescriptionListGroup>
                { network.source.mode &&
                    <DescriptionListGroup>
                        <DescriptionListTerm>
                            {_("Mode")}
                        </DescriptionListTerm>
                        <DescriptionListDescription id={`${id}-network-${networkId}-source-mode`}>
                            {network.source.mode}
                        </DescriptionListDescription>
                    </DescriptionListGroup>
                }
            </>
        );
    };
    const addressPortSourceElem = (source: { address: optString, port: optString }) => {
        return (
            <>
                <DescriptionListGroup>
                    <DescriptionListTerm>
                        {_("Address")}
                    </DescriptionListTerm>
                    <DescriptionListDescription id={`${id}-network-${networkId}-address`}>
                        {source.address}
                    </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                    <DescriptionListTerm>
                        {_("Port")}
                    </DescriptionListTerm>
                    <DescriptionListDescription id={`${id}-network-${networkId}-port`}>
                        {source.port}
                    </DescriptionListDescription>
                </DescriptionListGroup>
            </>
        );
    };

    let source: React.ReactNode;
    const source_name = getIfaceSourceName(network);
    if (source_name) {
        if (typeof source_name == "string")
            source = singleSourceElem(source_name);
        else
            source = addressPortSourceElem(source_name);
    }

    return (
        <>
            {source}
            {network.target && <DescriptionListGroup>
                <DescriptionListTerm>
                    {_("TAP device")}
                </DescriptionListTerm>
                <DescriptionListDescription id={`${id}-network-${networkId}-tapdevice`}>
                    {network.target}
                </DescriptionListDescription>
            </DescriptionListGroup>}
        </>
    );
};

const NetworkSourceAbbrev = ({
    network,
    id,
} : {
    network: VMInterface,
    id: string,
}) => {
    const source_name = getIfaceSourceName(network);

    if (!source_name)
        return null;
    else if (typeof source_name == "string")
        return <div id={id}>{source_name}</div>;
    else
        return <div id={id}>{source_name.address + ":" + source_name.port}</div>;
};

const NetworkPortForwardDescriptions = ({
    network,
    networkId,
    id,
    needsShutdown,
} : {
    network: VMInterface,
    networkId: number,
    id: string,
    needsShutdown: boolean,
}) => {
    function shutdownWrapper(id: string, content: React.ReactNode, needs: boolean) {
        return (
            <WithPending
                id={id}
                isPending={needs}
            >
                {content}
            </WithPending>
        );
    }

    function row(pf: VMInterfacePortForward, index: number) {
        return (
            <DescriptionListDescription key={index}>
                {
                    shutdownWrapper(
                        `${id}-network-${networkId}-port-forward-${index}`,
                        portForwardText(pf),
                        index == 0 && needsShutdown
                    )
                }
            </DescriptionListDescription>
        );
    }

    return (
        <DescriptionListGroup>
            <DescriptionListTerm>
                {_("Port forwards")}
            </DescriptionListTerm>
            { network.portForward.length == 0 &&
                <DescriptionListDescription>
                    {
                        shutdownWrapper(
                            `${id}-network-${networkId}-port-forward`,
                            _("none"),
                            needsShutdown
                        )
                    }
                </DescriptionListDescription>
            }
            { network.portForward.map(row) }
        </DescriptionListGroup>
    );
};

// To make it easier to know which is what from libvirt API we put them in an enum.
enum IpAddressVersion {
    v4 = 0,
    v6 = 1
}

interface IpAddress {
    type: IpAddressVersion,
    ip: string,
    prefix: number,
}

interface IpInterface {
    name: string,
    mac: string,
    ips: IpAddress[],
    source: string,
}

function sort_ips_by_source(ips: IpInterface[]): IpInterface[] {
    // Setup a preferred order of IP/SUBNET-MASK we want to add.
    // Helps ensure that the IP subnet mask are taken from the right source.
    // agent > lease > arp
    const source_order: {[index: string]: number} = {
        agent: 1,
        lease: 2,
        arp: 3
    };
    return ips.sort((a, b) => source_order[a.source] - source_order[b.source]);
}

const IPAddresses = ({
    id,
    networkId,
    ipInterfaces,
} : {
    id: string,
    networkId: number,
    ipInterfaces: IpInterface[],
}) => {
    const inetIps: IpAddress[] = [];
    const inet6Ips: IpAddress[] = [];

    ipInterfaces.forEach(ipInterface => {
        ipInterface.ips.forEach(inet => {
            // Separate out IPv4 and IPv6 and don't add duplicate IPs.
            if (inet.type === IpAddressVersion.v4 && !inetIps.some(inetIp => inetIp.ip == inet.ip)) {
                inetIps.push(inet);
            } else if (inet.type === IpAddressVersion.v6 && !inet6Ips.some(inet6Ip => inet6Ip.ip == inet.ip)) {
                inet6Ips.push(inet);
            }
        });
    });

    function render_ip(ip: IpAddress, index: number, type: string) {
        return (
            <div
                id={`${id}-network-${networkId}-${type}-address-${index}`}
                key={ip.ip}
            >
                {ip.ip}/{ip.prefix}
            </div>
        );
    }

    return [
        ...inetIps.map((ip, index) => render_ip(ip, index, "ipv4")),
        ...inet6Ips.map((ip, index) => render_ip(ip, index, "ipv6")),
    ];
};

const IPTarget = ({
    ipInterfaces,
    id,
} : {
    ipInterfaces: IpInterface[],
    id: string,
}) => {
    for (const iface of ipInterfaces) {
        if (iface.source == "agent")
            return <div id={id}>{iface.name}</div>;
    }

    return null;
};

interface VmNetworkTabProps {
    vm: VM,
    networks: Network[],
}

interface VmNetworkTabState {
    networkDevices: Record<string, NetworkDevice> | undefined,
    ips: IpInterface[],
    haveAgentSource: boolean;
    dropdownOpenActions: number,
}

export class VmNetworkTab extends React.Component<VmNetworkTabProps, VmNetworkTabState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    client: cockpit.DBusClient;
    hostDevices: Record<string, NetworkManagerDeviceProxy>;

    constructor(props: VmNetworkTabProps) {
        super(props);

        this.state = {
            networkDevices: undefined,
            ips: [],
            haveAgentSource: false,
            dropdownOpenActions: 0,
        };

        this.deviceProxyHandler = this.deviceProxyHandler.bind(this);
        this.getIpAddr = this.getIpAddr.bind(this);
        this.client = cockpit.dbus("org.freedesktop.NetworkManager");
        const proxies = this.client.proxies("org.freedesktop.NetworkManager.Device", "/org/freedesktop");
        proxies.addEventListener('changed', this.deviceProxyHandler);
        proxies.addEventListener('removed', this.deviceProxyHandler);
        this.hostDevices = proxies as unknown as Record<string, NetworkManagerDeviceProxy>;
    }

    deviceProxyHandler() {
        this.forceUpdate();
    }

    getIpAddr() {
        if (this.props.vm.state != 'running' && this.props.vm.state != 'paused') {
            this.setState({ ips: [] });
            return;
        }

        domainInterfaceAddresses({ connectionName: this.props.vm.connectionName, objPath: this.props.vm.id })
                .then(domifaddressAllSources => {
                    const allRejected = !domifaddressAllSources.some(promise => promise.status == 'fulfilled');
                    // If user is in the VMDetails page during migration, the VM might get deleted
                    // before domainInterfaceAddresses is done processing. This race condition can end up
                    // causing a confusing view where the UI shows a redundant "Domain not found error"
                    // and the regular VM doesn't exist page, at the same time.
                    const domainNotFound = domifaddressAllSources.some(promise =>
                        promise.status === 'rejected' && promise.reason?.message.startsWith("Domain not found:")
                    );

                    if (allRejected && !domainNotFound) {
                        appState.addNotification({
                            text: cockpit.format(_("Failed to fetch the IP addresses of the interfaces present in $0"), this.props.vm.name),
                            detail: [...new Set(domifaddressAllSources.map(promise => promise.status == 'rejected' && promise.reason ? promise.reason.message : ''))].join(', '),
                            resourceId: this.props.vm.id,
                        });
                    } else {
                        const ipaddresses: IpInterface[] = [];
                        let haveAgentSource: boolean = false;

                        domifaddressAllSources
                                .filter(promise => promise.status == 'fulfilled')
                                .forEach(promise => {
                                    const ifaces = promise.value[0];

                                    ifaces.forEach(iface => {
                                        // Ignore loopback interface
                                        if (!iface.length || iface[0] == "lo")
                                            return;

                                        const address: IpInterface = {
                                            name: iface[0],
                                            mac: iface[1],
                                            ips: [],
                                            source: promise.value.source,
                                        };
                                        if (promise.value.source == "agent")
                                            haveAgentSource = true;
                                        iface[2].forEach(ifAddress => {
                                            if (ifAddress.length && ifAddress[0] in IpAddressVersion) {
                                                // 0 cell -> type, 1 cell -> address, 2 cell -> prefix
                                                address.ips.push({
                                                    type: ifAddress[0],
                                                    ip: ifAddress[1],
                                                    prefix: ifAddress[2],
                                                });
                                            }
                                        });
                                        ipaddresses.push(address);
                                    });
                                });
                        this.setState({ ips: sort_ips_by_source(ipaddresses), haveAgentSource });
                    }
                });
    }

    componentDidMount() {
        // only consider symlinks -- there might be other stuff like "bonding_masters" which we don't want
        getNetworkDevices().then(devs => this.setState({ networkDevices: devs }));
        this.getIpAddr();
    }

    componentDidUpdate(prevProps: VmNetworkTabProps) {
        if (prevProps.vm.state !== this.props.vm.state)
            this.getIpAddr();
    }

    componentWillUnmount() {
        this.client.close();
    }

    render() {
        const Dialogs = this.context;
        const { vm, networks } = this.props;
        const id = vmId(vm.name);

        const onChangeState = (network: VMInterface) => {
            return async (e: React.MouseEvent) => {
                e.stopPropagation();
                if (network.mac) {
                    try {
                        await virtXmlEdit(
                            vm,
                            "network",
                            { mac: network.mac },
                            { link: { state: network.state === 'up' ? 'down' : 'up' } },
                            { update: vm.state === "running" });
                        domainGet({ connectionName: vm.connectionName, id: vm.id });
                    } catch (ex) {
                        appState.addNotification({
                            text: cockpit.format(_("NIC $0 of VM $1 failed to change state"), network.mac, vm.name),
                            detail: String(ex),
                            resourceId: vm.id,
                        });
                    }
                }
            };
        };

        // Normally we should identify a vNIC to detach by a number of slot, bus, function and domain.
        // Such detachment is however broken in virt-xml, so instead let's detach it by the index of <interface> in array of VM's XML <devices>
        // This serves as workaround for https://github.com/virt-manager/virt-manager/issues/356
        type VMInterfaceWithIndex = VMInterface & { index: number };
        const ifaces: VMInterfaceWithIndex[] = vm.interfaces.map((iface, index) => ({ ...iface, index }));

        interface Detail {
            name: string,
            value: keyof VMInterface | ((network: VMInterfaceWithIndex, networkId: number) => React.ReactNode),
            hidden?: boolean,
            aria?: string,
        }

        // Network data mapping to rows
        let detailMap: Detail[] = [
            {
                name: _("Source"),
                value: (network) => {
                    return (
                        <NetworkSourceAbbrev id={`${id}-network-${networkId}-source-abbrev`} network={network} />
                    );
                },
            },
            {
                name: _("Target"),
                value: (network) => {
                    return (
                        <IPTarget
                            id={`${id}-network-${networkId}-target`}
                            ipInterfaces={this.state.ips.filter(ip => ip.mac === network.mac)}
                        />
                    );
                },
                hidden: !this.state.haveAgentSource,
            },
            {
                name: _("MAC address"),
                value: 'mac',
                hidden: this.state.haveAgentSource,
            },
            {
                name: _("IP address"),
                value: (network) => {
                    return (
                        <IPAddresses
                            id={id}
                            networkId={networkId}
                            ipInterfaces={this.state.ips.filter(ip => ip.mac === network.mac)}
                        />
                    );
                }
            },
            {
                name: _("State"),
                value: (network, networkId) => {
                    return <span className='machines-network-state' id={`${id}-network-${networkId}-state`}>{rephraseUI('networkState', String(network.state))}</span>;
                },
            },
            {
                name: "",
                aria: _("Actions"),
                value: (network, networkId) => {
                    const isUp = network.state === 'up';
                    const nicPersistent = !!vm.inactiveXML.interfaces.filter(iface => iface.mac == network.mac).length;
                    const editNICAction = () => {
                        if (!this.state.networkDevices)
                            return null;

                        const availableSources: AvailableSources = {
                            network: networks.map(network => network.name),
                            device: this.state.networkDevices,
                        };
                        const editNICDialogProps = {
                            idPrefix: `${id}-network-${networkId}-edit-dialog`,
                            vm,
                            // Always edit the inactive version of the interface
                            network: vm.inactiveXML.interfaces[network.index],
                            availableSources,
                        };

                        function open() {
                            Dialogs.show(<EditNICModal {...editNICDialogProps } />);
                        }

                        let isEditDisabled = false;
                        let editDisabledReason;

                        if (!vm.persistent) {
                            isEditDisabled = true;
                            editDisabledReason = _("Editing network interfaces of transient guests is not allowed");
                        } else if (this.state.networkDevices === undefined) {
                            isEditDisabled = true;
                            editDisabledReason = _("Loading available network devices");
                        } else if (!nicPersistent) {
                            isEditDisabled = true;
                            editDisabledReason = _("Editing transient network interfaces is not allowed");
                        }
                        const editButton = (
                            <Button id={editNICDialogProps.idPrefix} variant='secondary'
                                    isAriaDisabled={isEditDisabled}
                                    onClick={open}>
                                {_("Edit")}
                            </Button>
                        );
                        if (isEditDisabled) {
                            return (
                                <Tooltip content={editDisabledReason}>
                                    {editButton}
                                </Tooltip>
                            );
                        } else {
                            return editButton;
                        }
                    };

                    const deleteDialogProps = {
                        title: _("Remove network interface?"),
                        errorMessage: cockpit.format(_("Network interface $0 could not be removed"), network.mac),
                        actionDescription: cockpit.format(_("Network interface $0 will be removed from $1"), network.mac, vm.name),
                        actionName: _("Remove"),
                        deleteHandler: () => virtXmlHotRemove(
                            vm,
                            "network",
                            network.index + 1,
                            nicPersistent,
                        )
                    };
                    const disabled = vm.state != 'shut off' && vm.state != 'running';

                    let deleteButton = (
                        <DeleteResourceButton objectId={`${id}-iface-${networkId}`}
                                              key={`delete-${id}-button`}
                                              disabled={disabled}
                                              dialogProps={deleteDialogProps}
                                              actionName={_("Remove")}
                                              overlayText={_("The VM needs to be running or shut off to detach this device")}
                                              isDropdownItem />
                    );

                    if (disabled) {
                        deleteButton = (
                            <Tooltip id={`delete-${id}-tooltip`}
                                     key={`delete-${id}-tooltip`}
                                     content={_("The VM needs to be running or shut off to detach this device")}>
                                <span>{deleteButton}</span>
                            </Tooltip>
                        );
                    }

                    const isOpen = this.state.dropdownOpenActions == networkId;
                    const setIsOpen = (open: boolean) => {
                        if (!open && this.state.dropdownOpenActions == networkId)
                            this.setState({ dropdownOpenActions: 0 });
                        else if (open)
                            this.setState({ dropdownOpenActions: networkId });
                    };

                    return (
                        <div className='machines-listing-actions'>
                            <Button id={`${id}-iface-${networkId}-` + (isUp ? 'unplug' : 'plug')}
                                    variant='secondary'
                                    onClick={onChangeState(network)}>
                                {isUp ? 'Unplug' : 'Plug'}
                            </Button>
                            {editNICAction()}
                            <KebabDropdown position="right"
                                           toggleButtonId={`${id}-iface-${networkId}-action-kebab`}
                                           dropdownItems={[deleteButton]}
                                           isOpen={isOpen}
                                           setIsOpen={setIsOpen as React.Dispatch<React.SetStateAction<boolean>>} />
                        </div>
                    );
                },
            },
        ];

        let networkId = 1;
        detailMap = detailMap.filter(d => !d.hidden);

        const columnTitles = detailMap.map(target =>
            ({
                title: target.name,
                props: target.aria ? { "aria-label": target.aria } : { },
            }));
        const sortIfaces = (a: VMInterface, b: VMInterface) => {
            if (a.type !== b.type)
                return a.type > b.type ? 1 : -1;
            else if (a.mac !== b.mac)
                return String(a.mac) > String(b.mac) ? 1 : -1;
            else
                return 0;
        };
        const rows = ifaces.sort(sortIfaces).map(target => {
            const columns = detailMap.map(d => {
                let column = null;
                if (typeof d.value === 'string') {
                    if (target[d.value] !== undefined) {
                        column = { title: <div id={`${id}-network-${networkId}-${d.value}`}>{String(target[d.value])}</div> };
                    }
                }
                if (typeof d.value === 'function') {
                    column = { title: d.value(target, networkId) };
                }
                return column;
            });

            const Description = ({ term, children } : { term: string, children: React.ReactNode }) => (
                <DescriptionListGroup>
                    <DescriptionListTerm>{term}</DescriptionListTerm>
                    <DescriptionListDescription>{children}</DescriptionListDescription>
                </DescriptionListGroup>
            );

            const DescriptionWithPending = ({
                id,
                term,
                isPending,
                children,
            } : {
                id: string,
                term: string,
                isPending: boolean,
                children: React.ReactNode
            }) => (
                <Description term={term}>
                    <WithPending id={id} isPending={isPending}>
                        {children}
                    </WithPending>
                </Description>
            );

            const expandedContent = (
                <DescriptionList isAutoFit>
                    { this.state.haveAgentSource &&
                        <Description term={_("MAC address")}>
                            <div id={`${id}-network-${networkId}-mac`}>{target.mac}</div>
                        </Description>
                    }
                    <DescriptionWithPending
                        id={`${id}-network-${networkId}-model`}
                        term={_("Model type")}
                        isPending={needsShutdownIfaceModel(vm, target)}
                    >
                        {target.model}
                    </DescriptionWithPending>
                    <DescriptionWithPending
                        id={`${id}-network-${networkId}-type`}
                        term={_("Type")}
                        isPending={needsShutdownIfaceType(vm, target)}
                    >
                        {target.type}
                    </DescriptionWithPending>
                    <NetworkSourceDescriptions
                        network={target}
                        networkId={networkId}
                        vm={vm}
                        hostDevices={this.hostDevices}
                    />
                    { target.type == "user" &&
                        <DescriptionWithPending
                            id={`${id}-network-${networkId}-backend`}
                            term={_("Backend")}
                            isPending={needsShutdownIfaceBackend(vm, target)}
                        >
                            {target.backend || _("default")}
                        </DescriptionWithPending>
                    }
                    { target.type == "user" && (!target.backend || target.backend == "passt") &&
                        <NetworkPortForwardDescriptions
                            network={target}
                            networkId={networkId}
                            id={id}
                            needsShutdown={needsShutdownIfacePortForward(vm, target)}
                        />
                    }
                </DescriptionList>
            );

            const rowId = networkId;

            networkId++;
            return {
                columns,
                props: {
                    key: cockpit.format("$0-$1-$2", target.mac, target.address.bus || networkId, target.address.slot || ''),
                    'data-row-id': rowId,
                },
                expandedContent,
                hasPadding: true,
            };
        });

        return (
            <ListingTable aria-label={`VM ${vm.name} Network Interface Cards`}
                          gridBreakPoint='grid-lg'
                          variant='compact'
                          emptyCaption={_("No network interfaces")}
                          columns={columnTitles}
                          rows={rows} />
        );
    }
}
