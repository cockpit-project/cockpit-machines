/*
 * This file is part of Cockpit.
 *
 * Copyright 2024 Fsas Technologies Inc.
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
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { DialogsContext } from 'dialogs.jsx';

import cockpit from 'cockpit';
import { vmId } from "../../../helpers.js";
import AddVIDEO from './videoAdd.jsx';
import { EditVIDEOModal } from './videoEdit.jsx';
import { needsShutdownVideo, NeedsShutdownTooltip } from '../../common/needsShutdown.jsx';
import './video.css';
import { domainDetachVideo } from '../../../libvirtApi/domain.js';

import { KebabDropdown } from "cockpit-components-dropdown";
import { ListingTable } from "cockpit-components-table.jsx";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

const _ = cockpit.gettext;

export class VmVideoActions extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            videoDevices: undefined,
        };
    }

    componentDidMount() {
    }

    render() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const id = vmId(vm.name);

        const open = () => {
            Dialogs.show(<AddVIDEO idPrefix={`${id}-add-video`}
                                 vm={vm} />);
        };

        return (
            <Button id={`${id}-add-video-button`} variant="secondary"
                    isDisabled={false}
                    onClick={open}>
                {_("Add video device")}
            </Button>
        );
    }
}

VmVideoActions.propTypes = {
    vm: PropTypes.object.isRequired,
};

export class VmVideoTab extends React.Component {
    static contextType = DialogsContext;

    constructor(props) {
        super(props);

        this.state = {
            dropdownOpenActions: new Set(),
        };

        this.deviceProxyHandler = this.deviceProxyHandler.bind(this);
        this.client = cockpit.dbus("org.freedesktop.NetworkManager", {});
        this.hostDevices = this.client.proxies("org.freedesktop.NetworkManager.Device");
        this.hostDevices.addEventListener('changed', this.deviceProxyHandler);
        this.hostDevices.addEventListener('removed', this.deviceProxyHandler);
    }

    deviceProxyHandler() {
        this.forceUpdate();
    }

    componentDidMount() {
    }

    componentDidUpdate(prevProps, prevState) {
    }

    componentWillUnmount() {
        this.client.close();
    }

    render() {
        const Dialogs = this.context;
        const { vm } = this.props;
        const id = vmId(vm.name);

        const videos = vm.displays
            .filter(video => video.type === 'vnc' || video.type === 'spice')
            .map((video, index) => ({ ...video, index }));

        const availableSources = {
            video: ['vnc', 'spice'],
            device: {
                'vnc': { type: 'vnc' },
                'spice': { type: 'spice' }
            }
        };

        let detailMap = [
            {
                name: _("Type"),
                value: (video, videoId) => {
                    return (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }} id={`${id}-video-${videoId}-type`}>
                            <FlexItem>{video.type}</FlexItem>
                            {needsShutdownVideo(vm, video) && <NeedsShutdownTooltip iconId={`${id}-video-${videoId}-type-tooltip`} tooltipId="tip-video" />}
                        </Flex>
                    );
                },
                props: { width: 10 },
                hidden: false,
            },
            {
                name: "",
                value: (video, videoId) => {
                    const editVIDEOAction = () => {
                        const editVIDEODialogProps = {
                            idPrefix: `${id}-video-${videoId}-edit-dialog`,
                            vm,
                            video,
                            availableSources
                        };

                        function open() {
                            Dialogs.show(<EditVIDEOModal {...editVIDEODialogProps } />);
                        }

                        const isEditDisabled = false;
                        let editDisabledReason;

                        const editButton = (
                            <Button id={editVIDEODialogProps.idPrefix} variant='secondary'
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
                        title: _("Remove video device?"),
                        errorMessage: cockpit.format(_("Video device $0 could not be removed"), video.index),
                        actionDescription: cockpit.format(_("Video device $0 will be removed from $1"), video.index, vm.name),
                        actionName: _("Remove"),
                        deleteHandler: () => domainDetachVideo({ connectionName: vm.connectionName, index: video.index, vmName: vm.name, live: vm.state === 'running', persistent: vm.persistent }),
                    };
                    const disabled = vm.state != 'shut off' && vm.state != 'running';

                    let deleteButton = (
                        <DeleteResourceButton objectId={`${id}-video-${videoId}`}
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

                    const isOpen = this.state.dropdownOpenActions.has(video.index);
                    const setIsOpen = open => {
                        const next = new Set(this.state.dropdownOpenActions);
                        if (open)
                            next.add(video.index);
                        else
                            next.delete(video.index);

                        this.setState({ dropdownOpenActions: next });
                    };

                    return (
                        <div className='machines-listing-actions'>
                            {editVIDEOAction()}
                            <KebabDropdown position="right"
                                           toggleButtonId={`${id}-video-${videoId}-action-kebab`}
                                           dropdownItems={[deleteButton]}
                                           isOpen={isOpen}
                                           setIsOpen={setIsOpen} />
                        </div>
                    );
                },
                props: { width: 10 }
            },
        ];

        let videoId = 1;
        detailMap = detailMap.filter(d => !d.hidden);

        const columnTitles = detailMap.map(target => target.name);
        const sortVideos = (a, b) => {
            if (a.type !== b.type)
                return a.type > b.type ? 1 : -1;
            else
                return 0;
        };
        const rows = videos.sort(sortVideos).map(target => {
            const columns = detailMap.map(d => {
                return { title: d.value(target, videoId, vm.connectionName) };
            });
            videoId++;
            return { columns, props: { key: videoId } };
        });

        return (
            <ListingTable aria-label={`VM ${vm.name} Video device Cards`}
                          gridBreakPoint='grid-lg'
                          variant='compact'
                          emptyCaption={_("No Video device defined for this VM")}
                          columns={columnTitles}
                          rows={rows} />
        );
    }
}

VmVideoTab.propTypes = {
    vm: PropTypes.object.isRequired,
};
