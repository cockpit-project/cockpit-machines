#!/bin/sh

NAME="`systemctl --no-legend --state=active list-units libvirtd.socket libvirt-bin.socket virtqemud.socket | tail -1 | awk '{$1=$1};1' | cut -f1 -d' '`"

if [ -z "$NAME" ]; then
    NAME="`systemctl --no-legend list-unit-files libvirtd.socket libvirt-bin.socket virtqemud.socket | tail -1 | awk '{$1=$1};1' | cut -f1 -d' '`"
fi

if [ -n "$NAME" ]; then
    # get id name because libvirt-bin is primary in ubuntu 1604
    systemctl  --property=Id show "$NAME" | cut -c 4-
fi
