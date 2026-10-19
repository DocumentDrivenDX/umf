# SPDX-License-Identifier: MIT OR Apache-2.0
"""Iterator control tests only; synthetic pages grant no native qualification."""

from __future__ import annotations

import unittest
from typing import Any

from pydantic import BaseModel
from umf_access.delta_read import SparkDeltaTarget
from umf_access.pages import (
    ReadContinuation,
    ReadObligationUnmet,
    ReadPage,
    StreamLimitReached,
)


class Row(BaseModel):
    value: int


class Pages(SparkDeltaTarget):
    def __init__(self, pages: list[ReadPage[Row]]):
        self.pages, self.dispatched = pages, 0

    def _page(self, *_: Any, **__: Any) -> ReadPage[Row]:
        self.dispatched += 1
        return self.pages[self.dispatched - 1]

    def run(self, maximum: int):
        return self._stream(None, None, max_rows=maximum, page_size=None, timeout=None)


def page(*values: int, more: bool = False) -> ReadPage[Row]:
    return ReadPage(
        tuple(Row(value=value) for value in values),
        ReadContinuation((values[-1] if values else 0,), "control") if more else None,
    )


class StreamLimits(unittest.TestCase):
    def test_buffered_remainder_reports_known_truncation(self) -> None:
        target = Pages([page(1, 2, 3, more=True)])
        stream = target.run(2)
        self.assertEqual([next(stream).value, next(stream).value], [1, 2])
        with self.assertRaises(StreamLimitReached) as raised:
            next(stream)
        self.assertIs(raised.exception.truncated, True)
        self.assertEqual(raised.exception.emitted, 2)
        self.assertEqual(target.dispatched, 1)

    def test_exact_full_page_reports_unknown_more_without_dispatch(self) -> None:
        target = Pages([page(1, 2, more=True)])
        stream = target.run(2)
        self.assertEqual([next(stream).value, next(stream).value], [1, 2])
        with self.assertRaises(StreamLimitReached) as raised:
            next(stream)
        self.assertIsNone(raised.exception.truncated)
        self.assertEqual(target.dispatched, 1)

    def test_native_exhaustion_is_the_only_natural_completion(self) -> None:
        for maximum in (2, 5):
            target = Pages([page(1, 2)])
            self.assertEqual([row.value for row in target.run(maximum)], [1, 2])
            self.assertEqual(target.dispatched, 1)

    def test_close_and_no_progress_do_not_dispatch_again(self) -> None:
        target = Pages([page(1, 2, more=True)])
        stream = target.run(5)
        next(stream)
        stream.close()
        self.assertEqual(target.dispatched, 1)
        target = Pages([page(more=True)])
        with self.assertRaises(ReadObligationUnmet):
            next(target.run(5))
        self.assertEqual(target.dispatched, 1)


if __name__ == "__main__":
    unittest.main()
