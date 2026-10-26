# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private Rust-directed host observation for capture graph prefix fixtures.

This opt-in prototype covers FieldRef ownership and a bounded terminal/root/
Join observation prefix. It does not implement complete graph validation,
serialization, the legacy DTO budget, or select the public capture route.
The private graph profile admits exact text values, the bounded
FieldRef/Join/tuple visit branch, and an empty SearchLeg prefix. Node values
and SearchLegs with a value or nested legs remain outside these branches.
"""

from __future__ import annotations

from typing import Any

_PROFILE = "umf-access-capture-graph-observation/0.6.0"


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
    observe_empty_search_leg = getattr(core, "access_observe_capture_empty_search_leg", None)
    try:
        available = callable(version) and version() == _PROFILE
    except Exception:
        available = False
    if not (
        available
        and callable(observe)
        and callable(observe_terminal)
        and callable(observe_field_join_tuple)
        and callable(observe_empty_search_leg)
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
    from umf_access.dsl._expressions import Join
    from umf_access.dsl._nodes import FieldRef
    from umf_access.dsl.search import SearchLeg

    result = core.access_observe_capture_terminal_join_owners(
        node, Node, RecordRef, FieldRef, Join, SearchLeg
    )
    if (
        type(result) is not dict
        or set(result)
        != {"terminalOp", "owners", "stepsEmpty", "recordExact", "stepsExactTuple"}
        or type(result["terminalOp"]) is not str
        or type(result["stepsEmpty"]) is not bool
        or type(result["recordExact"]) is not bool
        or type(result["stepsExactTuple"]) is not bool
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


def observe_all_empty_capture_profile(node: object, session: object | None = None) -> None:
    """Validate the private exact-base `.all()` empty-steps profile.

    This private candidate shares one work counter with the DTO encoder.
    Rust owns graph reads so Python profile admission cannot move the first
    fault ahead of the predecessor's repeated ``Node.args`` reads. It does not
    call `_validate_node`, retry another validator, or select public capture.
    DTO byte/node/depth ceilings remain separate.
    """
    core = _native()
    session_type = getattr(core, "CaptureResourceSession", None)
    observe_session = getattr(
        core, "access_observe_capture_terminal_join_owners_with_session", None
    )
    if not callable(session_type) or not callable(observe_session):
        raise FieldOwnerObservationUnavailable(
            "installed umf-core lacks the shared capture resource session"
        )
    if session is None:
        session = session_type((1 << 64) - 1)
    if type(session) is not session_type:
        raise TypeError("capture profile requires a native resource session")
    from umf_access.dsl._expressions import Join
    from umf_access.dsl._nodes import FieldRef, Node, RecordRef
    from umf_access.dsl.search import SearchLeg

    session.charge_work(1)
    if type(node) is not Node:
        raise TypeError("capture profile requires an exact Node")
    # Native observation owns all graph reads and preserves the predecessor's
    # distinct args accesses before RecordRef owner reads.
    result = observe_session(node, Node, RecordRef, FieldRef, Join, SearchLeg, session)
    if (
        type(result) is not dict
        or set(result)
        != {"terminalOp", "owners", "stepsEmpty", "recordExact", "stepsExactTuple"}
        or type(result["terminalOp"]) is not str
        or type(result["owners"]) is not list
        or len(result["owners"]) != 1
        or type(result["stepsEmpty"]) is not bool
        or type(result["recordExact"]) is not bool
        or type(result["stepsExactTuple"]) is not bool
    ):
        raise RuntimeError("Rust graph observer returned an invalid all profile result")
    if (
        result["terminalOp"] != "all"
        or not result["stepsEmpty"]
        or not result["recordExact"]
        or not result["stepsExactTuple"]
    ):
        raise TypeError("capture profile requires exact all terminal with empty steps")


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
    from umf_access.dsl._expressions import Join
    from umf_access.dsl._nodes import FieldRef, Node, RecordRef
    from umf_access.dsl.search import SearchLeg

    core = _native()
    core.access_observe_capture_field_join_tuple(
        value, allowed_owners, Node, RecordRef, FieldRef, Join, SearchLeg
    )


def observe_empty_search_leg(value: object, root_record: object) -> None:
    """Observe SearchLeg's empty-value, empty-legs predecessor branch."""
    from umf_access.dsl._expressions import Join
    from umf_access.dsl._nodes import FieldRef, Node, RecordRef
    from umf_access.dsl.search import SearchLeg

    core = _native()
    core.access_observe_capture_empty_search_leg(
        value, root_record, Node, RecordRef, FieldRef, Join, SearchLeg
    )


def observe_keyword_search_leg(
    value: object,
    root_record: object,
    parameter: object,
) -> None:
    """Observe one exact keyword/vector leg against its resolved parameter."""
    from umf_access.capture import CapturedParameter
    from umf_access.types import Vector

    if type(parameter) is not CapturedParameter or type(parameter.name) is not str:
        raise TypeError("keyword search observation requires a captured parameter")
    string_carrier = parameter.carrier is str
    vector_carrier = parameter.carrier is Vector
    from umf_access.dsl._expressions import Join
    from umf_access.dsl._nodes import FieldRef, Node, RecordRef
    from umf_access.dsl.search import SearchLeg

    core = _native()
    observe = getattr(core, "access_observe_capture_keyword_search_leg", None)
    if not callable(observe):
        raise FieldOwnerObservationUnavailable(
            "installed umf-core lacks keyword SearchLeg observation"
        )
    observe(
        value,
        root_record,
        parameter.name,
        string_carrier,
        vector_carrier,
        Node,
        RecordRef,
        FieldRef,
        Join,
        SearchLeg,
    )
