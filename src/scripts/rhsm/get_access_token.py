import json
import sys
import urllib.error
import urllib.request

args = json.loads(sys.argv[1], strict=False)

data = {
    "grant_type": "refresh_token",
    "client_id": "rhsm-api",
    "refresh_token": args["offlineToken"]
}
try:
    req = urllib.request.Request("https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token",
                                 urllib.parse.urlencode(data).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as s:
        response_body = s.read().decode()
        ret_obj = json.loads(response_body)

        # Handle RHSM API failure
        if "error" in ret_obj:
            sys.exit(ret_obj["error"])

    print(ret_obj["access_token"])
except Exception as error:
    sys.exit(error)
