# CPython 3.14.8 acquisition record

Acquired 2026-10-26T21:05:17Z through the connected GitHub public-repository API. The unmodified API JSON responses are retained alongside this record.

## Release source

- Release endpoint: `https://api.github.com/repos/actions/python-versions/releases/tags/3.14.8-36806082737`
- Release page: `https://github.com/actions/python-versions/releases/tag/3.14.8-36806082737`
- Release id: `400609475`; tag: `3.14.8-36806082737`; display name: `3.14.8`; published `2026-10-01T02:49:50Z`.
- Raw response: `release-3.14.8-36806082737.json`, SHA-256 `d7d8d41851a6a6489a9fc5b6b51e601e708cca26f1b0fe1791751371dc7cf0a0`.

## Linux 24.04 x64 archive

- Asset API endpoint: `https://api.github.com/repos/actions/python-versions/releases/assets/602296995`
- API-reported name: `python-3.14.8-linux-24.04-x64.tar.gz`; size: `110382248` bytes; digest: `sha256:fa74abc70a55c10f6631967784878704eef81bbde9b8ec27469534f6ba997cb3`.
- Download URL: `https://github.com/actions/python-versions/releases/download/3.14.8-36806082737/python-3.14.8-linux-24.04-x64.tar.gz`
- Raw asset response: `asset-602296995.json`, SHA-256 `bd1ade7f0c55dc6f8ac8ecc3af88d6d66646e8c09841dede5b0d73922ede7d00`.
- Downloaded file: `python-3.14.8-linux-24.04-x64.tar.gz`, size `110382248` bytes, independently measured SHA-256 `fa74abc70a55c10f6631967784878704eef81bbde9b8ec27469534f6ba997cb3`.
- Standard-library tar metadata/read verified regular executable member `./bin/python3.14`, mode `0755`, size `17752` bytes, streamed SHA-256 `a5230d8adbd26c2185d77fb003597c4ee9c44c2369fc179122ff7c3a3a58ae59`.
- The archive's text `setup.sh` declares version `3.14.8`, copies this tree to `$RUNNER_TOOL_CACHE/Python/3.14.8/x64`, and uses `bin/python3.14` for the installed Python command. The script and executable were not run.

## Matching macOS arm64 asset

- Asset API endpoint: `https://api.github.com/repos/actions/python-versions/releases/assets/602296948`
- API-reported name: `python-3.14.8-darwin-arm64.tar.gz`; size: `74568814` bytes; digest: `sha256:88379ff8be11ec05986bf384205f00092b4b46975f40321d8567a16a7c2e8d5f`.
- Download URL: `https://github.com/actions/python-versions/releases/download/3.14.8-36806082737/python-3.14.8-darwin-arm64.tar.gz`
- Raw asset response: `asset-602296948.json`, SHA-256 `c16f8a1b0a887619298c6c3819fe45faa5fddc4909177c6e25f0361f004be21e`.
- The actions/python-versions release lists this exact Darwin arm64 asset for the same 3.14.8 release; its README describes Python >=3.11 macOS binaries as official universal2 binaries. No macOS archive was downloaded.

## Unicode profile

- The official Python 3.14 “What’s New” documentation says the Unicode database was updated to `16.0.0`: `https://docs.python.org/3/whatsnew/3.14.html`.
- This identifies the expected UCD version for the exact 3.14.8 interpreter; runtime confirmation with the acquired interpreter remains intentionally unperformed pending the hosted generation recipe.

## Scope

The Linux archive was downloaded only to establish official byte identity and inspect archive-member metadata/hash with tar and Python's standard-library `tarfile`/`hashlib`. No archive member was extracted or executed; no candidate Python, setup script, package code, tests, imports, or generators were run. The `curl` operation was limited to the API-reported exact byte size.
