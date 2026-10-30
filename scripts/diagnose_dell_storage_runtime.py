"""Mil Moldes diagnostics. Run with sudo on Dell; read-only by default.
--compare additionally creates/removes disposable images through the Storage API.
No logs, tokens, connection strings, queries, or customer rows are printed.
"""
import json
import os
import argparse
import subprocess
import sys
import urllib.parse
from pathlib import Path

if os.geteuid() != 0:
    raise SystemExit('Run with sudo; this script only reads diagnostic metadata.')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--compare', action='store_true', help='Also compare direct/public Storage CRUD using disposable 1-pixel images')
args = parser.parse_args()

def run(args, input_text=None):
    result = subprocess.run(args, input=input_text, text=True, capture_output=True, timeout=35)
    if result.returncode:
        # stderr can contain unexpected data; report only exit status.
        raise RuntimeError('Diagnostic command failed with exit code ' + str(result.returncode))
    return result.stdout

containers = json.loads(run(['docker', 'inspect', 'milmoldes-storage', 'milmoldes-db']))
storage_ip = None
for container in containers:
    name = container['Name'].lstrip('/')
    labels = container['Config'].get('Labels') or {}
    if labels.get('com.docker.compose.project') != 'milmoldes':
        raise SystemExit('Unexpected project; diagnostics stopped.')
    state = container['State']
    print(json.dumps({'container': name, 'status': state['Status'], 'health': state.get('Health', {}).get('Status'),
                      'oom_killed': state.get('OOMKilled'), 'restarts': container['RestartCount']}), flush=True)
    if name == 'milmoldes-storage':
        networks = container['NetworkSettings'].get('Networks') or {}
        storage_ip = next((network.get('IPAddress') for network in networks.values() if network.get('IPAddress')), None)
        for entry in container['Config'].get('Env') or []:
            key, _, value = entry.partition('=')
            if key in ['DATABASE_POOL_MAX', 'DB_POOL_MAX', 'DB_CONNECTION_TIMEOUT', 'FILE_SIZE_LIMIT', 'STORAGE_BACKEND']:
                if value.isdecimal() or value in ['file','s3']:
                    print(json.dumps({'storage_setting': key, 'value': value}), flush=True)
            elif key in ['DATABASE_URL', 'DATABASE_CONNECTION_STRING']:
                parsed = urllib.parse.urlsplit(value)
                print(json.dumps({'storage_database_host': parsed.hostname, 'port': parsed.port}), flush=True)
        for mount in container['Mounts']:
            if mount.get('Destination') == '/var/lib/storage':
                source = Path(mount['Source'])
                if not source.resolve().is_relative_to(Path('/srv/datos/mil-moldes')):
                    raise SystemExit('Storage mount outside expected project; stopped.')
                info = source.stat()
                print(json.dumps({'storage_mount_writable': mount['RW'], 'mode': oct(info.st_mode & 0o777),
                                  'uid': info.st_uid, 'gid': info.st_gid}), flush=True)

# docker stats can hang on this host. It must not prevent database diagnostics.
sql = r"""
\pset pager off
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','superuser_reserved_connections','statement_timeout','lock_timeout','idle_in_transaction_session_timeout','track_io_timing');
SELECT usename AS database_role, coalesce(application_name,'') AS application, state, wait_event_type, wait_event,
       count(*) AS connections, max(clock_timestamp()-query_start) AS oldest_query_age,
       count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid))>0) AS blocked
FROM pg_stat_activity WHERE datname=current_database() GROUP BY usename,application_name,state,wait_event_type,wait_event ORDER BY connections DESC;
SELECT mode,granted,count(*) FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) GROUP BY mode,granted ORDER BY granted,mode;
SELECT xact_commit,xact_rollback,blks_read,blks_hit,deadlocks,blk_read_time,blk_write_time FROM pg_stat_database WHERE datname=current_database();
ROLLBACK;
"""
try:
    print(run(['docker','exec','-i','-e','PGCONNECT_TIMEOUT=8','milmoldes-db','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], sql), flush=True)
except subprocess.TimeoutExpired:
    print(json.dumps({'database_diagnostic': 'timeout_after_35_seconds'}), flush=True)
except RuntimeError:
    print(json.dumps({'database_diagnostic': 'command_failed'}), flush=True)

if args.compare:
    probe = Path(__file__).with_name('test_dell_storage_api.py')
    if not probe.is_file() or not storage_ip:
        raise SystemExit('Missing companion probe script or container IP')
    # Only a checked project container and the fixed public domain are tested.
    # The companion script creates/removes its own unique paths via Storage API.
    for extra in [['--direct', storage_ip], []]:
        result = subprocess.run([sys.executable, str(probe), '--apply', *extra], timeout=160)
        print(json.dumps({'storage_probe_exit_code': result.returncode}), flush=True)
