# SPDX-License-Identifier: MIT OR Apache-2.0
"""Portable saga operations delegated to the installed shared Rust engine.

This module owns no execution, database selection or capability verification.
Resources are the exact integrity-checked package cohort installed in this wheel.
"""
from __future__ import annotations
from typing import Any
from .action_runtime import _load_resources
from .rust_codegen import CodegenEngine

class SagaRuntime:
    """Immutable supported action/saga registry profile of the installed cohort."""
    def __init__(self, **controls: Any) -> None:
        self._engine = CodegenEngine(_load_resources(), **controls)

    def inspect_sagas(self, source: Any) -> Any:
        return self._engine.inspect_sagas(source)

    def declare_saga(self, source: Any, module: str, definition: Any) -> Any:
        return self._engine.declare_saga(source, module, definition)

    def edit_saga(self, source: Any, identity: Any, replacement: Any) -> Any:
        return self._engine.edit_saga(source, identity, replacement)

    def assess_saga(self, source: Any, identity: Any, capabilities: Any) -> Any:
        return self._engine.assess_saga(source, identity, capabilities)
