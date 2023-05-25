/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2021 Red Hat, Inc.
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
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";
import { HelpIcon } from "@patternfly/react-icons";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { ListingTable } from "cockpit-components-table.jsx";
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { FileAutoComplete } from "cockpit-components-file-autocomplete.jsx";
import { useDialogs } from 'dialogs.jsx';

import { domainCreateFilesystem, domainDeleteFilesystem, domainSetMemoryBacking } from "../../../libvirtApi/domain.js";
import { vmId } from "../../../helpers.js";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';

import "./vmFilesystemsCard.scss";

const _ = cockpit.gettext;

export const VmFilesystemsCard = ({ connectionName, vmName, vmState, filesystems }) => {
    const columnTitles = [_("Source path"), _("Mount tag"), ""];

    const rows = filesystems.map(filesystem => {
        const sourceKey = Object.keys(filesystem.source).find(key => filesystem.source[key]);
        const filesystemSource = sourceKey ? filesystem.source[sourceKey] : undefined;
        const filesystemTarget = filesystem.target.dir;
        const rowId = `${vmId(vmName)}-filesystem-${filesystemSource}-${filesystemTarget}`;
        const actions = (
            <div className='machines-listing-actions'>
                <DeleteResourceButton objectId={rowId}
                                      disabled={vmState != 'shut off'}
                                      actionName={_("Remove")}
                                      dialogProps={{
                                          title: _("Remove filesystem?"),
                                          errorMessage: cockpit.format(_("Filesystem $0 could not be removed"), filesystemTarget),
                                          actionDescription: cockpit.format(_("This filesystem will be removed from $0:"), vmName),
                                          objectDescription: [
                                              { name: _("Source path"), value: <span className="ct-monospace">{filesystemSource}</span> },
                                              { name: _("Mount tag"), value: <span className="ct-monospace">{filesystemTarget}</span> }
                                          ],
                                          actionName: _("Remove"),
                                          deleteHandler: () => domainDeleteFilesystem({ connectionName, vmName, target: filesystemTarget }),
                                      }}
                                      overlayText={_("Deleting shared directories is possible only when the guest is shut off")}
                                      isSecondary />
            </div>
        );
        const columns = [
            { title: filesystemSource },
            { title: filesystemTarget },
            { title: actions },
        ];

        return {
            columns,
            props: { key: rowId, 'data-row-id': rowId }
        };
    });

    return (
        <>
            <ListingTable variant='compact'
                          gridBreakPoint='grid-lg'
                          emptyCaption={_("No directories shared between the host and this VM")}
                          columns={columnTitles}
                          rows={rows} />
        </>
    );
};

export const VmFilesystemActions = ({ connectionName, objPath, vmName, vmState }) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vmName)}-filesystems`;

    function open() {
        Dialogs.show(<VmFilesystemAddModal connectionName={connectionName}
                                           vmName={vmName}
                                           objPath={objPath}
                                           vmState={vmState} />);
    }

    const addButton = (
        <Button id={`${idPrefix}-add`}
                isAriaDisabled={vmState != 'shut off'}
                onClick={open}
                variant="secondary">
            {_("Add shared directory")}
        </Button>
    );

    return vmState == 'shut off' ? addButton : <Tooltip content={_("Adding shared directories is possible only when the guest is shut off")}>{addButton}</Tooltip>;
};

const VmFilesystemAddModal = ({ connectionName, objPath, vmName, vmState }) => {
    const Dialogs = useDialogs();
    const [additionalOptionsExpanded, setAdditionalOptionsExpanded] = useState(false);
    const [dialogError, setDialogError] = useState();
    const [mountTag, setMountTag] = useState("");
    const [source, setSource] = useState("");
    const [validationFailed, setValidationFailed] = useState({});
    const [xattr, setXattr] = useState(false);
    const idPrefix = `${vmId(vmName)}-filesystems`;

    const onAddClicked = () => {
        const validationFailed = {};

        if (!mountTag)
            validationFailed.mountTag = _("Mount tag must not be empty");
        if (!source)
            validationFailed.source = _("Source must not be empty");

        setValidationFailed(validationFailed);

        if (Object.getOwnPropertyNames(validationFailed).length == 0) {
            domainSetMemoryBacking({
                connectionName,
                vmName,
                type: "memfd",
            })
                    .then(() => domainCreateFilesystem({
                        connectionName,
                        objPath,
                        vmName,
                        source,
                        target: mountTag,
                        xattr,
                    }))
                    .then(
                        Dialogs.close,
                        exc => setDialogError(exc.message)
                    );
        }
    };
    return (
        <Modal position="top" isOpen variant="medium" onClose={Dialogs.close}
               title={_("Share a host directory with the guest")}
               footer={
                   <>
                       <Button id={`${idPrefix}-modal-add`}
                               variant='primary'
                               onClick={onAddClicked}>
                           {_("Share")}
                       </Button>
                       <Button id={`${idPrefix}-modal-cancel`}
                               variant='link'
                               onClick={Dialogs.close}>
                           {_("Cancel")}
                       </Button>
                   </>
               }
               description={
                   <>
                       {_("Shared host directories need to be manually mounted inside the VM")}
                       <Popover
                           headerContent={_("You can mount the shared folder using:")}
                           bodyContent={
                               <CodeBlock>
                                   <CodeBlockCode>mount -t virtiofs {mountTag || 'hostshare'} [mount point]</CodeBlockCode>
                               </CodeBlock>
                           }
                           footerContent={
                               <List>
                                   <ListItem>{_("mount point: The mount point inside the guest")}</ListItem>
                               </List>
                           }
                           hasAutoWidth>
                           <Button variant="plain" aria-label={_("more info")}>
                               <HelpIcon />
                           </Button>
                       </Popover>
                   </>
               }>
            <Form isHorizontal>
                {dialogError && <ModalError dialogError={_("Failed to add shared directory")} dialogErrorDetail={dialogError} />}
                <FormGroup fieldId={`${idPrefix}-modal-source`}
                           id={`${idPrefix}-modal-source-group`}
                           label={_("Source path")}
                           labelIcon={
                               <Popover headerContent={_("The host path that is to be exported.")}>
                                   <button aria-label={_("More info for source path field")}
                                           className="pf-v5-c-form__group-label-help"
                                           onClick={e => e.preventDefault()}
                                           type="button">
                                       <HelpIcon noVerticalAlign />
                                   </button>
                               </Popover>
                           }>
                    <FileAutoComplete id={`${idPrefix}-modal-source`}
                                      onChange={value => setSource(value)}
                                      placeholder="/export/to/guest"
                                      superuser="try"
                                      value={source} />
                    <FormHelper fieldId={`${idPrefix}-modal-source`} helperTextInvalid={validationFailed.source} />
                </FormGroup>
                <FormGroup fieldId={`${idPrefix}-modal-mountTag`}
                           label={_("Mount tag")}
                           labelIcon={
                               <Popover headerContent={_("The tag name to be used by the guest to mount this export point.")}>
                                   <button aria-label={_("More info for mount tag field")}
                                           className="pf-v5-c-form__group-label-help"
                                           onClick={e => e.preventDefault()}
                                           type="button">
                                       <HelpIcon noVerticalAlign />
                                   </button>
                               </Popover>
                           }>
                    <TextInput id={`${idPrefix}-modal-mountTag`}
                               onChange={(_, value) => setMountTag(value)}
                               placeholder="hostshare"
                               value={mountTag}
                               validated={validationFailed.mountTag ? "error" : "default"} />
                    <FormHelper fieldId={`${idPrefix}-modal-mountTag`} helperTextInvalid={validationFailed.mountTag} />
                </FormGroup>
                <ExpandableSection toggleText={ additionalOptionsExpanded ? _("Hide additional options") : _("Show additional options")}
                                   onToggle={() => setAdditionalOptionsExpanded(!additionalOptionsExpanded)}
                                   isExpanded={additionalOptionsExpanded}>
                    <FormGroup hasNoPaddingTop
                               fieldId={`${idPrefix}-modal-xattr`}
                               label={_("Extended attributes")}>
                        <Checkbox id={`${idPrefix}-modal-xattr`}
                                  isChecked={xattr}
                                  label={_("Use extended attributes on files and directories")}
                                  onChange={(_event, xattr) => setXattr(xattr)} />
                    </FormGroup>
                </ExpandableSection>
            </Form>
        </Modal>
    );
};
