# This file is part of Cockpit.
#
# Copyright (C) 2021 Red Hat, Inc.
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

from netlib import NetworkHelpers
from storagelib import StorageHelpers
from testlib import Error, MachineCase, wait

distrosWithMonolithicDaemon = ["rhel-8-6", "rhel-8-7", "rhel-8-8", "rhel-8-9", "ubuntu-stable", "ubuntu-2204", "debian-testing", "debian-stable", "centos-8-stream", "arch"]


class VirtualMachinesCaseHelpers:
    created_pool = False

    def waitPageInit(self):
        virtualization_disabled_ignored = self.browser.call_js_func("localStorage.getItem", "virtualization-disabled-ignored") == "true"
        virtualization_enabled = "PASS" in self.machine.execute("virt-host-validate | grep 'Checking for hardware virtualization'")
        if not virtualization_enabled and not virtualization_disabled_ignored:
            self.browser.click("#ignore-hw-virtualization-disabled-btn")
        with self.browser.wait_timeout(30):
            self.browser.wait_in_text("body", "Virtual machines")

    def performAction(self, vmName, action, checkExpectedState=True, connectionName="system"):
        b = self.browser
        b.click("#vm-{0}-{1}-action-kebab button".format(vmName, connectionName))
        b.wait_visible("#vm-{0}-{1}-action-kebab > .pf-v5-c-dropdown__menu".format(vmName, connectionName))
        b.click("#vm-{0}-{1}-{2} a".format(vmName, connectionName, action))

        # Some actions, which can cause expensive downtime when clicked accidentally, have confirmation dialog
        if action in ["off", "forceOff", "reboot", "forceReboot", "sendNMI"]:
            b.wait_visible("#vm-{0}-{1}-confirm-action-modal".format(vmName, connectionName))
            b.click(".pf-v5-c-modal-box__footer #vm-{0}-{1}-{2}".format(vmName, connectionName, action))
            b.wait_not_present("#vm-{0}-{1}-confirm-action-modal".format(vmName, connectionName))

        if not checkExpectedState:
            return

        if action == "pause":
            b.wait_in_text("#vm-{0}-{1}-state".format(vmName, connectionName), "Paused")
        if action == "resume" or action == "run":
            b.wait_in_text("#vm-{0}-{1}-state".format(vmName, connectionName), "Running")
        if action == "forceOff" or action == "off":
            b.wait_in_text("#vm-{0}-{1}-state".format(vmName, connectionName), "Shut off")

    def goToVmPage(self, vmName, connectionName='system'):
        self.browser.click("tbody tr[data-row-id=vm-{0}-{1}] a.vm-list-item-name".format(vmName, connectionName))  # click on the row

    def goToMainPage(self):
        self.browser.click(".machines-listing-breadcrumb li:first-of-type a")

    def waitVmPage(self, vmName):
        self.browser.wait_in_text("#vm-details .vm-name", vmName)

    def waitVmRow(self, vmName, connectionName='system', present=True):
        b = self.browser
        vm_row = "tbody tr[data-row-id=vm-{0}-{1}]".format(vmName, connectionName)
        if present:
            b.wait_visible(vm_row)
        else:
            b.wait_not_present(vm_row)

    def togglePoolRow(self, poolName, connectionName="system"):
        isExpanded = 'pf-m-expanded' in self.browser.attr("tbody tr[data-row-id=pool-{0}-{1}] + tr".format(poolName, connectionName), "class")  # click on the row header
        self.browser.click("tbody tr[data-row-id=pool-{0}-{1}] .pf-v5-c-table__toggle button".format(poolName, connectionName))  # click on the row header
        if isExpanded:
            self.browser.wait_not_present("tbody tr[data-row-id=pool-{0}-{1}] + tr.pf-m-expanded".format(poolName, connectionName))  # click on the row header
        else:
            self.browser.wait_visible("tbody tr[data-row-id=pool-{0}-{1}] + tr.pf-m-expanded".format(poolName, connectionName))  # click on the row header

    def waitPoolRow(self, poolName, connectionName="system", present="true"):
        b = self.browser
        pool_row = "tbody tr[data-row-id=pool-{0}-{1}]".format(poolName, connectionName)
        if present:
            b.wait_visible(pool_row)
        else:
            b.wait_not_present(pool_row)

    def toggleNetworkRow(self, networkName, connectionName="system"):
        isExpanded = 'pf-m-expanded' in self.browser.attr("tbody tr[data-row-id=network-{0}-{1}] + tr".format(networkName, connectionName), "class")  # click on the row header
        self.browser.click("tbody tr[data-row-id=network-{0}-{1}] .pf-v5-c-table__toggle button".format(networkName, connectionName))  # click on the row header
        if isExpanded:
            self.browser.wait_not_present("tbody tr[data-row-id=network-{0}-{1}] + tr.pf-m-expanded".format(networkName, connectionName))  # click on the row header
        else:
            self.browser.wait_visible("tbody tr[data-row-id=network-{0}-{1}] + tr.pf-m-expanded".format(networkName, connectionName))  # click on the row header

    def waitNetworkRow(self, networkName, connectionName="system", present="true"):
        b = self.browser
        network_row = "tbody tr[data-row-id=network-{0}-{1}]".format(networkName, connectionName)
        if present:
            b.wait_visible(network_row)
        else:
            b.wait_not_present(network_row)

    def getDomainMacAddress(self, vmName):
        dom_xml = f"virsh -c qemu:///system dumpxml --domain {vmName}"
        return self.machine.execute(f"{dom_xml} | xmllint --xpath 'string(//domain/devices/interface/mac/@address)' - 2>&1 || true").strip()

    def getLibvirtServiceName(self):
        m = self.machine

        if m.image not in distrosWithMonolithicDaemon:
            return "virtqemud"
        else:
            return "libvirtd"

    def startLibvirt(self, m):

        # Ensure everything has started correctly
        m.execute(f"systemctl start {self.getLibvirtServiceName()}.service")

        # Wait until we can get a list of domains
        m.execute("until virsh list; do sleep 1; done")

        # Wait for the network 'default' to become active
        m.execute("virsh net-define /etc/libvirt/qemu/networks/default.xml || true")
        m.execute("virsh net-start default || true")
        m.execute(r"until virsh net-info default | grep 'Active:\s*yes'; do sleep 1; done")

    def createVm(self, name, graphics='none', ptyconsole=False, running=True, memory=128, connection='system'):
        m = self.machine

        image_file = m.pull("cirros")

        if connection == "system":
            img = "/var/lib/libvirt/images/{0}-2.img".format(name)
            logPath = f"/var/log/libvirt/console-{name}.log"
        else:
            m.execute("runuser -l admin -c 'mkdir -p /home/admin/.local/share/libvirt/images'")
            img = "/home/admin/.local/share/libvirt/images/{0}-2.img".format(name)
            logPath = f"/home/admin/.local/share/libvirt/console-{name}.log"

        m.upload([image_file], img)
        m.execute("chmod 777 {0}".format(img))

        args = {
            "name": name,
            "image": img,
            "logfile": logPath,
            "memory": memory,
        }
        if ptyconsole:
            console = "pty,target.type=virtio "
        else:
            console = "file,target.type=serial,source.path={} ".format(args["logfile"])

        command = ["virt-install --connect qemu:///{5} --name {0} "
                   "--os-variant cirros0.4.0 "
                   "--boot hd,network "
                   "--vcpus 1 "
                   "--memory {1} "
                   "--import --disk {2} "
                   "--graphics {3} "
                   "--console {4}"
                   "--print-step 1 > /tmp/xml-{5}".format(name, memory, img, "none" if graphics == "none" else graphics + ",listen=127.0.0.1", console, connection)]

        command.append(f"virsh -c qemu:///{connection} define /tmp/xml-{connection}")
        if running:
            command.append(f"virsh -c qemu:///{connection} start {name}")

        if connection == "system":
            state = "running" if running else "\"shut off\""
            command.append(
                f'[ "$(virsh -c qemu:///{connection} domstate {name})" = {state} ] || \
                {{ virsh -c qemu:///{connection} dominfo {name} >&2; cat /var/log/libvirt/qemu/{name}.log >&2; exit 1; }}')
        self.run_admin("; ".join(command), connection)

        # TODO check if kernel is booted
        # Ideally we would like to check guest agent event for that
        # Libvirt has a signal for that too: VIR_DOMAIN_EVENT_ID_AGENT_LIFECYCLE
        # https://libvirt.org/git/?p=libvirt-python.git;a=blob;f=examples/guest-vcpus/guest-vcpu-daemon.py;h=30fcb9ce24165c59dec8d9bbe6039f56382e81e3;hb=HEAD

        self.allow_journal_messages('.*denied.*comm="pmsignal".*')

        return args

    # Preparations for iscsi storage pool; return the system's initiator name
    def prepareStorageDeviceOnISCSI(self, target_iqn):
        m = self.machine

        # ensure that we generate a /etc/iscsi/initiatorname.iscsi
        m.execute("systemctl start iscsid")

        orig_iqn = m.execute("sed -n '/^InitiatorName=/ { s/^.*=//; p }' /etc/iscsi/initiatorname.iscsi").strip()

        # Increase the iSCSI timeouts for heavy load during our testing
        self.sed_file(r"s|^\(node\..*log.*_timeout = \).*|\1 60|", "/etc/iscsi/iscsid.conf")

        # make sure this gets cleaned up, to avoid reboot hangs (https://bugzilla.redhat.com/show_bug.cgi?id=1817241)
        self.restore_dir("/var/lib/iscsi")

        # Setup a iSCSI target
        m.execute("""
                  targetcli /backstores/ramdisk create test 50M
                  targetcli /iscsi create %(tgt)s
                  targetcli /iscsi/%(tgt)s/tpg1/luns create /backstores/ramdisk/test
                  targetcli /iscsi/%(tgt)s/tpg1/acls create %(ini)s
                  """ % {"tgt": target_iqn, "ini": orig_iqn})

        self.addCleanup(m.execute, "targetcli /backstores/ramdisk delete test")
        self.addCleanup(m.execute, "targetcli /iscsi delete %s; iscsiadm -m node -o delete || true" % target_iqn)
        return orig_iqn

    def run_admin(self, cmd, connectionName='system'):
        m = self.machine

        if connectionName == 'session':
            return m.execute(f"su - admin -c 'export XDG_RUNTIME_DIR=/run/user/$(id -u admin); {cmd}'")
        else:
            return m.execute(cmd)

    def deleteIface(self, iface, mac=None, vm_name=None):
        b = self.browser

        b.wait_visible(f"#vm-subVmTest1-iface-{iface}-action-kebab")
        b.click(f"#vm-subVmTest1-iface-{iface}-action-kebab button")
        b.wait_visible(f"#delete-vm-subVmTest1-iface-{iface}")
        b.click(f"#delete-vm-subVmTest1-iface-{iface}")
        b.wait_in_text(".pf-v5-c-modal-box .pf-v5-c-modal-box__header .pf-v5-c-modal-box__title", "Remove network interface?")
        if mac and vm_name:
            b.wait_in_text(".pf-v5-c-modal-box__body .pf-v5-c-description-list", f"{mac} will be removed from {vm_name}")
        b.click(".pf-v5-c-modal-box__footer button:contains(Remove)")
        b.wait_not_present(".pf-v5-c-modal-box")

    def get_next_mac(self, last_mac):
        parts = last_mac.split(':')
        suffix = parts[-1]
        new_suffix = format((int(suffix, 16) + 1) & 0xFF, "x").zfill(2)
        parts[-1] = new_suffix
        new_mac = ':'.join(parts)
        return new_mac

    def setup_mock_server(self, mock_server_filename, subj_names):
        self.machine.upload(["files/min-openssl-config.cnf", f"files/{mock_server_filename}"], self.vm_tmpdir)

        self.restore_file("/etc/hosts")
        for i, sub_name in enumerate(subj_names):
            self.machine.write("/etc/hosts", f"127.0.0.1 {sub_name}\n", append=True)
            self.machine.write(f"{self.vm_tmpdir}/min-openssl-config.cnf", f"DNS.{i + 2} = {sub_name}\n", append=True)

        cmds = [
            # Generate certificate for https server
            f"cd {self.vm_tmpdir}",
            f"openssl req -x509 -newkey rsa:4096 -nodes -keyout server.key -new -out server.crt -config {self.vm_tmpdir}/min-openssl-config.cnf -sha256 -days 365 -extensions dn"
        ]

        if self.machine.image.startswith("ubuntu") or self.machine.image.startswith("debian"):
            cmds += [
                f"cp {self.vm_tmpdir}/server.crt /usr/local/share/ca-certificates/cert.crt",
                "update-ca-certificates"
            ]
        elif self.machine.image.startswith("arch"):
            cmds += [
                f"cp {self.vm_tmpdir}/server.crt /etc/ca-certificates/trust-source/anchors/server.crt",
                "update-ca-trust"
            ]
        else:
            cmds += [
                f"cp {self.vm_tmpdir}/server.crt /etc/pki/ca-trust/source/anchors/server.crt",
                "update-ca-trust"
            ]
        self.machine.execute("; ".join(cmds))

        # Run https server with range option support. QEMU uses range option
        # see: https://lists.gnu.org/archive/html/qemu-devel/2013-06/msg02661.html
        # or
        # https://github.com/qemu/qemu/blob/master/block/curl.c
        #
        # and on certain distribution supports only https (not http)
        # see: block-drv-ro-whitelist option in qemu-kvm.spec for certain distribution
        return self.machine.spawn(f"cd /var/lib/libvirt; exec python3 {self.vm_tmpdir}/{mock_server_filename} {self.vm_tmpdir}/server.crt {self.vm_tmpdir}/server.key", "httpsserver")

    def waitLogFile(self, logfile, expected_text):
        try:
            wait(lambda: expected_text in self.machine.execute(f"cat {logfile}"), delay=3)
        except Error:
            log = self.machine.execute(f"cat {logfile}")
            print(f"----- log of failed VM ------\n{log}\n---------")
            raise

    def waitCirrOSBooted(self, logfile):
        self.waitLogFile(logfile, "login as 'cirros' user.")


class VirtualMachinesCase(MachineCase, VirtualMachinesCaseHelpers, StorageHelpers, NetworkHelpers):
    def setUp(self):
        super().setUp()

        m = self.machine

        # We don't want nested KVM since it doesn't work well enough
        # three levels deep.
        #
        # The first level is the VM allocated to us that runs our
        # "tasks" container in certain environments, the second level
        # is the VM started by testlib.py to run a given test, and the
        # third level are the VMS started by the test itself.  In most
        # environments, the "tasks" container runs on bare metal, and
        # the VMs started here are on level 2.
        #
        # Using KVM on level 3 is significantly slower than software
        # emulation, by something like a factor of 2 at least, and
        # much worse on a machine with many VMs to the point that the
        # kernel will trigger its NMI watchdog and the boot never
        # finishes. So we switch it off by removing "/dev/kvm".
        #
        # Our environments where the VMs started by the tests are on
        # level 2 don't have support for nested KVM. So "/dev/kvm"
        # does not exist in the first place and we don't need to be
        # careful to leave it in place.
        #
        m.execute("rm -f /dev/kvm")

        # Keep pristine state of libvirt
        self.restore_dir("/var/lib/libvirt")
        self.restore_dir("/etc/libvirt")
        self.restore_dir("/home/admin/.local/share/libvirt/")

        self.startLibvirt(m)

        self.addCleanup(m.execute, f"systemctl stop {self.getLibvirtServiceName()}")
        if m.image not in distrosWithMonolithicDaemon:
            self.addCleanup(m.execute, "systemctl stop virtstoraged.service virtnetworkd.service")

        # Stop all domains
        for connection in ["system", "session"]:
            cmd = f"for d in $(virsh -c qemu:///{connection} list --name); do virsh -c qemu:///{connection} destroy $d || true; done"
            if connection == "session":
                cmd += f"; for d in $(virsh -c qemu:///{connection} list --all --name); do virsh -c qemu:///{connection} undefine $d; done"
                cmd = f"runuser -l admin -c '{cmd}'"
            self.addCleanup(m.execute, cmd)

        # Cleanup pools
        self.addCleanup(m.execute, "rm -rf /run/libvirt/storage/*")

        # Stop all pools
        for connection in ["system", "session"]:
            cmd = f"for n in $(virsh -c qemu:///{connection} pool-list --name); do virsh -c qemu:///{connection} pool-destroy $n || true; done"
            if connection == "session":
                cmd += f"; for d in $(virsh -c qemu:///{connection} pool-list --all --name); do virsh -c qemu:///{connection} pool-undefine $d; done"
                cmd = f"runuser -l admin -c '{cmd}'"
            self.addCleanup(m.execute, cmd)

        # Cleanup networks
        self.addCleanup(m.execute, "rm -rf /run/libvirt/network/test_network*")

        # Stop all networks
        for connection in ["system", "session"]:
            cmd = f"for n in $(virsh -c qemu:///{connection} net-list --name); do virsh -c qemu:///{connection} net-destroy $n || true; done"
            if connection == "session":
                cmd += f"; for d in $(virsh -c qemu:///{connection} net-list --all --name); do virsh -c qemu:///{connection} net-undefine $d; done"
                cmd = f"runuser -l admin -c '{cmd}'"
            self.addCleanup(m.execute, cmd)

        # we don't have configuration to open the firewall for local libvirt machines, so just stop firewalld
        if m.image not in distrosWithMonolithicDaemon:
            m.execute("systemctl stop firewalld; systemctl reset-failed virtnetworkd; systemctl try-restart virtnetworkd")
        else:
            m.execute("systemctl stop firewalld; systemctl reset-failed libvirtd; systemctl try-restart libvirtd")

        # user libvirtd instance tends to SIGABRT with "Failed to find user record for uid .." on shutdown during cleanup
        # so make sure that there are no leftover user processes that bleed into the next test
        self.addCleanup(self.machine.execute, '''pkill -u admin || true; while [ -n "$(pgrep -au admin | grep -v 'systemd --user')" ]; do sleep 0.5; done''')

        # FIXME: report downstream; AppArmor noisily denies some operations, but they are not required for us
        self.allow_journal_messages(r'.* type=1400 .* apparmor="DENIED" operation="capable" profile="\S*libvirtd.* capname="sys_rawio".*')
        # AppArmor doesn't like the non-standard path for our storage pools
        self.allow_journal_messages('.* type=1400 .* apparmor="DENIED" operation="open".* profile="virt-aa-helper" name="%s.*' % self.vm_tmpdir)
        if m.image in ["ubuntu-stable"]:
            self.allow_journal_messages('.* type=1400 .* apparmor="DENIED" operation="open" profile="libvirt.* name="/" .* denied_mask="r" .*')
            self.allow_journal_messages('.* type=1400 .* apparmor="DENIED" operation="open" profile="libvirt.* name="/sys/bus/nd/devices/" .* denied_mask="r" .*')

        # FIXME: testDomainMemorySettings on Fedora-32 reports this. Figure out where it comes from.
        # Ignoring just to unbreak tests for now
        self.allow_journal_messages("Failed to get COMM: No such process")

        # FIXME: Testing on Arch Linux fails randomly with networkmanager time outs while the test passes.
        if m.image == 'arch':
            self.allow_journal_messages(r".* couldn't get all properties of org.freedesktop.NetworkManager.Device at /org/freedesktop/NetworkManager/Devices/\d+: Timeout was reached")

        m.execute("virsh net-define /etc/libvirt/qemu/networks/default.xml || true")

        # avoid error noise about resources getting cleaned up
        self.addCleanup(lambda: not self.browser.cdp.valid or self.browser.logout())

        # HACK: older c-ws versions always log an assertion, fixed in PR cockpit#16765
        self.allow_journal_messages("json_object_get_string_member: assertion 'node != NULL' failed")

    def tearDown(self):
        b = self.browser
        if b.cdp.valid and b.is_present("#button.alert-link.more-button"):
            b.click("button.alert-link.more-button")
        super().tearDown()
