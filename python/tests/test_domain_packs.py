"""Canonical metadata structure only; data execution remains consumer-owned."""

import pytest
from umf import domain_pack_schema, schema_validator


def test_domain_pack_canonical_copy_and_refusal():
    first = domain_pack_schema()
    assert first["$id"] == "urn:umf:domain-pack:1.0.0"
    first["properties"].clear()
    schema = domain_pack_schema()
    assert schema["properties"]
    validator = schema_validator(schema)
    pack = {
        "id": "legal",
        "version": "1.0.0",
        "generator": {"id": "tablespec.legal", "version": "1.0.0"},
        "domain_types": {"client_name": {"future": {"preserved": True}}},
    }
    assert validator.is_valid(pack)
    assert not validator.is_valid({**pack, "generator": {"id": "x"}})
    with pytest.raises(ValueError, match="version"):
        domain_pack_schema("2.0.0")


def test_external_dataset_source_is_structural_and_copied():
    from umf import dataset_source_schema

    schema = dataset_source_schema()
    validator = schema_validator(schema)
    source = {
        "kind": "external",
        "data_kind": "fabricated",
        "reference": "fixture.csv",
        "format": "csv",
        "license": {"redistribution": "unknown"},
        "future": {"retained": True},
    }
    assert validator.is_valid(source)
    assert not validator.is_valid({"kind": "external", "data_kind": "observed"})
    schema["properties"].clear()
    assert dataset_source_schema()["properties"]
    with pytest.raises(ValueError, match="version"):
        dataset_source_schema("2.0.0")
