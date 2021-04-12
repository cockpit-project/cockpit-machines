# This file is part of Cockpit.
#
# Copyright (C) 2015 Red Hat, Inc.
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

# This is a Trimmed version from StorageHelpers from cockpit-project/cockpit/test/verify/storagelib

class StorageHelpers:
    '''Mix-in class for using in tests that derive from something else than MachineCase or StorageCase'''
    def add_ram_disk(self, size=50):
        '''Add per-test RAM disk

        The disk gets removed automatically when the test ends. This is safe for @nondestructive tests.

        Return the device name.
        '''
        # sanity test: should not yet be loaded
        self.machine.execute("test ! -e /sys/module/scsi_debug")
        self.machine.execute("modprobe scsi_debug dev_size_mb=%s" % size)
        dev = self.machine.execute('set -e; while true; do O=$(ls /sys/bus/pseudo/drivers/scsi_debug/adapter*/host*/target*/*:*/block 2>/dev/null || true); '
                                   '[ -n "$O" ] && break || sleep 0.1; done; echo "/dev/$O"').strip()
        # don't use addCleanup() here, this is often busy and needs to be cleaned up late; done in MachineCase.nonDestructiveSetup()

        return dev
