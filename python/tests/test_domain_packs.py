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


def test_artifact_collection_structure_and_unknown_annotations():
    validator = schema_validator(domain_pack_schema())
    collection = {
        'version': '1.0.0', 'id': 'originals', 'title': 'Originals',
        'view': 'imaging', 'semantic_kinds': ['DICOM_instance'],
        'source_ids': ['original'], 'future': {'opaque': True},
    }
    pack = {'id': 'fixture', 'version': '1.0.0',
            'domain_types': {'identity': {'description': 'Source identity'}},
            'sources': {'original': {'kind': 'external', 'data_kind': 'unknown', 'reference': 'https://example.org/original', 'format': 'dicom-part10', 'license': {'redistribution': 'unknown'}}},
            'artifact_collections': [collection]}
    assert validator.is_valid(pack)
    assert collection['future'] == {'opaque': True}
    # Python admission is structural; TS pack inspection resolves IDs.
    assert validator.is_valid({**pack, 'artifact_collections': [{**collection, 'source_ids': ['unresolved']}]})
    for mutation in [{'version': '2.0.0'}, {'source_ids': ['original', 'original']},
                     {'source_ids': []}]:
        assert not validator.is_valid({**pack, 'artifact_collections': [{**collection, **mutation}]})
