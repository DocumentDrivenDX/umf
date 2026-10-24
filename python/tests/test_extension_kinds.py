# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Python transport and snapshot checks for generic extension kinds."""
import copy
import json
from pathlib import Path

import pytest
from umf import Registry, inspect_extension_kinds, validate_document

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures/extension-kinds"
CASES = json.loads((FIXTURES / "conformance.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_generic_kind_corpus(case):
    registry = Registry()
    for item in case["registrations"]:
        registry.register_package(item["manifest"], kinds=item["kinds"])
    result = inspect_extension_kinds(case["document"], registry)
    assert result["source"] == case["document"]
    assert result["sourceValidation"]["valid"] == case["expected"]["valid"]
    assert len(result["entries"]) == case["expected"]["entries"]
    if "status" in case["expected"]:
        assert result["coverage"][0]["status"] == case["expected"]["status"]


def test_full_manifest_snapshot_and_atomic_catalog_admission():
    manifest = copy.deepcopy(CASES[0]["registrations"][0]["manifest"])
    manifest["schema"] = {"type": "object"}
    original = copy.deepcopy(manifest)
    registry = Registry()
    registry.register_package(manifest, kinds=True)
    manifest["kindCatalog"].clear()
    assert registry.get_package(original["id"], original["version"]) == original
    exposed = registry.get_package(original["id"], original["version"])
    exposed.clear()
    registry.get(original["id"], original["version"])[0].schema.clear()
    assert registry.get_package(original["id"], original["version"]) == original
    reference = {"extension": original["id"], "version": original["version"], "kind": "dashboard"}
    definition = registry.get_kind(reference)
    definition["title"] = "changed"
    assert registry.get_kind(reference)["title"] != "changed"
    invalid = copy.deepcopy(original)
    invalid["id"] = "invalid"
    invalid["kindCatalog"]["definitions"]["dashboard"]["scopes"] = ["wrong"]
    with pytest.raises(Exception, match="catalog|scope|Catalog"):
        registry.register_package(invalid, kinds=True)
    assert registry.get_package("invalid", original["version"]) is None


def test_kind_errors_suppress_callback_and_legacy_registration_stays_opaque():
    manifest = copy.deepcopy(CASES[0]["registrations"][0]["manifest"])
    document = copy.deepcopy(CASES[0]["document"])
    manifest["capabilities"]["validation"] = "semantic"
    calls = []
    registry = Registry()
    registry.register_package(manifest, lambda payload, context: calls.append(context) or [], kinds=True)
    assert validate_document(document, registry).valid
    assert len(calls) == 1
    document["extensions"][manifest["id"]]["kind"] = "unknown"
    assert not validate_document(document, registry).valid
    assert len(calls) == 1
    legacy = Registry()
    legacy.register_package(manifest, lambda payload, context: [])
    assert validate_document(document, legacy).valid
    assert inspect_extension_kinds(document, legacy)["entries"] == []
