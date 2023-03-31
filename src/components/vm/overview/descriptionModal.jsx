import React, { useState } from 'react';
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainSetDescription } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const DescriptionModal = ({ vm }) => {
    const Dialogs = useDialogs();
    const [error, setError] = useState({});
    const [newDescription, setDescription] = useState(vm.description);
    const [isLoading, setIsLoading] = useState(false);

    function save() {
        setIsLoading(true);
        domainSetDescription({
            name: vm.name,
            id: vm.id,
            connectionName: vm.connectionName,
            description: newDescription
        }).then(Dialogs.close, exc => {
            setIsLoading(false);
            setError({ dialogError: _("Description could not be changed"), dialogErrorDetail: exc.message });
        });
    }

    const defaultBody = (
        <Form isHorizontal>
            <FormGroup id="description-model-select-group" label={_("New description")}
                fieldId="rename-dialog-new-description"
            >
                <TextInput id='rename-dialog-new-description'
                    value={newDescription}
                    onChange={setDescription} />
            </FormGroup>
        </Form>
    );

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
            title={cockpit.format(_("Set description of $0"), vm.name)}
            footer={
                <>
                    <Button variant='primary' isDisabled={isLoading} isLoading={isLoading} id="description-config-dialog-apply" onClick={save}>
                        {_("Save")}
                    </Button>
                    <Button variant='link' onClick={Dialogs.close}>
                        {_("Cancel")}
                    </Button>
                </>
            }>
            <>
                {error && error.dialogError && <ModalError dialogError={error.dialogError} dialogErrorDetail={error.dialogErrorDetail} />}
                {defaultBody}
            </>
        </Modal>
    );
};
