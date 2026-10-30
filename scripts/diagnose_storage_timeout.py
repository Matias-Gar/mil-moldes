"""Run on Dell via SSH stdin. Prints only HTTP status/timing; no tokens or bodies."""
import concurrent.futures
import json
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

env = {}
for line in Path('/srv/datos/mil-moldes/backend/.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('\"').strip("'")

def probe(item):
    label, base, path = item
    started = time.monotonic()
    headers = {'apikey': env['ANON_KEY'], 'Authorization': 'Bearer ' + env['ANON_KEY']}
    request = urllib.request.Request(base + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except Exception as error:
        status = type(error).__name__
    return {'target': label, 'path': path, 'status': status, 'seconds': round(time.monotonic()-started, 2)}

tasks = [(label, base, path)
         for label, base in [('local_gateway','http://127.0.0.1:8000'), ('public','https://milmoldes.duckdns.org')]
         for path in ['/storage/v1/status', '/storage/v1/object/public/product_images/__diagnostic_missing__.png', '/auth/v1/health', '/rest/v1/']]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for result in pool.map(probe, tasks):
        print(json.dumps(result), flush=True)

# Only routing/time-limit fields: never emit authentication headers or env values.
for filename in ['cds.yaml', 'lds.template.yaml', 'envoy.yaml']:
    path = Path('/srv/datos/mil-moldes/backend/volumes/api/envoy') / filename
    if path.is_file():
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if re.match(r'^\s*(?:-\s*)?(?:prefix|cluster|timeout|connect_timeout|request_timeout|stream_idle_timeout|max_request_bytes|port_value|address):', line):
                print(json.dumps({'config': filename, 'line': number, 'routing': line.strip()}), flush=True)
