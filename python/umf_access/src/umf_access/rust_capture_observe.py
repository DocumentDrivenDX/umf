# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private Rust-directed host observation for capture graph prefix fixtures.

This opt-in prototype covers FieldRef ownership and a bounded terminal/root/
Join observation prefix. It does not implement complete graph validation,
serialization, the legacy DTO budget, or select the public capture route.
The private graph profile admits exact text values and the bounded
FieldRef/Join/tuple visit branch. Node and SearchLeg values are explicitly
refused by that branch; subclass accessor effects on admitted objects are
observed in order, but subclass-produced non-text values are unsupported.
"""

from __future__ import annotations

from typing import Any

_PROFILE = "umf-access-capture-graph-observation/0.1.0"


class FieldOwnerObservationUnavailable(RuntimeError):
    """The installed umf-core does not provide the observation profile."""


def _native() -> Any:
    try:
        from umf import _rust
    except ImportError:
        raise FieldOwnerObservationUnavailable(
            "installed umf-core FieldRef observation engine required"
        ) from None
    core = getattr(_rust, "_rust_core", None)
    version = getattr(core, "access_field_owner_observation_profile_version", None)
    observe = getattr(core, "access_validate_field_owner_observed", None)
    observe_terminal = getattr(core, "access_observe_capture_terminal_join_owners", None)
    observe_field_join_tuple = getattr(core, "access_observe_capture_field_join_tuple", None)
    try:
        available = callable(version) and version() == _PROFILE
    except Exception:
        available = False
    if not (
        available
        and callable(observe)
        and callable(observe_terminal)
        and callable(observe_field_join_tuple)
    ):
        raise FieldOwnerObservationUnavailable(
            "installed umf-core lacks the capture graph observation profile"
        )
    return core


def validate_field_owner(field: object, expected: tuple[str, str, str | None]) -> None:
    """Ask Rust to observe FieldRef owner fields, in predecessor read order."""
    if (
        type(expected) is not tuple
        or len(expected) != 3
        or type(expected[0]) is not str
        or type(expected[1]) is not str
        or (expected[2] is not None and type(expected[2]) is not str)
    ):
        raise TypeError("expected FieldRef owner must be (str, str, str | None)")
    core = _native()
    matches = core.access_validate_field_owner_observed(
        field, expected[0], expected[1], expected[2]
    )
    if type(matches) is not bool:
        raise RuntimeError("Rust FieldRef observer returned an invalid result")
    if not matches:
        raise TypeError("expression column belongs to another Record")


def observe_terminal_join_owners(node: object) -> dict[str, object]:
    """Observe terminal structure and ordered RecordRef/Join owner reads.

    This is a private prefix-walker prototype. A successful result does not
    claim complete captured-graph validation and must not select the public
    capture route.
    """
    from umf_access.dsl._nodes import Node, RecordRef

    core = _native()
    result = core.access_observe_capture_terminal_join_owners(node, Node, RecordRef)
    if (
        type(result) is not dict
        or set(result) != {"terminalOp", "owners"}
        or type(result["terminalOp"]) is not str
        or type(result["owners"]) is not list
        or any(
            type(owner) is not dict
            or set(owner) != {"module", "element", "alias"}
            or type(owner["module"]) is not str
            or type(owner["element"]) is not str
            or (owner["alias"] is not None and type(owner["alias"]) is not str)
            for owner in result["owners"]
        )
    ):
        raise RuntimeError("Rust graph observer returned an invalid result")
    return result


def observe_field_join_tuple(
    value: object,
    allowed_owners: tuple[tuple[str, str, str | None], ...],
) -> None:
    """Run the private ordered FieldRef/Join/tuple branch of graph visitation.

    The caller supplies admitted owner tuples. This branch deliberately
    refuses Node and SearchLeg values because their semantic validation
    precedes recursion in `_validate_node.visit`.
    """
    if type(allowed_owners) is not tuple or any(
        type(owner) is not tuple
        or len(owner) != 3
        or type(owner[0]) is not str
        or type(owner[1]) is not str
        or (owner[2] is not None and type(owner[2]) is not str)
        for owner in allowed_owners
    ):
        raise TypeError("allowed owners must be exact (str, str, str | None) tuples")
    from umf_access.dsl._nodes import FieldRef, Node, RecordRef
    from umf_access.dsl._expressions import Join
    from umf_access.dsl.search import SearchLeg

    core = _native()
    core.access_observe_capture_field_join_tuple(
        value, allowed_owners, Node, RecordRef, FieldRef, Join, SearchLeg
    )
