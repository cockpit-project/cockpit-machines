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

import os
import sys
import time
import traceback

import netlib
import storagelib
import testlib
from machine import testvm


def hasMonolithicDaemon(image):
    return (image.startswith("rhel-8-") or
            image.startswith("debian") or
            image.startswith("ubuntu") or
            image in ["arch"])


class VirtualMachinesCaseHelpers:
    machine: testvm.Machine

    def waitPageInit(self):
        m = self.machine
        virtualization_disabled_ignored = \
                self.browser.call_js_func("localStorage.getItem", "virtualization-disabled-ignored") == "true"
        virtualization_enabled = \
                "PASS" in m.execute("virt-host-validate qemu | grep 'Checking for hardware virtualization' || true")
        if not virtualization_enabled and not virtualization_disabled_ignored:
            self.browser.click("#ignore-hw-virtualization-disabled-btn")
        with self.browser.wait_timeout(30):
            self.browser.wait_in_text("body", "Virtual machines")

    # TODO: generic, move to testlib.py?
    def dropdownAction(self, kebab_selector, menu_selector):
        b = self.browser
        b.click(kebab_selector)
        b.wait_visible(f"{kebab_selector}[aria-expanded=true]")
        # HACK: PF bug: Dropdown open state is bouncing
        time.sleep(0.2)
        b.wait_visible(f"{kebab_selector}[aria-expanded=true]")
        b.click(menu_selector)
        b.wait_not_present(f"{kebab_selector}[aria-expanded=true]")

    def performAction(self, vmName, action, checkExpectedState=True, connectionName="system", logPath=None):
        b = self.browser
        m = self.machine

        if logPath:
            m.write(logPath, '')

        self.dropdownAction(f"#vm-{vmName}-{connectionName}-action-kebab", f"#vm-{vmName}-{connectionName}-{action}")
        if action in ["reboot", "forceReboot"] and logPath:
            # https://bugzilla.redhat.com/show_bug.cgi?id=2221144
            # The VM should not be rebooted when the confirmation dialog is shown
            time.sleep(5)
            self.assertNotIn("Linux version", m.execute(f"cat {logPath}"))

        # Some actions, which can cause expensive downtime when clicked accidentally, have confirmation dialog
        if action in ["off", "forceOff", "reboot", "forceReboot", "sendNMI"]:
            b.wait_visible(f"#vm-{vmName}-{connectionName}-confirm-action-modal")
            b.click(f".pf-v5-c-modal-box__footer #vm-{vmName}-{connectionName}-{action}")
            b.wait_not_present(f"#vm-{vmName}-{connectionName}-confirm-action-modal")

        if not checkExpectedState:
            return

        if action == "pause":
            b.wait_in_text(f"#vm-{vmName}-{connectionName}-state", "Paused")
        if action in ["resume", "run", "reboot", "forceReboot"]:
            b.wait_in_text(f"#vm-{vmName}-{connectionName}-state", "Running")
            if logPath:
                testlib.wait(lambda: "Linux version" in m.execute(f"cat {logPath}"))
        if action == "forceOff" or action == "off":
            b.wait_in_text(f"#vm-{vmName}-{connectionName}-state", "Shut off")

    def goToVmPage(self, vmName, connectionName='system'):
        self.browser.click(f"tbody tr[data-row-id=\"vm-{vmName}-{connectionName}\"] a.vm-list-item-name")  # click on the row

    def goToMainPage(self):
        self.browser.click(".machines-listing-breadcrumb li:first-of-type a")

    def waitVmPage(self, vmName):
        self.browser.wait_in_text("#vm-details .vm-name", vmName)

    def waitVmRow(self, vmName, connectionName='system', present=True):
        b = self.browser
        vm_row = f"tbody tr[data-row-id=\"vm-{vmName}-{connectionName}\"]"
        if present:
            b.wait_visible(vm_row)
        else:
            b.wait_not_present(vm_row)

    def togglePoolRow(self, poolName, connectionName="system"):
        b = self.browser
        isExpanded = 'pf-m-expanded' in b.attr(f"tbody tr[data-row-id=\"pool-{poolName}-{connectionName}\"] + tr", "class")
        b.click(f"tbody tr[data-row-id=\"pool-{poolName}-{connectionName}\"] .pf-v5-c-table__toggle button")
        if isExpanded:
            b.wait_not_present(f"tbody tr[data-row-id=\"pool-{poolName}-{connectionName}\"] + tr.pf-m-expanded")
        else:
            b.wait_visible(f"tbody tr[data-row-id=\"pool-{poolName}-{connectionName}\"] + tr.pf-m-expanded")

    def waitPoolRow(self, poolName, connectionName="system", present=True):
        b = self.browser
        pool_row = f"tbody tr[data-row-id=\"pool-{poolName}-{connectionName}\"]"
        if present:
            b.wait_visible(pool_row)
        else:
            b.wait_not_present(pool_row)

    def toggleNetworkRow(self, networkName, connectionName="system"):
        b = self.browser
        isExpanded = 'pf-m-expanded' in b.attr(f"tbody tr[data-row-id=\"network-{networkName}-{connectionName}\"] + tr",
                                                          "class")
        b.click(f"tbody tr[data-row-id=\"network-{networkName}-{connectionName}\"] .pf-v5-c-table__toggle button")
        if isExpanded:
            b.wait_not_present(f"tbody tr[data-row-id=\"network-{networkName}-{connectionName}\"] + tr.pf-m-expanded")
        else:
            b.wait_visible(f"tbody tr[data-row-id=\"network-{networkName}-{connectionName}\"] + tr.pf-m-expanded")

    def waitNetworkRow(self, networkName, connectionName="system", present=True):
        b = self.browser
        network_row = f"tbody tr[data-row-id=\"network-{networkName}-{connectionName}\"]"
        if present:
            b.wait_visible(network_row)
        else:
            b.wait_not_present(network_row)

    def getDomainMacAddress(self, vmName):
        dom_xml = f"virsh -c qemu:///system dumpxml --domain {vmName}"
        return self.machine.execute(f"{dom_xml} | xmllint --xpath 'string(//domain/devices/interface/mac/@address)' -").strip()

    def getDomainXpathValue(self, vmName: str, xpath: str, *, str_value: bool = False, inactive: bool = False):
        dom_xml = f"virsh dumpxml {vmName} "
        if inactive:
            dom_xml += "--inactive "
        if str_value:
            xpath = f"string({xpath})"
        return self.machine.execute(f"{dom_xml} | xmllint --xpath '{xpath}' -").strip()

    def getLibvirtServiceName(self):
        m = self.machine
        return "libvirtd" if hasMonolithicDaemon(m.image) else "virtqemud"

    def startLibvirt(self, m):

        # Ensure everything has started correctly
        m.execute(f"systemctl start {self.getLibvirtServiceName()}.service")

        # Wait until we can get a list of domains
        m.execute("until virsh list; do sleep 1; done")

        # Create/activate network 'default' if necessary
        m.execute("""if ! out=$(virsh net-info default); then
                         virsh net-define /etc/libvirt/qemu/networks/default.xml
                     fi
                     if ! echo "$out" | grep -q 'Active.*yes'; then virsh net-start default; fi""")
        m.execute(r"until virsh net-info default | grep 'Active:\s*yes'; do sleep 1; done")

    def createVm(self, name, graphics='none', ptyconsole=False, running=True, memory=128,
                 connection='system', machine=None, os=None):
        m = machine or self.machine

        if os is None:
            # q35 in rhel-8 can't do a lot of hotplugging, so we stick
            # with i440fx by default there.
            os = "linux2022" if "rhel-8" not in m.image else "linux2016"

        image_file = m.pull("alpine")

        if connection == "system":
            img = f"/var/lib/libvirt/images/{name}-2.img"
            logPath = f"/var/log/libvirt/console-{name}.log"
            qemuLogPath = f"/var/log/libvirt/qemu/{name}.log"
        else:
            m.execute("runuser -l admin -c 'mkdir -p /home/admin/.local/share/libvirt/images'")
            img = f"/home/admin/.local/share/libvirt/images/{name}-2.img"
            logPath = f"/home/admin/.local/share/libvirt/console-{name}.log"
            qemuLogPath = f"/home/admin/.local/share/libvirt/qemu/{name}.log"

        m.upload([image_file], img)
        m.execute(f"chmod 777 {img}")

        args = {
            "name": name,
            "image": img,
            "logfile": logPath,
            "qemulog": qemuLogPath,
            "memory": memory,
        }
        if ptyconsole:
            console = "pty,target.type=serial "
        else:
            console = f"file,target.type=serial,source.path={args['logfile']} "

        command = [f"virt-install --connect qemu:///{connection} --name {name} "
                   f"--os-variant {os} "
                   "--boot hd,network "
                   "--vcpus 1 "
                   f"--memory {memory} "
                   f"--import --disk {img} "
                   f"--graphics {'none' if graphics == 'none' else graphics + ',listen=127.0.0.1'} "
                   f"--console {console}"
                   f"--print-step 1 > /tmp/xml-{connection}"]

        command.append(f"virsh -c qemu:///{connection} define /tmp/xml-{connection}")
        if running:
            command.append(f"virsh -c qemu:///{connection} start {name}")

        if connection == "system":
            state = "running" if running else "\"shut off\""
            command.append(
                f'[ "$(virsh -c qemu:///{connection} domstate {name})" = {state} ] || \
                {{ virsh -c qemu:///{connection} dominfo {name} >&2; cat /var/log/libvirt/qemu/{name}.log >&2; exit 1; }}')
        self.run_admin("; ".join(command), connection, machine=machine)

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
        self.addCleanup(m.execute, f"targetcli /iscsi delete {target_iqn}; iscsiadm -m node -o delete")
        return orig_iqn

    def run_admin(self, cmd, connectionName='system', machine=None):
        m = machine or self.machine

        if connectionName == 'session':
            return m.execute(f"su - admin -c 'export XDG_RUNTIME_DIR=/run/user/$(id -u admin); {cmd}'")
        else:
            return m.execute(cmd)

    def deleteDisk(self, target, vm_name="subVmTest1", expect_path=None):
        b = self.browser

        b.wait_visible(f"#vm-{vm_name}-disks-{target}-device")
        self.dropdownAction(f"#vm-{vm_name}-disks-{target}-action-kebab", f"#delete-vm-{vm_name}-disks-{target}")
        b.wait_visible(".pf-v5-c-modal-box")
        b.wait_in_text("#delete-resource-modal-target", target)
        if expect_path:
            b.wait_in_text("#delete-resource-modal-file", expect_path)
        b.click("#delete-resource-modal-primary")
        b.wait_not_present(".pf-v5-c-modal-box")
        b.wait_not_present(f"#vm-{vm_name}-disks-{target}-device")

    def deleteIface(self, iface, mac=None, vm_name=None):
        b = self.browser

        self.dropdownAction(f"#vm-subVmTest1-iface-{iface}-action-kebab", f"#delete-vm-subVmTest1-iface-{iface}")
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
            f"openssl req -x509 -newkey rsa:4096 -nodes -keyout server.key -new -out server.crt -config {self.vm_tmpdir}/min-openssl-config.cnf -sha256 -days 365 -extensions dn"  # noqa: E501
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
        elif "suse" in self.machine.image:
            cmds += [
                f"cp {self.vm_tmpdir}/server.crt /etc/pki/trust/anchors/server.crt",
                "update-ca-certificates"
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
        return self.machine.spawn(f"cd /var/lib/libvirt; exec python3 {self.vm_tmpdir}/{mock_server_filename} {self.vm_tmpdir}/server.crt {self.vm_tmpdir}/server.key",  # noqa: E501
                                  "httpsserver")

    def waitLogFile(self, logfile, expected_text):
        try:
            testlib.wait(lambda: expected_text in self.machine.execute(f"cat {logfile}"), delay=3)
        except testlib.Error:
            log = self.machine.execute(f"cat {logfile}")
            print(f"----- log of failed VM ------\n{log}\n---------")
            raise

    def waitGuestBooted(self, logfile):
        self.waitLogFile(logfile, "Welcome to Alpine Linux")

    def waitDisks(self, expected_disks: list[str], vm="subVmTest1"):
        """Wait until Disks table initialized on the details

        This prevents the kebabs from jumping around during re-renders, which
        makes trying to click on them racy.
        """
        for disk in expected_disks:
            self.browser.wait_visible(f"#vm-{vm}-disks-{disk}-device")  # type: ignore[attr-defined]
        # HACK: we need to wait on *something* else, but no idea what..
        time.sleep(0.5)


class VirtualMachinesCase(testlib.MachineCase, VirtualMachinesCaseHelpers, storagelib.StorageHelpers, netlib.NetworkHelpers):
    def setUp(self):
        super().setUp()

        for m in self.machines:
            m = self.machines[m]

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

        m = self.machine

        # Keep pristine state of libvirt
        self.restore_dir("/var/lib/libvirt")
        self.restore_dir("/etc/libvirt")
        self.restore_dir("/home/admin/.local/share/libvirt/")

        self.startLibvirt(m)

        self.addCleanup(m.execute, f"systemctl stop {self.getLibvirtServiceName()}")
        if not hasMonolithicDaemon(m.image):
            self.addCleanup(m.execute, "systemctl stop virtstoraged.service virtnetworkd.service")

        # HACK: https://issues.redhat.com/browse/RHEL-49567
        for mach in self.machines.values():
            mach.execute('if test "$(rpmquery selinux-policy)" = selinux-policy-40.13.6-1.el10.noarch; then setenforce 0; fi')

        def stop_all():
            # domains
            # this is a race condition: a test may leave a domain shutting down, so it may go away while iterating
            m.execute('for d in $(virsh -c qemu:///system list --name); do '
                      '  if ! out=$(virsh -c qemu:///system destroy $d 2>&1); then '
                      '    echo "$out" | grep -q "domain is not running"; '
                      "  fi; done")
            m.execute("runuser -l admin -c 'for d in $(virsh -c qemu:///session list --all --name); do "
                      "virsh -c qemu:///session undefine $d --snapshots-metadata; done'")

            # pools
            m.execute("rm -rf /run/libvirt/storage/*")
            m.execute("for n in $(virsh -c qemu:///system pool-list --name); do virsh -c qemu:///system pool-destroy $n; done")
            m.execute("runuser -l admin -c 'for d in $(virsh -c qemu:///session pool-list --name); do "
                      "virsh -c qemu:///session pool-destroy $d; done'")
            m.execute("runuser -l admin -c 'for d in $(virsh -c qemu:///session pool-list --name --all); do "
                      "virsh -c qemu:///session pool-undefine $d; done'")

            # networks
            m.execute("rm -rf /run/libvirt/network/test_network*")
            m.execute("for n in $(virsh -c qemu:///system net-list --name); do virsh -c qemu:///system net-destroy $n; done")
            m.execute("runuser -l admin -c 'for d in $(virsh -c qemu:///session net-list --name); do "
                      "virsh -c qemu:///session net-destroy $d; done'")
            m.execute("runuser -l admin -c 'for d in $(virsh -c qemu:///session net-list --name --all); do "
                      "virsh -c qemu:///session net-undefine $d; done'")

        self.addCleanup(stop_all)

        # we don't have configuration to open the firewall for local libvirt machines, so just stop firewalld
        if not hasMonolithicDaemon(m.image):
            m.execute("systemctl stop firewalld; systemctl reset-failed virtnetworkd; systemctl try-restart virtnetworkd")
        else:
            m.execute("systemctl stop firewalld; systemctl reset-failed libvirtd; systemctl try-restart libvirtd")

        # user libvirtd instance tends to SIGABRT with "Failed to find user record for uid .." on shutdown during cleanup
        # so make sure that there are no leftover user processes that bleed into the next test
        clean_cmd = '''pkill -u admin || true; while [ -n "$(pgrep -au admin | grep -v 'systemd --user')" ]; do sleep 0.5; done'''
        self.addCleanup(m.execute, clean_cmd)

        # FIXME: report downstream; AppArmor noisily denies some operations, but they are not required for us
        self.allow_journal_messages(
                r'.* type=1400 .* apparmor="DENIED" operation="capable" profile="\S*libvirtd.* capname="sys_rawio".*')
        # AppArmor doesn't like the non-standard path for our storage pools
        self.allow_journal_messages(
                f'.* type=1400 .* apparmor="DENIED" operation="open".* profile="virt-aa-helper" name="{self.vm_tmpdir}.*')

        # FIXME: Testing on Arch Linux fails randomly with networkmanager time outs while the test passes.
        if m.image == 'arch':
            self.allow_journal_messages(r".* couldn't get all properties of org.freedesktop.NetworkManager.Device at /org/freedesktop/NetworkManager/Devices/\d+: Timeout was reached")  # noqa: E501

        # avoid error noise about resources getting cleaned up
        self.addCleanup(lambda: not self.browser.valid or self.browser.logout())

        # noVNC warns about this for non-TLS connections; for RHEL downstream testing
        self.allow_browser_errors("noVNC requires a secure context")

        # HACK: fix these in our code
        self.allow_browser_errors(
            r"Scrollbar test exception: TypeError: Cannot read properties of null \(reading 'appendChild'\)",
            "Scrollbar test exception: TypeError: document.body is null",
            "Tried changing state of a disconnected RFB object",
            "Failed to get libvirt version from the dbus API:.*Cannot recv data: Connection reset by peer",
            # deprecated PF SelectGroup has invalid properties
            r"Warning: React does not recognize the .* prop.*(inputId|isSelected|sendRef|keyHandler)",
        )

    def downloadVmXml(self, vm):
        m = self.machine

        vms_xml = f"/var/lib/cockpittest/pkg_specific_artifacts/{vm}.xml"
        m.execute(f"virsh dumpxml {vm} > {vms_xml}")
        dest_file = f"{self.label()}-{m.label}-{vm}.xml"
        dest = os.path.abspath(dest_file)
        m.download(vms_xml, dest)
        testlib.attach(dest, move=False)
        print(f"Wrote {vm} XML to {dest_file}")

    def downloadVmLog(self, vm):
        m = self.machine

        vms_log = f"/var/log/libvirt/qemu/{vm}.log"
        # Log file may not exist, if VM was never started
        if m.execute(f"! test -f {vms_log} || echo exists").strip() == "exists":
            dest_file = f"{self.label()}-{m.label}-{vm}.log"
            dest = os.path.abspath(dest_file)
            m.download(vms_log, dest)
            testlib.attach(dest, move=True)
            print(f"Wrote {vm} log to {dest_file}")

    def downloadVmConsole(self, vm):
        m = self.machine

        console_log = f"/var/log/libvirt/console-{vm}.log"
        # Log file may not exist
        if m.execute(f"! test -f {console_log} || echo exists").strip() == "exists":
            dest_file = f"{self.label()}-{m.label}-{vm}-console.log"
            dest = os.path.abspath(dest_file)
            m.download(console_log, dest)
            testlib.attach(dest, move=True)
            print(f"Wrote {vm} console log to {dest_file}")

    def downloadVmsArtifacts(self):
        m = self.machine

        vms = m.execute("virsh list --all --name").strip().splitlines()
        if len(vms) > 0:
            m.execute("mkdir -p /var/lib/cockpittest/pkg_specific_artifacts")
        for vm in vms:
            self.downloadVmXml(vm)
            self.downloadVmLog(vm)
            self.downloadVmConsole(vm)

    def tearDown(self):
        b = self.browser
        if b.valid and b.is_present("#button.alert-link.more-button"):
            b.click("button.alert-link.more-button")

        if self.getError():
            try:
                self.downloadVmsArtifacts()
            except (OSError, RuntimeError):
                # failures in these debug artifacts should not skip cleanup actions
                sys.stderr.write("Failed to generate debug artifact:\n")
                traceback.print_exc(file=sys.stderr)

        super().tearDown()
