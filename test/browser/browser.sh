#!/bin/sh
set -eux

TESTS="$(realpath $(dirname "$0"))"
if [ -d source ]; then
    # path for standard-test-source
    SOURCE="$(pwd)/source"
else
    SOURCE="$(realpath $TESTS/../..)"
fi

# https://tmt.readthedocs.io/en/stable/overview.html#variables
LOGS="${TMT_TEST_DATA:-$(pwd)/logs}"
mkdir -p "$LOGS"
chmod a+w "$LOGS"

# we don't need the H.264 codec, and it is sometimes not available (rhbz#2005760)
DNF="dnf install --disablerepo=fedora-cisco-openh264 -y"

# install firefox (available everywhere in Fedora and RHEL)
# we don't need the H.264 codec, and it is sometimes not available (rhbz#2005760)
$DNF --setopt=install_weak_deps=False firefox

# RHEL/CentOS 8 and Fedora have this, but not RHEL 9; tests check this more precisely
$DNF libvirt-daemon-driver-storage-iscsi-direct || true

#HACK: unbreak rhel-9-0's default choice of 999999999 rounds, see https://bugzilla.redhat.com/show_bug.cgi?id=1993919
sed -ie 's/#SHA_CRYPT_MAX_ROUNDS 5000/SHA_CRYPT_MAX_ROUNDS 5000/' /etc/login.defs

# HACK: https://bugzilla.redhat.com/show_bug.cgi?id=2057769
if [ "$(rpm -q libvirt-daemon)" = "libvirt-daemon-8.0.0-5.el9.x86_64" ]; then
    rm /usr/share/qemu/firmware/50-edk2-ovmf-amdsev.json
fi

# Show critical packages versions
rpm -q selinux-policy cockpit-bridge cockpit-machines
rpm -qa | grep -E 'libvirt|qemu' | sort

# create user account for logging in
if ! id admin 2>/dev/null; then
    useradd -c Administrator -G wheel admin
    echo admin:foobar | chpasswd
fi

# set root's password
echo root:foobar | chpasswd

# avoid sudo lecture during tests
su -c 'echo foobar | sudo --stdin whoami' - admin

# create user account for running the test
if ! id runtest 2>/dev/null; then
    useradd -c 'Test runner' runtest
    # allow test to set up things on the machine
    mkdir -p /root/.ssh
    curl https://raw.githubusercontent.com/cockpit-project/bots/main/machine/identity.pub  >> /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi
chown -R runtest "$SOURCE"

# disable core dumps, we rather investigate them upstream where test VMs are accessible
echo core > /proc/sys/kernel/core_pattern

systemctl enable --now cockpit.socket

# make sure that we can access cockpit through the firewall
systemctl start firewalld
firewall-cmd --add-service=cockpit --permanent
firewall-cmd --add-service=cockpit

. /usr/lib/os-release

if [ "${PLATFORM_ID:-}" != "platform:f34" ] && [ "${PLATFORM_ID:-}" != "platform:el8" ]; then
    # HACK: new modular libvirt sockets are not running by default in f35
    # https://gitlab.com/libvirt/libvirt/-/issues/219
    systemctl start virtinterfaced.socket
    systemctl start virtnetworkd.socket
    systemctl start virtnodedevd.socket
    systemctl start virtproxyd.socket
    systemctl start virtstoraged.socket
fi

# Fedora 36/37 and RHEL 9 split out qemu-virtiofsd; once this is in all supported OSes, move to main.fmf
if [ "${PLATFORM_ID:-}" != "platform:f35" ] && [ "${PLATFORM_ID:-}" != "platform:el8" ]; then
    dnf install -y qemu-virtiofsd
fi

# Run tests as unprivileged user
su - -c "env TEST_BROWSER=firefox SOURCE=$SOURCE LOGS=$LOGS $TESTS/run-test.sh" runtest

RC=$(cat $LOGS/exitcode)
exit ${RC:-1}
