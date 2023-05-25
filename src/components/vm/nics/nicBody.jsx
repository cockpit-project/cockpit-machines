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
import PropTypes from 'prop-types';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect";
import { Popover, PopoverPosition } from "@patternfly/react-core/dist/esm/components/Popover";
import { Text, TextContent, TextVariants } from "@patternfly/react-core/dist/esm/components/Text";
import { ExternalLinkSquareAltIcon, OutlinedQuestionCircleIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';

import './nic.css';

const _ = cockpit.gettext;

export const NetworkModelRow = ({ idPrefix, onValueChanged, dialogValues, osTypeArch, osTypeMachine }) => {
    const availableModelTypes = [
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

NetworkModelRow.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    osTypeArch: PropTypes.string.isRequired,
    osTypeMachine: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
};

export const NetworkTypeAndSourceRow = ({ idPrefix, onValueChanged, dialogValues, connectionName }) => {
    const defaultNetworkType = dialogValues.networkType;
    let availableNetworkTypes = [];
    let defaultNetworkSource = dialogValues.networkSource;
    let networkSourcesContent;
    let networkSourceEnabled = true;

    // { name: 'ethernet', desc: 'Generic ethernet connection' }, Add back to the list when implemented
    const virtualNetwork = [{
        name: 'network',
        desc: 'Virtual network',
        detailHeadline: _("This is the recommended config for general guest connectivity on hosts with dynamic / wireless networking configs."),
        detailParagraph: _("Provides a connection whose details are described by the named network definition.")
    }];
    if (connectionName !== 'session') {
        availableNetworkTypes = [
            ...virtualNetwork,
            {
                name: 'bridge',
                desc: 'Bridge to LAN',
                detailHeadline: _("This is the recommended config for general guest connectivity on hosts with static wired networking configs."),
                detailParagraph: _("Provides a bridge from the guest virtual machine directly onto the LAN. This needs a bridge device on the host with one or more physical NICs.")
            },
            {
                name: 'direct',
                desc: 'Direct attachment',
                detailHeadline: _("This is the recommended config for high performance or enhanced security."),
                detailParagraph: _("In the default 'vepa' mode, switching is offloaded to the external switch. If the switch is not VEPA-capable, communication between guest virtual machines, or between a guests and the host is not possible."),
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
        let sources;
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
                       labelIcon={
                           <Popover aria-label={_("Interface type help")}
                                    position={PopoverPosition.bottom}
                                    enableFlip={false}
                                    bodyContent={<Flex direction={{ default: 'column' }}>
                                        {availableNetworkTypes.map(type => (<TextContent key={type.name}>
                                            <Text component={TextVariants.h4}>{type.desc}</Text>
                                            <strong>{type.detailHeadline}</strong>
                                            <p>
                                                {type.detailParagraph}
                                                {type.externalDocs}
                                            </p>
                                        </TextContent>))}
                                    </Flex>}>
                               <button onClick={e => e.preventDefault()} className="pf-v5-c-form__group-label-help">
                                   <OutlinedQuestionCircleIcon />
                               </button>
                           </Popover>
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
        </>
    );
};

NetworkTypeAndSourceRow.propTypes = {
    idPrefix: PropTypes.string.isRequired,
    connectionName: PropTypes.string.isRequired,
    onValueChanged: PropTypes.func.isRequired,
    dialogValues: PropTypes.object.isRequired,
};
