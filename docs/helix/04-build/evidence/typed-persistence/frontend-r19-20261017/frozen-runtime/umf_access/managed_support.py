"""Managed execution mechanics; native authority and commit metadata remain owner ports."""

from __future__ import annotations

import json
import re
from contextlib import contextmanager

from .native_actions import NativeScope
from .native_program import canonical_json
from .protocols import ActionRefused, Receipt


@contextmanager
def preserve_body_failure(manager):
    """A host cleanup cannot suppress or replace the original operation failure."""
    original = None
    try:
        with manager as value:
            try:
                yield value
            except BaseException as error:
                original = error
                raise
    except BaseException as closing:
        if original is not None and closing is not original:
            raise original from closing
        raise
    if original is not None:
        raise original


def checked_receipt(receipt: Receipt, scope: NativeScope) -> Receipt:
    """Validate the retained native receipt ABI; never infer native commit versions.

    The admission owner must prove exact transaction metadata before dispatch.
    This shape check cannot turn a ledger row, history tip or caller label into
    that proof. A failure after COMMIT submission is uncertain settlement.
    """
    try:
        if (
            type(receipt) is not Receipt
            or receipt.store != scope.store
            or receipt.epoch != scope.epoch
        ):
            raise ValueError("receipt scope differs")
        stores, versions = json.loads(receipt.store), json.loads(receipt.version)
        if (
            type(stores) is not list
            or not stores
            or any(
                type(v) is not str
                or re.fullmatch(
                    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", v
                )
                is None
                for v in stores
            )
        ):
            raise ValueError("native table UUID vector required")
        if stores != sorted(set(stores)) or canonical_json(stores) != receipt.store:
            raise ValueError("canonical distinct UUID vector required")
        if (
            type(versions) is not list
            or not versions
            or canonical_json(versions) != receipt.version
        ):
            raise ValueError("canonical native commit vector required")
        seen = set()
        last = {}
        for item in versions:
            if (
                type(item) is not dict
                or set(item) != {"tableUuid", "version"}
                or item["tableUuid"] not in stores
                or type(item["version"]) is not str
                or re.fullmatch(r"0|[1-9][0-9]*", item["version"]) is None
            ):
                raise ValueError("exact native commit pair required")
            table, version = item["tableUuid"], int(item["version"])
            if table in last and version <= last[table]:
                raise ValueError("native versions must increase per table")
            last[table] = version
            seen.add(table)
        if seen != set(stores):
            raise ValueError("complete table commit vector required")
    except (ValueError, TypeError, KeyError) as error:
        raise ActionRefused("EXACT_MANAGED_COMMIT_RECEIPT_REQUIRED") from error
    return receipt


def drive(generator, scope):
    result = None
    while True:
        try:
            operation = generator.send(result)
        except StopIteration as done:
            return done.value
        if operation[0] != "query":
            raise ActionRefused("DELTA_NATIVE_STATE_OPERATION")
        result = scope.query(operation[1], operation[2])


def net_changes(state):
    created = []
    changed = []
    combined = {}
    for index, effect in enumerate(state.program["effects"]):
        identity = canonical_json(
            [
                effect["entity"]["key"]["reference"],
                [
                    {"carrier": f["carrier"], "value": str(state.resolve(v))}
                    for f, v in zip(
                        effect["entity"]["key"]["fields"],
                        effect["entity"]["components"],
                        strict=True,
                    )
                ],
            ]
        )
        before, after = (
            state.pre["effect:" + str(index)],
            state.post["effect:" + str(index)],
        )
        if identity not in combined:
            combined[identity] = {
                "entity": effect["entity"],
                "before": None if before is None else {},
                "after": None if after is None else {},
            }
        net = combined[identity]
        for phase, row in (("before", before), ("after", after)):
            if (net[phase] is None) != (row is None):
                raise ActionRefused("DELTA_ENTITY_IMAGE_DISAGREEMENT")
            if row is not None:
                net[phase].update(row)
    for identity, net in combined.items():
        before, after = net["before"], net["after"]
        if before == after:
            continue
        key = state.key(net["entity"])
        kind = (
            "created"
            if before is None and after is not None
            else "deleted"
            if after is None
            else "updated"
        )
        state.changes.append({"kind": kind, "key": identity})
        if kind == "created":
            created.append(key)
        elif kind == "updated":
            changed.append(key)
    return tuple(created), tuple(changed)


def require_atomic_dispatch(program):
    """The historical interactive candidate is not CONTRACT-073 admission.

    The source-owned atomic dispatcher is a separate ABI. Until its complete
    native result/receipt interface is implemented and checked here, no new
    program label can enable the preserved sequential candidate machinery.
    """
    raise ActionRefused("MANAGED_ATOMIC_DISPATCH_ABI_UNQUALIFIED")
