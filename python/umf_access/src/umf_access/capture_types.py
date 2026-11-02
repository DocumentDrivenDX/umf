# SPDX-License-Identifier: MIT OR Apache-2.0
"""Shared immutable capture value types used by capture and its observers."""

from __future__ import annotations

from dataclasses import dataclass

from .dsl import GeneratedSource


@dataclass(frozen=True)
class CapturedParameter:
    name: str
    carrier: object
    optional: bool
    key_components: tuple[str, ...] = ()
    key_identity: tuple[tuple[str, str], ...] = ()
    key_source: GeneratedSource | None = None


# Preserve the established semantic type identity in canonical capture values.
CapturedParameter.__module__ = "umf_access.capture"
