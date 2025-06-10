/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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
import React from 'react';

import type { optString, VM, VMInterface, Network } from '../../../types';
import type { Notification } from '../../../app';

import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { DialogsContext } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { getIfaceSourceName, rephraseUI, vmId } from "../../../helpers.js";
import AddNIC from './nicAdd.jsx';
import { EditNICModal } from './nicEdit.jsx';
import { needsShutdownIfaceModel, needsShutdownIfaceSource, needsShutdownIfaceType, NeedsShutdownTooltip } from '../../common/needsShutdown.jsx';
import './nic.css';
import { domainChangeInterfaceSettings, domainDetachIface, domainInterfaceAddresses, domainGet } from '../../../libvirtApi/domain.js';
import { KebabDropdown } from "cockpit-components-dropdown";
import { ListingTable } from "cockpit-components-table.jsx";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

const _ = cockpit.gettext;

interface NetworkDevice {
    type?: "bridge";
}

const getNetworkDevices = (): Promise<Record<string, NetworkDevice>> => {
    const devs: Record<string, NetworkDevice> = {};
    return cockpit.spawn(["find", "/sys/class/net", "-type", "l", "-printf", '%f\n'], { err: "message" })
            .then(output => {
                output.trim().split('\n')
                        .forEach(dev => { devs[dev] = {} });
                return cockpit.spawn(["ip", "-j", "link", "show", "type", "bridge"], { err: "message" });
            })
            .then(bridges => {
                const bridgeNames: string[] = JSON.parse(bridges).map((br: { ifname: string }) => br.ifname);
                bridgeNames.forEach(br => {
                    if (devs[br]) {
                        devs[br].type = "bridge";
                    }
                });
            })
            .then(() => {
                return Promise.resolve(devs);
            })
            .catch(e => {
                console.warn("could not read /sys/class/net:", e.toString());
                return Promise.resolve({});
            });
};

interface VmNetworkActionsProps {
    vm: VM;
    vms: VM[];
    networks: Network[];
}

interface VmNetworkActionsState {
    networkDevices: Record<string, NetworkDevice> | undefined;
}

export interface AvailableSources {
    network: string[];
    device: Record<string, NetworkDevice>;
}

export class VmNetworkActions extends React.Component<VmNetworkActionsProps, VmNetworkActionsState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: VmNetworkActionsProps) {
        super(props);

        this.state = {
            networkDevices: undefined,
        };
    }

    componentDidMount() {
        // only consider symlinks -- there might be other stuff like "bonding_masters" which we don't want
        getNetworkDevices().then(devs => this.setState({ networkDevices: devs }));
    }

    render() {
        if (!this.state.networkDevices)
            return null;

        const Dialogs = this.context;
        const { vm, vms, networks } = this.props;
        const id = vmId(vm.name);
        const availableSources: AvailableSources = {
            network: networks.map(network => network.name),
            device: this.state.networkDevices,
        };

        const open = () => {
            Dialogs.show(<AddNIC idPrefix={`${id}-add-iface`}
                                 vm={vm}
                                 vms={vms}
                                 availableSources={availableSources} />);
        };

        return (
            <Button id={`${id}-add-iface-button`} variant="secondary"
                    isDisabled={this.state.networkDevices === undefined}
                    onClick={open}>
                {_("Add network interface")}
            </Button>
        );
    }
}

interface NetworkManagerDeviceProxy extends cockpit.DBusProxy {
    Interface: string;
}

const NetworkSource = ({
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
            <DescriptionListGroup>
                <DescriptionListTerm>
                    {label}
                </DescriptionListTerm>
                <DescriptionListDescription>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-source`}>
                        <FlexItem>
                            {checkDeviceAvailability(source)
                                ? <Button variant="link" isInline onClick={sourceJump(source)}>{source}</Button>
                                : source}
                        </FlexItem>
                        {needsShutdownIfaceSource(vm, network) && <NeedsShutdownTooltip iconId={`${id}-network-${networkId}-source-tooltip`} tooltipId="tip-network" />}
                    </Flex>
                </DescriptionListDescription>
                { network.source.mode &&
                    <>
                        <DescriptionListTerm>
                            {_("Mode")}
                        </DescriptionListTerm>
                        <DescriptionListDescription id={`${id}-network-${networkId}-source-mode`}>
                            {network.source.mode}
                        </DescriptionListDescription>
                    </>
                }
            </DescriptionListGroup>
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
        <DescriptionList isHorizontal isFluid>
            {source}
            {network.target && <DescriptionListGroup>
                <DescriptionListTerm>
                    {_("TAP device")}
                </DescriptionListTerm>
                <DescriptionListDescription id={`${id}-network-${networkId}-tapdevice`}>
                    {network.target}
                </DescriptionListDescription>
            </DescriptionListGroup>}
        </DescriptionList>
    );
};

interface VmNetworkTabProps {
    vm: VM,
    networks: Network[],
    onAddErrorNotification: (notification: Notification) => void;
}

interface IpAddress {
    name: string,
    mac: string,
    ip: Record<string, string>,
    source: string,
}

interface VmNetworkTabState {
    networkDevices: Record<string, NetworkDevice> | undefined,
    ips: IpAddress[],
    dropdownOpenActions: Set<unknown>,
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
            dropdownOpenActions: new Set(),
        };

        this.deviceProxyHandler = this.deviceProxyHandler.bind(this);
        this.getIpAddr = this.getIpAddr.bind(this);
        this.client = cockpit.dbus("org.freedesktop.NetworkManager");
        const proxies = this.client.proxies("org.freedesktop.NetworkManager.Device");
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

                    if (allRejected) {
                        this.props.onAddErrorNotification({
                            text: cockpit.format(_("Failed to fetch the IP addresses of the interfaces present in $0"), this.props.vm.name),
                            detail: [...new Set(domifaddressAllSources.map(promise => promise.status == 'rejected' && promise.reason ? promise.reason.message : ''))].join(', '),
                            resourceId: this.props.vm.id,
                        });
                    } else {
                        const ipaddresses: IpAddress[] = [];

                        domifaddressAllSources
                                .filter(promise => promise.status == 'fulfilled')
                                .forEach(promise => {
                                    const ifaces = promise.value[0];

                                    ifaces.forEach(iface => {
                                        // Ignore loopback interface
                                        if (!iface.length || iface[0] == "lo")
                                            return;

                                        const address: IpAddress = {
                                            name: iface[0],
                                            mac: iface[1],
                                            ip: { },
                                            source: promise.value.source,
                                        };
                                        iface[2].forEach(ifAddress => {
                                            // type == 0 -> ipv4
                                            // type == 1 -> ipv6
                                            const type = ifAddress[0] == 0 ? 'inet' : 'inet6';

                                            if (ifAddress.length && ifAddress[0] <= 1) {
                                                // 0 cell -> type, 1 cell -> address, 2 cell -> prefix
                                                address.ip[type] = ifAddress[1] + '/' + ifAddress[2];
                                            }
                                        });
                                        ipaddresses.push(address);
                                    });
                                });
                        this.setState({ ips: ipaddresses });
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
        const { vm, networks, onAddErrorNotification } = this.props;
        const id = vmId(vm.name);

        const onChangeState = (network: VMInterface) => {
            return (e: React.MouseEvent) => {
                e.stopPropagation();
                if (network.mac) {
                    domainChangeInterfaceSettings({ vmName: vm.name, connectionName: vm.connectionName, macAddress: network.mac, state: network.state === 'up' ? 'down' : 'up', hotplug: vm.state === "running" })
                            .then(() => domainGet({ connectionName: vm.connectionName, id: vm.id }))
                            .catch(ex => {
                                onAddErrorNotification({
                                    text: cockpit.format(_("NIC $0 of VM $1 failed to change state"), network.mac, vm.name),
                                    detail: ex.message,
                                    resourceId: vm.id,
                                });
                            });
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
            props: object,
            hidden?: boolean,
            aria?: string,
        }

        // Network data mapping to rows
        let detailMap: Detail[] = [
            {
                name: _("Type"),
                value: (network, networkId) => {
                    return (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-type`}>
                            <FlexItem>{network.type}</FlexItem>
                            {needsShutdownIfaceType(vm, network) && <NeedsShutdownTooltip iconId={`${id}-network-${networkId}-type-tooltip`} tooltipId="tip-network" />}
                        </Flex>
                    );
                },
                props: { width: 10 },
                hidden: ifaces.every(i => !i.type),
            },
            {
                name: _("Model type"),
                value: (network, networkId) => {
                    return (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-model`}>
                            <FlexItem>{network.model}</FlexItem>
                            {needsShutdownIfaceModel(vm, network) && <NeedsShutdownTooltip iconId={`${id}-network-${networkId}-model-tooltip`} tooltipId="tip-network" />}
                        </Flex>
                    );
                },
                props: { width: 10 },
                hidden: ifaces.every(i => !i.model),
            },
            {
                name: _("MAC address"),
                value: 'mac',
                props: { width: 15 },
                hidden: ifaces.every(i => !i.mac),
            },
            {
                name: _("IP address"),
                value: (network, networkId) => {
                    const ips = this.state.ips.filter(ip => ip.mac === network.mac);

                    const ip: { inet?: string, inet6?: string } = {};
                    // If information from agent are available, it's preferred over lease/arp
                    ips.sort((a) => a.source === "agent" ? -1 : 1).forEach(a => {
                        // Various sources (agent,lease,arp) may have only partial information about interface
                        // (e.g. one source may only know ipv4 address, the other may only know ipv6 address)
                        // Therefore, look at each source to get all available information
                        if (!ip.inet && a.ip.inet)
                            ip.inet = a.ip.inet;
                        if (!ip.inet6 && a.ip.inet6)
                            ip.inet6 = a.ip.inet6;
                    });

                    if (Object.values(ip).length === 0) {
                        // There is not IP address associated with this NIC
                        return (
                            <span id={`${id}-network-${networkId}-ip-unknown`}>
                                {_("Unknown")}
                            </span>
                        );
                    } else {
                        return (
                            <DescriptionList isHorizontal isFluid>
                                {ip.inet && <DescriptionListGroup>
                                    <DescriptionListTerm>
                                        {_("inet")}
                                    </DescriptionListTerm>
                                    <DescriptionListDescription id={`${id}-network-${networkId}-ipv4-address`}>
                                        {ip.inet}
                                    </DescriptionListDescription>
                                </DescriptionListGroup>}
                                {ip.inet6 && <DescriptionListGroup>
                                    <DescriptionListTerm>
                                        {_("inet6")}
                                    </DescriptionListTerm>
                                    <DescriptionListDescription id={`${id}-network-${networkId}-ipv6-address`}>
                                        {ip.inet6}
                                    </DescriptionListDescription>
                                </DescriptionListGroup>}
                            </DescriptionList>
                        );
                    }
                },
                props: { width: Object.keys(this.state.ips).length ? 20 : 10 },
                hidden: this.props.vm.state != 'running' && this.props.vm.state != 'paused',
            },
            {
                name: _("Source"),
                value: (network, networkId) => <NetworkSource network={network} networkId={networkId} vm={vm} hostDevices={this.hostDevices} />,
                props: { width: 15 }
            },
            {
                name: _("State"),
                value: (network, networkId) => {
                    return <span className='machines-network-state' id={`${id}-network-${networkId}-state`}>{rephraseUI('networkState', String(network.state))}</span>;
                },
                props: { width: 10 },
                hidden: ifaces.every(i => !i.state),
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
                            network,
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
                        deleteHandler: () => domainDetachIface({ connectionName: vm.connectionName, index: network.index, vmName: vm.name, live: vm.state === 'running', persistent: vm.persistent && nicPersistent }),
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

                    const isOpen = this.state.dropdownOpenActions.has(network.mac);
                    const setIsOpen = (open: boolean) => {
                        const next = new Set(this.state.dropdownOpenActions);
                        if (open)
                            next.add(network.mac);
                        else
                            next.delete(network.mac);

                        this.setState({ dropdownOpenActions: next });
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
                props: { width: 10 }
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
                        column = { title: <div id={`${id}-network-${networkId}-${d.value}`}>{String(target[d.value])}</div>, props: d.props };
                    }
                }
                if (typeof d.value === 'function') {
                    column = { title: d.value(target, networkId), props: d.props };
                }
                return column;
            });
            networkId++;
            return { columns, props: { key: cockpit.format("$0-$1-$2", target.mac, target.address.bus || networkId, target.address.slot || '') } };
        });

        return (
            <ListingTable aria-label={`VM ${vm.name} Network Interface Cards`}
                          gridBreakPoint='grid-lg'
                          variant='compact'
                          emptyCaption={_("No network interfaces defined for this VM")}
                          columns={columnTitles}
                          rows={rows} />
        );
    }
}
