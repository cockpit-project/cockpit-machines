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
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";

import { InfoPopover } from '../../common/infoPopover.jsx';

import cockpit from 'cockpit';

import './nic.css';

const _ = cockpit.gettext;

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

export interface DialogBodyValues {
    networkModel: string;
    networkType: string;
    networkSource: string;
    networkSourceMode: string;
    portForwards: DialogPortForward[];
}

type OnValueChanged = <K extends keyof DialogBodyValues>(key: K, value: DialogBodyValues[K]) => void;

export const NetworkModelRow = ({
    idPrefix,
    onValueChanged,
    dialogValues,
    osTypeArch,
    osTypeMachine
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    dialogValues: DialogBodyValues,
    osTypeArch: optString,
    osTypeMachine: optString,
}) => {
    const availableModelTypes: { name: string, desc?: string }[] = [
        { name: 'virtio', desc: 'Linux, perf' },
        { name: 'e1000e', desc: 'PCI' },
        { name: 'e1000', desc: 'PCI, legacy' },
        { name: 'rtl8139', desc: 'PCI, legacy' }];
    const defaultModelType = dialogValues.networkModel;

    if (osTypeArch == 'ppc64' && osTypeMachine == 'pseries')
        availableModelTypes.push({ name: 'spapr-vlan' });

    return (
        <FormGroup fieldId={`${idPrefix}-model`} label={_("Model")}>
            <FormSelect id={`${idPrefix}-model`}
                        onChange={(_event, value) => onValueChanged('networkModel', value)}
                        data-value={defaultModelType}
                        value={defaultModelType}>
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

export const NetworkTypeAndSourceRow = ({
    vm,
    idPrefix,
    onValueChanged,
    dialogValues,
} : {
    vm: VM,
    idPrefix: string,
    onValueChanged: OnValueChanged,
    dialogValues: DialogBodyValues & { availableSources: AvailableSources },
}) => {
    interface NetworkTypeDescription {
        name: string,
        desc: string,
        detailHeadline?: React.ReactNode,
        detailParagraph?: React.ReactNode,
        externalDocs?: React.ReactNode,
        disabled?: boolean,
    }

    const defaultNetworkType = dialogValues.networkType;
    let availableNetworkTypes: NetworkTypeDescription[] = [];
    let defaultNetworkSource = dialogValues.networkSource;
    let networkSourcesContent: React.ReactNode;
    let networkSourceEnabled: boolean = true;

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
        if (dialogValues.availableSources.network.length > 0) {
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

    if (["network", "direct", "bridge"].includes(dialogValues.networkType)) {
        let sources: string[] = [];
        if (dialogValues.networkType === "network")
            sources = dialogValues.availableSources.network;
        else if (dialogValues.networkType === "direct")
            sources = Object.keys(dialogValues.availableSources.device).filter(dev => dialogValues.availableSources.device[dev].type != "bridge");
        else if (dialogValues.networkType === "bridge")
            sources = Object.keys(dialogValues.availableSources.device).filter(dev => dialogValues.availableSources.device[dev].type == "bridge");

        if (sources.length > 0) {
            networkSourcesContent = sources.sort().map(networkSource => {
                return (
                    <FormSelectOption value={networkSource} key={networkSource}
                                      label={networkSource} />
                );
            });
        } else {
            if (dialogValues.networkType === "network")
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

    return (
        <>
            { availableNetworkTypes.length > 0 &&
                <FormGroup fieldId={`${idPrefix}-type`}
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
                    <FormSelect id={`${idPrefix}-type`}
                        onChange={(_event, value) => onValueChanged('networkType', value)}
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
            {["network", "direct", "bridge"].includes(dialogValues.networkType) && (
                <FormGroup fieldId={`${idPrefix}-source`} label={_("Source")}>
                    <FormSelect id={`${idPrefix}-source`}
                                onChange={(_event, value) => onValueChanged('networkSource', value)}
                                isDisabled={!networkSourceEnabled}
                                data-value={defaultNetworkSource}
                                value={defaultNetworkSource}>
                        {networkSourcesContent}
                    </FormSelect>
                </FormGroup>
            )}
            {dialogValues.networkType == "direct" && (
                <FormGroup id={`${idPrefix}-source-mode`} label={_("Mode")} hasNoPaddingTop isInline
                    data-value={dialogValues.networkSourceMode}
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
                            id={`${idPrefix}-source-mode-${mode}`}
                            name={`mode-${mode}`}
                            isChecked={dialogValues.networkSourceMode == mode}
                            // The label is not translated since the
                            // documentation we link to is always in
                            // English.
                            label={<pre>{mode}</pre>}
                            onChange={() => onValueChanged('networkSourceMode', mode)} />)}
                </FormGroup>
            )}
        </>
    );
};

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
    // NOTE - Instead of validating the input (which no other part of
    // the dialog does), we simply ignore rules with a empty host
    // port.

    function valid_pf(pf: DialogPortForward): boolean {
        return !(pf.kind == "simple" && !pf.host);
    }

    return portForwards.filter(valid_pf).map((pf: DialogPortForward) => {
        if (pf.kind == "simple") {
            const range = pf.host.split("-");
            return {
                address: pf.address || null,
                dev: null,
                proto: pf.proto,
                range: [
                    {
                        start: range[0],
                        end: range[1] || null,
                        to: pf.guest || null,
                        exclude: null,
                    }
                ],
            };
        } else {
            return pf.config;
        }
    });
}

const SimplePortForward = ({
    id,
    item,
    onChange,
    idx,
    removeitem,
} : {
    id: string,
    item: DialogSimplePortForward,
    onChange: <K extends keyof DialogSimplePortForward>(idx: number, key: K, value: DialogSimplePortForward[K]) => void,
    idx: number,
    removeitem: (idx: number) => void,
}) => {
    return (
        <Grid hasGutter id={id}>
            <FormGroup className="pf-m-3-col-on-md"
                id={id + "-ip-address-group"}
                label={_("IP address")}
                fieldId={id + "-ip-address"}
                labelHelp={
                    <InfoPopover
                        aria-label={_("IP address help")}
                        enableFlip
                        bodyContent={_("If host IP is set to 0.0.0.0 or not set at all, the port will be bound on all IPs on the host.")}
                    />
                }>
                <TextInput
                    id={id + "-ip-address"}
                    value={item.address}
                    onChange={(_event, value) => {
                        onChange(idx, 'address', value);
                    }}
                />
            </FormGroup>
            <FormGroup
                className="pf-m-4-col-on-md"
                id={id + "-host-port-group"}
                label={_("Host port")}
                fieldId={id + "-host-port"}
                isRequired
                labelHelp={
                    <InfoPopover
                        aria-label={_("Host port help")}
                        enableFlip
                        bodyContent={_("The port on the host that is fotwarded into the guest. You can also specify a range of ports like 4000-4050.")}
                    />
                }>
                <TextInput
                    id={id + "-host-port"}
                    step={1}
                    value={item.host}
                    onChange={(_event, value) => {
                        onChange(idx, 'host', value);
                    }}
                />
            </FormGroup>
            <FormGroup
                className="pf-m-3-col-on-md"
                id={id + "-guest-port-group"}
                label={_("Guest port")}
                fieldId={id + "-guest-port"}
                labelHelp={
                    <InfoPopover
                        aria-label={_("Guest port help")}
                        enableFlip
                        bodyContent={_("The port on the guest. If left empty, the same port as on the host is used.")}
                    />
                }>
                <TextInput
                    id={id + "-guest-port"}
                    value={item.guest}
                    onChange={(_event, value) => {
                        onChange(idx, 'guest', value);
                    }}
                />
            </FormGroup>
            <FormGroup
                className="pf-m-2-col-on-md"
                label={_("Protocol")}
                fieldId={id + "-protocol"}
            >
                <FormSelect
                    className='pf-v6-c-form-control'
                    id={id + "-protocol"}
                    value={item.proto}
                    onChange={(_event, value) => onChange(idx, 'proto', value)}
                >
                    <FormSelectOption value='tcp' label={_("TCP")} />
                    <FormSelectOption value='udp' label={_("UDP")} />
                </FormSelect>
            </FormGroup>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={id + "-btn-close"}
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
    id,
    item,
    idx,
    removeitem,
} : {
    id: string,
    item: DialogComplexPortForward,
    idx: number,
    removeitem: (idx: number) => void,
}) => {
    return (
        <Grid hasGutter id={id}>
            <div className="pf-m-12-col-on-md">
                {
                    cockpit.format(
                        _("Complex rule \"$0\" can not be edited here."),
                        portForwardText(item.config))
                }
            </div>
            <FormGroup className="pf-m-1-col-on-md remove-button-group">
                <Button
                    variant='plain'
                    className="btn-close"
                    id={id + "-btn-close"}
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
    idPrefix,
    onValueChanged,
    dialogValues,
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    dialogValues: DialogBodyValues,
}) => {
    const simple_default: DialogPortForward = {
        kind: "simple",
        address: "",
        proto: "tcp",
        host: "",
        guest: "",
    };

    function addSimple() {
        onValueChanged('portForwards', dialogValues.portForwards.concat({ ...simple_default }));
    }

    function remItem(idx: number) {
        dialogValues.portForwards.splice(idx, 1);
        onValueChanged('portForwards', dialogValues.portForwards);
    }

    function onSimpleChange<K extends keyof DialogSimplePortForward>(idx: number, key: K, value: DialogSimplePortForward[K]) {
        if (dialogValues.portForwards[idx].kind == "simple") {
            dialogValues.portForwards[idx][key] = value;
            onValueChanged('portForwards', dialogValues.portForwards);
        }
    }

    const action = (
        <Button variant="secondary" onClick={addSimple}>
            {_("Add")}
        </Button>
    );

    return (
        <FormFieldGroup
            id={`${idPrefix}-port-forwards`}
            className="nic-dynamic-form-group"
            header={
                <FormFieldGroupHeader
                    titleText={{ id: `${idPrefix}-port-forwards-header`, text: _("Forwarded ports") }}
                    actions={action}
                />
            }
        >
            {dialogValues.portForwards.length == 0 &&
                <EmptyState>
                    <EmptyStateBody>
                        {_("No ports forwarded")}
                    </EmptyStateBody>
                </EmptyState>
            }
            {
                dialogValues.portForwards.map((pf, idx) => {
                    if (pf.kind == "simple")
                        return (
                            <SimplePortForward
                                key={idx}
                                id={`${idPrefix}-port-forwards-${idx}`}
                                item={pf}
                                onChange={onSimpleChange}
                                idx={idx}
                                removeitem={() => remItem(idx)}
                            />
                        );
                    else
                        return (
                            <ComplexPortForward
                                key={idx}
                                id={`${idPrefix}-port-forwards-${idx}`}
                                item={pf}
                                idx={idx}
                                removeitem={() => remItem(idx)}
                            />
                        );
                })
            }
        </FormFieldGroup>
    );
};
