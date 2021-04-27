#!/bin/sh
set -eux

# tests need cockpit's bots/ libraries and test infrastructure
cd $SOURCE
git init
rm -f bots  # common local case: existing bots symlink
make bots test/common test/reference

# support running from clean git tree
if [ ! -d node_modules/chrome-remote-interface ]; then
    npm install chrome-remote-interface sizzle
fi

# disable detection of affected tests; testing takes too long as there is no parallelization,
# and TF machines are slow and brittle
mv .git dot-git

. /etc/os-release
export TEST_OS="${ID}-${VERSION_ID/./-}"
export TEST_AUDIT_NO_SELINUX=1

EXCLUDES=""

# Fedora gating tests are running on infra without /dev/kvm; Machines tests are too darn slow there
# too many tests also fail on RHEL 9 (also on testing farm); so just pick a representative sample on these
# Only RHEL 8 gating env can run all tests
if ! [ "$ID" = "rhel" -a "${VERSION_ID#8}" != "$VERSION_ID" ]; then
    # Testing Farm machines are really slow in European evenings
    export TEST_TIMEOUT_FACTOR=3
    TESTS="TestMachinesConsoles.testInlineConsole
           TestMachinesCreate.testCreateImportDisk
           TestMachinesCreate.testCreatePXE
           TestMachinesDisks.testAddDiskDirPool
           TestMachinesDisks.testAddDiskNFS
           TestMachinesDisks.testAddDiskSCSI
           TestMachinesLifecycle.testBasic
           TestMachinesNICs.testNICAdd
           TestMachinesNetworks.testNetworks
           TestMachinesSettings.testBootOrder
           TestMachinesSettings.testVCPU
           TestMachinesSnapshots.testSnapshots
           "
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
    --machine localhost:22 --browser localhost:9090 ${TESTS:-} || RC=$?

echo $RC > "$LOGS/exitcode"
cp --verbose Test* "$LOGS" || true
# deliver test result via exitcode file
exit 0
