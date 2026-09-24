/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import type { ConnectionName } from '../../types';
import type { Dialogs } from 'dialogs';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption, FormSelectOptionGroup } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { useDialogs, DialogsContext } from 'dialogs.jsx';
import { FormHelper } from 'cockpit-components-form-helper.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { networkCreate } from '../../libvirtApi/network.js';
import {
    isEmpty, LIBVIRT_SYSTEM_CONNECTION, rephraseUI, bridgeHasVlanFiltering, getNetworkBridges, getNetworkDevices
} from '../../helpers.js';
import * as utils from './utils';
import cockpit from 'cockpit';

const _ = cockpit.gettext;

const ConnectionRow = ({ connectionName } : { connectionName: ConnectionName }) => {
    return (
        <FormGroup fieldId="create-network-connection-name" label={_("Connection")} hasNoPaddingTop>
            <div id="create-network-connection-name">
                {connectionName}
            </div>
        </FormGroup>
    );
};

interface DialogValues {
    name: string;
    forwardMode: string;
    device: string;
    ip: string;
    netmask: string;
    ipv4: string;
    ipv4DhcpEnabled: boolean;
    ipv4DhcpRangeStart: string;
    ipv4DhcpRangeEnd: string;
    ipv6: string;
    prefix: string;
    ipv6DhcpEnabled: boolean;
    ipv6DhcpRangeStart: string;
    ipv6DhcpRangeEnd: string;
    vlanEnabled: boolean;
    vlanIds: string;
    vlanNative: string;
}

type OnValueChanged = <K extends keyof DialogValues>(key: K, value: DialogValues[K]) => void;

interface ValidationFailed {
    name?: string;
    device?: string;
    netmask?: string;
    ipv4?: string;
    ipv4DhcpRangeStart?: string;
    ipv4DhcpRangeEnd?: string;
    ipv6?: string;
    prefix?: string;
    ipv6DhcpRangeStart?: string;
    ipv6DhcpRangeEnd?: string;
    vlanIds?: string;
    vlanNative?: string;
}

function validateParams(dialogValues: DialogValues): ValidationFailed {
    const validationFailed: ValidationFailed = {};

    if (isEmpty(dialogValues.name.trim()))
        validationFailed.name = _("Name should not be empty");

    // libvirt does not create the bridge for this mode, it has to exist on the host
    if (dialogValues.forwardMode === "bridge" && isEmpty(dialogValues.device))
        validationFailed.device = _("No bridge devices available on the host");

    if (dialogValues.forwardMode === "bridge" && dialogValues.vlanEnabled) {
        const hasIds = !isEmpty(dialogValues.vlanIds.trim());
        const hasNative = !isEmpty(dialogValues.vlanNative.trim());

        // the native VLAN is allowed on the port implicitly, so either field alone is enough
        if (!hasIds && !hasNative)
            validationFailed.vlanIds = _("VLAN IDs or native VLAN should not be empty");
        else if (hasIds && !utils.parseVlanIds(dialogValues.vlanIds))
            validationFailed.vlanIds = _("Invalid VLAN IDs, expected numbers or ranges between 1 and 4094");

        if (hasNative && !utils.validateVlanId(dialogValues.vlanNative))
            validationFailed.vlanNative = _("Invalid VLAN ID");
    }

    if (dialogValues.ip === "IPv4 only" || dialogValues.ip === "IPv4 and IPv6") {
        let ipv4_prefix: number | null = null;

        if (isEmpty(dialogValues.netmask.trim()))
            validationFailed.netmask = _("Mask or prefix length should not be empty");
        else {
            ipv4_prefix = utils.parseNetmask(dialogValues.netmask);
            if (ipv4_prefix === null)
                validationFailed.netmask = _("Invalid IPv4 mask or prefix length");
            else if ((ipv4_prefix % 8) != 0) {
                // because we use localPtr="yes".
                validationFailed.netmask = _("IPv4 prefix length must be a multiple of 8");
            } else if (ipv4_prefix > 24) {
                // because we use localPtr="yes".
                validationFailed.netmask = _("IPv4 prefix length must be 24 or less");
            }
        }

        if (isEmpty(dialogValues.ipv4.trim()))
            validationFailed.ipv4 = _("IPv4 network should not be empty");
        else if (!utils.validateIpv4(dialogValues.ipv4))
            validationFailed.ipv4 = _("Invalid IPv4 address");
        // During virtual network creation, address is assigned to bridge. However no interface can have the
        // address same as the network identifier, as it would disable the connectivity of the virtual network.
        else if (!validationFailed.netmask && utils.ipv4IsNetworkIdentifier(dialogValues.ipv4, String(ipv4_prefix))) {
            validationFailed.ipv4 =
                cockpit.format(_("Must be an address instead of the network identifier, such as $0"),
                               utils.ipv4ExampleBridgeAddressForNetworkIdentifier(dialogValues.ipv4));
        // Using broadcast address of network space as the address of virtual network's bridge
        // is forbidden and would disable the connectivity of the virtual network.
        } else if (!validationFailed.netmask && utils.ipv4IsBroadcast(dialogValues.ipv4, String(ipv4_prefix)))
            validationFailed.ipv4 = _("IPv4 address cannot be same as the network's broadcast address");

        if (dialogValues.ipv4DhcpEnabled) {
            if (isEmpty(dialogValues.ipv4DhcpRangeStart.trim()))
                validationFailed.ipv4DhcpRangeStart = _("Start should not be empty");
            else if (!utils.validateIpv4(dialogValues.ipv4DhcpRangeStart))
                validationFailed.ipv4DhcpRangeStart = _("Invalid IPv4 address");
            else if (!validationFailed.netmask && !utils.isIpv4InNetwork(dialogValues.ipv4, String(ipv4_prefix), dialogValues.ipv4DhcpRangeStart))
                validationFailed.ipv4DhcpRangeStart = _("Address not within subnet");

            if (isEmpty(dialogValues.ipv4DhcpRangeEnd.trim()))
                validationFailed.ipv4DhcpRangeEnd = _("End should not be empty");
            else if (!utils.validateIpv4(dialogValues.ipv4DhcpRangeEnd))
                validationFailed.ipv4DhcpRangeEnd = _("Invalid IPv4 address");
            else if (!validationFailed.netmask && !utils.isIpv4InNetwork(dialogValues.ipv4, String(ipv4_prefix), dialogValues.ipv4DhcpRangeEnd))
                validationFailed.ipv4DhcpRangeEnd = _("Address not within subnet");
        }
    }

    if (dialogValues.ip === "IPv6 only" || dialogValues.ip === "IPv4 and IPv6") {
        if (isEmpty(dialogValues.ipv6.trim()))
            validationFailed.ipv6 = _("IPv6 network should not be empty");
        else if (!utils.validateIpv6(dialogValues.ipv6))
            validationFailed.ipv6 = _("Invalid IPv6 address");

        if (isEmpty(dialogValues.prefix.trim()))
            validationFailed.prefix = _("Prefix length should not be empty");
        else if (!utils.validateIpv6Prefix(dialogValues.prefix))
            validationFailed.prefix = _("Invalid IPv6 prefix");

        if (dialogValues.ipv6DhcpEnabled) {
            if (isEmpty(dialogValues.ipv6DhcpRangeStart.trim()))
                validationFailed.ipv6DhcpRangeStart = _("Start should not be empty");
            else if (!utils.validateIpv6(dialogValues.ipv6DhcpRangeStart))
                validationFailed.ipv6DhcpRangeStart = _("Invalid IPv6 address");
            else if (!utils.isIpv6InNetwork(dialogValues.ipv6, dialogValues.prefix, dialogValues.ipv6DhcpRangeStart))
                validationFailed.ipv6DhcpRangeStart = _("Address not within subnet");

            if (isEmpty(dialogValues.ipv6DhcpRangeEnd.trim()))
                validationFailed.ipv6DhcpRangeEnd = _("End should not be empty");
            else if (!utils.validateIpv6(dialogValues.ipv6DhcpRangeEnd))
                validationFailed.ipv6DhcpRangeEnd = _("Invalid IPv6 address");
            else if (!utils.isIpv6InNetwork(dialogValues.ipv6, dialogValues.prefix, dialogValues.ipv6DhcpRangeEnd))
                validationFailed.ipv6DhcpRangeEnd = _("Address not within subnet");
        }
    }

    return validationFailed;
}

const NetworkNameRow = ({
    onValueChanged,
    dialogValues,
    validationFailed,
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    const validationState = validationFailed.name ? 'error' : 'default';

    return (
        <FormGroup fieldId='create-network-name' label={_("Name")}>
            <TextInput id='create-network-name'
                       placeholder={_("Unique network name")}
                       value={dialogValues.name}
                       validated={validationState}
                       onChange={(_, value) => onValueChanged('name', value)} />
            <FormHelper helperTextInvalid={validationFailed.name} />
        </FormGroup>
    );
};

const NetworkForwardModeRow = ({
    onValueChanged,
    dialogValues
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
}) => {
    const forwardModes = ['nat', 'route', 'open', 'bridge', 'none'];

    return (
        <FormGroup fieldId='create-network-forward-mode' label={_("Forward mode")}>
            <FormSelect id='create-network-forward-mode'
                        value={dialogValues.forwardMode}
                        onChange={(_event, value) => onValueChanged('forwardMode', value)}>
                { forwardModes.map(mode => {
                    return (
                        <FormSelectOption value={mode} key={mode}
                                          label={rephraseUI('networkForward', mode)} />
                    );
                })
                }
            </FormSelect>
        </FormGroup>
    );
};

const NetworkDeviceRow = ({
    onValueChanged,
    dialogValues
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
}) => {
    const devices = getNetworkDevices();
    return (
        <FormGroup fieldId='create-network-device' label={_("Device")}>
            <FormSelect id='create-network-device'
                        isDisabled={!devices.length}
                        value={dialogValues.device}
                        onChange={(_event, value) => onValueChanged('device', value)}>
                <FormSelectOption value='automatic' key='automatic'
                                  label={_("Automatic")} />
                <FormSelectOptionGroup key="Devices" label={_("Devices")}>
                    { devices.map(dev => {
                        return (
                            <FormSelectOption value={dev} key={dev}
                                              label={dev} />
                        );
                    })}
                </FormSelectOptionGroup>
            </FormSelect>
        </FormGroup>
    );
};

const NetworkBridgeRow = ({
    onValueChanged,
    dialogValues,
    validationFailed
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    const bridges = getNetworkBridges();
    const validationState = validationFailed.device ? 'error' : 'default';

    return (
        <FormGroup fieldId='create-network-bridge' label={_("Bridge")}>
            <FormSelect id='create-network-bridge'
                        isDisabled={!bridges.length}
                        value={dialogValues.device}
                        validated={validationState}
                        onChange={(_event, value) => onValueChanged('device', value)}>
                { bridges.map(dev => {
                    return (
                        <FormSelectOption value={dev} key={dev}
                                          label={dev} />
                    );
                })}
            </FormSelect>
            <FormHelper helperTextInvalid={validationFailed.device} />
        </FormGroup>
    );
};

const NetworkVlanRow = ({
    onValueChanged,
    dialogValues,
    validationFailed
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    // libvirt sets the port VLANs through the kernel's bridge VLAN filtering; without it they are ignored
    const supported = bridgeHasVlanFiltering(dialogValues.device);
    const validationIds = validationFailed.vlanIds ? 'error' : 'default';
    const validationNative = validationFailed.vlanNative ? 'error' : 'default';

    return (
        <>
            <FormGroup fieldId='create-network-vlan' hasNoPaddingTop>
                <Checkbox id='create-network-vlan'
                          isChecked={supported && dialogValues.vlanEnabled}
                          isDisabled={!supported}
                          label={_("VLAN tagging")}
                          description={supported
                              ? _("Guest ports behave like switch ports: tagged frames are limited to the listed VLANs")
                              : cockpit.format(_("Bridge $0 has VLAN filtering disabled"), dialogValues.device)}
                          onChange={() => onValueChanged('vlanEnabled', !dialogValues.vlanEnabled)} />
            </FormGroup>
            {supported && dialogValues.vlanEnabled && <Grid hasGutter md={6}>
                <FormGroup fieldId='create-network-vlan-ids' label={_("VLAN IDs")}>
                    <TextInput id='create-network-vlan-ids'
                               placeholder={_("e.g. 10,20-29")}
                               value={dialogValues.vlanIds}
                               validated={validationIds}
                               onChange={(_, value) => onValueChanged('vlanIds', value)} />
                    <FormHelper helperTextInvalid={validationIds == "error" ? validationFailed.vlanIds : null} />
                </FormGroup>
                <FormGroup fieldId='create-network-vlan-native' label={_("Native VLAN")}>
                    <TextInput id='create-network-vlan-native'
                               placeholder={_("None, untagged frames are dropped")}
                               value={dialogValues.vlanNative}
                               validated={validationNative}
                               onChange={(_, value) => onValueChanged('vlanNative', value)} />
                    <FormHelper helperTextInvalid={validationNative == "error" ? validationFailed.vlanNative : null} />
                </FormGroup>
            </Grid>}
        </>
    );
};

const IpRow = ({
    onValueChanged,
    dialogValues,
    validationFailed
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    return (
        <FormGroup fieldId='create-network-ip-configuration' label={_("IP configuration")}>
            <FormSelect id='create-network-ip-configuration'
                        value={dialogValues.ip}
                        onChange={(_event, value) => onValueChanged('ip', value)}>
                {dialogValues.forwardMode === "none" &&
                <FormSelectOption value='None' key='None' label={_("None")} />}
                <FormSelectOption value='IPv4 only' key='IPv4 only' label={_("IPv4 only")} />
                <FormSelectOption value='IPv6 only' key='IPv6 only' label={_("IPv6 only")} />
                <FormSelectOption value='IPv4 and IPv6' key='IPv4 and IPv6' label={_("IPv4 and IPv6")} />
            </FormSelect>
            { (dialogValues.ip === "IPv4 only" || dialogValues.ip === "IPv4 and IPv6") &&
            <Ipv4Row dialogValues={dialogValues}
                     onValueChanged={onValueChanged}
                     validationFailed={validationFailed} /> }

            { (dialogValues.ip === "IPv6 only" || dialogValues.ip === "IPv4 and IPv6") &&
            <Ipv6Row dialogValues={dialogValues}
                     onValueChanged={onValueChanged}
                     validationFailed={validationFailed} /> }
        </FormGroup>
    );
};

const DhcpRow = ({
    ipVersion,
    rangeStart,
    rangeEnd,
    expanded,
    onRangeStartChanged,
    onRangeEndChanged,
    onExpandedChanged,
    validationFailedRangeStart,
    validationFailedRangeEnd,
} : {
    ipVersion: string,
    rangeStart: string,
    rangeEnd: string,
    expanded: boolean,
    onRangeStartChanged: (val: string) => void,
    onExpandedChanged: (val: boolean) => void,
    onRangeEndChanged: (val: string) => void,
    validationFailedRangeStart: string | undefined,
    validationFailedRangeEnd: string | undefined,
}) => {
    const validationStart = validationFailedRangeStart ? 'error' : 'default';
    const validationEnd = validationFailedRangeEnd ? 'error' : 'default';

    return (
        <>
            <FormGroup>
                <Checkbox id={'create-network-ipv' + ipVersion + '-dhcp'}
                          isChecked={expanded}
                          label={_("Set DHCP range")}
                          onChange={() => onExpandedChanged(!expanded)} />
            </FormGroup>
            {expanded && <Grid hasGutter md={6}>
                <FormGroup fieldId={'create-network-ipv' + ipVersion + '-dhcp-range-start'}
                           className={`create-network-ipv${ipVersion}-dhcp-range-start`} label={_("Start")}>
                    <TextInput id={'create-network-ipv' + ipVersion + '-dhcp-range-start'}
                               value={rangeStart}
                               onChange={(_, value) => onRangeStartChanged(value)} />
                    <FormHelper helperTextInvalid={validationStart == "error" ? validationFailedRangeStart : null} />
                </FormGroup>
                <FormGroup fieldId={'create-network-ipv' + ipVersion + '-dhcp-range-end'}
                           className={`create-network-ipv${ipVersion}-dhcp-range-end`} label={_("End")}>
                    <TextInput id={'create-network-ipv' + ipVersion + '-dhcp-range-end'}
                               value={rangeEnd}
                               onChange={(_, value) => onRangeEndChanged(value)} />
                    <FormHelper helperTextInvalid={validationEnd == "error" ? validationFailedRangeEnd : null} />
                </FormGroup>
            </Grid>}
        </>
    );
};

const Ipv4Row = ({
    validationFailed,
    dialogValues,
    onValueChanged
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    const validationAddress = validationFailed.ipv4 ? 'error' : 'default';
    const validationNetmask = validationFailed.netmask ? 'error' : 'default';

    return (
        <>
            <FormGroup fieldId='create-network-ipv4-address' label={_("IPv4 address")}>
                <TextInput id='create-network-ipv4-address'
                           value={dialogValues.ipv4}
                           validated={validationAddress}
                           onChange={(_, value) => onValueChanged('ipv4', value)} />
                <FormHelper helperTextInvalid={validationAddress == "error" ? validationFailed.ipv4 : null} />
            </FormGroup>
            <FormGroup fieldId='create-network-ipv4-netmask' label={_("Mask or prefix length")}>
                <TextInput id='create-network-ipv4-netmask'
                           value={dialogValues.netmask}
                           validated={validationNetmask}
                           onChange={(_, value) => onValueChanged('netmask', value)} />
                <FormHelper helperTextInvalid={validationNetmask == "error" ? validationFailed.netmask : null} />
            </FormGroup>
            <DhcpRow ipVersion='4'
                rangeStart={dialogValues.ipv4DhcpRangeStart}
                rangeEnd={dialogValues.ipv4DhcpRangeEnd}
                expanded={dialogValues.ipv4DhcpEnabled}
                onRangeStartChanged={val => onValueChanged('ipv4DhcpRangeStart', val)}
                onRangeEndChanged={val => onValueChanged('ipv4DhcpRangeEnd', val)}
                onExpandedChanged={val => onValueChanged('ipv4DhcpEnabled', val)}
                validationFailedRangeStart={validationFailed.ipv4DhcpRangeStart}
                validationFailedRangeEnd={validationFailed.ipv4DhcpRangeEnd} />
        </>
    );
};

const Ipv6Row = ({
    validationFailed,
    dialogValues,
    onValueChanged
} : {
    onValueChanged: OnValueChanged,
    dialogValues: DialogValues,
    validationFailed: ValidationFailed,
}) => {
    const validationAddress = validationFailed.ipv6 ? 'error' : 'default';
    const validationPrefix = validationFailed.prefix ? 'error' : 'default';

    return (
        <>
            <FormGroup fieldId='create-network-ipv6-address' label={_("IPv6 address")}>
                <TextInput id='create-network-ipv6-address'
                           value={dialogValues.ipv6}
                           validated={validationAddress}
                           onChange={(_, value) => onValueChanged('ipv6', value)} />
                <FormHelper helperTextInvalid={validationAddress == "error" ? validationFailed.ipv6 : null} />
            </FormGroup>
            <FormGroup fieldId='create-network-ipv6-prefix' label={_("Prefix length")}>
                <TextInput id='create-network-ipv6-prefix'
                           value={dialogValues.prefix}
                           validated={validationPrefix}
                           onChange={(_, value) => onValueChanged('prefix', value)} />
                <FormHelper helperTextInvalid={validationPrefix == "error" ? validationFailed.prefix : null} />
            </FormGroup>
            <DhcpRow ipVersion='6'
                rangeStart={dialogValues.ipv6DhcpRangeStart}
                rangeEnd={dialogValues.ipv6DhcpRangeEnd}
                expanded={dialogValues.ipv6DhcpEnabled}
                onRangeStartChanged={val => onValueChanged('ipv6DhcpRangeStart', val)}
                onRangeEndChanged={val => onValueChanged('ipv6DhcpRangeEnd', val)}
                onExpandedChanged={val => onValueChanged('ipv6DhcpEnabled', val)}
                validationFailedRangeStart={validationFailed.ipv6DhcpRangeStart}
                validationFailedRangeEnd={validationFailed.ipv6DhcpRangeEnd} />
        </>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CreateNetworkModalProps {
}

interface CreateNetworkModalState extends DialogValues {
    createInProgress: boolean;
    dialogError: string | undefined,
    dialogErrorDetail?: string;
    validate: boolean;
}

class CreateNetworkModal extends React.Component<CreateNetworkModalProps, CreateNetworkModalState> {
    static contextType = DialogsContext;
    declare context: Dialogs;

    constructor(props: CreateNetworkModalProps) {
        super(props);
        this.state = {
            createInProgress: false,
            dialogError: undefined,
            validate: false,
            name: '',
            forwardMode: 'nat',
            device: 'automatic',
            ip: 'IPv4 only',
            ipv4: '192.168.100.1',
            netmask: '24',
            ipv6: '',
            prefix: '',
            ipv4DhcpEnabled: false,
            ipv4DhcpRangeStart: '',
            ipv4DhcpRangeEnd: '',
            ipv6DhcpEnabled: false,
            ipv6DhcpRangeStart: '',
            ipv6DhcpRangeEnd: '',
            vlanEnabled: false,
            vlanIds: '',
            vlanNative: '',
        };
        this.dialogErrorSet = this.dialogErrorSet.bind(this);
        this.dialogErrorDismiss = this.dialogErrorDismiss.bind(this);
        this.onValueChanged = this.onValueChanged.bind(this);
        this.onCreate = this.onCreate.bind(this);
    }

    dialogErrorSet(text: string, detail: string) {
        this.setState({ dialogError: text, dialogErrorDetail: detail });
    }

    dialogErrorDismiss() {
        this.setState({ dialogError: undefined });
    }

    onValueChanged<K extends keyof DialogValues>(key: K, value: DialogValues[K]): void {
        if (key === "forwardMode") {
            if (this.state.ip !== "None" && (value === "bridge" || value === "vepa"))
                this.setState({ ip: "None" });

            if (this.state.ip === "None" && (value === "nat" || value === "route" || value === "open"))
                this.setState({ ip: "IPv4 only" });

            // "device" is the outgoing interface for nat/route, but the host bridge for bridge mode
            if (value === "bridge")
                this.setState({ device: getNetworkBridges()[0] || "" });
            else if (this.state.forwardMode === "bridge")
                this.setState({ device: "automatic" });
        }

        this.setState({ [key]: value } as Pick<CreateNetworkModalState, K>);
    }

    onCreate() {
        const Dialogs = this.context;
        if (Object.getOwnPropertyNames(validateParams(this.state)).length > 0) {
            this.setState({ createInProgress: false, validate: true });
        } else {
            const {
                name, forwardMode, ip, prefix, device,
                ipv4DhcpRangeStart, ipv4DhcpRangeEnd, ipv6DhcpRangeStart, ipv6DhcpRangeEnd
            } = this.state;
            const ipv6 = ["IPv4 only", "None"].includes(ip) ? undefined : this.state.ipv6;
            const ipv4 = ["IPv6 only", "None"].includes(ip) ? undefined : this.state.ipv4;
            const netmask = utils.netmaskConvert(this.state.netmask);
            const vlan = forwardMode === "bridge" && this.state.vlanEnabled && bridgeHasVlanFiltering(device);
            const vlanNativeId = vlan && !isEmpty(this.state.vlanNative.trim()) ? Number(this.state.vlanNative) : undefined;
            const vlanIds = (vlan && !isEmpty(this.state.vlanIds.trim()) && utils.parseVlanIds(this.state.vlanIds)) || [];
            // libvirt marks the native VLAN on one of the port's tags, so make sure it is in the list
            if (vlanNativeId !== undefined && !vlanIds.includes(vlanNativeId)) {
                vlanIds.push(vlanNativeId);
                vlanIds.sort((a, b) => a - b);
            }

            this.setState({ createInProgress: true });
            networkCreate({
                connectionName: LIBVIRT_SYSTEM_CONNECTION,
                name,
                forwardMode,
                device,
                ipv4,
                netmask,
                ipv6,
                prefix,
                ipv4DhcpRangeStart,
                ipv4DhcpRangeEnd,
                ipv6DhcpRangeStart,
                ipv6DhcpRangeEnd,
                vlanIds,
                vlanNativeId,
            })
                    .then(Dialogs.close)
                    .catch(exc => {
                        this.setState({ createInProgress: false });
                        this.dialogErrorSet(_("Virtual network failed to be created"), exc.message);
                    });
        }
    }

    render() {
        const Dialogs = this.context;
        const validationFailed = this.state.validate ? validateParams(this.state) : {};

        const body = (
            <Form isHorizontal>
                <ConnectionRow connectionName={LIBVIRT_SYSTEM_CONNECTION} />

                <NetworkNameRow dialogValues={this.state}
                                onValueChanged={this.onValueChanged}
                                validationFailed={validationFailed} />

                <NetworkForwardModeRow dialogValues={this.state}
                                       onValueChanged={this.onValueChanged} />
                { (this.state.forwardMode === "nat" || this.state.forwardMode === "route") &&
                <NetworkDeviceRow dialogValues={this.state}
                                  onValueChanged={this.onValueChanged} /> }

                { this.state.forwardMode === "bridge" &&
                <>
                    <NetworkBridgeRow dialogValues={this.state}
                                      onValueChanged={this.onValueChanged}
                                      validationFailed={validationFailed} />
                    <NetworkVlanRow dialogValues={this.state}
                                    onValueChanged={this.onValueChanged}
                                    validationFailed={validationFailed} />
                </> }

                { (this.state.forwardMode !== "vepa" && this.state.forwardMode !== "bridge") &&
                <IpRow dialogValues={this.state}
                       onValueChanged={this.onValueChanged}
                       validationFailed={validationFailed} /> }
            </Form>
        );

        return (
            <Modal position="top" variant="medium" id='create-network-dialog' className='network-create' isOpen onClose={ Dialogs.close }>
                <ModalHeader title={_("Create virtual network")} />
                <ModalBody>
                    {this.state.dialogError &&
                        <ModalError
                            dialogError={this.state.dialogError}
                            {...this.state.dialogErrorDetail && { dialogErrorDetail: this.state.dialogErrorDetail } }
                        />
                    }
                    {body}
                </ModalBody>
                <ModalFooter>
                    <Button variant='primary'
                            isLoading={ this.state.createInProgress }
                            isDisabled={ this.state.createInProgress || Object.getOwnPropertyNames(validationFailed).length > 0 }
                            onClick={ this.onCreate }>
                        {_("Create")}
                    </Button>
                    <Button variant='link' onClick={ Dialogs.close }>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        );
    }
}

export const CreateNetworkAction = () => {
    const Dialogs = useDialogs();

    return (
        <Button id='create-network'
                variant='secondary'
                onClick={() => Dialogs.show(<CreateNetworkModal />)}>
            {_("Create virtual network")}
        </Button>
    );
};
