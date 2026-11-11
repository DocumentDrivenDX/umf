# SPDX-License-Identifier: MIT OR Apache-2.0
"""Differential vectors captured from the Rust PreparedQuery owner."""

import json
from pathlib import Path

from umf_access_generated_executor._codec import run_issued_codec
from umf_access_generated_executor._errors import GeneratedExecutionError

FIXTURE = Path(__file__).parent / "fixtures/query_codec_rust_vectors.json"


def test_rust_issued_query_codec_vectors_match_python_vm() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert fixture["version"] == "umf.query-codec-rust-vectors/1"
    assert fixture["cases"]

    for case in fixture["cases"]:
        export = json.loads(case["export"])
        assert export["version"] == "weft.generated-query-program/1"
        assert export["readiness"] == "weft.fixed-query-executable/1"
        assert export["programDigest"] == fixture["programDigest"]
        values = json.loads(case["inputsJson"])["inputs"]
        native_inputs = {}
        accepted = True
        try:
            for parameter in export["parameters"]:
                identity = parameter["id"]
                native_inputs[identity] = run_issued_codec(
                    parameter["codec"],
                    values[identity],
                    carrier=parameter["carrier"],
                    nullable=parameter["nullable"],
                )
        except GeneratedExecutionError:
            accepted = False

        assert accepted is case["rustAccepted"], case["case"]
        if accepted:
            assert [native_inputs] == case["rustNativeInputs"], case["case"]
        else:
            assert case["rustNativeInputs"] is None
