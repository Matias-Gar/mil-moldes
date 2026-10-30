"""Run on Dell. Tests ONLY uniquely named temporary Storage objects via API.
Does not access catalog tables, real images, users, or invent inventory.
Keys stay on server; output is restricted to operation/status/timing.
"""
import argparse
import base64
import json
import ipaddress
import os
import struct
import time
import urllib.error
import urllib.request
import uuid
import zlib
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true', help='Create, replace and remove a temporary 1-pixel PNG')
parser.add_argument('--direct', help='Private IP of the verified Mil Moldes Storage container, bypasses public proxies')
parser.add_argument('--large', action='store_true', help='Use a valid random RGBA PNG of about 4 MiB instead of one pixel')
parser.add_argument('--multipart', action='store_true', help='Use the browser SDK multipart format for POST/PUT')
args = parser.parse_args()
if not args.apply:
    print('Use --apply to test Storage API with a disposable image.')
    raise SystemExit(0)

env = {}
for line in Path('/srv/datos/mil-moldes/backend/.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('\"').strip("'")
key = env['SERVICE_ROLE_KEY']
base = 'https://milmoldes.duckdns.org/storage/v1'
if args.direct:
    address = ipaddress.ip_address(args.direct)
    if not address.is_private or address.is_loopback or address.is_link_local or address.is_multicast:
        raise SystemExit('Expected a private container IP')
    base = 'http://' + str(address) + ':5000'
name = '__api_probe__/' + str(uuid.uuid4()) + '.png'
image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
if args.large:
    def chunk(kind, body):
        return struct.pack('>I',len(body)) + kind + body + struct.pack('>I',zlib.crc32(kind+body) & 0xffffffff)
    rows = b''.join(b'\0' + os.urandom(1024*4) for _ in range(1024))
    image = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',1024,1024,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(rows,1)) + chunk(b'IEND',b'')
    del rows
print(json.dumps({'probe_bytes': len(image), 'multipart': args.multipart}), flush=True)

def call(operation, method, path, body=None, mime=None):
    headers = {'apikey': key, 'Authorization': 'Bearer ' + key}
    if args.multipart and method in ['POST','PUT'] and mime == 'image/png':
        boundary = 'probe' + uuid.uuid4().hex
        body = (('--'+boundary+'\r\nContent-Disposition: form-data; name="cacheControl"\r\n\r\n3600\r\n--'+boundary+
                '\r\nContent-Disposition: form-data; name=""; filename="probe.png"\r\nContent-Type: image/png\r\n\r\n').encode() + body +
                ('\r\n--'+boundary+'--\r\n').encode())
        mime = 'multipart/form-data; boundary=' + boundary
        headers['x-upsert'] = 'false'
    if mime:
        headers['Content-Type'] = mime
    started = time.monotonic()
    cpu_before = [int(value) for value in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    status = None
    upstream_ms = None
    try:
        request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=45) as response:
            status = response.status
            upstream_ms = response.headers.get('x-envoy-upstream-service-time')
            response.read(256)
    except urllib.error.HTTPError as error:
        status = error.code
        upstream_ms = error.headers.get('x-envoy-upstream-service-time')
    except Exception as error:
        status = type(error).__name__
    cpu_after = [int(value) for value in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
    delta = sum(cpu_after) - sum(cpu_before)
    iowait = round(100 * (cpu_after[4] - cpu_before[4]) / delta, 1) if delta else 0
    print(json.dumps({'target': 'direct_storage' if args.direct else 'public', 'operation': operation,
                      'status': status, 'seconds': round(time.monotonic()-started, 2), 'host_iowait_percent': iowait,
                      'upstream_ms': upstream_ms}), flush=True)
    return status

try:
    status = call('upload_service_role', 'POST', '/object/product_images/' + name, image, 'image/png')
    if status not in (200, 201):
        raise SystemExit('Upload failed; subsequent writes skipped. Cleanup will be attempted.')
    status = call('replace_service_role', 'PUT', '/object/product_images/' + name, image, 'image/png')
    if status not in (200, 201):
        raise SystemExit('Replacement failed; cleanup will be attempted.')
    call('read_public', 'GET', '/object/public/product_images/' + name)
finally:
    # Unique probe path only, even if the upload result was ambiguous.
    status = call('delete_service_role', 'DELETE', '/object/product_images',
                  json.dumps({'prefixes': [name]}).encode(), 'application/json')
    if status in (200, 201):
        call('verify_deleted', 'GET', '/object/public/product_images/' + name)
    else:
        print(json.dumps({'cleanup_pending_path': name}), flush=True)
