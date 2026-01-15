#!/usr/bin/env python3

import os
import sys


def get_vm_start_time(vm_name, connection_name):
    """
    Get the start time of a VM by reading its qemu process PID from libvirt
    and then calculating the start time from /proc.

    Returns the start time as seconds since the epoch, or None if unable to determine.
    """
    try:
        # Determine the PID file path based on connection type
        if connection_name == "system":
            pid_file = f"/run/libvirt/qemu/{vm_name}.pid"
        else:
            # For session connections, libvirt stores PID files in user runtime directory
            runtime_dir = os.environ.get('XDG_RUNTIME_DIR', f"/run/user/{os.getuid()}")
            pid_file = f"{runtime_dir}/libvirt/qemu/run/{vm_name}.pid"

        # We assume the ctime of the PID file is the start time of the
        # process.
        return os.stat(pid_file).st_ctime

    except OSError as e:
        print(f"Error getting VM start time: {e}", file=sys.stderr)
        return None


def main():
    if len(sys.argv) != 3:
        print("Usage: get_vm_start_time.py connectionName vmName", file=sys.stderr)
        sys.exit(1)

    connection_name = sys.argv[1]
    vm_name = sys.argv[2]

    start_time = get_vm_start_time(vm_name, connection_name)

    if start_time is not None:
        print(start_time)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
