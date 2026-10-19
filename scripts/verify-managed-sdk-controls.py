# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual compiler/generated-action host fault controls, not native qualification."""

from __future__ import annotations

import argparse
import json
import sys
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

import weft
from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin
from umf_access.commands import CommandVariant
from umf_access.managed_bulk import ManagedAtomicBulkExecutor
from umf_access.managed_delta import UnityCatalogConfiguration, UnityCatalogTarget
from umf_access.native_program import NativeProgram
from umf_access.protocols import (
    ActionFailed,
    ActionIndeterminate,
    ActionRefused,
    Receipt,
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generated", type=Path, required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.generated))
    from native_sales.actions import Approve, ApproveInput

    request = json.loads(args.request.read_text())
    program = NativeProgram.build(
        weft, request, bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST
    )
    original = program.checked()
    if original.get("obligations", {}).get("transaction", "").endswith("-interactive"):

        class NoAdmission:
            def hold(self, *args, **kwargs):
                raise AssertionError(
                    "unsupported interactive candidate reached native owner"
                )

        executor = ManagedAtomicBulkExecutor(
            object(), program, Approve, {}, NoAdmission(), timedelta(seconds=10)
        )
        for operation in (executor.preview, executor.execute):
            try:
                operation()
            except ActionRefused as error:
                assert error.code == "MANAGED_ATOMIC_DISPATCH_ABI_UNQUALIFIED"
            else:
                raise AssertionError("interactive managed bulk candidate accepted")
        args.output.write_text(
            json.dumps(
                {
                    "status": "pass",
                    "controls": [
                        "actual managed interactive preview refuses before owner admission",
                        "actual managed interactive execute refuses before owner admission",
                    ],
                    "scope": "actual compiler/generated ActionRef refusal controls; prior candidate fault cohorts retained separately, no managed qualification",
                    "temporal": "HELD",
                },
                indent=2,
            )
            + "\n"
        )
        print(json.dumps({"status": "pass", "controls": 2, "atomicDispatch": "held"}))
        return
    controls = []

    class OriginalTransportFailure(ConnectionError):
        pass

    class Scope:
        store = '["11111111-1111-1111-1111-111111111111"]'
        epoch = "control-fixture-only"
        authenticated = effective = "owner-fixture-human-label-not-native-proof"
        attribution_json = "{}"
        allowed = True

        def __init__(self, fault):
            self.fault = fault
            self.rows = [("a", "pending"), ("b", "blocked")]
            self.commit_submitted = self.write_submitted = self.rollback_confirmed = (
                False
            )
            self.effect_count = self.commit_count = 0
            self.original_failure = OriginalTransportFailure(
                "controlled original transport loss"
            )

        def require_exact_commit_receipt(self):
            if self.fault == "missing-capability":
                raise ActionRefused("EXACT_NATIVE_METADATA_UNAVAILABLE")

        def query(self, sql, values=()):
            if sql == original["keyCheck"]["sql"]:
                return [(0,)]
            if sql == original["selection"]["sql"]:
                return (
                    [("a", "pending")] * 11
                    if self.fault == "overbound"
                    else [("a", "pending")]
                )
            if sql == original["before"]["sql"]:
                return list(self.rows)
            raise AssertionError("unreviewed SQL dispatched")

        def execute(self, sql, values=()):
            assert sql == original["update"]["sql"]
            self.effect_count += 1
            self.write_submitted = True
            self.rows[0] = ("a", "approved")
            if self.fault == "unframed":
                self.rows[1] = ("b", "approved")
            if self.fault == "added-row":
                self.rows.append(("c", "approved"))

        def recheck(self):
            pass

        def commit(self, *, markers_json):
            self.commit_count += 1
            self.commit_submitted = True
            self.markers = json.loads(markers_json)
            if self.fault.startswith("lost-ack"):
                raise self.original_failure
            if self.fault == "invalid-receipt":
                return Receipt(self.store, self.epoch, "[]")
            return Receipt(
                self.store,
                self.epoch,
                '[{"tableUuid":"11111111-1111-1111-1111-111111111111","version":"1"}]',
            )

    identity = TargetIdentity(
        "unity-catalog",
        "controlled-compiler",
        "controlled-version",
        "databricks-managed-delta",
        "controlled-binding",
        (("databricks", "controlled-native-version"),),
    )

    class Admission:
        def identity(self, caller):
            assert caller is caller_connection
            return identity

        def __init__(self, fault):
            self.scope = Scope(fault)
            self.pending = None
            self.cleanup_error = RuntimeError("controlled quarantine storage failure")

        @contextmanager
        def hold(self, connection, owner_program, owner_request, *, deadline):
            assert connection is caller_connection
            assert owner_program == original
            try:
                yield self.scope
            finally:
                if not self.scope.commit_submitted:
                    self.scope.rollback_confirmed = True

        def quarantine(self, scope, original_failure):
            self.pending = (scope, original_failure)
            if self.scope.fault == "lost-ack-quarantine-failure":
                raise self.cleanup_error

    caller_connection = object()
    for fault in (
        "missing-capability",
        "invalid-receipt",
        "none",
        "unframed",
        "added-row",
        "overbound",
        "lost-ack",
        "lost-ack-quarantine-failure",
    ):
        admission = Admission(fault)
        executor = ManagedAtomicBulkExecutor(
            caller_connection, program, Approve, {}, admission, timedelta(seconds=10)
        )
        if fault == "none":
            target = UnityCatalogTarget(
                caller_connection,
                UnityCatalogConfiguration(identity, timedelta(seconds=10)),
                admission,
            )
            pin = TargetPin(
                identity.kind,
                identity.backend_id,
                identity.backend_version,
                identity.target_profile,
                identity.binding_sha256,
                tuple((name, (version,)) for name, version in identity.platform),
            )
            entry = CommandVariant((), pin, program, Approve, ())
            outcome = target.plan(entry, {}).execute()
            assert (outcome.selected, outcome.changed) == (1, 1)
            assert admission.scope.effect_count == admission.scope.commit_count == 1
            assert (
                admission.scope.markers["verification"][1]["check"]
                == "complete-population-frame"
            )
        elif fault in ("unframed", "added-row"):
            try:
                executor.execute()
            except ActionFailed as failure:
                assert failure.code == "MANAGED_BULK_FRAME_POSTCONDITION"
            else:
                raise AssertionError("faulty complete frame accepted")
            assert (
                admission.scope.rollback_confirmed and admission.scope.commit_count == 0
            )
        elif fault == "missing-capability":
            try:
                executor.execute()
            except ActionRefused as failure:
                assert failure.code == "EXACT_NATIVE_METADATA_UNAVAILABLE"
            else:
                raise AssertionError("missing native receipt capability accepted")
            assert admission.scope.effect_count == admission.scope.commit_count == 0
        elif fault == "overbound":
            try:
                executor.execute()
            except ActionRefused as failure:
                assert failure.code == "MANAGED_BULK_MAX_ITEMS"
            else:
                raise AssertionError("overbound selected population accepted")
            assert admission.scope.effect_count == admission.scope.commit_count == 0
        else:
            try:
                executor.execute()
            except ActionIndeterminate as failure:
                if fault == "invalid-receipt":
                    assert isinstance(failure.__cause__, ActionRefused)
                else:
                    assert failure.__cause__ is admission.scope.original_failure
                assert failure.original.recovery is admission.pending[0]
                assert admission.pending[1] is failure.__cause__
                if fault == "lost-ack-quarantine-failure":
                    assert failure.settlement_failures == (
                        admission.scope.original_failure,
                        admission.cleanup_error,
                    )
            else:
                raise AssertionError(
                    "lost acknowledgement classified as committed/rejected"
                )
            assert admission.scope.effect_count == admission.scope.commit_count == 1
        controls.append(fault)
    args.output.write_text(
        json.dumps(
            {
                "status": "pass",
                "controls": controls,
                "scope": "actual Rust program and current generated ActionRef; deliberately faulty owner transport controls only, never native acceptance",
                "temporal": "HELD",
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"status": "pass", "controls": len(controls)}))


if __name__ == "__main__":
    main()
