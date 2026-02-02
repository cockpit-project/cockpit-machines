/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2019 Red Hat, Inc.
 */

import React from 'react';

import * as ipaddr from "ipaddr.js";

import type { optString, VM, VMInterface, VMInterfacePortForward } from '../../../types';
import type { AvailableSources } from './vmNicsCard';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState";
import { FormGroup, FormFieldGroup, FormFieldGroupHeader } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { ExternalLinkSquareAltIcon, TrashIcon } from '@patternfly/react-icons';
import { Grid } from "@patternfly/react-core/dist/esm/layouts/Grid";

import { InfoPopover } from '../../common/infoPopover.jsx';

import cockpit from 'cockpit';

import {
    DialogField,
    DialogTextInput,
    DialogDropdownSelect, DialogDropdownSelectOption,
    DialogRadioSelect, DialogRadioSelectOption
} from 'cockpit/dialog';

import './nic.css';

const _ = cockpit.gettext;

export const NetworkModelRow = ({
    field,
    osTypeArch,
    osTypeMachine
} : {
    field: DialogField<string>,
    osTypeArch: optString,
    osTypeMachine: optString,
}) => {
    const availableModelTypes = [
        { value: 'virtio', label: 'virtio (Linux, perf)' },
        { value: 'e1000e', label: 'e1000e (PCI)' },
        { value: 'e1000', label: 'e1000 (PCI, legacy)' },
        { value: 'rtl8139', label: 'rtl8139 (PCI, legacy)' }];

    if (osTypeArch == 'ppc64' && osTypeMachine == 'pseries')
        availableModelTypes.push({ value: 'spapr-vlan', label: 'spapr-vlan' });

    return (
        <DialogDropdownSelect
            label={_("Model")}
            field={field}
            options={availableModelTypes}
        />
    );
};

interface NetworkTypeDescription {
    name: string,
    desc: string,
    detailHeadline?: React.ReactNode,
    disabled: boolean,
}

function getAvailableNetworkTypes(vm: VM, availableSources: Record<string, string[]>) {
    let availableNetworkTypes: NetworkTypeDescription[] = [];

    // { name: 'ethernet', desc: 'Generic ethernet connection' }, Add back to the list when implemented
    const virtualNetwork: NetworkTypeDescription[] = [{
        name: 'network',
        desc: 'Virtual network',
        detailHeadline: _("For general guest connectivity on hosts with dynamic / wireless networking configs."),
        disabled: !availableSources.network || availableSources.network.length == 0,
    }];
    if (vm.connectionName !== 'session') {
        availableNetworkTypes = [
            ...virtualNetwork,
            {
                name: 'bridge',
                desc: 'Bridge to LAN',
                detailHeadline: _("For general guest connectivity on hosts with static wired networking configs."),
                disabled: !availableSources.bridge || availableSources.bridge.length == 0,
            },
            {
                name: 'direct',
                desc: 'Direct attachment',
                detailHeadline: (
                    <>
                        {_("Advanced interface type for high performance or enhanced security.")}
                        {"\n"}
                        <Button
                            isInline
                            variant="link"
                            component="a"
                            icon={<ExternalLinkSquareAltIcon />}
                            iconPosition="right"
                            target="__blank"
                            href="https://libvirt.org/formatdomain.html#direct-attachment-to-physical-interface">
                            {_("More info")}
                        </Button>
                    </>
                ),
                disabled: !availableSources.direct || availableSources.direct.length == 0,
            },
        ];
    } else {
        // User session
        if (availableSources.network && availableSources.network.length > 0) {
            availableNetworkTypes = [
                {
                    name: 'user',
                    desc: 'Userspace stack',
                    detailHeadline: _("Provides a virtual LAN with NAT to the outside world."),
                    disabled: false,
                },
                ...virtualNetwork,
            ];
        }
    }

    return availableNetworkTypes;
}

function getNetworkSource(network: VMInterface): optString {
    if (network.type === "network")
        return network.source.network;
    else if (network.type === "direct")
        return network.source.dev;
    else if (network.type === "bridge")
        return network.source.bridge;
}

export interface NetworkTypeAndSourceValue {
    type: string;
    source: string;
    mode: string;

    _availableTypes: NetworkTypeDescription[];
    _availableSourcesForType: Record<string, string[]>;
}

export function init_NetworkTypeAndSourceRow(
    vm: VM,
    network: VMInterface | null,
    availableSources: AvailableSources
): NetworkTypeAndSourceValue {
    const _availableSourcesForType: Record<string, string[]> = {
        network: availableSources.network,
        direct: Object.keys(availableSources.device)
                .filter(dev => availableSources.device[dev].type != "bridge"),
        bridge: Object.keys(availableSources.device)
                .filter(dev => availableSources.device[dev].type == "bridge")
    };

    if (network) {
        // Make sure the current network source is available, no
        // matter what.
        if (network.type in _availableSourcesForType) {
            const avail = _availableSourcesForType[network.type];
            const src = getNetworkSource(network) || "";
            if (!avail.includes(src))
                avail.push(src);
        }
    }

    const _availableTypes = getAvailableNetworkTypes(vm, _availableSourcesForType);

    let type: string;
    let source: string;
    let mode: string;

    if (network) {
        type = network.type;
        source = getNetworkSource(network) || "";
        mode = (type == "direct" ? (network.source.mode || "") : "bridge");
    } else if (vm.connectionName == "session") {
        type = "user";
        source = "";
        mode = "";
    } else {
        type = "";
        source = "";
        for (let i = 0; i < _availableTypes.length; i++) {
            if (!_availableTypes[i].disabled) {
                type = _availableTypes[i].name;
                source = _availableSourcesForType[type][0];
                break;
            }
        }
        mode = "bridge";
    }

    return {
        type,
        source,
        mode,

        _availableTypes,
        _availableSourcesForType,
    };
}

export function NetworkTypeAndSource_has_sources(value: NetworkTypeAndSourceValue) {
    return value.type != "";
}

export const NetworkTypeAndSourceRow = ({
    field,
} : {
    field: DialogField<NetworkTypeAndSourceValue>,
}) => {
    const {
        type,
        _availableTypes, _availableSourcesForType
    } = field.get();

    let networkSourcesContent: DialogDropdownSelectOption<string>[] = [];

    if (["network", "direct", "bridge"].includes(type)) {
        const sources = _availableSourcesForType[type] || [];
        networkSourcesContent = sources.sort().map(networkSource => {
            return {
                value: networkSource,
                label: networkSource
            };
        });
    }

    function updateType(type: string) {
        const sources = _availableSourcesForType[type] || [];
        field.sub("source").set(sources.length > 0 ? sources[0] : "");
    }

    function makeTypeOption(t: NetworkTypeDescription): DialogRadioSelectOption<string> {
        return {
            value: t.name,
            label: t.desc,
            excuse: t.disabled ? _("no sources") : null,
            explanation: t.detailHeadline,
        };
    }

    return (
        <>
            { _availableTypes.length > 0 &&
                <DialogRadioSelect
                    label={_("Interface type")}
                    field={field.sub("type", updateType)}
                    options={_availableTypes.map(makeTypeOption)}
                />
            }
            {["network", "direct", "bridge"].includes(type) && (
                <DialogDropdownSelect
                    label={_("Source")}
                    field={field.sub("source")}
                    options={networkSourcesContent}
                />
            )}
            {type == "direct" && (
                <DialogRadioSelect
                    label={_("Mode")}
                    isInline
                    field={field.sub("mode")}
                    options={
                        [
                            // The label is not translated since the
                            // documentation we link to is always in
                            // English.
                            { value: "vepa", label: <pre>vepa</pre> },
                            { value: "bridge", label: <pre>bridge</pre> },
                            { value: "private", label: <pre>private</pre> },
                            { value: "passthrough", label: <pre>passthrough</pre> },
                        ]
                    }
                />
            )}
        </>
    );
};

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

export function validate_PortForwards(field: DialogField<PortForwardsValue>) {
    field.forEach(f => {
        const v = f.get();
        if (v.kind == "simple") {
            const sf = f.at(v);
            sf.sub("address").validate(validateAddress);
            sf.sub("host").validate(validateHostPort);
            sf.sub("guest").validate(validateGuestPort);
        }
    });
}

const SimplePortForward = ({
    field,
    removeitem,
} : {
    field: DialogField<DialogSimplePortForward>,
    removeitem: () => void,
}) => {
    return (
        <Grid hasGutter id={field.id()}>
            <FormGroup className="pf-m-3-col-on-md"
                label={_("IP address")}
                fieldId={field.sub("address").id()}
                labelHelp={
                    <InfoPopover
                        aria-label={_("IP address help")}
                        enableFlip
                        bodyContent={_("If host IP is set to 0.0.0.0 or not set at all, the port will be bound on all IPs on the host.")}
                    />
                }
            >
                <DialogTextInput field={field.sub("address")} />
            </FormGroup>
            <FormGroup
                className="pf-m-4-col-on-md"
                label={_("Host port")}
                fieldId={field.sub("host").id()}
                isRequired
                labelHelp={
                    <InfoPopover
                        aria-label={_("Host port help")}
                        enableFlip
                        bodyContent={_("The port on the host that is fotwarded into the guest. You can also specify a range of ports like 4000-4050.")}
                    />
                }
            >
                <DialogTextInput step={1} field={field.sub("host")} />
            </FormGroup>
            <FormGroup
                className="pf-m-3-col-on-md"
                label={_("Guest port")}
                fieldId={field.sub("guest").id()}
                labelHelp={
                    <InfoPopover
                        aria-label={_("Guest port help")}
                        enableFlip
                        bodyContent={_("The port on the guest. If left empty, the same port as on the host is used.")}
                    />
                }>
                <DialogTextInput field={field.sub("guest")} />
            </FormGroup>
            <FormGroup
                className="pf-m-2-col-on-md"
                label={_("Protocol")}
                fieldId={field.sub("proto").id()}
            >
                <FormSelect
                    className='pf-v6-c-form-control'
                    id={field.sub("proto").id()}
                    value={field.sub("proto").get()}
                    onChange={(_event, val) => field.sub("proto").set(val)}
                >
                    <FormSelectOption value='tcp' label={_("TCP")} />
                    <FormSelectOption value='udp' label={_("UDP")} />
                </FormSelect>
            </FormGroup>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={field.id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={removeitem}
                />
            </FormGroup>
        </Grid>
    );
};

const ComplexPortForward = ({
    field,
    removeitem,
} : {
    field: DialogField<DialogComplexPortForward>,
    removeitem: () => void,
}) => {
    return (
        <Grid hasGutter id={field.id()}>
            <div className="pf-m-12-col-on-md">
                {
                    cockpit.format(
                        _("Complex rule \"$0\" can not be edited here."),
                        portForwardText(field.get().config))
                }
            </div>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={field.id("remove")}
                    size="sm"
                    aria-label={_("Remove item")}
                    icon={<TrashIcon />}
                    onClick={removeitem}
                />
            </FormGroup>
        </Grid>
    );
};

export const NetworkPortForwardsRow = ({
    field,
} : {
    field: DialogField<PortForwardsValue>,
}) => {
    const simple_default: DialogPortForward = {
        kind: "simple",
        address: "",
        proto: "tcp",
        host: "",
        guest: "",
    };

    function addSimple() {
        field.add(simple_default);
    }

    function remItem(idx: number) {
        field.remove(idx);
    }

    const action = (
        <Button variant="secondary" onClick={addSimple}>
            {_("Add")}
        </Button>
    );

    return (
        <FormFieldGroup
            id={field.id()}
            className="nic-dynamic-form-group"
            header={
                <FormFieldGroupHeader
                    titleText={{ id: field.id("header"), text: _("Forwarded ports") }}
                    actions={action}
                />
            }
        >
            {field.get().length == 0 &&
                <EmptyState>
                    <EmptyStateBody>
                        {_("No ports forwarded")}
                    </EmptyStateBody>
                </EmptyState>
            }
            {
                field.map((f, idx) => {
                    const v = f.get();
                    if (v.kind == "simple")
                        return (
                            <SimplePortForward
                                key={idx}
                                field={f.at(v)}
                                removeitem={() => remItem(idx)}
                            />
                        );
                    else
                        return (
                            <ComplexPortForward
                                key={idx}
                                field={f.at(v)}
                                removeitem={() => remItem(idx)}
                            />
                        );
                })
            }
        </FormFieldGroup>
    );
};
