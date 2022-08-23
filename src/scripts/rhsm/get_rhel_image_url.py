import urllib.request
import urllib.error
import sys
import json

args = json.loads(sys.argv[1], strict=False)

try:
    req = urllib.request.Request(f"https://api.access.redhat.com/management/v1/images/rhel/{args['rhelVersion']}/{args['arch']}")
    req.add_header("Authorization", f"Bearer {args['accessToken']}")
    with urllib.request.urlopen(req) as s:
        ret_obj = json.loads(s.read())
except urllib.error.URLError as error:
    sys.exit(error)

if "error" in ret_obj:
    sys.exit(ret_obj["error"])

# If certain version of RHEL is not available for download through RHSM API (e.g. it's not released yet),
# RHSM just returns an empty object: { body: [] }.
# Show appropriate error message in such situation
if len(ret_obj["body"]) == 0:
    sys.exit(f"No image available for RHEL {args['rhelVersion']} ({args['arch']}).")

for downloadable_content in ret_obj["body"]:
    if downloadable_content["filename"].endswith("boot.iso"):
        download_url = downloadable_content["downloadHref"]
        filename = downloadable_content["filename"]

out = {"url": download_url, "filename": filename}
print(json.dumps(out))
