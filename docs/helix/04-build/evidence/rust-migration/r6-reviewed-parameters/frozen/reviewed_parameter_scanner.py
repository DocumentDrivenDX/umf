# SPDX-License-Identifier: MIT OR Apache-2.0
"""Frozen Gate 0 predecessor for reviewed.py._parameter_positions.

Copied from the active reviewed.py source before any scanner implementation
change. Keep this file immutable; add a new packet revision for later captures.
"""
import re


class ReadBuildError(ValueError):
    pass


def _parameter_positions(sql: str) -> list[tuple[int, int, int]]:
    """Lossless parameter-style lexing of compiler-owned SQL, never lowering."""
    positions: list[tuple[int, int, int]] = []
    i = 0
    while i < len(sql):
        if sql.startswith("--", i):
            end = sql.find("\n", i + 2)
            i = len(sql) if end < 0 else end + 1
        elif sql.startswith("/*", i):
            depth = 1
            i += 2
            while depth and i < len(sql):
                if sql.startswith("/*", i):
                    depth += 1
                    i += 2
                elif sql.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise ReadBuildError("unterminated compiler SQL comment")
        elif sql[i] in ("'", '"'):
            quote = sql[i]
            escaped = (
                quote == "'"
                and i > 0
                and sql[i - 1] in ("E", "e")
                and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] == "_"))
            )
            i += 1
            while i < len(sql):
                if escaped and sql[i] == "\\":
                    i += 2
                elif sql[i] == quote:
                    if i + 1 < len(sql) and sql[i + 1] == quote:
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            else:
                raise ReadBuildError("unterminated compiler SQL quote")
        elif sql[i] == "$":
            tag = re.match(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
            if tag:
                delimiter = tag[0]
                end = sql.find(delimiter, i + len(delimiter))
                if end < 0:
                    raise ReadBuildError("unterminated compiler SQL dollar quote")
                i = end + len(delimiter)
            else:
                parameter = re.match(r"\$([1-9][0-9]*)", sql[i:])
                if parameter:
                    end = i + len(parameter[0])
                    positions.append((i, end, int(parameter[1]) - 1))
                    i = end
                else:
                    i += 1
        else:
            i += 1
    return positions
