#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Freeze CPython's official re_tests.py corpus as compact expected outcomes.

Run with CPython 3.11, 3.12, and 3.13 in order. The source test-data file is
vendored at tests/fixtures/cpython-re/re_tests.py from CPython 3.11.
"""
from __future__ import annotations

import pathlib
import runpy
import sys

if len(sys.argv) != 4:
    raise SystemExit("usage: generate_cpython_re_corpus.py PYTHON311 PYTHON312 PYTHON313")

root = pathlib.Path(__file__).resolve().parents[1]
source = root / "tests" / "fixtures" / "cpython-re" / "re_tests.py"
module = runpy.run_path(str(source))


def units(text: str) -> str:
    data = text.encode("utf-16-le", "surrogatepass")
    return ",".join(f"{int.from_bytes(data[i:i + 2], 'little'):04x}" for i in range(0, len(data), 2))


for minor, interpreter in zip((11, 12, 13), sys.argv[1:]):
    program = r'''
import json, runpy, re, sys
m=runpy.run_path(sys.argv[1])
rows=[]
for pattern, text, outcome, *_ in m["tests"]:
    try:
        match=re.search(pattern, text)
    except (re.error, ValueError, OverflowError):
        status="E"
        start=end=0
    else:
        if match is None:
            status="N"
            start=end=0
        else:
            status="M"
            start,end=match.span()
    expected={m["SUCCEED"]:"M", m["FAIL"]:"N", m["SYNTAX_ERROR"]:"E"}[outcome]
    if status != expected:
        raise SystemExit(f"source corpus expectation differs from this interpreter: {pattern!r}")
    def units(s):
        b=s.encode("utf-16-le", "surrogatepass")
        return ",".join(f"{int.from_bytes(b[i:i+2], 'little'):04x}" for i in range(0,len(b),2))
    rows.append("\t".join((status,str(start),str(end),units(pattern),units(text))))
print("\n".join(rows))
'''
    import subprocess

    result = subprocess.run(
        [interpreter, "-c", program, str(source)],
        check=True,
        capture_output=True,
        text=True,
    )
    (root / "tests" / "fixtures" / "cpython-re" / f"outcomes-3.{minor}.tsv").write_text(
        result.stdout.rstrip("\n") + "\n", encoding="ascii"
    )
