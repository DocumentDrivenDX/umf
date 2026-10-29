#!/usr/bin/env python3
"""Compare every installed Weft package member with the exact selected wheel."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, pathlib, stat, zipfile

MEMBER_CAP = 64 * 1024 * 1024

def digest(path: pathlib.Path, cap: int) -> tuple[str, int]:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size > cap:
        raise RuntimeError("unsafe or oversized wheel member")
    h = hashlib.sha256(); n = 0
    with path.open("rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            n += len(block)
            if n > cap: raise RuntimeError("wheel member expanded beyond bound")
            h.update(block)
    if n != st.st_size: raise RuntimeError("wheel member changed while hashing")
    return h.hexdigest(), n

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--wheel", required=True, type=pathlib.Path)
    p.add_argument("--wheel-sha256", required=True)
    p.add_argument("--wheel-size", required=True, type=int)
    args = p.parse_args()
    wheel_sha, wheel_size = digest(args.wheel, 64 * 1024 * 1024)
    if (wheel_sha, wheel_size) != (args.wheel_sha256, args.wheel_size):
        raise RuntimeError("final Weft wheel bytes differ from frozen cohort input")
    spec = importlib.util.find_spec("weft")
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError("installed Weft package location unavailable")
    package = pathlib.Path(next(iter(spec.submodule_search_locations))).resolve(strict=True)
    expected_paths = set(); rows = []
    with zipfile.ZipFile(args.wheel) as archive:
        for info in archive.infolist():
            name = info.filename
            if info.is_dir() or not name.startswith("weft/"): continue
            if name.startswith("weft/../") or "\\" in name or info.file_size > MEMBER_CAP:
                raise RuntimeError("unsafe or oversized immutable wheel member")
            rel = pathlib.PurePosixPath(name).relative_to("weft")
            target = package.joinpath(*rel.parts)
            if target.resolve(strict=True) != target or package not in target.parents:
                raise RuntimeError("installed Weft member escapes package or uses symlink")
            h = hashlib.sha256(); n = 0
            with archive.open(info) as src:
                for block in iter(lambda: src.read(65536), b""):
                    n += len(block)
                    if n > MEMBER_CAP: raise RuntimeError("wheel member expanded beyond bound")
                    h.update(block)
            expected = h.hexdigest(); actual, actual_n = digest(target, MEMBER_CAP)
            if (actual, actual_n, n) != (expected, info.file_size, info.file_size):
                raise RuntimeError("installed Weft member differs from wheel: " + name)
            expected_paths.add(rel.as_posix())
            rows.append({"wheelPath": name, "sizeBytes": actual_n, "sha256": actual})
    if not rows: raise RuntimeError("final wheel has no Weft package members")
    installed_paths = set()
    for base, dirs, files in __import__("os").walk(package, followlinks=False):
        bp = pathlib.Path(base)
        if any((bp / d).is_symlink() for d in dirs): raise RuntimeError("installed package has symlink directory")
        for name in files:
            path = bp / name
            if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
                raise RuntimeError("installed package has non-regular file")
            installed_paths.add(path.relative_to(package).as_posix())
    if installed_paths != expected_paths:
        raise RuntimeError("installed Weft package member roster differs from final wheel")
    print(json.dumps({"wheelPath": str(args.wheel), "wheelSha256": wheel_sha,
        "wheelSizeBytes": wheel_size, "installedPackagePath": str(package),
        "memberCount": len(rows), "members": sorted(rows, key=lambda x: x["wheelPath"]),
        "memberRosterExact": True}, sort_keys=True, separators=(",", ":")))
    return 0

if __name__ == "__main__": raise SystemExit(main())
