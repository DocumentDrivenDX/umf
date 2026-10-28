# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit opt-in Rust orchestration for the bounded ReadPlan.bind seam."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

from pydantic import BaseModel

from .catalog import CatalogError, NotCompiledForTarget, ReadPlan, ReadVariant
from .pages import ReadContinuation, StaleContinuation
from .protocols import AsyncReadTarget, ReadTarget

PROFILE = "umf-access-read-plan-bind/0.1.0"


class ReadPlanBindRustUnavailable(RuntimeError):
    """The installed UMF extension does not expose the bind profile."""


def _core() -> Any:
    try:
        from umf import _rust
    except ImportError:
        raise ReadPlanBindRustUnavailable(
            "installed UMF Rust engine required"
        ) from None
    core = getattr(_rust, "_rust_core", None)
    profile = getattr(core, "access_read_plan_bind_profile_version", None)
    select = getattr(core, "access_read_plan_bind_select", None)
    if not callable(profile) or not callable(select) or profile() != PROFILE:
        raise ReadPlanBindRustUnavailable(
            "installed UMF read-plan bind profile unavailable"
        )
    return core


def bind(
    plan: ReadPlan,
    target: ReadTarget | AsyncReadTarget,
    values: Mapping[str, object],
) -> tuple[ReadVariant, BaseModel, ReadContinuation | None]:
    """Bind a plan through Rust-owned selection with lazy Python host callbacks.

    Argument checking, continuation validation and final Pydantic construction
    remain Python-owned. This function is opt-in and is not the public default.
    """
    from .codec_support import revalidate_model
    from .dsl import Continuation
    from .types import MISSING

    arguments = plan.arguments
    if set(values) != {argument.name for argument in arguments}:
        raise CatalogError("exact catalog argument inventory required")
    checked = {
        argument.name: (
            values[argument.name]
            if argument.name == plan.cursor_argument
            else argument.validate(values[argument.name])
        )
        for argument in arguments
    }
    after = checked.get(plan.cursor_argument) if plan.cursor_argument else None
    if after is not None:
        if (
            not isinstance(after, Continuation)
            or plan.cursor_key_model is None
            or type(after.key) is not plan.cursor_key_model
        ):
            raise StaleContinuation(
                "page requires its original declared-Key continuation"
            )
        key = revalidate_model(plan.cursor_key_model, after.key)
        if any(
            index >= len(after.sort_values)
            or getattr(key, name) != after.sort_values[index]
            for name, index in plan.key_components
        ):
            raise StaleContinuation(
                "continuation Key differs from its complete sort context"
            )
        after = ReadContinuation(
            after.sort_values,
            after.identity_digest,
            after.owner_cursor,
            after.snapshot_versions,
        )
    presence = tuple(
        argument.name
        for argument in arguments
        if argument.optional and checked[argument.name] is not MISSING
    )

    class Callbacks:
        parameters: object | None = None

        def preflight_artifact(self, index: int) -> None:
            plan.variants[index].entry.artifact()

        def target_identity(self) -> object:
            return target.identity()

        def presence_matches(self, index: int, observed_presence: object) -> bool:
            return plan.variants[index].presence == observed_presence

        def pin_matches(self, identity: object, index: int) -> bool:
            return plan.variants[index].pin.matches(identity)

        def selected_artifact(self, index: int) -> None:
            plan.variants[index].entry.artifact()

        def build_parameters(self, index: int) -> None:
            variant = plan.variants[index]
            native = {
                name: (
                    getattr(checked[source], component)
                    if component is not None
                    else checked[source]
                )
                for name, source, component in variant.parameters
            }
            self.parameters = variant.entry.parameters.model_validate(
                native, strict=True
            )

    callbacks = Callbacks()
    selected = _core().access_read_plan_bind_select(plan.variants, presence, callbacks)
    if selected is None:
        raise NotCompiledForTarget(
            "no unique compiled variant for target identity and argument presence"
        )
    return (
        plan.variants[selected],
        cast(BaseModel, callbacks.parameters),
        cast(ReadContinuation | None, after),
    )
