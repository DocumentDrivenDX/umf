# SPDX-License-Identifier: MIT OR Apache-2.0
"""Skip the tests listed in known_failures.txt, each with its recorded reason."""
from pathlib import Path

import pytest


def _known():
    entries = {}
    for line in (Path(__file__).parent / "known_failures.txt").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            node, _, reason = line.partition(" ; ")
            entries[node.strip()] = reason.strip()
    return entries


def pytest_collection_modifyitems(config, items):
    known = _known()
    for item in items:
        # nodeids are relative to the rootdir (python/) or to the invocation directory.
        suffix = item.nodeid.split("python/", 1)[-1]
        reason = known.get(suffix)
        if reason:
            item.add_marker(pytest.mark.skip(reason="known failure: " + reason))
