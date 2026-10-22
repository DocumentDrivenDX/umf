# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual compiler/generated ActionRef transport controls; no native qualification."""

from __future__ import annotations

import argparse
import json
import sys
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

import weft
from umf_access.adoption import TargetIdentity
from umf_access.managed_actions import ManagedDeltaActionExecutor, ManagedNativeConflict
from umf_access.managed_delta import UnityCatalogConfiguration, UnityCatalogTarget
from umf_access.native_program import NativeProgram
from umf_access.protocols import (
    ActionFailed,
    ActionRefused,
    Committed,
    Conflict,
    Indeterminate,
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
    from native_sales.keys import OrderKey

    program = NativeProgram.build(
        weft,
        json.loads(args.request.read_text()),
        bundle_input_digest=ApproveInput.UMF_BUNDLE_INPUT_DIGEST,
    )
    original = program.checked()
    if original.get("obligations", {}).get("transaction", "").endswith("-interactive"):

        class NoAdmission:
            def hold(self, *args, **kwargs):
                raise AssertionError(
                    "unsupported interactive candidate reached native owner"
                )

        executor = ManagedDeltaActionExecutor(
            object(), (program,), NoAdmission(), default_timeout=timedelta(seconds=10)
        )
        inputs = ApproveInput(order=OrderKey(id="a"))
        for operation in (executor.invoke, executor.validate):
            try:
                operation(Approve, inputs)
            except ActionRefused as error:
                assert error.code == "MANAGED_ATOMIC_DISPATCH_ABI_UNQUALIFIED"
            else:
                raise AssertionError("interactive managed action candidate accepted")
        args.output.write_text(
            json.dumps(
                {
                    "status": "pass",
                    "controls": [
                        "actual managed interactive invoke refuses before owner admission",
                        "actual managed interactive validate refuses before owner admission",
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
    connection = object()
    checks = []

    class Scope:
        store = '["11111111-1111-1111-1111-111111111111"]'
        epoch = "controlled-original-epoch"
        authenticated = effective = "controlled-human-label-not-native-proof"
        attribution_json = "{}"
        allowed = True

        def __init__(self, fault):
            self.fault = fault
            self.write_submitted = self.commit_submitted = self.rollback_confirmed = (
                False
            )
            self.status = "pending"
            self.calls = []
            self.failure = ConnectionError("original transport failure")

        def require_exact_commit_receipt(self):
            if self.fault == "missing-capability":
                raise ActionRefused("EXACT_NATIVE_METADATA_UNAVAILABLE")

        def recheck(self):
            pass

        def query(self, sql, values=()):
            self.calls.append(sql)
            if self.fault == "query-loss":
                raise self.failure
            if sql == original["keyCheck"]["sql"]:
                return [(0,)]
            if sql == original["effects"][0]["guard"]["sql"]:
                return [(True,)]
            for image in original["preImages"] + original["postImages"]:
                if sql == image["statement"]["sql"]:
                    return [
                        tuple(
                            "a" if field["logical"] == "id" else self.status
                            for field in image["columns"]
                        )
                    ]
            raise AssertionError("unreviewed original SQL")

        def execute(self, sql, values):
            assert sql == original["effects"][0]["statement"]["sql"]
            self.write_submitted = True
            if self.fault in ("conflict", "unconfirmed-conflict"):
                raise ManagedNativeConflict(self.failure)
            self.status = "approved"

        def commit(self, *, markers_json):
            self.commit_submitted = True
            self.markers = json.loads(markers_json)
            if self.fault == "lost-ack":
                raise self.failure
            return Receipt(
                self.store,
                self.epoch,
                "[]"
                if self.fault == "invalid-receipt"
                else '[{"tableUuid":"11111111-1111-1111-1111-111111111111","version":"1"}]',
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
            assert caller is connection
            return identity

        def __init__(self, fault):
            self.scope = Scope(fault)
            self.pending = None

        @contextmanager
        def hold(self, caller, owner_program, request, *, deadline):
            assert caller is connection and owner_program == original
            try:
                yield self.scope
            finally:
                if (
                    not self.scope.commit_submitted
                    and self.scope.fault != "unconfirmed-conflict"
                ):
                    self.scope.rollback_confirmed = True

        def quarantine(self, scope, error):
            self.pending = (scope, error)

    inputs = ApproveInput(order=OrderKey(id="a"))
    for fault in [
        "none",
        "validate",
        "missing-capability",
        "invalid-receipt",
        "lost-ack",
        "query-loss",
        "conflict",
        "unconfirmed-conflict",
    ]:
        admission = Admission(fault)
        executor = ManagedDeltaActionExecutor(
            connection, (program,), admission, default_timeout=timedelta(seconds=10)
        )
        if fault == "validate":
            assert executor.validate(Approve, inputs).valid
            assert (
                admission.scope.rollback_confirmed
                and not admission.scope.write_submitted
            )
        elif fault in [
            "none",
            "invalid-receipt",
            "lost-ack",
            "conflict",
            "unconfirmed-conflict",
        ]:
            endpoint = (
                UnityCatalogTarget(
                    connection,
                    UnityCatalogConfiguration(identity, timedelta(seconds=10)),
                    admission,
                    programs=(program,),
                )
                if fault == "none"
                else executor
            )
            outcome = endpoint.invoke(Approve, inputs)
            if fault == "conflict":
                assert (
                    isinstance(outcome, Conflict) and admission.scope.rollback_confirmed
                )
            elif fault == "none":
                assert isinstance(outcome, Committed) and outcome.changed == (
                    OrderKey(id="a"),
                )
                assert outcome.original.recovery.custody is admission.scope
            else:
                assert isinstance(outcome, Indeterminate) and executor.quarantined
                assert admission.pending[1] is executor.original_failure
                if fault == "lost-ack":
                    assert executor.original_failure is admission.scope.failure
                try:
                    executor.invoke(Approve, inputs)
                except ActionRefused:
                    pass
                else:
                    raise AssertionError("uncertain executor reused")
        elif fault == "missing-capability":
            try:
                executor.invoke(Approve, inputs)
            except ActionRefused:
                pass
            else:
                raise AssertionError("missing capability accepted")
            assert not admission.scope.calls and not admission.scope.write_submitted
        else:
            try:
                executor.invoke(Approve, inputs)
            except ActionFailed as failure:
                assert failure.__cause__ is admission.scope.failure
            else:
                raise AssertionError("known rollback native failure lost")
        checks.append(fault)
    args.output.write_text(
        json.dumps(
            {
                "status": "pass",
                "checks": checks,
                "scope": "actual compiler and generated ActionRef, faulty transport controls only; no native authority qualification",
                "temporal": "HELD",
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"status": "pass", "controls": len(checks)}))


if __name__ == "__main__":
    main()
