/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
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
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch";
import { Text, TextVariants } from "@patternfly/react-core/dist/esm/components/Text";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import cockpit from 'cockpit';

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { networkId } from '../../helpers.js';
import { networkGet, networkAddStaticHostEntries, networkChangeAutostart, networkRemoveStaticHostEntries } from '../../libvirtApi/network.js';
import { DeleteResourceButton } from '../common/deleteResource.jsx';

import '../common/overviewCard.css';

const _ = cockpit.gettext;

const DHCPHost = (host, index, family, idPrefix, network, parentIndex) => {
    const id = `${idPrefix}-${family}-dhcp-host-${index}`;

    const hostVals = [];
    if (host.name)
        hostVals.push(_("Name: ") + host.name);
    if (host.mac) // MAC for ipv4, ID for ipv6
        hostVals.push("MAC: " + host.mac);
    else if (host.id)
        hostVals.push("ID: " + host.id);
    if (host.ip)
        hostVals.push("IP: " + host.ip);

    const hostInfo = hostVals.join(", ");

    const removeDHCPHostButton = (
        <DeleteResourceButton objectId={`${id}-button`}
                              actionName={_("remove")}
                              isLink
                              isInline
                              dialogProps={{
                                  title: _("Remove static host from DHCP"),
                                  errorMessage: _("Static host from DHCP could not be removed"),
                                  actionDescription: cockpit.format(_("The static host entry for $0 will be removed:"), host.ip),
                                  objectDescription: [
                                      { name: _("IP"), value: <span className="ct-monospace">{host.ip}</span> },
                                      { name: _("MAC"), value: <span className="ct-monospace">{host.mac}</span> }
                                  ],
                                  actionName: _("Remove"),
                                  deleteHandler: () => networkRemoveStaticHostEntries({
                                      connectionName: network.connectionName,
                                      objPath: network.id,
                                      macAddress: host.mac,
                                      ipAddress: host.ip,
                                      parentIndex,
                                      isNetworkActive: network.active
                                  }).then(() => networkGet({ connectionName: network.connectionName, id: network.id, updateOnly: true }))
                              }} />
    );

    return (
        <ListItem key={index} id={id}>
            <Flex>
                <Flex flex={{ default: 'flex_4' }}>
                    {hostInfo}
                </Flex>
                <Flex>
                    {removeDHCPHostButton}
                </Flex>
            </Flex>
        </ListItem>
    );
};

export const NetworkOverviewTab = ({ network }) => {
    const idPrefix = `${networkId(network.name, network.connectionName)}`;

    const ip = [];
    // Libvirt allows network to have multiple ipv6 and ipv4 addresses.
    // But we only first one of each
    ip[0] = network.ip.find(ip => ip.family === "ipv4");
    ip[1] = network.ip.find(ip => ip.family === "ipv6");

    return (
        <Flex className="overview-tab">
            <FlexItem>
                <DescriptionList>
                    <Text component={TextVariants.h4}>
                        {_("General")}
                    </Text>

                    <DescriptionListGroup>
                        <DescriptionListTerm> {_("Persistent")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-persistent`}> {network.persistent ? _("yes") : _("no")} </DescriptionListDescription>
                    </DescriptionListGroup>

                    {network.persistent && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Autostart")} </DescriptionListTerm>
                        <DescriptionListDescription>
                            <Switch id={`${idPrefix}-autostart`}
                                    isChecked={network.autostart}
                                    onChange={(_, autostart) => networkChangeAutostart({ network, autostart })}
                                    label={_("Run when host boots")} />
                        </DescriptionListDescription>
                    </DescriptionListGroup>}

                    { network.mtu && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Maximum transmission unit")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-mtu`}> {network.mtu} </DescriptionListDescription>
                    </DescriptionListGroup> }
                </DescriptionList>
            </FlexItem>

            { ip[0] && <FlexItem>
                <DescriptionList>
                    <Text component={TextVariants.h4}>
                        {_("IPv4 address")}
                    </Text>

                    { ip[0].address && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Address")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-ipv4-address`}> {ip[0].address} </DescriptionListDescription>
                    </DescriptionListGroup> }

                    { ip[0].netmask && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Netmask")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-ipv4-netmask`}> {ip[0].netmask} </DescriptionListDescription>
                    </DescriptionListGroup> }

                    <StaticDHCPSettings idPrefix={idPrefix} ip={ip} network={network} protocol='ipv4' />
                </DescriptionList>
            </FlexItem>}

            { ip[1] && <FlexItem>
                <DescriptionList>
                    <Text component={TextVariants.h4}>
                        {_("IPv6 address")}
                    </Text>

                    { ip[1].address && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Address")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-ipv6-address`}> {ip[1].address} </DescriptionListDescription>
                    </DescriptionListGroup> }

                    { ip[1].prefix && <DescriptionListGroup>
                        <DescriptionListTerm> {_("Prefix")} </DescriptionListTerm>
                        <DescriptionListDescription id={`${idPrefix}-ipv6-prefix`}> {ip[1].prefix} </DescriptionListDescription>
                    </DescriptionListGroup> }

                    <StaticDHCPSettings idPrefix={idPrefix} ip={ip} network={network} protocol='ipv6' />
                </DescriptionList>
            </FlexItem>}
        </Flex>
    );
};

NetworkOverviewTab.propTypes = {
    network: PropTypes.object.isRequired,
};

const NetworkAddStaticHostEntriesAction = ({ idPrefix, network, parentIndex }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <Button variant="link"
                    id={idPrefix + "-static-host-entries-add"}
                    isInline
                    onClick={() => setIsOpen(true)}>
                {_("add entry")}
            </Button>
            {isOpen && <NetworkAddStaticHostEntries idPrefix={idPrefix}
                                                    network={network} parentIndex={parentIndex}
                                                    setIsOpen={setIsOpen} />}
        </>
    );
};

const NetworkAddStaticHostEntries = ({ idPrefix, network, parentIndex, setIsOpen }) => {
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [ipAddress, setIpAddress] = useState('');
    const [macAddress, setMacAddress] = useState('');
    const [error, setError] = useState();

    const add = () => {
        setIsSubmitted(true);

        if (!ipAddress || !macAddress)
            return;

        return networkAddStaticHostEntries({
            connectionName: network.connectionName,
            objPath: network.id,
            macAddress,
            ipAddress,
            parentIndex,
            isNetworkActive: network.active,
        })
                .then(
                    () => {
                        setIsOpen(false);
                        networkGet({ connectionName: network.connectionName, id: network.id, updateOnly: true });
                    },
                    exc => setError(exc.message)
                );
    };

    return (
        <>
            <Modal id="add-new-static-entry" position="top" variant="small" isOpen onClose={() => setIsOpen(false)}
                title={_("Add a DHCP static host entry")}
                footer={
                    <>
                        <Button variant='primary' onClick={add} id="add-new-static-entry-save">
                            {_("Add")}
                        </Button>
                        <Button variant='link' id="add-new-static-entry-cancel" onClick={() => setIsOpen(false)}>
                            {_("Cancel")}
                        </Button>
                    </>
                }>
                <Form onSubmit={e => {
                    e.preventDefault();
                }} isHorizontal>
                    {error && <ModalError dialogError={_("Failed to save network settings")} dialogErrorDetail={error} />}
                    <FormGroup label={_("MAC address")} fieldId="add-new-static-entry-mac-address">
                        <TextInput id="add-new-static-entry-mac-address"
                                   validated={isSubmitted && !macAddress ? "error" : "default"}
                                   value={macAddress}
                                   onChange={(_, value) => setMacAddress(value)} />
                        <FormHelper fieldId="add-new-static-entry-mac-address" helperTextInvalid={isSubmitted && !macAddress && _("MAC address must not be empty")} />
                    </FormGroup>
                    <FormGroup label={_("IP address")} fieldId="add-new-static-entry-ip-address">
                        <TextInput id="add-new-static-entry-ip-address"
                                   validated={isSubmitted && !ipAddress ? "error" : "default"}
                                   value={ipAddress}
                                   onChange={(_, value) => setIpAddress(value)} />
                        <FormHelper fieldId="add-new-static-entry-ip-address" helperTextInvalid={isSubmitted && !ipAddress && _("IP address must not be empty")} />
                    </FormGroup>
                </Form>
            </Modal>
        </>
    );
};

const StaticDHCPSettings = ({ idPrefix, ip, network, protocol }) => {
    const parentIndex = protocol == 'ipv4' ? 0 : 1;

    return (
        <>
            <Text component={TextVariants.h5}>
                {_("DHCP Settings")}
            </Text>
            { ip[parentIndex].dhcp.range.start &&
            <DescriptionListGroup>
                <DescriptionListTerm> {_("Range")} </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-${protocol}-dhcp-range`}>
                    {ip[parentIndex].dhcp.range.start + " - " + ip[parentIndex].dhcp.range.end}
                </DescriptionListDescription>
            </DescriptionListGroup>}
            <DescriptionListGroup>
                <DescriptionListTerm>
                    <Flex>
                        <FlexItem>{_("Static host entries")}</FlexItem>
                        {protocol == 'ipv4' && <NetworkAddStaticHostEntriesAction idPrefix={idPrefix} network={network} parentIndex={parentIndex} />}
                    </Flex>
                </DescriptionListTerm>
                <DescriptionListDescription id={`${idPrefix}-${protocol}-dhcp-static`}>
                    <List isPlain>
                        { ip[parentIndex].dhcp.hosts.length
                            ? ip[parentIndex].dhcp.hosts.map((host, index) => DHCPHost(host, index, ip[parentIndex].family, idPrefix, network, parentIndex))
                            : <ListItem>{_("none")}</ListItem>
                        }
                    </List>
                </DescriptionListDescription>
            </DescriptionListGroup>
        </>
    );
};
