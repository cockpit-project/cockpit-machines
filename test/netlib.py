# This file is part of Cockpit.
#
# Copyright (C) 2017 Red Hat, Inc.
#
# Cockpit is free software; you can redistribute it and/or modify it
# under the terms of the GNU Lesser General Public License as published by
# the Free Software Foundation; either version 2.1 of the License, or
# (at your option) any later version.
#
# Cockpit is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public License
# along with Cockpit; If not, see <http://www.gnu.org/licenses/>.

# This is a Trimmed version from NetworkHelpers from cockpit-project/cockpit/test/verify/netlib

import re
import subprocess

from testlib import *


class NetworkHelpers:
    '''Mix-in class for tests that require network setup'''

    def add_veth(self, name, dhcp_cidr=None, dhcp_range=['10.111.112.2', '10.111.127.254']):
        '''Add a veth device that is manageable with NetworkManager

        This is safe for @nondestructive tests, the interface gets cleaned up automatically.
        '''
        self.machine.execute(r"""set -e
            mkdir -p /run/udev/rules.d/
            echo 'ENV{ID_NET_DRIVER}=="veth", ENV{INTERFACE}=="%(name)s", ENV{NM_UNMANAGED}="0"' > /run/udev/rules.d/99-nm-veth-%(name)s-test.rules
            udevadm control --reload
            ip link add name %(name)s type veth peer name v_%(name)s
            # Trigger udev to make sure that it has been renamed to its final name
            udevadm trigger --subsystem-match=net
            udevadm settle
            """ % {"name": name})
        self.addCleanup(self.machine.execute, "rm /run/udev/rules.d/99-nm-veth-{0}-test.rules; ip link del dev {0}".format(name))
        if dhcp_cidr:
            # up the remote end, give it an IP, and start DHCP server
            self.machine.execute("ip a add {0} dev v_{1} && ip link set v_{1} up".format(dhcp_cidr, name))
            server = self.machine.spawn("dnsmasq --keep-in-foreground --log-queries --log-facility=- "
                                        "--conf-file=/dev/null --dhcp-leasefile=/tmp/leases.{0} "
                                        "--bind-interfaces --except-interface=lo --interface=v_{0} --dhcp-range={1},{2},4h".format(name, dhcp_range[0], dhcp_range[1]),
                                        "dhcp-%s.log" % name)
            self.addCleanup(self.machine.execute, "kill %i" % server)
            self.machine.execute("if firewall-cmd --state >/dev/null 2>&1; then firewall-cmd --add-service=dhcp; fi")
