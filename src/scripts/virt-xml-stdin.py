# SPDX-License-Identifier: LGPL-2.1-or-later

import json
import sys

sys.path.insert(0, "/usr/share/virt-manager")
from virtinst import virtxml

# HACK - Run virt-xml but get command line from stdin, for security.
#
# See https://github.com/virt-manager/virt-manager/issues/1163 for the
# request to support this more officially.  If and when this support
# appears, we should retire this hack, of course.

sys.argv = json.loads(sys.stdin.read())
virtxml.runcli()
