"""Emit Python admissions and both serialized forms for the browser replay."""

import json
from pathlib import Path

from umf import Document, validate_document, write_document

root = Path(__file__).resolve().parent
if not (root / "fixtures/python").is_dir():
    root = root.parent
cases = json.loads((root / "fixtures/python/core-conformance.json").read_text())
cases.append(
    {
        "name": "advanced-properties-preservation-only",
        "document": json.loads(
            (root / "fixtures/core/schema-properties.json").read_text()
        ),
        "compareComplete": False,
    }
)
results = []
for case in cases:
    validation = validate_document(case["document"])
    result = {
        **case,
        "python": {"valid": validation.valid, "complete": validation.complete},
    }
    try:
        document = Document.model_validate(case["document"])
        result["texts"] = {
            format: write_document(document, format) for format in ("json", "yaml")
        }
    except ValueError:
        result["texts"] = {}
    results.append(result)
print(json.dumps(results))
