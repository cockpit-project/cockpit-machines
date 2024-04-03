#!/bin/sh

set -eux

cd "${0%/*}/../.."

# we don't need the H.264 codec, and it is sometimes not available (rhbz#2005760)
DNF="dnf install --disablerepo=fedora-cisco-openh264 -y"

# RHEL/CentOS 8 and Fedora have this, but not RHEL 9; tests check this more precisely
$DNF libvirt-daemon-driver-storage-iscsi-direct || true

# Show critical packages versions
rpm -q selinux-policy cockpit-bridge cockpit-machines
rpm -qa | grep -E 'libvirt|qemu' | sort

# allow test to set up things on the machine
mkdir -p /root/.ssh
curl https://raw.githubusercontent.com/cockpit-project/bots/main/machine/identity.pub  >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# create user account for logging in
if ! id admin 2>/dev/null; then
    useradd -c Administrator -G wheel admin
    echo admin:foobar | chpasswd
fi

# set root's password
echo root:foobar | chpasswd

# avoid sudo lecture during tests
su -c 'echo foobar | sudo --stdin whoami' - admin

# disable core dumps, we rather investigate them upstream where test VMs are accessible
echo core > /proc/sys/kernel/core_pattern

sh -x test/vm.install

. /usr/lib/os-release

if [ "${PLATFORM_ID:-}" != "platform:el8" ]; then
    # https://gitlab.com/libvirt/libvirt/-/issues/219
    systemctl start virtinterfaced.socket
    systemctl start virtnetworkd.socket
    systemctl start virtnodedevd.socket
    systemctl start virtstoraged.socket
fi

# Fedora split out qemu-virtiofsd
if [ "$ID" = fedora ]; then
    dnf install -y virtiofsd
fi

# Run tests in the cockpit tasks container, as unprivileged user
# TODO: Run in "host" network ns, as some tests fail on unexpected veth/bridge claimed by the container
# fix these and then use the isolation in starter-kit and friends
CONTAINER="$(cat .cockpit-ci/container)"
exec podman \
    run \
        --rm \
        --shm-size=1024m \
        --security-opt=label=disable \
        --network=host \
        --env='TEST_*' \
        --volume="${TMT_TEST_DATA}":/logs:rw,U --env=LOGS=/logs \
        --volume="$(pwd)":/source:rw,U --env=SOURCE=/source \
        --volume=/usr/lib/os-release:/run/host/usr/lib/os-release:ro \
        "${CONTAINER}" \
            sh /source/test/browser/run-test.sh "$@"
