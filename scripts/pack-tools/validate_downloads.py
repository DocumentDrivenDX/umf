#!/usr/bin/env python3
"""Check an actual browser ZIP against the file hashes shown by the workbench."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

folder = Path(sys.argv[1])
expected = json.loads((folder / 'download-hashes.json').read_text())
with zipfile.ZipFile(folder / 'commerce.zip') as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'Duplicate archive paths'
    assert set(names) == set(expected), 'Archive membership differs from displayed output'
    assert archive.testzip() is None, 'ZIP CRC mismatch'
    for name in names:
        assert hashlib.sha256(archive.read(name)).hexdigest() == expected[name], name
print(json.dumps({'downloadedZipFiles':len(names), 'displayedHashParity':'passed', 'crc':'passed'}))
