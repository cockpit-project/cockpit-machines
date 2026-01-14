#!/usr/bin/python3

import json
import os
import sys
import time

def get_vm_start_time(pid_file):
    """
    Calculate VM start time from QEMU process information.
    
    Reads the PID from the pidfile, extracts the process start time from
    /proc/<pid>/stat, and calculates the absolute start time.
    
    Returns ISO format timestamp or None if unable to determine.
    """
    try:
        # Read PID from pidfile
        with open(pid_file, 'r') as f:
            pid_str = f.read().strip()
        
        pid = int(pid_str)
        
        # Validate PID: must be a positive integer within reasonable bounds
        # Linux PIDs are typically limited to PID_MAX_LIMIT (4194304 by default)
        MAX_PID = 4194304
        if pid <= 0 or pid > MAX_PID:
            return None
        
        # Read process start time from /proc/<pid>/stat
        # Field 22 contains starttime in clock ticks since system boot
        stat_file = f'/proc/{pid}/stat'
        with open(stat_file, 'r') as f:
            stat_data = f.read()
        
        # Parse the stat file - split by spaces but handle process name in parentheses
        # The process name (field 2) can contain spaces, so we need to be careful
        # Fields after the closing parenthesis are numbered from 3 onwards
        # Field 22 is at index 19 in fields_after_name (since field 3 is at index 0: 22-3=19)
        paren_close = stat_data.rfind(')')
        if paren_close == -1:
            return None
        
        fields_after_name = stat_data[paren_close + 1:].split()
        if len(fields_after_name) < 20:
            return None
        
        start_time_ticks = int(fields_after_name[19])
        
        # Get system uptime (seconds since boot)
        with open('/proc/uptime', 'r') as f:
            uptime_str = f.read().split()[0]
        system_uptime_seconds = float(uptime_str)
        
        # Get clock ticks per second
        try:
            ticks_per_sec = os.sysconf(os.sysconf_names['SC_CLK_TCK'])
        except (KeyError, AttributeError, OSError):
            ticks_per_sec = 100  # Default fallback
        
        # Calculate process start time
        # System boot time = current time - system uptime
        # Process start time (seconds since boot) = start ticks / ticks per second
        # Process start time (absolute) = system boot time + process start seconds since boot
        process_start_seconds_since_boot = start_time_ticks / ticks_per_sec
        current_time = time.time()
        system_boot_time = current_time - system_uptime_seconds
        process_start_time = system_boot_time + process_start_seconds_since_boot
        
        # Return ISO format timestamp
        return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(process_start_time))
    
    except (IOError, OSError, ValueError, IndexError):
        # Unable to determine start time
        return None

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Usage: get_vm_start_time.py <pid_file>'}))
        sys.exit(1)
    
    pid_file = sys.argv[1]
    start_time = get_vm_start_time(pid_file)
    
    if start_time:
        print(json.dumps({'startTime': start_time}))
    else:
        print(json.dumps({'startTime': None}))
