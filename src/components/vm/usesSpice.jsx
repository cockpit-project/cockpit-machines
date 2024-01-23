import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Label } from "@patternfly/react-core/dist/esm/components/Label";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover";
import { ExclamationTriangleIcon } from "@patternfly/react-icons";

import cockpit from 'cockpit';
import { useDialogs } from 'dialogs.jsx';

import { ReplaceSpiceDialog } from './vmReplaceSpiceDialog.jsx';

const _ = cockpit.gettext;

export const VmUsesSpice = ({ vm }) => {
    const Dialogs = useDialogs();

    if (!vm.hasSpice || vm.capabilities?.supportsSpice)
        return null;

    const onReplace = () => Dialogs.show(<ReplaceSpiceDialog vmName={vm.name}
                                                             vmId={vm.id}
                                                             connectionName={vm.connectionName}
                                                             vmRunning={vm.state == 'running'} />);

    const header = _("Uses SPICE");
    return (
        <Popover
            alertSeverityVariant="warning"
            headerContent={header}
            headerIcon={<ExclamationTriangleIcon />}
            position="bottom"
            hasAutoWidth
            bodyContent={
                <>
                    <p>{_("SPICE is not supported on this host and will cause this virtual machine to not boot.")}</p>
                    <p>{_("Switch to VNC to continue using this machine.")}</p>
                </>
            }
            footerContent={ hide =>
                <Button variant="secondary" onClick={() => { hide(); onReplace() }}>
                    {_("Replace SPICE devices")}
                </Button>
            }>
            <Label className="resource-state-text" color="orange" id={`vm-${vm.name}-uses-spice`}
                   icon={<ExclamationTriangleIcon />} onClick={() => null}>
                {header}
            </Label>
        </Popover>
    );
};
