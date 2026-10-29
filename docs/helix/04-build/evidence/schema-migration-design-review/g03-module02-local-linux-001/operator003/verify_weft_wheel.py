#!/usr/bin/env python3
"""Verify installed Weft wrapper/native files match the selected immutable wheel."""
from __future__ import annotations
import hashlib, importlib.util, json, os, pathlib, stat, zipfile

WHEEL=pathlib.Path('/cohort/aggregate/mirror/files/umf_weft-0.4.55+g03.a96e4f29262e-cp39-abi3-manylinux_2_34_x86_64.whl')
EXPECTED_WHEEL_SHA='51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e'
CAP=20*1024*1024
MEMBER_CAP=64*1024*1024

def fail(msg): raise RuntimeError(msg)
def hash_file(path):
    st=path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size>MEMBER_CAP: fail('unsafe/oversized installed wheel member')
    h=hashlib.sha256(); n=0
    with path.open('rb') as f:
        for block in iter(lambda:f.read(65536),b''):
            n+=len(block)
            if n>MEMBER_CAP: fail('installed wheel member exceeds bound')
            h.update(block)
    if n!=st.st_size: fail('installed wheel member changed while hashing')
    return h.hexdigest(),n

wheel_hash,wheel_size=hash_file(WHEEL)
if wheel_hash!=EXPECTED_WHEEL_SHA: fail('selected immutable Weft wheel hash mismatch')
spec=importlib.util.find_spec('weft')
if spec is None or not spec.submodule_search_locations: fail('installed Weft package location unavailable')
package=pathlib.Path(next(iter(spec.submodule_search_locations))).resolve(strict=True)
members=[]
expected_paths=set()
with zipfile.ZipFile(WHEEL) as archive:
    for info in archive.infolist():
        name=info.filename
        if info.is_dir() or not name.startswith('weft/'): continue
        if name.startswith('weft/../') or '\\' in name: fail('unsafe wheel member path')
        rel=pathlib.PurePosixPath(name).relative_to('weft')
        target=package.joinpath(*rel.parts)
        expected_paths.add(rel.as_posix())
        if target.resolve(strict=True)!=target or package not in target.parents: fail('installed Weft member has symlink/noncanonical path')
        if info.file_size>MEMBER_CAP: fail('immutable wheel member exceeds 64 MiB member bound')
        member_hash=hashlib.sha256(); member_size=0
        with archive.open(info) as source:
            for block in iter(lambda:source.read(65536),b''):
                member_hash.update(block); member_size+=len(block)
                if member_size>MEMBER_CAP: fail('immutable wheel member expanded past 64 MiB bound')
        expected=member_hash.hexdigest()
        actual,size=hash_file(target)
        if actual!=expected or size!=info.file_size or member_size!=info.file_size:
            fail('installed Weft member differs from immutable wheel: '+name)
        members.append({'wheelPath':name,'sizeBytes':size,'sha256':actual})
if not members: fail('immutable wheel contains no Weft wrapper/native members')
installed_paths=set()
for base,dirs,files in os.walk(package,followlinks=False):
    base_path=pathlib.Path(base)
    for directory in dirs:
        if (base_path/directory).is_symlink(): fail('installed Weft package contains a symlink directory')
    for filename in files:
        path=base_path/filename
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode): fail('installed Weft package contains a non-regular member')
        installed_paths.add(path.relative_to(package).as_posix())
if installed_paths!=expected_paths:
    fail('installed Weft package member roster differs from immutable wheel')
print(json.dumps({'wheelPath':str(WHEEL),'wheelSizeBytes':wheel_size,'wheelSha256':wheel_hash,
                  'installedPackagePath':str(package),'memberCount':len(members),'members':members,
                  'memberRosterExact':True},
                 sort_keys=True,separators=(',',':')))
