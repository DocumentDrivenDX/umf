#!/usr/bin/env python3
"""Write a fixed-shape failure record if Docker never emits an in-container receipt."""
import json
import pathlib
import sys

path, commit, execution_id, harness, image, docker_status = sys.argv[1:]
record = {
    'schema': 'umf.local-linux-sdk-producer/1',
    'profile': 'umf.sdk.distribution/1',
    'status': 'failed',
    'sourceCommit': commit,
    'sourceTree': None,
    'executionId': execution_id,
    'attempt': 1,
    'harness': {'sha256': harness},
    'runtime': {'imageId': image,
                'baseImageId': 'sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556'},
    'resourceLimits': {'cpus': 4, 'memoryBytes': 8589934592,
                       'pids': 4096, 'network': 'bridge',
                       'pullPolicy': 'never'},
    'command': {'name': 'sdk-test-install', 'exitCode': None},
    'dockerExitCode': int(docker_status),
    'failureCode': 'container-or-receipt-unavailable',
}
pathlib.Path(path).write_text(json.dumps(record, indent=2, sort_keys=True) + '\n')
