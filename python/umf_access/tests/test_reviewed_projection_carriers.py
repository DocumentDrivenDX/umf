# SPDX-License-Identifier: MIT OR Apache-2.0
"""Native projection shapes never grant additional parameter carriers."""

from __future__ import annotations

import unittest
from typing import Annotated

from pydantic import BaseModel, ConfigDict
from umf_access.reviewed import ReadBuildError, _carrier, _fields
from umf_access.types import Vector


class ProjectionCarriers(unittest.TestCase):
    def test_exact_binary_and_vector_results_only(self) -> None:
        class Row(BaseModel):
            model_config = ConfigDict(strict=True, extra="forbid")
            payload: bytes
            vector: Vector | None

        self.assertEqual(
            _fields(Row, projection=True),
            [
                {"name": "payload", "carrier": "binary", "nullable": False},
                {"name": "vector", "carrier": "vector", "nullable": True},
            ],
        )
        # Both build-time requests and runtime signature validation default to
        # the original scalar parameter profile.
        with self.assertRaises(ReadBuildError):
            _fields(Row)
        for annotation in (bytes, Vector, Vector | None, Annotated[bytes, "result"]):
            with self.subTest(annotation=annotation), self.assertRaises(ReadBuildError):
                _carrier(annotation)

    def test_lookalike_collections_are_not_vectors(self) -> None:
        for annotation in (
            list[float],
            tuple[int, ...],
            tuple[float, float],
            tuple[object, ...],
        ):
            with self.subTest(annotation=annotation), self.assertRaises(ReadBuildError):
                _carrier(annotation, projection=True)


if __name__ == "__main__":
    unittest.main()
