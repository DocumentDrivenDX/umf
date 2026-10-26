# SPDX-License-Identifier: MIT OR Apache-2.0
"""The private graph-validator seam is opt-in and translates closed replies."""

from unittest.mock import patch

import pytest

from umf import _rust
from umf_access.capture import CaptureError
from umf_access.dsl import FieldRef, Query, RecordRef, query
from umf_access import rust_catalog_render


_ID = FieldRef(module="demo", element="Thing", field="id")
_QUERY = Query(RecordRef(module="demo", element="Thing", key=(_ID,)))


def test_private_opt_in_capture_accepts_closed_rust_response():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "accepted",
    }
    with patch.object(_rust._rust_core, "access_validate_captured_graph_variant", return_value=response, create=True) as validate:
        captured = rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert len(captured.variants) == 1
    assert validate.call_count == 4


def test_private_opt_in_capture_maps_rust_signature_refusal():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "refused",
        "kind": "capture-error",
        "code": "CAPTURE_SIGNATURE",
        "rule": "expression references an undeclared parameter",
    }
    with patch.object(_rust._rust_core, "access_validate_captured_graph_variant", return_value=response, create=True):
        with pytest.raises(CaptureError) as caught:
            rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert caught.value.code == "CAPTURE_SIGNATURE"
    assert str(caught.value) == "CAPTURE_SIGNATURE: expression references an undeclared parameter"
