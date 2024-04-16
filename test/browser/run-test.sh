#!/bin/sh
set -eux

PLAN="$1"

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

. /run/host/usr/lib/os-release
export TEST_OS="${ID}-${VERSION_ID/./-}"

if [ "$TEST_OS" = "centos-8" ] || [ "$TEST_OS" = "centos-9" ]; then
    TEST_OS="${TEST_OS}-stream"
fi

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

# We only have few VMs and tests should take at most one hour. So run those tests which exercise external API
# (and thus are useful for reverse dependency testing and gating), and exclude those which test internal
# functionality -- upstream CI covers that.
EXCLUDES="$EXCLUDES
          TestMachinesCreate.testConfigureBeforeInstall
          TestMachinesCreate.testConfigureBeforeInstallBios
          TestMachinesCreate.testConfigureBeforeInstallBiosTPM
          TestMachinesCreate.testCreateBasicValidation
          TestMachinesCreate.testCreateNameGeneration
          TestMachinesCreate.testCreateDownloadRhel
          TestMachinesCreate.testDisabledCreate

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

          TestMachinesNetworks.testNetworkSettings
          TestMachinesNetworks.testNICPlugingAndUnpluging

          TestMachinesNICs.NICAddDialog

          TestMachinesSettings.testMultipleSettings
          "

case "$PLAN" in
    basic)
        TESTS="TestMachinesCreate
               TestMachinesHostDevs
               TestMachinesLifecycle
               ";;

    network)
        # Settings is not really networking specific, but let's balance the tests
        TESTS="TestMachinesNICs
               TestMachinesNetworks
               TestMachinesSettings
               ";;

    storage)
        TESTS="TestMachinesDisks
               TestMachinesFilesystems
               TestMachinesSnapshots
               TestMachinesStoragePools
               ";;

    *)
        echo "Unknown plan $PLAN" >&2
        exit 1 ;;
esac

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

# make it easy to check in logs
echo "TEST_ALLOW_JOURNAL_MESSAGES: ${TEST_ALLOW_JOURNAL_MESSAGES:-}"
echo "TEST_AUDIT_NO_SELINUX: ${TEST_AUDIT_NO_SELINUX:-}"

# Chromium sometimes gets OOM killed on testing farm
export TEST_BROWSER=firefox

# execute run-tests
RC=0
test/common/run-tests \
    --nondestructive \
    $exclude_options \
    --machine localhost:22 \
    --browser localhost:9090 \
    $TESTS \
|| RC=$?

echo $RC > "$LOGS/exitcode"
cp --verbose Test* "$LOGS" || true
exit $RC
