# SPDX-License-Identifier: MIT OR Apache-2.0
"""Internal fixed catalog-query protocol shared by sync and async drivers.

Only library-owned observation generators construct queries. This is neither a
query authoring API nor an execution/admission capability.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .catalog import _all, _execute, _one


@dataclass(frozen=True)
class _Query:
    kind: Literal['one','all','execute']
    statement: str
    parameters: tuple[Any, ...] = ()


def _run(connection: Any, steps: Any) -> Any:
    """Original Psycopg3 administrative driver for the same bounded protocol."""
    try:
        query = next(steps)
        while True:
            if query.kind == 'one':
                value = _one(connection,query.statement,query.parameters)
            elif query.kind == 'all':
                value = _all(connection,query.statement,query.parameters)
            elif query.kind == 'execute':
                value = _execute(connection,query.statement,query.parameters)
            else:
                raise ValueError('unknown internal query kind')
            query = steps.send(value)
    except StopIteration as result:
        return result.value
    finally:
        steps.close()
