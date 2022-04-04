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
import PropTypes from 'prop-types';
import { Button, Flex, FlexItem, Tooltip } from '@patternfly/react-core';

import cockpit from 'cockpit';
import { rephraseUI, vmId } from "../../../helpers.js";
import AddNIC from './nicAdd.jsx';
import { EditNICModal } from './nicEdit.jsx';
import WarningInactive from '../../common/warningInactive.jsx';
import './nic.css';
import { domainChangeInterfaceSettings, domainDetachIface, domainInterfaceAddresses, domainGet } from '../../../libvirtApi/domain.js';
import { ListingTable } from "cockpit-components-table.jsx";
import { DeleteResourceButton, DeleteResourceModal } from '../../common/deleteResource.jsx';

const _ = cockpit.gettext;

const getNetworkDevices = (updateState) => {
    cockpit.spawn(["find", "/sys/class/net", "-type", "l", "-printf", '%f\n'], { err: "message" })
            .then(output => {
                const devs = output.trim().split('\n');
                updateState(devs);
            })
            .catch(e => console.warn("could not read /sys/class/net:", e.toString()));
};

export class VmNetworkActions extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            showAddNICModal: false,
            networkDevices: undefined,
        };

        this.open = this.open.bind(this);
        this.close = this.close.bind(this);
    }

    close() {
        this.setState({ showAddNICModal: false });
    }

    open() {
        this.setState({ showAddNICModal: true });
    }

    componentDidMount() {
        // only consider symlinks -- there might be other stuff like "bonding_masters" which we don't want
        getNetworkDevices(devs => this.setState({ networkDevices: devs }));
    }

    render() {
        const { vm, vms, networks } = this.props;
        const id = vmId(vm.name);
        const availableSources = {
            network: networks.map(network => network.name),
            device: this.state.networkDevices,
        };
        return (<>
            {this.state.showAddNICModal && this.state.networkDevices !== undefined &&
                <AddNIC idPrefix={`${id}-add-iface`}
                    vm={vm}
                    vms={vms}
                    availableSources={availableSources}
                    close={this.close} />}
            <Button id={`${id}-add-iface-button`} variant="secondary" onClick={this.open}>
                {_("Add network interface")}
            </Button>
        </>);
    }
}

VmNetworkActions.propTypes = {
    vm: PropTypes.object.isRequired,
    vms: PropTypes.array.isRequired,
    networks: PropTypes.array.isRequired,
};

export class VmNetworkTab extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            domifaddressAllSources: [],
            networkDevices: undefined,
            ips: {},
        };

        this.deviceProxyHandler = this.deviceProxyHandler.bind(this);
        this.getIpAddr = this.getIpAddr.bind(this);
        this.client = cockpit.dbus("org.freedesktop.NetworkManager", {});
        this.hostDevices = this.client.proxies("org.freedesktop.NetworkManager.Device");
        this.hostDevices.addEventListener('changed', this.deviceProxyHandler);
        this.hostDevices.addEventListener('removed', this.deviceProxyHandler);
    }

    deviceProxyHandler() {
        this.forceUpdate();
    }

    getIpAddr() {
        if (this.props.vm.state != 'running' && this.props.vm.state != 'paused') {
            this.setState({ ips: {} });
            return;
        }

        domainInterfaceAddresses({ connectionName: this.props.vm.connectionName, objPath: this.props.vm.id })
                .then(domifaddressAllSources => {
                    const allRejected = !domifaddressAllSources.some(promise => promise.status == 'fulfilled');

                    if (allRejected)
                        this.props.onAddErrorNotification({
                            text: cockpit.format(_("Failed to fetch the IP addresses of the interfaces present in $0"), this.props.vm.name),
                            detail: [...new Set(domifaddressAllSources.map(promise => promise.reason ? promise.reason.message : ''))].join(', '),
                            resourceId: this.props.vm.id,
                        });
                    else {
                        const ipaddr = {};

                        domifaddressAllSources
                                .filter(promise => promise.status == 'fulfilled')
                                .forEach(promise => {
                                    const ifaces = promise.value[0];

                                    ifaces.forEach(iface => {
                                        // Ignore loopback interface
                                        if (!iface.length || iface[0] == "lo")
                                            return;

                                        iface[2].forEach(ifAddress => {
                                            // type == 0 -> ipv4
                                            // type == 1 -> ipv6
                                            const type = ifAddress[0] == 0 ? 'inet' : 'inet6';

                                            if (ifAddress.length && !ipaddr[type] && ifAddress[0] <= 1) {
                                                // 0 cell -> type, 1 cell -> address, 2 cell -> prefix
                                                ipaddr[type] = ifAddress[1] + '/' + ifAddress[2];
                                            }
                                        });
                                    });
                                });
                        this.setState({ ips: ipaddr });
                    }
                });
    }

    componentDidMount() {
        // only consider symlinks -- there might be other stuff like "bonding_masters" which we don't want
        getNetworkDevices(devs => this.setState({ networkDevices: devs }));
        this.getIpAddr();
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevProps.vm.state !== this.props.vm.state)
            this.getIpAddr();
    }

    componentWillUnmount() {
        this.client.close();
    }

    render() {
        const { vm, networks, onAddErrorNotification } = this.props;
        const id = vmId(vm.name);
        const availableSources = {
            network: networks.map(network => network.name),
            device: this.state.networkDevices,
        };

        const nicLookupByMAC = (interfacesList, mac) => {
            return interfacesList.filter(iface => iface.mac == mac)[0];
        };

        const checkDeviceAviability = (network) => {
            for (const i in this.hostDevices) {
                if (this.hostDevices[i].valid && this.hostDevices[i].Interface == network) {
                    return true;
                }
            }
            return false;
        };

        const sourceJump = (source) => {
            return () => {
                if (source !== null && checkDeviceAviability(source)) {
                    cockpit.jump(`/network#/${source}`, cockpit.transport.host);
                }
            };
        };

        const onChangeState = (network) => {
            return (e) => {
                e.stopPropagation();
                if (network.mac) {
                    domainChangeInterfaceSettings({ vmName: vm.name, connectionName: vm.connectionName, macAddress: network.mac, state: network.state === 'up' ? 'down' : 'up', hotplug: vm.state === "running" })
                            .then(() => domainGet({ connectionName: vm.connectionName, id:vm.id, name: vm.name }))
                            .catch(ex => {
                                onAddErrorNotification({
                                    text: cockpit.format(_("NIC $0 of VM $1 failed to change state"), network.mac, vm.name),
                                    detail: ex.message, resourceId: vm.id,
                                });
                            });
                }
            };
        };

        // Network data mapping to rows
        let detailMap = [
            {
                name: _("Type"), value: (network, networkId) => {
                    const inactiveNIC = nicLookupByMAC(vm.inactiveXML.interfaces, network.mac);
                    return (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-type`}>
                            <FlexItem>{network.type}</FlexItem>
                            {inactiveNIC && inactiveNIC.type !== network.type && <WarningInactive iconId={`${id}-network-${networkId}-type-tooltip`} tooltipId="tip-network" />}
                        </Flex>
                    );
                },
                props: { width: 10 }
            },
            {
                name: _("Model type"), value: (network, networkId) => {
                    const inactiveNIC = nicLookupByMAC(vm.inactiveXML.interfaces, network.mac);
                    return (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-model`}>
                            <FlexItem>{network.model}</FlexItem>
                            {inactiveNIC && inactiveNIC.model !== network.model && <WarningInactive iconId={`${id}-network-${networkId}-model-tooltip`} tooltipId="tip-network" />}
                        </Flex>
                    );
                },
                props: { width: 10 }
            },
            { name: _("MAC address"), value: 'mac', props: { width: 20 } },
            {
                name: _("IP address"), value: () => {
                    if (this.props.vm.state != 'running' && this.props.vm.state != 'paused')
                        return '';

                    const ips = this.state.ips;

                    if (!Object.keys(ips).length) {
                        // There is not IP address associated with this NIC
                        return _("Unknown");
                    } else {
                        return (
                            <>
                                {ips.inet && <div id={`${id}-network-${networkId}-ipv4-address`}>
                                    {'inet ' + ips.inet}
                                </div>}
                                {ips.inet6 && <div id={`${id}-network-${networkId}-ipv6-address`}>
                                    {'inet6 ' + ips.inet6}
                                </div>}
                            </>
                        );
                    }
                },
                props: { width: 20 }
            },
            {
                name: _("Source"), value: (network, networkId) => {
                    const singleSourceElem = source => checkDeviceAviability(source) ? <Button variant="link" isInline onClick={sourceJump(source)}>{source}</Button> : source;
                    const addressPortSourceElem = (source, networkId) => (<table id={`${id}-network-${networkId}-source`}>
                        <tbody>
                            <tr><td className='machines-network-source-descr'>{_("Address")}</td><td className='machines-network-source-value'>{source.address}</td></tr>
                            <tr><td className='machines-network-source-descr'>{_("Port")}</td><td className='machines-network-source-value'>{source.port}</td></tr>
                        </tbody>
                    </table>);

                    const getIfaceSourceName = (iface) => {
                        const mapper = {
                            direct: source => source.dev,
                            network: source => source.network,
                            bridge: source => source.bridge,
                            mcast: source => ({ address: source.address, port: source.port }),
                            server: source => ({ address: source.address, port: source.port }),
                            client: source => ({ address: source.address, port: source.port }),
                            udp: source => ({ address: source.address, port: source.port }),
                        };

                        return mapper[iface.type](iface.source);
                    };

                    const getSourceElem = {
                        direct: singleSourceElem,
                        network: singleSourceElem,
                        bridge: singleSourceElem,
                        mcast: addressPortSourceElem,
                        server: addressPortSourceElem,
                        client: addressPortSourceElem,
                        udp: addressPortSourceElem,
                    };

                    if (getSourceElem[network.type] !== undefined) {
                        const inactiveNIC = nicLookupByMAC(vm.inactiveXML.interfaces, network.mac);
                        return (
                            <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-network-${networkId}-source`}>
                                <FlexItem>{getSourceElem[network.type](getIfaceSourceName(network), networkId)}</FlexItem>
                                {inactiveNIC && getIfaceSourceName(inactiveNIC) !== getIfaceSourceName(network) && <WarningInactive iconId={`${id}-network-${networkId}-source-tooltip`} tooltipId="tip-network" />}
                            </Flex>
                        );
                    } else {
                        return null;
                    }
                },
                props: { width: 10 }
            },
            {
                name: _("State"), value: (network, networkId) => {
                    return <span className='machines-network-state' id={`${id}-network-${networkId}-state`}>{rephraseUI('networkState', network.state)}</span>;
                },
                props: { width: 10 }
            },
            {
                name: "", value: (network, networkId) => {
                    const isUp = network.state === 'up';
                    const nicPersistent = !!vm.inactiveXML.interfaces.filter(iface => iface.mac == network.mac).length;
                    const editNICAction = () => {
                        const editNICDialogProps = {
                            idPrefix: `${id}-network-${networkId}-edit-dialog`,
                            vm,
                            network,
                            availableSources,
                            onClose: () => this.setState({ editNICDialogProps: undefined }),
                        };

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
                                    onClick={() => this.setState({ editNICDialogProps })}>
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
                        onClose: () => this.setState({ deleteDialogProps: undefined }),
                        actionName: _("Remove"),
                        deleteHandler: () => domainDetachIface({ connectionName: vm.connectionName, index: network.index, vmName: vm.name, live: vm.state === 'running', persistent: nicPersistent }),
                    };
                    const deleteNICAction = (
                        <DeleteResourceButton objectId={`${id}-iface-${networkId}`}
                                              disabled={vm.state != 'shut off' && vm.state != 'running'}
                                              showDialog={() => this.setState({ deleteDialogProps })}
                                              actionName={_("Remove")}
                                              overlayText={_("The VM needs to be running or shut off to detach this device")} />
                    );

                    return (
                        <div className='machines-listing-actions'>
                            {deleteNICAction}
                            <Button id={`${id}-iface-${networkId}-` + (isUp ? 'unplug' : 'plug')}
                                    variant='secondary'
                                    onClick={onChangeState(network)}>
                                {isUp ? 'Unplug' : 'Plug'}
                            </Button>
                            {editNICAction()}
                        </div>
                    );
                },
                props: { width: 20 }
            },
        ];

        let networkId = 1;
        detailMap = detailMap.filter(d => !d.hidden);

        const columnTitles = detailMap.map(target => target.name);
        const sortIfaces = (a, b) => {
            if (a.type !== b.type)
                return a.type > b.type ? 1 : -1;
            else if (a.mac !== b.mac)
                return a.mac > b.mac ? 1 : -1;
            else
                return 0;
        };
        // Normally we should identify a vNIC to detach by a number of slot, bus, function and domain.
        // Such detachment is however broken in virt-xml, so instead let's detach it by the index of <interface> in array of VM's XML <devices>
        // This serves as workaround for https://github.com/virt-manager/virt-manager/issues/356
        const ifaces = vm.interfaces.map((iface, index) => ({ ...iface, index }));
        const rows = ifaces.sort(sortIfaces).map(target => {
            const columns = detailMap.map(d => {
                let column = null;
                if (typeof d.value === 'string') {
                    if (target[d.value] !== undefined) {
                        column = { title: <div id={`${id}-network-${networkId}-${d.value}`}>{target[d.value]}</div>, props: d.props };
                    }
                }
                if (typeof d.value === 'function') {
                    column = { title: d.value(target, networkId, vm.connectionName), props: d.props };
                }
                return column;
            });
            networkId++;
            return { columns, props: { key: cockpit.format("$0-$1-$2", target.mac, target.address.bus || networkId, target.address.slot || '') } };
        });

        return (
            <>
                {this.state.deleteDialogProps && <DeleteResourceModal {...this.state.deleteDialogProps} />}
                {this.state.editNICDialogProps && <EditNICModal {...this.state.editNICDialogProps } />}
                <ListingTable aria-label={`VM ${vm.name} Network Interface Cards`}
                    gridBreakPoint='grid-xl'
                    variant='compact'
                    emptyCaption={_("No network interfaces defined for this VM")}
                    columns={columnTitles}
                    rows={rows} />
            </>
        );
    }
}

VmNetworkTab.propTypes = {
    vm: PropTypes.object.isRequired,
    networks: PropTypes.array.isRequired,
    onAddErrorNotification: PropTypes.func.isRequired,
};
