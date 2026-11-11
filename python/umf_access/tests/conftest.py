# SPDX-License-Identifier: MIT OR Apache-2.0
"""Skip tests that need an environment the plain CI install does not have.

Some tests need the pgserver local PostgreSQL profile or `bun`; they are listed too.
These tests import generated client packages (``commerce``, ``search_docs``; produced by
``bun scripts/umf-client-generate.ts``) or the downstream ``weft`` package. They are not run in
the fast CI job; each is listed here so the gap is visible. Fix = generate the packages in a
prepared environment and remove the entry.
"""
import pytest

NEEDS_GENERATED_CLIENT_OR_WEFT = [
    "conformance_selftest/test_reads.py",
    "test_action_clients.py",
    "test_alias_dsl.py",
    "test_codecs.py",
    "test_generated_actiontypes.py",
    "test_generated_models.py",
    "test_generated_projections.py",
    "test_joined_keys_context.py",
    "test_joined_model_projection.py",
    "test_manifest_commands.py",
    "test_ranked_projection.py",
    "test_related_generated.py",
    "test_related_key_transport.py",
    "test_related_projection_stream.py",
    "test_relationship_key_identity.py",
    "test_relationship_literals.py",
    "test_rust_related_keys.py",
    "test_search_resolution_order.py",
    "test_table_outcomes.py",
    "test_truss_related_metadata.py",
]

# These need the pgserver local PostgreSQL profile (a pgserver-pgNN wheel) or `bun`.
NEEDS_LOCAL_POSTGRES_OR_BUN = [
    "test_owner_authority.py",
    "test_original_control_lease.py",
    "test_owner_ledger_birth_recovery.py",
    "test_ingress_local_postgres_authority_bridge.py",
    "test_join_refinement.py",
]

collect_ignore = NEEDS_GENERATED_CLIENT_OR_WEFT + NEEDS_LOCAL_POSTGRES_OR_BUN

# Collected, but one case each imports the generated ``commerce`` package.
NEEDS_GENERATED_CASES = {
    "test_aggregate_dsl.py::GeneratedAggregateRows::test_real_generated_inputs_do_not_leak_numeric_input_domains",
    "test_dsl_render.py::KeyAndRelationshipRendering::test_literal_and_parameter_keys_retain_same_exact_identity",
    "test_dsl_runtime.py::GeneratedDelegationHooks::test_projection_and_repeated_hydration_do_not_lose_result_shape",
}


def pytest_collection_modifyitems(config, items):
    for item in items:
        if item.nodeid.split("tests/", 1)[-1] in NEEDS_GENERATED_CASES:
            item.add_marker(pytest.mark.skip(reason="needs the generated `commerce` client package"))
