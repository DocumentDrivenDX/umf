#!/usr/bin/env python3
"""Fresh schema-parser observations for exact Rust Avro export inputs."""
import hashlib
import json

import avro
import avro.schema
import fastavro

DEPENDENCY = '{"type":"record","name":"Node","namespace":"n","fields":[{"name":"next","type":["null","Node"]}]}'
ROOT = '{"type":"record","name":"Root","fields":[{"name":"node","type":"n.Node"}]}'


def apache(dependency, root):
    names = avro.schema.Names()
    avro.schema.make_avsc_object(json.loads(dependency), names)
    avro.schema.make_avsc_object(json.loads(root), names)
    return "accepted"


def fast(dependency, root):
    names = {}
    fastavro.parse_schema(json.loads(dependency), names)
    fastavro.parse_schema(json.loads(root), names)
    return "accepted"


def observe(fn, dependency, root):
    try:
        return {"outcome": fn(dependency, root)}
    except Exception as exc:  # native parser differences are retained verbatim
        return {"outcome": "rejected", "errorType": type(exc).__name__, "message": str(exc)}


records = []
for label, dep, root in [
    ("original-input", DEPENDENCY, ROOT),
    # The Rust bundle export is asserted byte-for-byte in
    # tests/r5_avro_document.rs; compact source trees plus final LF are exact.
    ("rust-exported-input", DEPENDENCY + "\n", ROOT + "\n"),
]:
    records.append({
        "case": "recursive-cross-dependency-reference",
        "input": label,
        "sourceSha256": {"dependency": hashlib.sha256(dep.encode()).hexdigest(), "root": hashlib.sha256(root.encode()).hexdigest()},
        "apacheAvro112": observe(apache, dep, root),
        "fastavro112": observe(fast, dep, root),
    })

# Additional parser probes are original schema inputs only. They do not claim
# that Apache Avro or fastavro implements the Rust inspector's diagnostic API.
probes = {
    "named-array-and-container-union": ('{"type":"record","name":"array","namespace":"n","fields":[]}', '["n.array",{"type":"array","items":"string"}]'),
    "valid-single-relative-named-reference": ('{"type":"record","name":"A","namespace":"n","fields":[]}', '{"type":"record","name":"Root","namespace":"n","fields":[{"name":"choice","type":["A"]}]}'),
    "normalized-duplicate-named-reference": ('{"type":"record","name":"A","namespace":"n","fields":[]}', '{"type":"record","name":"Root","namespace":"n","fields":[{"name":"choice","type":["A","n.A"]}]}'),
    "object-form-missing-reference": ('{"type":"record","name":"Unused","fields":[]}', '{"type":"record","name":"R","fields":[{"name":"x","type":{"type":"Missing"}}]}'),
    "missing-field-name": ('{"type":"record","name":"Unused","fields":[]}', '{"type":"record","name":"R","fields":[{"type":"string"}]}'),
    "missing-field-type": ('{"type":"record","name":"Unused","fields":[]}', '{"type":"record","name":"R","fields":[{"name":"x"}]}'),
}
for case, (dep, root) in probes.items():
    records.append({
        "case": case,
        "input": "original-only",
        "sourceSha256": {"dependency": hashlib.sha256(dep.encode()).hexdigest(), "root": hashlib.sha256(root.encode()).hexdigest()},
        "apacheAvro112": observe(apache, dep, root),
        "fastavro112": observe(fast, dep, root),
    })

print(json.dumps({
    "profile": "r5-avro-semantic-inspection/native-oracle/1.0.0",
    "versions": {"apacheAvroPython": avro.__version__, "fastavro": fastavro.__version__},
    "observations": records,
    "scope": "Independent schema parser observations only; no datum/default/logical equivalence or full Avro conformance is inferred.",
}, separators=(",", ":")))
