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

import type { optString, ConnectionName } from '../../../types';
import type { AvailableSources } from './vmNicsCard';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Radio } from "@patternfly/react-core/dist/esm/components/Radio";
import { PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";
import { Content, ContentVariants } from "@patternfly/react-core/dist/esm/components/Content";
import { ExternalLinkSquareAltIcon } from '@patternfly/react-icons';

import { InfoPopover } from '../../common/infoPopover.jsx';

import cockpit from 'cockpit';

import './nic.css';

const _ = cockpit.gettext;

export interface DialogBodyValues {
    networkModel: string;
    networkType: string;
    networkSource: string;
    networkSourceMode: string;
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
    idPrefix,
    onValueChanged,
    dialogValues,
    connectionName
} : {
    idPrefix: string,
    onValueChanged: OnValueChanged,
    dialogValues: DialogBodyValues & { availableSources: AvailableSources },
    connectionName: ConnectionName,
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
    if (connectionName !== 'session') {
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
                externalDocs: (
                    <Button isInline
                            className='ct-external-docs-link'
                            variant="link"
                            component="a"
                            icon={<ExternalLinkSquareAltIcon />}
                            iconPosition="right"
                            target="__blank"
                            href="https://libvirt.org/formatdomain.html#direct-attachment-to-physical-interface">
                        {_("more info")}
                    </Button>
                )
            },
        ];
    } else {
        availableNetworkTypes = [
            ...virtualNetwork,
            {
                name: 'user',
                desc: 'Userspace SLIRP stack',
                detailParagraph: _("Provides a virtual LAN with NAT to the outside world.")
            },
        ];
    }

    // Bring to the first position in dropdown list the initial selection which reflects the current nic type
    availableNetworkTypes.sort(function(x, y) { return x.name == defaultNetworkType ? -1 : y.name == defaultNetworkType ? 1 : 0 });

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
            <FormGroup fieldId={`${idPrefix}-type`}
                       label={_("Interface type")}
                       labelHelp={
                           <InfoPopover aria-label={_("Interface type help")}
                                    position={PopoverPosition.bottom}
                                    enableFlip={false}
                                    bodyContent={<Flex direction={{ default: 'column' }}>
                                        {availableNetworkTypes.map(type => (<Content key={type.name}>
                                            <Content component={ContentVariants.h4}>{type.desc}</Content>
                                            <strong>{type.detailHeadline}</strong>
                                            <p>
                                                {type.detailParagraph}
                                                {type.externalDocs}
                                            </p>
                                        </Content>))}
                                    </Flex>}
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
                           data-value={dialogValues.networkSourceMode}>
                    <Radio id={`${idPrefix}-source-mode-vepa`}
                        name="mode-vepa"
                        isChecked={dialogValues.networkSourceMode == "vepa"}
                        label={_("VEPA")}
                        onChange={() => onValueChanged('networkSourceMode', "vepa")} />
                    <Radio id={`${idPrefix}-source-mode-bridge`}
                        name="mode-bridge"
                        isChecked={dialogValues.networkSourceMode == "bridge"}
                        label={_("Bridge")}
                        onChange={() => onValueChanged('networkSourceMode', "bridge")} />
                    <Radio id={`${idPrefix}-source-mode-private`}
                        name="mode-private"
                        isChecked={dialogValues.networkSourceMode == "private"}
                        label={_("Private")}
                        onChange={() => onValueChanged('networkSourceMode', "private")} />
                    <Radio id={`${idPrefix}-source-mode-passthrough`}
                        name="mode-passthrough"
                        isChecked={dialogValues.networkSourceMode == "passthrough"}
                        label={_("Passthrough")}
                        onChange={() => onValueChanged('networkSourceMode', "passthrough")} />
                </FormGroup>
            )}
        </>
    );
};
