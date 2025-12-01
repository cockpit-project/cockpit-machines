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

import React from 'react';

import * as ipaddr from "ipaddr.js";

import type { optString, VM, VMInterfacePortForward } from '../../../types';
import type { AvailableSources } from './vmNicsCard';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup, FormFieldGroup, FormFieldGroupHeader } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { ExternalLinkSquareAltIcon, TrashIcon } from '@patternfly/react-icons';
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";

import { InfoPopover } from '../../common/infoPopover.jsx';

import cockpit from 'cockpit';

import {
    DialogValue,
    DialogTextInput,
    DialogValidationText,
} from '../../common/dialog';

import './nic.css';

const _ = cockpit.gettext;

export const NetworkModelRow = ({
    value,
    osTypeArch,
    osTypeMachine
} : {
    value: DialogValue<string>,
    osTypeArch: optString,
    osTypeMachine: optString,
}) => {
    const availableModelTypes: { name: string, desc?: string }[] = [
        { name: 'virtio', desc: 'Linux, perf' },
        { name: 'e1000e', desc: 'PCI' },
        { name: 'e1000', desc: 'PCI, legacy' },
        { name: 'rtl8139', desc: 'PCI, legacy' }];
    const defaultModelType = value.get();

    if (osTypeArch == 'ppc64' && osTypeMachine == 'pseries')
        availableModelTypes.push({ name: 'spapr-vlan' });

    return (
        <FormGroup fieldId={value.id()} label={_("Model")}>
            <FormSelect
                id={value.id()}
                onChange={(_event, val) => value.set(val)}
                data-value={defaultModelType}
                value={defaultModelType}
            >
                {availableModelTypes
                        .map(networkModel => {
                            return (
                                <FormSelectOption value={networkModel.name} key={networkModel.name}
                                                  label={networkModel.name + ' (' + networkModel.desc + ')'} />
                            );
                        })}
            </FormSelect>
        </FormGroup>
    );
};

interface NetworkTypeDescription {
    name: string,
    desc: string,
    detailHeadline?: React.ReactNode,
    detailParagraph?: React.ReactNode,
    externalDocs?: React.ReactNode,
    disabled?: boolean,
}

function getAvailableNetworkTypes(vm: VM, availableSources: AvailableSources) {
    let availableNetworkTypes: NetworkTypeDescription[] = [];

    // { name: 'ethernet', desc: 'Generic ethernet connection' }, Add back to the list when implemented
    const virtualNetwork: NetworkTypeDescription[] = [{
        name: 'network',
        desc: 'Virtual network',
        detailHeadline: _("This is the recommended type for general guest connectivity on hosts with dynamic / wireless networking configs."),
        detailParagraph: _("Provides a connection whose details are described by the named network definition.")
    }];
    if (vm.connectionName !== 'session') {
        availableNetworkTypes = [
            ...virtualNetwork,
            {
                name: 'bridge',
                desc: 'Bridge to LAN',
                detailHeadline: _("This is the recommended type for general guest connectivity on hosts with static wired networking configs."),
                detailParagraph: _("Provides a bridge from the guest virtual machine directly onto the LAN. This needs a bridge device on the host with one or more physical NICs.")
            },
            {
                name: 'direct',
                desc: 'Direct attachment',
                detailParagraph: _("This is the recommended type for high performance or enhanced security."),
            },
        ];
    } else {
        // User session
        if (availableSources.network.length > 0) {
            availableNetworkTypes = [
                {
                    name: 'user',
                    desc: 'Userspace stack',
                    detailParagraph: _("Provides a virtual LAN with NAT to the outside world.")
                },
                ...virtualNetwork,
            ];
        }
    }

    return availableNetworkTypes;
}

export const NetworkTypeAndSourceRow = ({
    vm,
    type_value,
    source_value,
    source_mode_value,
    availableSources,
} : {
    vm: VM,
    type_value: DialogValue<string>,
    source_value: DialogValue<string>,
    source_mode_value: DialogValue<string>,
    availableSources: AvailableSources,
}) => {
    const defaultNetworkType = type_value.get();
    let defaultNetworkSource = source_value.get();
    let networkSourcesContent: React.ReactNode;
    let networkSourceEnabled: boolean = true;

    const availableNetworkTypes = getAvailableNetworkTypes(vm, availableSources);

    function sources_for_type(type: string) {
        if (type === "network")
            return availableSources.network;
        else if (type === "direct")
            return Object.keys(availableSources.device).filter(dev => availableSources.device[dev].type != "bridge");
        else if (type === "bridge")
            return Object.keys(availableSources.device).filter(dev => availableSources.device[dev].type == "bridge");
        else
            return [];
    }

    const networkType = type_value.get();
    if (["network", "direct", "bridge"].includes(networkType)) {
        const sources = sources_for_type(networkType);
        if (sources.length > 0) {
            networkSourcesContent = sources.sort().map(networkSource => {
                return (
                    <FormSelectOption value={networkSource} key={networkSource}
                                      label={networkSource} />
                );
            });
        } else {
            if (networkType === "network")
                defaultNetworkSource = _("No virtual networks");
            else
                defaultNetworkSource = _("No network devices");

            networkSourcesContent = (
                <FormSelectOption value='empty-list' key='empty-list'
                                  label={defaultNetworkSource} />
            );
            networkSourceEnabled = false;
        }
    }

    function setNetworkType(type: string) {
        type_value.set(type);
        const sources = sources_for_type(type);
        source_value.set(sources.length > 0 ? sources[0] : "");
    }

    return (
        <>
            { availableNetworkTypes.length > 0 &&
                <FormGroup fieldId={type_value.id()}
                    label={_("Interface type")}
                    labelHelp={
                        <InfoPopover aria-label={_("Interface type help")}
                            position={PopoverPosition.bottom}
                            enableFlip={false}
                            bodyContent={
                                <Flex direction={{ default: 'column' }}>
                                    {availableNetworkTypes.map(type => (
                                        <Content key={type.name}>
                                            <Content component={ContentVariants.h4}>{type.desc}</Content>
                                            <strong>{type.detailHeadline}</strong>
                                            <p>{type.detailParagraph}</p>
                                        </Content>))}
                                </Flex>
                            }
                        />
                    }>
                    <FormSelect id={type_value.id()}
                        onChange={(_event, value) => setNetworkType(value)}
                        data-value={defaultNetworkType}
                        value={defaultNetworkType}>
                        {availableNetworkTypes
                                .map(networkType => {
                                    return (
                                        <FormSelectOption value={networkType.name} key={networkType.name}
                                    isDisabled={networkType.disabled || false}
                                    label={networkType.desc} />
                                    );
                                })}
                    </FormSelect>
                </FormGroup>
            }
            {["network", "direct", "bridge"].includes(networkType) && (
                <FormGroup fieldId={source_value.id()} label={_("Source")}>
                    <FormSelect id={source_value.id()}
                                onChange={(_event, value) => source_value.set(value)}
                                isDisabled={!networkSourceEnabled}
                                data-value={defaultNetworkSource}
                                value={defaultNetworkSource}>
                        {networkSourcesContent}
                    </FormSelect>
                    <DialogValidationText value={source_value} />
                </FormGroup>
            )}
            {networkType == "direct" && (
                <FormGroup id={source_mode_value.id()} label={_("Mode")} hasNoPaddingTop isInline
                    data-value={source_mode_value.get()}
                       labelHelp={
                           <InfoPopover
                               aria-label={_("Mode help")}
                               position={PopoverPosition.bottom}
                               enableFlip={false}
                               bodyContent={
                                   <Content>
                                       <Content component={ContentVariants.p}>
                                           {_("The mode influences the delivery of packets.")}
                                       </Content>
                                       <Content component={ContentVariants.p}>
                                           <Button isInline
                                               variant="link"
                                               component="a"
                                               icon={<ExternalLinkSquareAltIcon />}
                                               iconPosition="right"
                                               target="__blank"
                                               href="https://libvirt.org/formatdomain.html#direct-attachment-to-physical-interface">
                                               {_("More info")}
                                           </Button>
                                       </Content>
                                   </Content>}
                           />
                       }>
                    {["vepa", "bridge", "private", "passthrough"].map(mode =>
                        <Radio
                            key={mode}
                            id={source_mode_value.id(mode)}
                            name={`mode-${mode}`}
                            isChecked={source_mode_value.get() == mode}
                            // The label is not translated since the
                            // documentation we link to is always in
                            // English.
                            label={<pre>{mode}</pre>}
                            onChange={() => source_mode_value.set(mode)} />)}
                </FormGroup>
            )}
        </>
    );
};

export function validate_NetworkTypeAndSourceRow(
    source_value: DialogValue<string>,
    vm: VM,
    availableSources: AvailableSources,
) {
    const availableNetworkTypes = getAvailableNetworkTypes(vm, availableSources);
    if (availableNetworkTypes.length > 0)
        source_value.validate(v => {
            if (v == "")
                return _("No sources available");
        });
}

export interface DialogComplexPortForward {
    kind: "complex";
    config: VMInterfacePortForward;
}

export interface DialogSimplePortForward {
    kind: "simple";
    address: string;
    proto: string;
    host: string;
    guest: string;
}

type DialogPortForward = DialogSimplePortForward | DialogComplexPortForward;
export type PortForwardsValue = DialogPortForward[];

export function portForwardText(pf: VMInterfacePortForward): string {
    let text = "";

    if (pf.address)
        text += pf.address + ":";
    if (pf.dev)
        text += pf.dev + ":";
    if (!pf.range.some(r => r.exclude != "yes"))
        text += _("all");
    for (let i = 0; i < pf.range.length; i++) {
        const r = pf.range[i];
        if (i > 0)
            text += ",";
        if (r.exclude == "yes")
            text += _(" excluding ");
        text += r.start;
        if (r.end)
            text += "-" + r.end;
        if (!r.exclude)
            text += " → " + (r.to || r.start) + (r.end ? "-" + (Number(r.to || r.start) + Number(r.end) - Number(r.start)).toString() : "");
    }
    text += "/" + pf.proto;

    return text;
}

export function interfacePortForwardsToDialog(portForwards: VMInterfacePortForward[]): DialogPortForward[] {
    return portForwards.map(pf => {
        if (!pf.dev && pf.range.length == 1 && pf.range[0].exclude != "yes") {
            const r = pf.range[0];
            return {
                kind: "simple",
                address: pf.address || "",
                proto: pf.proto || "",
                host: r.start + (r.end ? "-" + r.end : ""),
                guest: r.to || "",
            };
        } else {
            return {
                kind: "complex",
                config: pf,
            };
        }
    });
}

export function dialogPortForwardsToInterface(portForwards: DialogPortForward[]): VMInterfacePortForward[] {
    // NOTE: We have to set every field here, none of them can be
    // "null". Our return value is passed to virt-xml, and we want
    // virt-xml to set everything and not leave anything behind from
    // the previous portForward XML element.
    return portForwards.map((pf: DialogPortForward) => {
        if (pf.kind == "simple") {
            const range = pf.host.split("-");
            return {
                address: pf.address,
                dev: "",
                proto: pf.proto,
                range: [
                    {
                        start: range[0],
                        end: range[1] || "",
                        to: pf.guest,
                        exclude: "",
                    }
                ],
            };
        } else {
            return pf.config;
        }
    });
}

function validateAddress(addr: string): string | undefined {
    if (addr && !ipaddr.isValid(addr))
        return _("Invalid IP address");
    return undefined;
}

function validatePort(port: string): string | undefined {
    const p = Number(port);
    if (isNaN(p))
        return _("Port must be a number.");
    if (p <= 0 || p > 65535)
        return _("Port must be 1 to 65535.");
    return undefined;
}

function validateHostPort(port: string): string | undefined {
    if (!port)
        return _("Host port can not be empty.");
    const parts = port.split("-");
    return validatePort(parts[0]) || (parts[1] && validatePort(parts[1]));
}

function validateGuestPort(port: string): string | undefined {
    if (port)
        return validatePort(port);
    return undefined;
}

export function validate_PortForwards(value: DialogValue<PortForwardsValue>) {
    value.forEach(v => {
        if (v.get().kind == "simple") {
            const sv = v as DialogValue<DialogSimplePortForward>;
            sv.sub("address").validate(validateAddress);
            sv.sub("host").validate(validateHostPort);
            sv.sub("guest").validate(validateGuestPort);
        }
    });
}

const SimplePortForward = ({
    value,
    idx,
    removeitem,
} : {
    value: DialogValue<DialogSimplePortForward>,
    idx: number,
    removeitem: (idx: number) => void,
}) => {
    return (
        <Grid hasGutter id={value.id()}>
            <FormGroup className="pf-m-3-col-on-md"
                label={_("IP address")}
                fieldId={value.sub("address").id()}
                labelHelp={
                    <InfoPopover
                        aria-label={_("IP address help")}
                        enableFlip
                        bodyContent={_("If host IP is set to 0.0.0.0 or not set at all, the port will be bound on all IPs on the host.")}
                    />
                }
            >
                <DialogTextInput value={value.sub("address")} />
            </FormGroup>
            <FormGroup
                className="pf-m-4-col-on-md"
                label={_("Host port")}
                fieldId={value.sub("host").id()}
                isRequired
                labelHelp={
                    <InfoPopover
                        aria-label={_("Host port help")}
                        enableFlip
                        bodyContent={_("The port on the host that is fotwarded into the guest. You can also specify a range of ports like 4000-4050.")}
                    />
                }
            >
                <DialogTextInput step={1} value={value.sub("host")} />
            </FormGroup>
            <FormGroup
                className="pf-m-3-col-on-md"
                label={_("Guest port")}
                fieldId={value.sub("guest").id()}
                labelHelp={
                    <InfoPopover
                        aria-label={_("Guest port help")}
                        enableFlip
                        bodyContent={_("The port on the guest. If left empty, the same port as on the host is used.")}
                    />
                }>
                <DialogTextInput value={value.sub("guest")} />
            </FormGroup>
            <FormGroup
                className="pf-m-2-col-on-md"
                label={_("Protocol")}
                fieldId={value.sub("proto").id()}
            >
                <FormSelect
                    className='pf-v6-c-form-control'
                    id={value.sub("proto").id()}
                    value={value.sub("proto").get()}
                    onChange={(_event, val) => value.sub("proto").set(val)}
                >
                    <FormSelectOption value='tcp' label={_("TCP")} />
                    <FormSelectOption value='udp' label={_("UDP")} />
                </FormSelect>
            </FormGroup>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={value.id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={() => removeitem(idx)}
                />
            </FormGroup>
        </Grid>
    );
};

const ComplexPortForward = ({
    value,
    idx,
    removeitem,
} : {
    value: DialogValue<DialogComplexPortForward>,
    idx: number,
    removeitem: (idx: number) => void,
}) => {
    return (
        <Grid hasGutter id={value.id()}>
            <div className="pf-m-12-col-on-md">
                {
                    cockpit.format(
                        _("Complex rule \"$0\" can not be edited here."),
                        portForwardText(value.get().config))
                }
            </div>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={value.id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={() => removeitem(idx)}
                />
            </FormGroup>
        </Grid>
    );
};

export const NetworkPortForwardsRow = ({
    value,
} : {
    value: DialogValue<PortForwardsValue>,
}) => {
    const simple_default: DialogPortForward = {
        kind: "simple",
        address: "",
        proto: "tcp",
        host: "",
        guest: "",
    };

    function addSimple() {
        value.add(simple_default);
    }

    function remItem(idx: number) {
        value.remove(idx);
    }

    const action = (
        <Button variant="secondary" onClick={addSimple}>
            {_("Add")}
        </Button>
    );

    return (
        <FormFieldGroup
            id={value.id()}
            className="nic-dynamic-form-group"
            header={
                <FormFieldGroupHeader
                    titleText={{ id: value.id("header"), text: _("Forwarded ports") }}
                    actions={action}
                />
            }
        >
            {value.get().length == 0 &&
                <EmptyState>
                    <EmptyStateBody>
                        {_("No ports forwarded")}
                    </EmptyStateBody>
                </EmptyState>
            }
            {
                value.map((v, idx) => {
                    if (v.get().kind == "simple")
                        return (
                            <SimplePortForward
                                key={idx}
                                value={v as DialogValue<DialogSimplePortForward>}
                                idx={idx}
                                removeitem={() => remItem(idx)}
                            />
                        );
                    else
                        return (
                            <ComplexPortForward
                                key={idx}
                                value={v as DialogValue<DialogComplexPortForward>}
                                idx={idx}
                                removeitem={() => remItem(idx)}
                            />
                        );
                })
            }
        </FormFieldGroup>
    );
};
