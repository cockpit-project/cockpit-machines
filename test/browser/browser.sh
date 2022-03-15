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

#HACK: unbreak rhel-9-0's default choice of 999999999 rounds, see https://bugzilla.redhat.com/show_bug.cgi?id=1993919
sed -ie 's/#SHA_CRYPT_MAX_ROUNDS 5000/SHA_CRYPT_MAX_ROUNDS 5000/' /etc/login.defs

# HACK: https://bugzilla.redhat.com/show_bug.cgi?id=2057769
if [ "$(rpm -q edk2-ovmf)" = "edk2-ovmf-20220126gitbb1bba3d77-3.el9.noarch" ]; then
    rm /usr/share/qemu/firmware/50-edk2-ovmf-amdsev.json
fi

# Show critical packages versions
rpm -qa | grep -E 'libvirt|qemu'

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
    systemctl start virtnwfilterd.socket
    systemctl start virtproxyd.socket
    systemctl start virtsecretd.socket
    systemctl start virtstoraged.socket
    systemctl start virtqemud.socket
fi

# Fedora 36/37 and RHEL 9 split out qemu-virtiofsd; once this is in all supported OSes, move to main.fmf
if [ "${PLATFORM_ID:-}" != "platform:f35" ] && [ "${PLATFORM_ID:-}" != "platform:el8" ]; then
    dnf install -y qemu-virtiofsd
fi

qemu-img info https://archive.fedoraproject.org/pub/archive/fedora/linux/releases/28/Server/x86_64/os/images/boot.iso || true

timeout 60 virt-install -d -d --connect qemu:///system --name test1 --os-variant fedora28 --memory 128 --check path_in_use=off --wait -1 --noautoconsole --disk none --cdrom https://archive.fedoraproject.org/pub/archive/fedora/linux/releases/28/Server/x86_64/os/images/boot.iso
