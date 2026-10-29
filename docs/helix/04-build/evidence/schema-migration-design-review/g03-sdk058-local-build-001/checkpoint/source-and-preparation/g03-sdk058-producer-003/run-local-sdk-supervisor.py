#!/usr/bin/env python3
"""Own one bounded SDK producer container and close its output after absence."""
import hashlib
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
import uuid

image = 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
base_image = 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'
total_seconds = 1500
host_finalization_reserve = 120
termination_grace = 10
source_volume, expected_commit, expected_tree, output_arg = sys.argv[1:5]
output = pathlib.Path(output_arg).absolute()
if (not re.fullmatch(r'[A-Za-z0-9_.-]+', source_volume)
        or not re.fullmatch(r'[0-9a-f]{40}', expected_commit)
        or not re.fullmatch(r'[0-9a-f]{40}', expected_tree)
        or os.path.lexists(output)):
    sys.exit(64)

started = time.monotonic()
deadline = started + total_seconds

def terminate_as_interrupt(signum, frame):
    raise KeyboardInterrupt(f'signal-{signum}')

signal.signal(signal.SIGTERM, terminate_as_interrupt)
signal.signal(signal.SIGINT, terminate_as_interrupt)
execution_id = 'local-sdk-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(uuid.uuid4()) + '-attempt1'
script_dir = pathlib.Path(__file__).resolve().parent
harness_sha = 'unavailable'


def call(argv, limit, **kwargs):
    remaining = deadline - time.monotonic() - host_finalization_reserve
    if remaining <= 0:
        raise TimeoutError('outer-deadline-preflight')
    return subprocess.run(argv, timeout=max(0.1, min(limit, remaining)), **kwargs)


def source_hash(path):
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest()


def harness_hash():
    names = ['inside-sdk-producer.py', 'capture-bounded-log.py', 'run-local-sdk.sh',
             'write-launch-failure.py', 'close-sdk-output.py', 'run-local-sdk-supervisor.py']
    rows = [f"{source_hash(script_dir / name)}  {name}\n" for name in names]
    return hashlib.sha256(''.join(rows).encode()).hexdigest()


def write_failure_record(docker_exit):
    path = output / 'sdk-producer-receipt.json'
    if path.exists():
        return
    remaining = deadline - time.monotonic() - host_finalization_reserve
    if remaining <= 0:
        return
    subprocess.run([sys.executable, str(script_dir / 'write-launch-failure.py'),
                    str(path), expected_commit, expected_tree, execution_id,
                    harness_sha, image, str(docker_exit)],
                   check=False, timeout=min(5, remaining))


def cleanup_owned_container():
    remaining = deadline - time.monotonic() - host_finalization_reserve
    if remaining <= 0:
        return False
    try:
        subprocess.run(['docker', 'rm', '-f', execution_id], stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, check=False, timeout=min(10, remaining))
        inspected = subprocess.run(['docker', 'inspect', execution_id], stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, check=False, timeout=min(5, remaining))
    except (OSError, subprocess.TimeoutExpired):
        return False
    if inspected.returncode == 0:
        return False
    detail = inspected.stderr.decode('utf-8', 'replace').lower()
    return 'no such object' in detail or 'no such container' in detail


docker_exit = 125
cleanup_absent = False
container = None
try:
    output.mkdir(parents=True, exist_ok=False)
    image_info = call(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], 10,
                      text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    volume_info = call(['docker', 'volume', 'inspect', source_volume], 10,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if image_info.returncode != 0 or image_info.stdout.strip() != image or volume_info.returncode != 0:
        raise RuntimeError('input-resource-preflight')
    harness_sha = harness_hash()
    argv = [
        'docker', 'run', '--rm', '--name', execution_id,
        '--pull=never', '--platform', 'linux/amd64', '--network', 'bridge',
        '--cpus', '4', '--memory', '8g', '--pids-limit', '4096', '--stop-timeout', '5',
        '--mount', f'type=volume,src={source_volume},dst=/source,readonly',
        '--mount', f'type=bind,src={script_dir},dst=/runner,readonly',
        '--mount', f'type=bind,src={output},dst=/out',
        '--env', f'UMF_HARNESS_SHA256={harness_sha}',
        '--env', f'UMF_IMAGE_ID={image}',
        '--env', f'UMF_BASE_IMAGE_ID={base_image}',
        image, 'python3', '/runner/inside-sdk-producer.py',
        expected_commit, expected_tree, execution_id,
    ]
    command_remaining = deadline - time.monotonic() - host_finalization_reserve
    if command_remaining <= termination_grace:
        raise TimeoutError('outer-deadline-before-container')
    container = subprocess.Popen(argv)
    container_deadline = deadline - host_finalization_reserve - termination_grace
    while container.poll() is None and time.monotonic() < container_deadline:
        time.sleep(min(0.25, max(0.01, container_deadline - time.monotonic())))
    if container.poll() is None:
        container.terminate()
        try:
            container.wait(timeout=termination_grace)
        except subprocess.TimeoutExpired:
            container.kill()
            container.wait(timeout=termination_grace)
    docker_exit = container.returncode if container.returncode is not None else 124
except KeyboardInterrupt:
    docker_exit = 130
    if container is not None and container.poll() is None:
        container.terminate()
        try:
            container.wait(timeout=termination_grace)
        except subprocess.TimeoutExpired:
            container.kill()
            container.wait(timeout=termination_grace)
except Exception:
    docker_exit = 125
finally:
    cleanup_absent = cleanup_owned_container()

try:
    write_failure_record(docker_exit)
    remaining = deadline - time.monotonic()
    if remaining <= 2:
        sys.exit(124)
    closure_budget = int(remaining - 1)
    closer = subprocess.run([
        sys.executable, str(script_dir / 'close-sdk-output.py'), str(output),
        expected_commit, expected_tree, execution_id, str(docker_exit),
        'true' if cleanup_absent else 'false', str(closure_budget),
    ], check=False, timeout=closure_budget)
    if time.monotonic() > deadline:
        sys.exit(124)
    sys.exit(0 if closer.returncode == 0 and docker_exit == 0 and cleanup_absent else 1)
except (OSError, subprocess.TimeoutExpired):
    sys.exit(124)
