#! /bin/sh

set -e

# See https://wiki.libvirt.org/Networking.html#host-configuration-nat

f=/usr/share/libvirt/networks/default.xml
if test -f "$f"; then
    virsh -c qemu:///system net-define "$f"
else
    cat <<EOF | virsh -c qemu:///system net-define /dev/stdin
<network>
  <name>default</name>
  <bridge name='virbr0'/>
  <forward/>
  <ip address='192.168.122.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.122.2' end='192.168.122.254'/>
    </dhcp>
  </ip>
</network>
EOF
fi

virsh -c qemu:///system net-autostart default
virsh -c qemu:///system net-start default
