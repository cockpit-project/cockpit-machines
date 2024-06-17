import json
import os
import sys
import urllib.error
import urllib.request

args = json.loads(sys.argv[1], strict=False)

download_path = os.path.join(args['downloadDir'], args['fileName'])
if not os.path.exists(download_path):
    # Create download directory, don't complain when it already exists
    os.makedirs(args['downloadDir'], exist_ok=True)

    try:
        req = urllib.request.Request(args['url'])
        req.add_header("Authorization", f"Bearer {args['accessToken']}")
        with urllib.request.urlopen(req) as s, open(download_path, "wb") as f:
            size = int(s.headers["content-length"])
            done = 0
            percentage = -1
            block = s.read(2 ** 20)
            while block:
                done += len(block)
                new_percentage = round(done * 100 / size)
                if (new_percentage > percentage):
                    percentage = new_percentage
                    # print adds newling by default, which serves nicely as a delimiter
                    print(f"{percentage}", flush=True)
                f.write(block)
                block = s.read(2 ** 20)

    except urllib.error.URLError as error:
        sys.exit(str(error))
