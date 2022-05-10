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

for downloadable_content in ret_obj["body"]:
    if downloadable_content["filename"].endswith("boot.iso"):
        download_url = downloadable_content["downloadHref"]
        filename = downloadable_content["filename"]

out = {"url": download_url, "filename": filename}
print(json.dumps(out))
