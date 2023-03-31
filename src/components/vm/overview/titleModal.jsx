import React, { useState } from 'react';
import cockpit from 'cockpit';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { useDialogs } from 'dialogs.jsx';

import { ModalError } from 'cockpit-components-inline-notification.jsx';
import { domainSetTitle } from '../../../libvirtApi/domain.js';

const _ = cockpit.gettext;

export const TitleModal = ({ vm }) => {
    const Dialogs = useDialogs();
    const [error, setError] = useState({});
    const [newTitle, setTitle] = useState(vm.title);
    const [isLoading, setIsLoading] = useState(false);

    function save() {
        setIsLoading(true);
        domainSetTitle({
            name: vm.name,
            id: vm.id,
            connectionName: vm.connectionName,
            title: newTitle
        }).then(Dialogs.close, exc => {
            setIsLoading(false);
            setError({ dialogError: _("Title could not be changed"), dialogErrorDetail: exc.message });
        });
    }

    const defaultBody = (
        <Form isHorizontal>
            <FormGroup id="title-model-select-group" label={_("New title")}
                fieldId="rename-dialog-new-title"
            >
                <TextInput id='rename-dialog-new-title'
                    value={newTitle}
                    onChange={setTitle} />
            </FormGroup>
        </Form>
    );

    return (
        <Modal position="top" variant="small" isOpen onClose={Dialogs.close}
            title={cockpit.format(_("Set title of $0"), vm.name)}
            footer={
                <>
                    <Button variant='primary' isDisabled={isLoading} isLoading={isLoading} id="title-config-dialog-apply" onClick={save}>
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
