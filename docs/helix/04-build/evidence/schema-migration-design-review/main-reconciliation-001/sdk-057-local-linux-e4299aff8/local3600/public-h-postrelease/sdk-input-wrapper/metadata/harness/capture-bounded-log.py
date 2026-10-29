#!/usr/bin/env python3
"""Drain command output while retaining at most the remaining aggregate log budget."""
import pathlib
import sys

target = pathlib.Path(sys.argv[1])
cap = int(sys.argv[2])
marker = b"\n[LOG TRUNCATED: local SDK producer aggregate log cap reached]\n"
stored = 0
truncated = False
failed = False
try:
    out = target.open('wb', buffering=0)
except OSError:
    out = None
    failed = True
limit = max(0, cap - len(marker))
while True:
    chunk = sys.stdin.buffer.read(65536)
    if not chunk:
        break
    if out is None:
        continue
    room = max(0, limit - stored)
    piece = chunk[:room]
    if piece:
        try:
            out.write(piece)
            stored += len(piece)
        except OSError:
            out = None
            failed = True
    if len(chunk) > room:
        truncated = True
if out is not None:
    try:
        if truncated:
            out.write(marker[:max(0, cap - stored)])
        out.close()
    except OSError:
        failed = True
sys.exit(74 if failed else 75 if truncated else 0)
