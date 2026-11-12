#!/usr/bin/env python3
"""Transport and publish the reviewed 0.10.11 registry archives."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import tarfile
import time
import tomllib
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

REPO = "DocumentDrivenDX/umf"
SOURCE = "09bbf7c447d5749fcf07010ea736d133f96264ff"
STAGING_TAG = "umf-v0.10.11-registry-candidates"
VERSION = "0.10.11"
NPM_NAME = "@documentdrivendx/umf-core"
NPM_ARCHIVE = "documentdrivendx-umf-core-0.10.11.tgz"
ADMISSIONS = Path(__file__).resolve().parent
AGENT = "DocumentDrivenDX-umf-registry-publisher/1"
CRATE_NAME = re.compile(r"umf-(?:[a-z0-9]+-)*[a-z0-9]+")
SEMVER = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
SHA256 = re.compile(r"[a-f0-9]{64}")
CRATE_UPLOAD_LIMIT = 10 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def admission(registry):
    path = ADMISSIONS / f"admit-01011-{registry}.json"
    value = json.loads(path.read_text())
    require(value["source"] == SOURCE and value["version"] == VERSION, "Incorrect release admission")
    records = value["archives"]
    require(records and len({record["file"] for record in records}) == len(records),
            "Missing or duplicate admitted archive")
    if registry == "npm":
        require([(r["name"], r["version"], r["file"]) for r in records] ==
                [(NPM_NAME, VERSION, NPM_ARCHIVE)], "Incorrect npm package identity")
    else:
        require(records[-1]["name"] == "umf-core" and records[-1]["version"] == VERSION,
                "The final admitted crate must be umf-core 0.10.11")
        for r in records:
            require(CRATE_NAME.fullmatch(r["name"]) and SEMVER.fullmatch(r["version"]) and
                    r["file"] == f'{r["name"]}-{r["version"]}.crate', "Incorrect crate identity")
    for r in records:
        require(SHA256.fullmatch(r["sha256"]) and type(r["bytes"]) is int and r["bytes"] > 0,
                "Incorrect archive digest or size")
    return records


def gh_api(resource, *, binary=False, output=None):
    command = ["gh", "api", "--hostname", "github.com", resource]
    if binary:
        command += ["-H", "Accept: application/octet-stream"]
    return subprocess.run(command, check=True, stdout=output or subprocess.PIPE).stdout


def check_archive(path, record):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size == record["bytes"]
            and digest(path) == record["sha256"], f"Archive differs from admission: {path.name}")


def stage(records, directory, release_id):
    require(release_id.isascii() and release_id.isdecimal(), "Supply the numeric GitHub draft release ID")
    root = f"repos/{REPO}/releases"
    release = json.loads(gh_api(f"{root}/{release_id}"))
    require(release["tag_name"] == STAGING_TAG and release["draft"] is True
            and release["target_commitish"] == SOURCE, "Unexpected registry staging release")
    directory.mkdir()
    for record in records:
        matches = [asset for asset in release["assets"] if asset["name"] == record["file"]]
        require(len(matches) == 1, f'Missing or duplicate GitHub asset {record["file"]}')
        asset = matches[0]
        require(asset["state"] == "uploaded" and asset["size"] == record["bytes"] and
                asset["digest"] == "sha256:" + record["sha256"], f'GitHub digest differs for {record["file"]}')
        archive = directory / record["file"]
        with archive.open("xb") as stream:
            gh_api(f'{root}/assets/{asset["id"]}', binary=True, output=stream)
        check_archive(archive, record)
        print(f"Verified {archive.name}")


def public_request(url, *, missing_ok=False):
    request = Request(url, headers={"User-Agent": AGENT, "Cache-Control": "no-cache"})
    try:
        return urlopen(request, timeout=30)
    except HTTPError as error:
        if missing_ok and error.code == 404:
            return None
        raise


def verify_download(url, host, record):
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == host and not parsed.username, "Unexpected archive host")
    with public_request(url) as response:
        require(urlsplit(response.geturl()).netloc == host, "Unexpected download redirect")
        require(hashlib.file_digest(response, "sha256").hexdigest() == record["sha256"],
                f'Registry bytes differ for {record["file"]}')


def npm_visible(record):
    url = f'https://registry.npmjs.org/{quote(record["name"], safe="@")}/{record["version"]}'
    response = public_request(url, missing_ok=True)
    if response is None:
        return False
    with response:
        package = json.load(response)
    require(package["name"] == record["name"] and package["version"] == record["version"],
            "Unexpected npm package identity")
    verify_download(package["dist"]["tarball"], "registry.npmjs.org", record)
    return True


def crate_visible(record):
    name = record["name"]
    response = public_request(f"https://index.crates.io/{name[:2]}/{name[2:4]}/{name}", missing_ok=True)
    if response is None:
        return False
    with response:
        records = [json.loads(line) for line in response if line.strip()]
    matches = [version for version in records if version["vers"] == record["version"]]
    if not matches:
        return False
    require(len(matches) == 1 and matches[0]["name"] == name and not matches[0]["yanked"]
            and matches[0]["cksum"] == record["sha256"], f'Conflicting crates.io version {record["file"]}')
    verify_download(f'https://static.crates.io/crates/{name}/{record["file"]}', "static.crates.io", record)
    return True


def crate_metadata(archive, record):
    def tar_text(path):
        member = root + "/" + path
        return tar.extractfile(member).read().decode()

    root = archive.stem
    with tarfile.open(archive, "r:gz") as tar:
        manifest = tomllib.loads(tar_text("Cargo.toml"))
        package = manifest["package"]
        require(package["name"] == record["name"] and package["version"] == record["version"],
                "Unexpected Cargo manifest identity")
        metadata = {key: package.get(key.replace("_", "-")) for key in (
            "description", "documentation", "homepage", "license", "license_file",
            "repository", "links", "rust_version",
        )}
        metadata.update(name=package["name"], vers=package["version"], deps=[],
                        features=manifest.get("features", {}), badges=manifest.get("badges", {}))
        for key in ("authors", "keywords", "categories"):
            metadata[key] = package.get(key, [])
        readme = package.get("readme") or None
        metadata.update(readme=tar_text(readme) if readme else None, readme_file=readme)
    for target, section in [(None, manifest), *manifest.get("target", {}).items()]:
        for table, kind in (("dependencies", "normal"), ("dev-dependencies", "dev"),
                            ("build-dependencies", "build")):
            for alias, dependency in section.get(table, {}).items():
                if isinstance(dependency, str):
                    dependency = {"version": dependency}
                allowed = {"version", "package", "default-features", "optional", "features"}
                require(not (dependency.keys() - allowed) and "version" in dependency,
                        f"Unsupported dependency metadata for {alias} in {archive.name}")
                name = dependency.get("package", alias)
                entry = dict(name=name, version_req=dependency["version"], kind=kind, target=target,
                             optional=dependency.get("optional", False),
                             default_features=dependency.get("default-features", True),
                             features=dependency.get("features", []))
                if "package" in dependency:
                    entry["explicit_name_in_toml"] = alias
                metadata["deps"].append(entry)
    require(metadata["description"] and (metadata["license"] or metadata["license_file"]),
            "crates.io requires a description and license")
    return metadata


def crate_payload(archive, record):
    metadata = json.dumps(crate_metadata(archive, record), separators=(",", ":")).encode()
    content = archive.read_bytes()
    require(len(metadata) + len(content) + 8 <= CRATE_UPLOAD_LIMIT,
            f"Crate publish payload exceeds 10 MiB: {archive.name}")
    return struct.pack("<I", len(metadata)) + metadata + struct.pack("<I", len(content)) + content


def upload_crate(payload, record):
    token = os.environ.get("CARGO_REGISTRY_TOKEN")
    require(token, "Set the crates-io environment's CARGO_REGISTRY_TOKEN secret")
    # HTTPSConnection sends the token only to crates.io and never follows redirects.
    connection = http.client.HTTPSConnection("crates.io", timeout=60)
    try:
        connection.request("PUT", "/api/v1/crates/new", body=payload,
                           headers={"Content-Type": "application/octet-stream", "Accept": "application/json",
                                    "User-Agent": AGENT, "Authorization": token})
        response = connection.getresponse()
        body = response.read(64 * 1024)
        try:
            result = json.loads(body)
        except (UnicodeError, ValueError):
            result = {}
        errors = result.get("errors", [])
        if not 200 <= response.status < 300 or errors:
            detail = " ".join(item.get("detail", "") for item in errors)
            detail = " ".join(detail.replace(token, "[redacted]").split())[:800]
            retry_after = response.getheader("Retry-After")
            retry = f" Retry-After: {retry_after}." if retry_after else ""
            raise ValueError(f'crates.io refused {record["file"]} (HTTP {response.status}).{retry} {detail}')
    finally:
        connection.close()


def wait_visible(visible, record, wait):
    deadline = time.monotonic() + wait
    while not visible(record):
        if time.monotonic() >= deadline:
            return False
        time.sleep(3)
    print(f'Verified public {record["file"]}')
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("stage", "publish", "verify"))
    parser.add_argument("registry", choices=("npm", "crates"))
    parser.add_argument("--directory", type=Path, default=Path("registry-candidates"))
    parser.add_argument("--release-id")
    args = parser.parse_args()
    records = admission(args.registry)
    if args.command == "stage":
        require(args.release_id, "Supply --release-id")
        stage(records, args.directory, args.release_id)
        return
    visible = npm_visible if args.registry == "npm" else crate_visible
    payloads = {}
    if args.command == "publish" and args.registry == "crates":
        for record in records:
            archive = args.directory / record["file"]
            check_archive(archive, record)
            payloads[archive.name] = crate_payload(archive, record)
    for record in records:
        if args.command == "publish":
            archive = args.directory / record["file"]
            if args.registry == "npm":
                check_archive(archive, record)
            if not visible(record):
                if args.registry == "npm":
                    require(os.environ.get("NODE_AUTH_TOKEN"), "Set the npm-core environment's NPM_TOKEN secret")
                    subprocess.run(["npm", "publish", str(archive.resolve()), "--access=public", "--ignore-scripts",
                                    "--registry=https://registry.npmjs.org"], check=True)
                else:
                    upload_crate(payloads[archive.name], record)
            # Companion crates must reach the index before their dependents.
            wait = 45 if args.registry == "crates" else 0
        else:
            wait = 0
        if wait_visible(visible, record, wait):
            continue
        pending = f'{record["file"]} is awaiting registry visibility. Use verify before any retry.'
        if args.command == "publish" and args.registry == "npm":
            # npm can accept the upload while its scan delays public visibility.
            print(f"::notice::{pending}")
        else:
            raise ValueError(pending)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from None
