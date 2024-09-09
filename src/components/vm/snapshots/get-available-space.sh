#! /bin/bash

set -eu

path=$1
while ! test -e "$path"; do path=$(dirname "$path"); done
stat -f -c '{ "unit": %S, "free": %a }' "$path"
