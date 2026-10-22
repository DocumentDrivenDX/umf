#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generate the regex Unicode property tables from pinned CPython runtimes.

Run with three interpreter paths, in order: Python 3.11, 3.12, and 3.13.
The generated file records each runtime's actual unicodedata release.
"""
from __future__ import annotations

import pathlib
import hashlib
import subprocess
import sys


if len(sys.argv) != 4:
    raise SystemExit("usage: generate_python_re_tables.py PYTHON311 PYTHON312 PYTHON313")

names = ("V3_11", "V3_12", "V3_13")
alias_sources = (
    "NameAliases-14.0.0.txt",
    "NameAliases-15.0.0.txt",
    "NameAliases-15.1.0.txt",
)
out = [
    "// SPDX-License-Identifier: MIT OR Apache-2.0\n"
    "// Generated from CPython unicodedata tables, pinned per interpreter release.\n"
    "// Regenerate with tools/generate_python_re_tables.py PYTHON311 PYTHON312 PYTHON313.\n"
]
name_maps: list[dict[str, int]] = []
tool_dir = pathlib.Path(__file__).resolve().parent
program = r'''
import unicodedata as u
def ranges(pred):
 out=[]; start=prev=None
 for cp in range(0x110000):
  if pred(chr(cp)):
   if start is None: start=cp
   prev=cp
  elif start is not None: out.append((start,prev)); start=prev=None
 if start is not None: out.append((start,prev))
 return out
def emit_ranges(name, vals):
 print(f"pub(super) static {name}: &[(u32,u32)] = &["+','.join(f"(0x{a:X},0x{b:X})" for a,b in vals)+"];")
print("// Unicode",u.unidata_version)
emit_ranges("DIGIT_"+PROFILE,ranges(str.isdecimal))
emit_ranges("WORD_"+PROFILE,ranges(str.isalnum))
emit_ranges("SPACE_"+PROFILE,ranges(str.isspace))
emit_ranges("IDSTART_"+PROFILE,ranges(lambda c: c == '_' or c.isidentifier()))
emit_ranges("IDCONTINUE_"+PROFILE,ranges(lambda c: ('A'+c).isidentifier()))
lower=[]
for cp in range(0x110000):
 s=chr(cp).lower()
 if len(s)==1 and ord(s)!=cp: lower.append((cp,ord(s)))
lower.append((0x130,0x69))
lower.sort()
print("pub(super) static LOWER_"+PROFILE+": &[(u32,u32)] = &["+','.join(f"(0x{a:X},0x{b:X})" for a,b in lower)+"];")
reverse=sorted((target,source) for source,target in lower)
print("pub(super) static LOWER_REVERSE_"+PROFILE+": &[(u32,u32)] = &["+','.join(f"(0x{a:X},0x{b:X})" for a,b in reverse)+"];")
casefix=sorted((source,target) for source,targets in __import__('re._casefix',fromlist=['_EXTRA_CASES'])._EXTRA_CASES.items() for target in targets)
casefix += [(0x130,0x69),(0x212A,0x6B)]
casefix.sort()
print("pub(super) static CASEFIX_"+PROFILE+": &[(u32,u32)] = &["+','.join(f"(0x{a:X},0x{b:X})" for a,b in casefix)+"];")
reverse_casefix=sorted((target,source) for source,target in casefix)
print("pub(super) static CASEFIX_REVERSE_"+PROFILE+": &[(u32,u32)] = &["+','.join(f"(0x{a:X},0x{b:X})" for a,b in reverse_casefix)+"];")
'''
generator_hash = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
for name, interpreter in zip(names, sys.argv[1:]):
    interpreter_path = pathlib.Path(interpreter).resolve()
    executable_hash = hashlib.sha256(interpreter_path.read_bytes()).hexdigest()
    alias_path = tool_dir / "unicode" / alias_sources[len(name_maps)]
    alias_hash = hashlib.sha256(alias_path.read_bytes()).hexdigest()
    result = subprocess.run(
        [interpreter, "-c", f"PROFILE={name!r}\n" + program],
        check=True,
        capture_output=True,
        text=True,
    )
    unicode_version = result.stdout.splitlines()[0].removeprefix("// Unicode ")
    out.append(
        f"// CPython {interpreter_path.name}; Unicode {unicode_version}\n"
        f"// Interpreter executable SHA256: {executable_hash}\n"
        f"// Unicode name alias input {alias_path.name} SHA256: {alias_hash}\n"
        f"// Generator SHA256: {generator_hash}\n"
        + result.stdout + "\n"
    )
    names_result = subprocess.run(
        [
            interpreter,
            "-c",
            "import unicodedata as u\n"
            "print('\\n'.join(f'{u.name(chr(cp))}\\t{cp:X}' for cp in range(0x110000) if u.name(chr(cp), None)))",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    mapping = {
        line.split("\t")[0].upper(): int(line.split("\t")[1], 16)
        for line in names_result.stdout.splitlines()
    }
    for line in alias_path.read_text(encoding="utf-8").splitlines():
        body = line.split("#", 1)[0].strip()
        if not body:
            continue
        codepoint, alias, _kind = (field.strip() for field in body.split(";"))
        mapping.setdefault(alias.upper(), int(codepoint, 16))
    name_maps.append(mapping)
path = pathlib.Path(__file__).resolve().parents[1] / "src" / "python_re_tables.rs"
path.write_text("\n".join(out), encoding="utf-8")

# UCD names are sorted and prefix-compressed. Each first-byte bucket starts
# from an empty prefix so lookup can decode only that bucket. Unicode names
# are ASCII; version is the first CPython minor that contains a name.
available: dict[str, tuple[int, int]] = {}
for minor, mapping in zip((11, 12, 13), name_maps):
    for name, cp in mapping.items():
        old = available.get(name)
        if old is None or minor < old[1]:
            available[name] = (cp, minor)
records = bytearray()
bucket_offsets: dict[int, tuple[int, int]] = {}
previous = ""
active_first: int | None = None
bucket_start = 0
for name in sorted(available):
    first = ord(name[0])
    if first != active_first:
        if active_first is not None:
            bucket_offsets[active_first] = (bucket_start, len(records))
        active_first = first
        bucket_start = len(records)
        previous = ""
    prefix = 0
    while prefix < min(len(previous), len(name)) and previous[prefix] == name[prefix]:
        prefix += 1
    suffix = name[prefix:].encode("ascii")
    cp, minor = available[name]
    records.extend((prefix, len(suffix)))
    records.extend(suffix)
    records.extend(cp.to_bytes(3, "big"))
    records.append(minor)
    previous = name
if active_first is not None:
    bucket_offsets[active_first] = (bucket_start, len(records))
header_size = 8 + 128 * 8
header = bytearray(b"UMFPNAM1")
for first in range(128):
    start, end = bucket_offsets.get(first, (0, 0))
    header.extend((header_size + start).to_bytes(4, "little"))
    header.extend((header_size + end).to_bytes(4, "little"))
(path.parent / "python_re_names.dat").write_bytes(header + records)
