#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Add a Python 3.14 regex profile from an exact CPython 3.14 interpreter.

This incremental generator preserves the frozen 3.11–3.13 tables and name
index. Run with the exact CPython 3.14 executable used for the oracle.
"""
from __future__ import annotations

import ast
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLES = ROOT / "src/python_re_tables.rs"
NAMES = ROOT / "src/python_re_names.dat"
ALIASES = pathlib.Path(__file__).resolve().parent / "unicode/NameAliases-16.0.0.txt"
FIXTURES = ROOT / "tests/fixtures/cpython-re"
PROFILE_START = "// BEGIN GENERATED CPYTHON 3.14 PROFILE"
PROFILE_END = "// END GENERATED CPYTHON 3.14 PROFILE"

if len(sys.argv) != 2:
    raise SystemExit("usage: extend_python_re_314.py PYTHON314")

interpreter = pathlib.Path(sys.argv[1]).resolve()
version = subprocess.check_output(
    [str(interpreter), "-c", "import sys; print('.'.join(map(str,sys.version_info[:3])))"],
    text=True,
).strip()
if not version.startswith("3.14."):
    raise SystemExit(f"expected CPython 3.14, got {version}")

# Reuse the exact table-producing program from the canonical generator.
table_generator = pathlib.Path(__file__).with_name("generate_python_re_tables.py")
tree = ast.parse(table_generator.read_text(encoding="utf-8"))
program = next(
    ast.literal_eval(node.value)
    for node in tree.body
    if isinstance(node, ast.Assign)
    and any(isinstance(target, ast.Name) and target.id == "program" for target in node.targets)
)
table_output = subprocess.check_output(
    [str(interpreter), "-c", "PROFILE='V3_14'\n" + program], text=True
)
table_hash = hashlib.sha256(table_output.encode()).hexdigest()
generator_hash = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
interpreter_hash = hashlib.sha256(interpreter.read_bytes()).hexdigest()
alias_hash = hashlib.sha256(ALIASES.read_bytes()).hexdigest()
unicode_version = subprocess.check_output(
    [str(interpreter), "-c", "import unicodedata; print(unicodedata.unidata_version)"],
    text=True,
).strip()
block = (
    f"{PROFILE_START}\n"
    f"// CPython {version}; Unicode {unicode_version}\n"
    f"// Interpreter executable SHA256: {interpreter_hash}\n"
    f"// Unicode name alias input {ALIASES.name} SHA256: {alias_hash}\n"
    f"// Incremental generator SHA256: {generator_hash}\n"
    f"// Generated table payload SHA256: {table_hash}\n"
    f"{table_output}\n{PROFILE_END}"
)
source = TABLES.read_text(encoding="utf-8")
if PROFILE_START in source and PROFILE_END in source:
    before, rest = source.split(PROFILE_START, 1)
    _, after = rest.split(PROFILE_END, 1)
    source = before.rstrip() + "\n\n" + after.lstrip("\n")
TABLES.write_text(source.rstrip() + "\n\n" + block + "\n", encoding="utf-8")

# Decode the existing prefix-compressed name buckets, add names admitted by
# Unicode 16.0, then rewrite the same compact format with minor 14 markers.
raw = NAMES.read_bytes()
if raw[:8] != b"UMFPNAM1":
    raise SystemExit("unexpected Python regex name-table header")
header_size = 8 + 128 * 8
available: dict[str, tuple[int, int]] = {}
for first in range(128):
    pair = 8 + first * 8
    start = int.from_bytes(raw[pair : pair + 4], "little") - header_size
    end = int.from_bytes(raw[pair + 4 : pair + 8], "little") - header_size
    if start < 0 or end < start:
        if start == end == -header_size:
            continue
        raise SystemExit("invalid Python regex name-table bucket")
    pos = start
    previous = ""
    while pos < end:
        prefix, size = raw[header_size + pos], raw[header_size + pos + 1]
        pos += 2
        suffix = raw[header_size + pos : header_size + pos + size].decode("ascii")
        pos += size
        codepoint = int.from_bytes(raw[header_size + pos : header_size + pos + 3], "big")
        minor = raw[header_size + pos + 3]
        pos += 4
        name = previous[:prefix] + suffix
        available[name] = (codepoint, minor)
        previous = name

name_program = r'''
import unicodedata as u
print("\n".join(f"{u.name(chr(cp)).upper()}\t{cp:X}" for cp in range(0x110000) if u.name(chr(cp),None)))
'''
canonical = subprocess.check_output([str(interpreter), "-c", name_program], text=True)
for line in canonical.splitlines():
    name, codepoint = line.split("\t")
    available.setdefault(name, (int(codepoint, 16), 14))
for line in ALIASES.read_text(encoding="utf-8").splitlines():
    body = line.split("#", 1)[0].strip()
    if body:
        codepoint, alias, _kind = (field.strip() for field in body.split(";"))
        available.setdefault(alias.upper(), (int(codepoint, 16), 14))

records = bytearray()
offsets: dict[int, tuple[int, int]] = {}
active_first: int | None = None
bucket_start = 0
previous = ""
for name in sorted(available):
    first = ord(name[0])
    if first != active_first:
        if active_first is not None:
            offsets[active_first] = (bucket_start, len(records))
        active_first = first
        bucket_start = len(records)
        previous = ""
    prefix = 0
    while prefix < min(len(previous), len(name)) and previous[prefix] == name[prefix]:
        prefix += 1
    suffix = name[prefix:].encode("ascii")
    codepoint, minor = available[name]
    records.extend((prefix, len(suffix)))
    records.extend(suffix)
    records.extend(codepoint.to_bytes(3, "big"))
    records.append(minor)
    previous = name
if active_first is not None:
    offsets[active_first] = (bucket_start, len(records))
header = bytearray(b"UMFPNAM1")
for first in range(128):
    start, end = offsets.get(first, (0, 0))
    header.extend((header_size + start).to_bytes(4, "little"))
    header.extend((header_size + end).to_bytes(4, "little"))
NAMES.write_bytes(header + records)

# Freeze the official vendored CPython re_tests plus explicit 3.14 deltas and
# new Unicode 16 codepoint/casefold controls using CPython's own re module.
cases = []
for pattern, text, _outcome, *_ in __import__("runpy").run_path(
    str(FIXTURES / "re_tests.py")
)["tests"]:
    cases.append((pattern, text, "cpython-re_tests"))
cases.extend(
    [
        (r"\z", "", "python314-z-absolute-end"),
        (r"a\z", "a\n", "python314-z-strict-end"),
        (r"\B", "", "python314-negative-boundary-empty"),
        (r"\B", "a", "python314-negative-boundary-word"),
        (r"\B\z", "", "python314-boundary-and-end-empty"),
        (r"\w", "\U00001c89", "unicode16-new-letter-word"),
        (r"(?i)\U00001c89", "\U00001c8a", "unicode16-new-case-pair"),
        (r"\d", "\U0001e4f0", "unicode16-new-decimal-digit"),
        (r"\N{KAWI LETTER A}", "\U00011f04", "unicode16-new-name"),
    ]
)
oracle = r'''
import re,sys
for pattern,text,family in __import__('json').load(sys.stdin):
 try:match=re.search(pattern,text); status='N' if match is None else 'M'; span=(0,0) if match is None else match.span()
 except (re.error,ValueError,OverflowError,RecursionError):status='E';span=(0,0)
 def cps(value):return ','.join(str(ord(char)) for char in value)
 print('\t'.join((status,str(span[0]),str(span[1]),cps(pattern),cps(text),family)))
'''
encoded_cases = json.dumps(cases, ensure_ascii=True, separators=(",", ":"))
outcomes = subprocess.check_output(
    [str(interpreter), "-c", oracle], input=encoded_cases, text=True
)
(FIXTURES / "outcomes-3.14.tsv").write_text(outcomes, encoding="ascii")
print(
    json.dumps(
        {
            "python": version,
            "unicode": unicode_version,
            "tablesSha256": hashlib.sha256(TABLES.read_bytes()).hexdigest(),
            "namesSha256": hashlib.sha256(NAMES.read_bytes()).hexdigest(),
            "outcomesSha256": hashlib.sha256(outcomes.encode()).hexdigest(),
            "rows": len(outcomes.splitlines()),
            "interpreterSha256": interpreter_hash,
            "aliasSourceSha256": alias_hash,
            "generatorSha256": generator_hash,
        },
        sort_keys=True,
    )
)
