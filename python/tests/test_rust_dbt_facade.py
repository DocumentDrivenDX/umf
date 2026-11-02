import pytest

from umf import rust_dbt


def test_dbts_public_operation_names_preserve_source_and_selection_options(monkeypatch):
    calls = []
    monkeypatch.setattr(rust_dbt, "_call", lambda op, fields, **kw: calls.append((op, fields)) or fields)
    source = '{"metadata":{}}'
    options = {"id": "fixture"}
    document = {"umf": "0.10.0"}
    rust_dbt.import_manifest(source, options)
    rust_dbt.export_manifest(document)
    rust_dbt.inspect_manifest(document)
    rust_dbt.get_manifest_node(document, "/metadata")
    rust_dbt.propose_manifest_node_edit(document, "/metadata", source)
    rust_dbt.import_artifact(source, options)
    rust_dbt.export_artifact(document)
    rust_dbt.inspect_artifact(document)
    rust_dbt.get_artifact_node(document, "/metadata")
    rust_dbt.propose_artifact_node_edit(document, "/metadata", source)
    rust_dbt.import_semantic_manifest(source, options)
    rust_dbt.export_semantic_manifest(document)
    rust_dbt.inspect_semantic_manifest(document)
    rust_dbt.get_semantic_manifest_node(document, "/metadata")
    rust_dbt.propose_semantic_manifest_node_edit(document, "/metadata", source)
    rust_dbt.inspect_manifest_graph(document)
    rust_dbt.select_manifest_dependencies(document, {"roots": ["model.x.a"]})

    assert [op for op, _ in calls] == [
        "importManifest", "exportManifest", "inspectManifest", "getManifestNode", "editManifest",
        "importArtifact", "exportArtifact", "inspectArtifact", "getArtifactNode", "editArtifact",
        "importSemanticManifest", "exportSemanticManifest", "inspectSemanticManifest",
        "getSemanticManifestNode", "editSemanticManifest", "inspectManifestGraph",
        "selectManifestDependencies",
    ]
    assert calls[0][1] == {"text": source, "options": options}
    assert calls[-1][1]["options"] == {"roots": ["model.x.a"]}


def test_selection_preserves_nulls_for_rust_owned_validation(monkeypatch):
    calls = []
    monkeypatch.setattr(rust_dbt, "_call", lambda op, fields, **kw: calls.append(fields) or fields)
    options = {"roots": ["x"], "includeMacros": None}
    rust_dbt.select_manifest_dependencies({}, options)
    assert calls[0]["options"] is options
