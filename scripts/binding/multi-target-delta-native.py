"""Pinned native read of the shared DDD graph's Delta clustering proposal."""
import json
import pathlib
import tempfile
import deltalake

assert deltalake.__version__ == '1.6.4'
base = pathlib.Path('fixtures/projections/ddd-postgresql-tables')
source = (base / 'delta-native.jsonl').read_bytes()
candidate = (base / 'delta-candidate.jsonl').read_bytes()
action = json.loads(candidate)
assert action['domainMetadata']['domain'] == 'delta.clustering'
assert json.loads(action['domainMetadata']['configuration'])['clusteringColumns'] == [{'physicalName': ['tenant']}]
with tempfile.TemporaryDirectory() as directory:
    log = pathlib.Path(directory) / '_delta_log'
    log.mkdir()
    (log / '00000000000000000000.json').write_bytes(source)
    initial = deltalake.DeltaTable(directory)
    assert initial.version() == 0
    (log / '00000000000000000001.json').write_bytes(candidate)
    latest = deltalake.DeltaTable(directory)
    assert latest.version() == 1
    assert latest.schema().json() == initial.schema().json()
    assert (log / '00000000000000000000.json').read_bytes() == source
    assert (log / '00000000000000000001.json').read_bytes() == candidate
    print(json.dumps({'runtime': f'deltalake {deltalake.__version__}', 'version': latest.version(),
                      'sourceBytesRecovered': True, 'candidateBytesRecovered': True, 'schema': latest.schema().json()}))
