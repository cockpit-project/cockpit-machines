import React from 'react';
import PropTypes from 'prop-types';
import cockpit from 'cockpit';
import { Alert, Tooltip } from "@patternfly/react-core";
import { PendingIcon } from "@patternfly/react-icons";

const _ = cockpit.gettext;

export const WarningInactiveTooltip = ({ iconId, tooltipId }) => {
    return (
        <Tooltip id={tooltipId} content={_("Changes will take effect after shutting down the VM")}>
            <PendingIcon color="orange" id={iconId} />
        </Tooltip>
    );
};

WarningInactiveTooltip.propTypes = {
    iconId: PropTypes.string.isRequired,
    tooltipId: PropTypes.string.isRequired,
};

export const WarningInactiveAlert = ({ idPrefix }) =>
    <Alert isInline variant='warning' id={`${idPrefix}-idle-message`} title={_("Changes will take effect after shutting down the VM")} />;

WarningInactiveAlert.propTypes = {
    idPrefix: PropTypes.string.isRequired,
};
