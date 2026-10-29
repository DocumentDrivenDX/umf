# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public, dependency-free canonical JSON rendering used by native modules."""
from __future__ import annotations

import json
from typing import Any


def canonical_json(value: Any) -> str:
    # The Weft owner uses UTF-16 ordering, including non-BMP identifiers.
    def ordered(item: Any) -> Any:
        if isinstance(item, dict):
            return {
                key: ordered(item[key])
                for key in sorted(item, key=lambda key: key.encode("utf-16-be"))
            }
        if isinstance(item, list):
            return [ordered(v) for v in item]
        return item

    return json.dumps(
        ordered(value), ensure_ascii=False, separators=(",", ":"), allow_nan=False
    )
