# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare independently parsed quads with one shared blank-node mapping."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from rdflib.compare import isomorphic
from rdf_oracle_support import declared, encoded
rows = json.load(sys.stdin)
results = []
for row in rows:
    results.append({'id': row['id'], 'equal': isomorphic(encoded(declared(row['actual'])), encoded(declared(row['expected'])))})
print(json.dumps(results))
