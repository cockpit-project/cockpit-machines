/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2021 Red Hat, Inc.
 */
import React, { useState } from 'react';
import cockpit from 'cockpit';

import type { VM, VMFilesystem } from '../../../types';

import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import {
    Modal, ModalBody, ModalFooter, ModalHeader
} from '@patternfly/react-core/dist/esm/components/Modal';
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip";

import { FormHelper } from 'cockpit-components-form-helper.jsx';
import { ListingTable } from "cockpit-components-table.jsx";
import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { FileAutoComplete } from "cockpit-components-file-autocomplete.jsx";
import { useDialogs } from 'dialogs.jsx';

import { virtXmlHotAdd, virtXmlHotRemove, virtXmlEdit } from "../../../libvirtApi/domain.js";
import { vmId } from "../../../helpers.js";
import { DeleteResourceButton } from '../../common/deleteResource.jsx';
import { InfoPopover } from '../../common/infoPopover.jsx';

const _ = cockpit.gettext;

export const VmFilesystemsCard = ({
    vm,
} : {
    vm: VM,
}) => {
    const columnTitles = [_("Source path"), _("Mount tag"), ""];

    const rows = vm.filesystems.map(filesystem => {
        const keys: (keyof VMFilesystem["source"])[] = ["name", "dir", "file", "socket"];
        const sourceKey = keys.find(key => filesystem.source[key]);
        const filesystemSource = sourceKey ? filesystem.source[sourceKey] : undefined;
        const filesystemTarget = filesystem.target.dir;
        const rowId = `${vmId(vm.name)}-filesystem-${filesystemSource}-${filesystemTarget}`;
        const actions = (
            <div className='machines-listing-actions'>
                <DeleteResourceButton objectId={rowId}
                                      actionName={_("Remove")}
                                      dialogProps={{
                                          title: _("Remove filesystem?"),
                                          errorMessage: cockpit.format(_("Filesystem $0 could not be removed"), filesystemTarget),
                                          actionDescription: cockpit.format(_("This filesystem will be removed from $0:"), vm.name),
                                          objectDescription: [
                                              { name: _("Source path"), value: <span className="ct-monospace">{filesystemSource}</span> },
                                              { name: _("Mount tag"), value: <span className="ct-monospace">{filesystemTarget}</span> }
                                          ],
                                          actionName: _("Remove"),
                                          deleteHandler: () => virtXmlHotRemove(
                                              vm,
                                              "filesystem",
                                              { target: { dir: filesystemTarget } }
                                          ),
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
        <ListingTable variant='compact'
                          gridBreakPoint='grid-lg'
                          emptyCaption={_("No shared directories")}
                          columns={columnTitles}
                          rows={rows} />
    );
};

export const VmFilesystemActions = ({
    vm,
} : {
    vm: VM,
}) => {
    const Dialogs = useDialogs();
    const idPrefix = `${vmId(vm.name)}-filesystems`;
    function open() {
        Dialogs.show(<VmFilesystemAddModal vm={vm} />);
    }

    /* We can hot-add filesystems, but we can not hot-add a
       memoryBacking element. But if it is there, we assume we don't
       need to change it.
     */
    const enabled = vm.memoryBacking || vm.state == 'shut off';

    const addButton = (
        <Button id={`${idPrefix}-add`}
                isAriaDisabled={!enabled}
                onClick={open}
                variant="secondary">
            {_("Add shared directory")}
        </Button>
    );

    return enabled ? addButton : <Tooltip content={_("Adding shared directories is possible only when the guest is shut off")}>{addButton}</Tooltip>;
};

interface ValidationFailed {
    mountTag?: string;
    source?: string;
}

const VmFilesystemAddModal = ({
    vm
} : {
    vm: VM
}) => {
    const Dialogs = useDialogs();
    const [additionalOptionsExpanded, setAdditionalOptionsExpanded] = useState(false);
    const [dialogError, setDialogError] = useState<string | undefined>();
    const [mountTag, setMountTag] = useState("");
    const [source, setSource] = useState("");
    const [validationFailed, setValidationFailed] = useState<ValidationFailed>({});
    const [xattr, setXattr] = useState(false);
    const idPrefix = `${vmId(vm.name)}-filesystems`;

    const onAddClicked = async () => {
        const validationFailed: ValidationFailed = {};

        if (!mountTag)
            validationFailed.mountTag = _("Mount tag must not be empty");
        if (!source)
            validationFailed.source = _("Source must not be empty");

        setValidationFailed(validationFailed);

        if (Object.getOwnPropertyNames(validationFailed).length == 0) {
            try {
                if (!vm.memoryBacking) {
                    await virtXmlEdit(vm, "memorybacking", 1, {
                        access: { mode: "shared" },
                        source: { type: "memfd" },
                    });
                }
                await virtXmlHotAdd(vm, "filesystem", {
                    type: "mount",
                    accessmode: "passthrough",
                    driver: { type: "virtiofs" },
                    source: { dir: source },
                    target: { dir: mountTag },
                    binary: { xattr: xattr ? "on" : null },
                });
                Dialogs.close();
            } catch (exc) {
                setDialogError(String(exc));
            }
        }
    };
    return (
        <Modal position="top" isOpen variant="medium" onClose={Dialogs.close}>
            <ModalHeader title={_("Share a host directory with the guest")}
                description={
                    <>
                        {_("Shared host directories need to be manually mounted inside the VM")}
                        <InfoPopover
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
                            hasAutoWidth
                        />
                    </>
                }
            />
            <ModalBody>
                <Form isHorizontal>
                    {dialogError && <ModalError dialogError={_("Failed to add shared directory")} dialogErrorDetail={dialogError} />}
                    <FormGroup fieldId={`${idPrefix}-modal-source`}
                               id={`${idPrefix}-modal-source-group`}
                               label={_("Source path")}
                               labelHelp={
                                   <InfoPopover bodyContent={_("The host path that is to be exported.")} />
                               }>
                        <FileAutoComplete id={`${idPrefix}-modal-source`}
                                          onChange={(value: string) => setSource(value)}
                                          placeholder="/export/to/guest"
                                          superuser="try"
                                          value={source} />
                        <FormHelper fieldId={`${idPrefix}-modal-source`} helperTextInvalid={validationFailed.source} />
                    </FormGroup>
                    <FormGroup fieldId={`${idPrefix}-modal-mountTag`}
                               label={_("Mount tag")}
                               labelHelp={
                                   <InfoPopover
                                       bodyContent={_("The tag name to be used by the guest to mount this export point.")} />
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
            </ModalBody>
            <ModalFooter>
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
            </ModalFooter>
        </Modal>
    );
};
