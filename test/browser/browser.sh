#!/bin/sh
set -eux

TESTS="$(realpath $(dirname "$0"))"
if [ -d source ]; then
    # path for standard-test-source
    SOURCE="$(pwd)/source"
else
    SOURCE="$(realpath $TESTS/../..)"
fi
LOGS="$(pwd)/logs"
mkdir -p "$LOGS"
chmod a+w "$LOGS"

# install browser; on RHEL/CentOS, use firefox
if grep -Eq 'ID=.*(rhel|centos)' /etc/os-release; then
    # Install firefox to pull in all the deps
    dnf install -y firefox
    curl --location 'https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US' | tar -C /usr/local/lib/ -xj
    ln -s /usr/local/lib/firefox/firefox /usr/local/bin/
    TEST_BROWSER=firefox
else
    dnf install -y chromium
    TEST_BROWSER=chromium
fi

#HACK: unbreak rhel-9-0's default choice of 999999999 rounds, see https://bugzilla.redhat.com/show_bug.cgi?id=1993919
sed -ie 's/#SHA_CRYPT_MAX_ROUNDS 5000/SHA_CRYPT_MAX_ROUNDS 5000/' /etc/login.defs

# Show critical packages versions
rpm -qi qemu-kvm libvirt-daemon selinux-policy

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

# Run tests as unprivileged user
su - -c "env TEST_BROWSER=$TEST_BROWSER SOURCE=$SOURCE LOGS=$LOGS $TESTS/run-test.sh" runtest

RC=$(cat $LOGS/exitcode)
exit ${RC:-1}
