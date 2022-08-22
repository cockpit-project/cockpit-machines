#!/bin/sh
set -eux

# tests need cockpit's bots/ libraries and test infrastructure
cd $SOURCE
rm -f bots  # common local case: existing bots symlink
make bots

if [ -e .git ]; then
    tools/node-modules checkout
    # disable detection of affected tests; testing takes too long as there is no parallelization
    mv .git dot-git
else
    # upstream tarballs ship test dependencies; print version for debugging
    grep '"version"' node_modules/chrome-remote-interface/package.json
fi

. /usr/lib/os-release
export TEST_OS="${ID}-${VERSION_ID/./-}"

if [ "${TEST_OS#centos-}" != "$TEST_OS" ]; then
    TEST_OS="${TEST_OS}-stream"
fi

export TEST_AUDIT_NO_SELINUX=1

#
# exclude known-broken tests
#
EXCLUDES=""

# FIXME: Fails everywhere on the Testing Farm but not locally with tmt virtual
EXCLUDES="$EXCLUDES TestMachinesNetworks.testNetworkAddStaticDCHPHosts"

if [ "$ID" = "rhel" ]; then
    EXCLUDES="$EXCLUDES
              TestMachinesDisks.testDetachDisk
              TestMachinesDisks.testDiskEdit
              TestMachinesNetworks.testNetworkSettings
    "
fi

# We only have one VM and tests should take at most one hour. So run those tests which exercise external API
# (and thus are useful for reverse dependency testing and gating), and exclude those which test internal
# functionality -- upstream CI covers that.
EXCLUDES="$EXCLUDES
          TestMachinesCreate.testConfigureBeforeInstall
          TestMachinesCreate.testConfigureBeforeInstallBios
          TestMachinesCreate.testCreateBasicValidation
          TestMachinesCreate.testCreateNameGeneration
          TestMachinesCreate.testCreateDownloadRhel
          TestMachinesCreate.testDisabledCreate

          TestMachinesConsoles.testExternalConsole
          TestMachinesConsoles.testInlineConsole
          TestMachinesConsoles.testInlineConsoleWithUrlRoot
          TestMachinesConsoles.testSerialConsole
          TestMachinesConsoles.testSwitchConsoleFromSerialToGraphical

          TestMachinesDisks.testAddDiskAdditionalOptions
          TestMachinesDisks.testAddDiskCustomPath
          TestMachinesDisks.testDetachDisk
          TestMachinesDisks.testDiskEdit

          TestMachinesFilesystems.testBasicSessionConnection

          TestMachinesLifecycle.testBasicAdminUser
          TestMachinesLifecycle.testBasicLibvirtUserUnprivileged
          TestMachinesLifecycle.testBasicNonrootUserUnprivileged
          TestMachinesLifecycle.testCloneSystemConnection
          TestMachinesLifecycle.testDelete
          TestMachinesLifecycle.testLibvirt

          TestMachinesHostDevs.testHostDevAddMultipleDevices

          TestMachinesMigration.testFailMigrationUriIncorrect
          TestMachinesMigration.testFailMigrationDomainUnknown

          TestMachinesNetworks.testNetworkSettings
          TestMachinesNetworks.testNICPlugingAndUnpluging

          TestMachinesNICs.NICAddDialog

          TestMachinesSettings.testMultipleSettings
          "

if [ "$ID" = "fedora" ]; then
    # Testing Farm machines are really slow in European evenings
    export TEST_TIMEOUT_FACTOR=3
fi

# pre-download cirros image for Machines tests
bots/image-download cirros

exclude_options=""
for t in $EXCLUDES; do
    exclude_options="$exclude_options --exclude $t"
done

# execute run-tests
RC=0
test/common/run-tests --nondestructive $exclude_options \
    --machine localhost:22 --browser localhost:9090 || RC=$?

echo $RC > "$LOGS/exitcode"
cp --verbose Test* "$LOGS" || true
# deliver test result via exitcode file
exit 0
