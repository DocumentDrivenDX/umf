#!/usr/bin/env python3
"""Closed, verification-first Codegen publisher. Never builds or stages releases.

Consumes the existing coupled umf-v0.10.8 release at production S. No production
admission is supplied by this source patch. OIDC belongs only to the workflow's
qualified, explicitly enabled upload job; no prior publisher pass is required.
"""
from __future__ import annotations

import argparse
import base64
import io
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import zipfile
from datetime import datetime
from email.parser import BytesParser
from pathlib import Path

import publish_core_pypi_release as core
from publish_access_pypi_release import decode, pointer, read_asset, require, safe_name, AccessReleaseError

REPOSITORY = "DocumentDrivenDX/umf"
SOURCE = "e3f38ef6f05ae636d2837f9d69f8d6805222664b"
TREE = "a21368a92df488882ef9771e4a1d92205267ddd3"
TAG = "umf-v0.10.8"
VERSION = "0.10.8"
DISTRIBUTION = "umf-codegen"
WORKFLOW = "publish-codegen-pypi.yml"
ADMISSION_PATH = ".github/release-admissions/umf-codegen-0.10.8.json"
FILES = {
    "umf_codegen-0.10.8-py3-none-any.whl": "0d21acef3171442b818a4ad1dfdbaf99cc0f0f5557e5c670d5ce56243235dbc5",
    "umf_codegen-0.10.8.tar.gz": "f094d73900004debf70516ab5f7e18fb84c564ba5861e305ae29fe021464c52d",
}
PROTOCOLS = {"engine": "umf-core-r2", "native": "umf-codegen-r3-seven-ops-nine-resources/1",
             "cli": "umf.codegen-cli/1", "resources": "umf.codegen-resources/1"}
RESOURCE_PINS = {
    "manifest": "5ebd51f10967ba1a92ed82784cef017ece06633ab158155c26247732f641837e",
    "releaseAuthority": "b9db9262cc627dd6f891d1490cd45e9563533d3ffc24834e6f6e1da24b030a53",
}
RESOURCE_NAMES = {"actions.package.json", "binding.package.json", "core.constraints.json",
    "core.domain-policy.json", "core.package-schema.json", "core.reference-schema.json", "core.schema.json",
    "saga.package.json", "stable-binding.package.json", "tables.package.json"}
MAX_ARCHIVE = 1024 * 1024
MAX_EXPANDED = 8 * 1024 * 1024
CORE_WORKFLOW = ".github/workflows/publish-pypi.yml"
CORE_SCOPES = {
    "publication": ("publish", "umf-core-pypi-publication-0.10.8", "publication-receipt.json"),
    "consumer": ("installed-consumer", "umf-core-pypi-consumer-0.10.8", "consumer-receipt.json"),
}
CORE_CONSUMER_REQUIRED = {
    "/schema": "pypi-consumer-receipt.v1", "/status": "passed", "/index": "https://pypi.org/simple",
    "/umf_core_version": "0.10.8", "/source_sha": SOURCE,
    "/nativeResourceInspection/profile": "umf.fresh-public-core-correspondence/1",
    "/nativeResourceInspection/status": "passed", "/nativeResourceInspection/sourceS": SOURCE,
    "/nativeResourceInspection/wheelSHA256": "2dd4f00869240b37aa89fb9009e0663bf4c78cde103995d9d5c6e6b2333d92dd",
    "/nativeResourceInspection/nativeSHA256": "7716d79ae0c85ac92ba679d531c213811fe66501397b0ec0f78e8bad53c296da",
    "/nativeResourceInspection/resourceManifestSHA256": "5eecd2e367ac58a38df0f4f32a8a7d9bef8020b8340dc4704583f7806d83d571",
    "/nativeResourceInspection/inspectionCases": 17, "/nativeResourceInspection/inspectionCalls": 51,
    "/nativeResourceInspection/requestCustodyPreserved": True, "/nativeResourceInspection/canonicalResources": True,
    "/nativeResourceInspection/engineVersion": "umf-core-r2",
    "/nativeResourceInspection/codegenProtocol": "umf-codegen-r3-seven-ops-nine-resources/1",
    "/nativeResourceInspection/semanticCore": "0.10.0",
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def proof(directory, reference, *, source=True):
    require(type(reference) is dict and set(reference) == {"file", "sha256", "assertions"}, "closed proof reference required")
    value = decode(read_asset(directory, reference["file"], reference["sha256"]))
    assertions = reference["assertions"]
    require(type(assertions) is dict and assertions, "reviewed actual proof assertions required")
    # Actual receipts use different source/controller fields. The reviewed main
    # admission selects the meaningful original-S pointer, never rewrites a receipt.
    require(not source or any(v == SOURCE for v in assertions.values()), "proof must bind actual production S")
    require(any(v is True or v == "passed" for v in assertions.values()), "actual positive proof required")
    for path, expected in assertions.items():
        actual = pointer(value, path)
        require(type(actual) is type(expected) and actual == expected, "proof assertion differs: " + path)
    return value


def require_deep_core_consumer(value):
    # Mandatory controller contract, independent of any admission assertions.
    # These are new actual proof fields, not an upgrade of old shallow receipts.
    require(type(value) is dict, "original public Core consumer object required")
    for path, expected in CORE_CONSUMER_REQUIRED.items():
        actual = pointer(value, path)
        require(type(actual) is type(expected) and actual == expected, "mandatory deep public Core proof differs: " + path)


def actions_reference(ref, role):
    require(type(ref) is dict and set(ref) == {"file", "sha256", "assertions", "actions"}, "original Actions receipt reference required")
    safe_name(ref["file"])
    require(ref["file"].endswith(".json") and ref["file"] not in {"release-pins.json", "source-receipt.json"}, "reserved Actions receipt filename")
    a = ref["actions"]
    require(type(a) is dict and set(a) == {"run_id", "run_attempt", "job_id", "controller_sha", "workflow_sha256",
        "artifact_id", "artifact_name", "artifact_sha256", "member", "members"}, "closed Actions provenance required")
    require(all(type(a[k]) is int and a[k] > 0 for k in ("run_id", "run_attempt", "job_id", "artifact_id")), "positive exact Actions identities required")
    require(type(a["controller_sha"]) is str and core.COMMIT.fullmatch(a["controller_sha"]), "exact publisher controller SHA required")
    require(all(type(v) is str and core.SHA.fullmatch(v) for v in (ref["sha256"], a["artifact_sha256"], a["workflow_sha256"])), "Actions digest pins required")
    _, name, member = CORE_SCOPES[role]
    members = {member, "source-receipt.json"} if role == "publication" else {member}
    require(a["artifact_name"] == name and a["member"] == member and type(a["members"]) is dict
        and set(a["members"]) == members and a["members"][member] == ref["sha256"]
        and all(type(h) is str and core.SHA.fullmatch(h) for h in a["members"].values()), "original artifact scope/member hashes differ")
    return a


def actions_pair(value):
    require(type(value["core"]) is dict and set(value["core"]) == set(CORE_SCOPES), "qualified public Core Actions proof pair required")
    publication = actions_reference(value["core"]["publication"], "publication")
    consumer = actions_reference(value["core"]["consumer"], "consumer")
    # Bind the new original deep consumer to the same real publisher attempt.
    # Its source/native fields must be produced before first upload; no legacy
    # shallow receipt is rewritten or upgraded by this reader.
    require(all(publication[k] == consumer[k] for k in ("run_id", "run_attempt", "controller_sha", "workflow_sha256"))
        and publication["artifact_id"] != consumer["artifact_id"] and publication["job_id"] != consumer["job_id"]
        and value["core"]["publication"]["file"] != value["core"]["consumer"]["file"], "Core receipt run/attempt/scope pair differs")


def actions_zip_name(ref):
    return "core-actions-" + str(ref["actions"]["artifact_id"]) + ".zip"


def actions_metadata(a):
    prefix = "repos/" + REPOSITORY + "/"
    def get(path):
        return decode(subprocess.check_output(["gh", "api", prefix + path]))
    attempt = "actions/runs/" + str(a["run_id"]) + "/attempts/" + str(a["run_attempt"])
    workflow = get("contents/" + CORE_WORKFLOW + "?ref=" + a["controller_sha"])
    require(type(workflow) is dict and workflow.get("type") == "file" and workflow.get("path") == CORE_WORKFLOW
            and workflow.get("encoding") == "base64", "publisher workflow source missing")
    return {"run": get(attempt), "jobs": get(attempt + "/jobs?per_page=100"),
            "job": get("actions/jobs/" + str(a["job_id"])), "artifact": get("actions/artifacts/" + str(a["artifact_id"])),
            "workflow": base64.b64decode(workflow["content"])}


def verify_actions_metadata(ref, role, meta):
    a = actions_reference(ref, role)
    require(type(meta) is dict and set(meta) == {"run", "job", "jobs", "artifact", "workflow"}
        and all(type(meta[k]) is dict for k in ("run", "job", "jobs", "artifact"))
        and type(meta["workflow"]) is bytes, "actual Actions provenance metadata missing")
    run, job, jobs, artifact = (meta[k] for k in ("run", "job", "jobs", "artifact"))
    require(type(run.get("repository")) is dict and type(run["repository"].get("owner")) is dict
        and type(run.get("head_repository")) is dict, "actual Actions repository identity missing")
    require(run.get("id") == a["run_id"] and run.get("run_attempt") == a["run_attempt"]
        and run.get("head_sha") == a["controller_sha"] and run.get("head_branch") == "main"
        and run.get("path") == CORE_WORKFLOW and run.get("event") == "workflow_dispatch"
        and run.get("status") == "completed" and run.get("conclusion") == "success"
        and run.get("repository", {}).get("full_name") == REPOSITORY
        and run.get("repository", {}).get("id") == 1382276802
        and run.get("repository", {}).get("owner", {}).get("id") == 273466046
        and run.get("head_repository", {}).get("id") == 1382276802, "actual publisher run/controller/repository differs")
    require(digest(meta["workflow"]) == a["workflow_sha256"], "actual original publisher workflow bytes differ")
    rows = jobs.get("jobs")
    require(type(rows) is list and all(type(r) is dict for r in rows) and jobs.get("total_count") == len(rows)
        and len([r for r in rows if r.get("id") == a["job_id"]]) == 1, "job is absent from exact run attempt")
    require(job.get("id") == a["job_id"] and job.get("run_id") == a["run_id"]
        and job.get("head_sha") == a["controller_sha"] and job.get("name") == CORE_SCOPES[role][0]
        and job.get("status") == "completed" and job.get("conclusion") == "success"
        and all(next(r for r in rows if r.get("id") == a["job_id"]).get(k) == job.get(k)
                for k in ("id", "run_id", "name", "status", "conclusion")), "actual publisher job/scope differs")
    origin = artifact.get("workflow_run", {})
    require(type(origin) is dict and artifact.get("id") == a["artifact_id"] and artifact.get("name") == a["artifact_name"]
        and artifact.get("expired") is False and artifact.get("digest") == "sha256:" + a["artifact_sha256"]
        and origin.get("id") == a["run_id"] and origin.get("head_sha") == a["controller_sha"]
        and origin.get("head_branch") == "main" and origin.get("repository_id") == 1382276802
        and origin.get("head_repository_id") == 1382276802, "actual artifact identity/run/digest differs")
    times = (job.get("started_at"), artifact.get("created_at"), job.get("completed_at"))
    require(all(type(v) is str for v in times), "original job/artifact timestamps missing")
    try:
        start, created, end = (datetime.fromisoformat(v.replace("Z", "+00:00")) for v in times)
        require(all(v.tzinfo is not None for v in (start, created, end)) and start <= created <= end,
                "artifact creation is outside original successful job attempt")
    except (KeyError, ValueError):
        raise AccessReleaseError("invalid original job/artifact timestamps") from None


def original_actions_members(raw, ref, role):
    a = actions_reference(ref, role)
    require(len(raw) <= MAX_EXPANDED and digest(raw) == a["artifact_sha256"], "original Actions archive bytes differ")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        rows = archive.infolist()
        require(len(rows) == len(a["members"]) and {r.filename for r in rows} == set(a["members"])
            and sum(r.file_size for r in rows) <= MAX_EXPANDED
            and all(not r.is_dir() and stat.S_IFMT(r.external_attr >> 16) in (0, stat.S_IFREG) for r in rows),
            "original Actions artifact member inventory/links differ")
        values = {name: archive.read(name) for name in a["members"]}
    require(all(digest(values[n]) == h for n, h in a["members"].items()), "original Actions member bytes differ")
    return values


def core_actions_proof(assets, ref, role):
    a = actions_reference(ref, role)
    verify_actions_metadata(ref, role, actions_metadata(a))
    members = original_actions_members(read_asset(assets, actions_zip_name(ref), a["artifact_sha256"]), ref, role)
    require(read_asset(assets, ref["file"], ref["sha256"]) == members[a["member"]], "receipt substituted for original Actions member")
    value = proof(assets, {k: ref[k] for k in ("file", "sha256", "assertions")}, source=role == "publication")
    require(type(value) is dict, "original Core receipt must be an object")
    if role == "publication":
        source = decode(members["source-receipt.json"])
        require(type(source) is dict and source.get("schema") == "pypi-release-source.v1" and source.get("status") == "verified"
            and source.get("repository") == REPOSITORY and source.get("source_sha") == SOURCE
            and source.get("tag") == TAG and source.get("distribution") == "umf-core"
            and source.get("version") == VERSION and source.get("files") == value.get("files"),
            "original Core source/publication scope differs")
    else:
        require_deep_core_consumer(value)
    return value


def fetch_core_proofs(value, assets):
    actions_pair(value)
    assets.mkdir(parents=True, exist_ok=True)
    for role, ref in value["core"].items():
        a = actions_reference(ref, role)
        verify_actions_metadata(ref, role, actions_metadata(a))
        raw = subprocess.check_output(["gh", "api", "--allow-escape-sequences", "repos/" + REPOSITORY
            + "/actions/artifacts/" + str(a["artifact_id"]) + "/zip"])
        members = original_actions_members(raw, ref, role)
        for name, data in ((actions_zip_name(ref), raw), (ref["file"], members[a["member"]])):
            path = assets / name
            require(not path.is_symlink(), "unsafe Actions destination")
            if path.exists():
                require(path.is_file() and path.read_bytes() == data, "refuse replacing different retained Actions bytes")
            else:
                with path.open("xb") as stream: stream.write(data)


def admission_identity(raw, expected_hash):
    require(digest(raw) == expected_hash, "reviewed admission digest differs")
    value = decode(raw)
    require(type(value) is dict and set(value) == {"schema", "repository", "tag", "source_sha", "source_tree",
        "distribution", "version", "files", "protocols", "resources", "release_pins_sha256", "qualification",
        "gates", "core", "publisher"}, "closed reviewed Codegen admission required")
    require(value["schema"] == "umf.codegen-publication-admission/1" and value["repository"] == REPOSITORY
        and value["tag"] == TAG and value["source_sha"] == SOURCE and value["source_tree"] == TREE
        and value["distribution"] == DISTRIBUTION and value["version"] == VERSION and value["files"] == FILES,
        "Codegen source/tag/package/archive identity differs")
    require(value["protocols"] == PROTOCOLS and value["resources"] == RESOURCE_PINS, "protocol/resource identity differs")
    require(type(value["release_pins_sha256"]) is str and core.SHA.fullmatch(value["release_pins_sha256"]), "release-pins hash required")
    return value


def admission(raw, expected_hash, assets):
    value = admission_identity(raw, expected_hash)
    require(type(value["gates"]) is dict and set(value["gates"]) == {"companion-installed", "companion-sdist"},
            "actual scoped companion installed and sdist proof required")
    for reference in value["gates"].values():
        proof(assets, reference)
    qualification = proof(assets, value["qualification"])
    require(type(qualification) is dict and qualification.get("files") == FILES and qualification.get("protocols") == PROTOCOLS
            and qualification.get("resources") == RESOURCE_PINS, "actual qualification must bind exact archives/protocol/resources")
    actions_pair(value)
    published = core_actions_proof(assets, value["core"]["publication"], "publication")
    require(type(published) is dict and published.get("schema") == "pypi-publication-receipt.v1" and published.get("status") == "passed"
        and published.get("source_sha") == SOURCE and published.get("tag") == TAG and published.get("distribution") == "umf-core"
        and published.get("version") == VERSION and published.get("registry") == "pypi"
        and published.get("registry_bytes_verified") is True and type(published.get("files")) is dict
        and published["files"], "actual qualified public Core0.10.8 publication missing")
    require(CORE_CONSUMER_REQUIRED["/nativeResourceInspection/wheelSHA256"] in published["files"].values(),
            "deep public Core witness wheel is absent from actual publication")
    consumer = core_actions_proof(assets, value["core"]["consumer"], "consumer")
    require_deep_core_consumer(consumer)
    publisher = value["publisher"]
    require(type(publisher) is dict and set(publisher) == {"repository", "distribution", "workflow", "environment", "proof"}
        and publisher["repository"] == REPOSITORY and publisher["distribution"] == DISTRIBUTION
        and publisher["workflow"] == WORKFLOW and publisher["environment"] == "pypi", "dedicated publisher identity differs")
    if publisher["proof"] is not None:
        scoped = proof(assets, publisher["proof"], source=False)
        require(type(scoped) is dict and all(scoped.get(k) == publisher[k] for k in ("repository", "distribution", "workflow", "environment"))
                and scoped.get("status") == "passed", "provided scoped publisher proof differs")
    return value


def metadata(raw):
    item = BytesParser().parsebytes(raw)
    require(all(len(item.get_all(n, [])) == 1 for n in ("Name", "Version", "Requires-Python")), "ambiguous package metadata")
    require(re.sub(r"[-_.]+", "-", item["Name"]).lower() == DISTRIBUTION and item["Version"] == VERSION,
            "Codegen distribution/version differs")
    require(set(re.sub(r"\s", "", item["Requires-Python"]).split(",")) == {">=3.11", "<3.15"}, "Python range differs")
    require(item.get_all("Requires-Dist") == ["umf-core==0.10.8"], "exact Core-only dependency required")


def archive_members(names, read, wheel):
    require(len(names) == len(set(names)) and all(not n.startswith("/") and "\\" not in n and ":" not in n
        and all(p not in ("", ".", "..") for p in n.split("/")) for n in names), "duplicate or unsafe archive member")
    require(not any(n.lower().endswith((".so", ".pyd", ".dll", ".dylib")) for n in names), "Codegen must remain pure Python")
    root = "umf_codegen-" + VERSION
    prefix = "" if wheel else root + "/src/"
    package = prefix + "umf_codegen/"
    release = read(package + "_release.py")
    manifest_raw = read(package + "_resources/manifest.json")
    require(digest(release) == RESOURCE_PINS["releaseAuthority"] and digest(manifest_raw) == RESOURCE_PINS["manifest"],
            "release authority or resource manifest differs")
    manifest = decode(manifest_raw)
    require(type(manifest) is dict and set(manifest) == {"files", "profile"} and manifest["profile"] == PROTOCOLS["resources"]
            and type(manifest["files"]) is dict and set(manifest["files"]) == RESOURCE_NAMES, "resource profile/inventory differs")
    resource_prefix = package + "_resources/"
    require({n.removeprefix(resource_prefix) for n in names if n.startswith(resource_prefix)} == RESOURCE_NAMES | {"manifest.json"},
            "extra or missing packaged resource")
    for name, sha in manifest["files"].items():
        safe_name(name)
        require(type(sha) is str and core.SHA.fullmatch(sha) and digest(read(resource_prefix + name)) == sha, "resource bytes differ")
    expected = root + (".dist-info/METADATA" if wheel else "/PKG-INFO")
    require([n for n in names if n.endswith(".dist-info/METADATA" if wheel else "/PKG-INFO")] == [expected], "ambiguous metadata member")
    metadata(read(expected))
    if wheel:
        info = BytesParser().parsebytes(read(root + ".dist-info/WHEEL"))
        require(info.get_all("Root-Is-Purelib") == ["true"] and info.get_all("Tag") == ["py3-none-any"], "pure wheel tag differs")


def archive_metadata(path):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= MAX_ARCHIVE, "unsafe Codegen archive")
    if path.name.endswith(".whl"):
        with zipfile.ZipFile(path) as archive:
            rows = archive.infolist()
            require(len(rows) <= 1000 and sum(r.file_size for r in rows) <= MAX_EXPANDED
                and all(stat.S_IFMT(r.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR) for r in rows), "wheel bounds/links refused")
            archive_members([r.filename for r in rows if not r.is_dir()], archive.read, True)
    else:
        with tarfile.open(path, "r:gz") as archive:
            rows = archive.getmembers()
            require(len(rows) <= 1000 and sum(r.size for r in rows) <= MAX_EXPANDED
                and all(r.isfile() or r.isdir() for r in rows), "sdist bounds/links refused")
            def read(name):
                stream = archive.extractfile(name)
                require(stream is not None, "sdist member missing")
                return stream.read()
            archive_members([r.name for r in rows if r.isfile()], read, False)


def verify_packet(assets, raw, admission_hash, sums_hash, tag, source):
    if tag == 'umf-v0.10.10':
        return core.verify_candidate01010_packet(Path(__file__).resolve().parents[1], assets,
            distribution='umf-codegen',source_sha=source,tag=tag,sums_sha256=sums_hash,admission_sha256=admission_hash)
    require(tag == TAG and source == SOURCE, "only coupled umf-v0.10.8 at S is supported")
    value = admission(raw, admission_hash, assets)
    sums = core.parse_sums(read_asset(assets, "SHA256SUMS", sums_hash))
    require(sums.get("release-pins.json") == value["release_pins_sha256"], "coupled release-pins checksum differs")
    pins = decode(read_asset(assets, "release-pins.json", value["release_pins_sha256"]))
    require(type(pins) is dict and pins.get("commit") == SOURCE and pins.get("sdk") == VERSION
        and pins.get("umf_core") == VERSION and pins.get("tag", TAG) == TAG
        and pins.get("umf_codegen", VERSION) == VERSION, "coupled source/SDK/Core pins differ")
    selected = {n for n in sums if n.startswith(("umf_codegen-", "umf-codegen-")) and n.endswith((".whl", ".tar.gz"))}
    actual = {p.name for p in assets.iterdir() if p.name.startswith(("umf_codegen-", "umf-codegen-")) and p.name.endswith((".whl", ".tar.gz"))}
    require(selected == actual == set(FILES), "extra/missing Codegen package files")
    for name, sha in FILES.items():
        require(sums[name] == sha, "qualified archive checksum differs")
        read_asset(assets, name, sha)
        archive_metadata(assets / name)
    refs = [value["qualification"], *value["gates"].values()]
    if value["publisher"]["proof"] is not None:
        refs.append(value["publisher"]["proof"])
    needed = {**FILES, "release-pins.json": value["release_pins_sha256"]}
    for ref in refs:
        name, sha = ref["file"], ref["sha256"]
        require(name not in {*FILES, "release-pins.json", "SHA256SUMS", "source-receipt.json"}, "reserved proof name")
        require(name not in needed or needed[name] == sha, "conflicting proof digest")
        require(sums.get(name) == sha, "actual proof missing from public checksums")
        needed[name] = sha
    for name, sha in needed.items():
        read_asset(assets, name, sha)
    for role, ref in value["core"].items():
        later = {ref["file"]: ref["sha256"], actions_zip_name(ref): ref["actions"]["artifact_sha256"]}
        require(not (set(later) & (set(sums) | set(needed))), "later Actions inputs must remain separate from immutable release assets")
        needed.update(later)
        for name, sha in later.items(): read_asset(assets, name, sha)
        if role == "publication":
            members = original_actions_members(read_asset(assets, actions_zip_name(ref), ref["actions"]["artifact_sha256"]), ref, role)
            source_receipt = decode(members["source-receipt.json"])
            require(source_receipt.get("sums_sha256") == sums_hash
                and source_receipt.get("release_pins_sha256") == value["release_pins_sha256"],
                "actual Core publisher used different immutable coupled release pins/checksums")
    return value, sums, needed


def verify_release(release, ref, annotated, sums, sums_hash):
    require(core.resolve_tag_commit(ref, annotated, TAG) == SOURCE, "coupled tag differs from production S")
    require(release.get("tag_name") == TAG and release.get("draft") is False and release.get("prerelease") is False,
            "existing public coupled release required")
    rows = release.get("assets")
    require(type(rows) is list and all(type(r) is dict and type(r.get("name")) is str for r in rows), "release inventory missing")
    expected = {**sums, "SHA256SUMS": sums_hash}
    require(len(rows) == len(expected) and {r["name"] for r in rows} == set(expected), "coupled asset roster differs")
    for row in rows:
        require(row.get("digest") == "sha256:" + expected[row["name"]], "GitHub asset digest differs")


def check_core(value, assets):
    published = core_actions_proof(assets, value["core"]["publication"], "publication")
    require(core.check_pypi("umf-core", VERSION, published["files"]) == "matching", "qualified Core0.10.8 not public with exact bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "prepare", "check-pypi", "fetch-core-proofs"))
    parser.add_argument("--assets-dir", type=Path, required=True)
    parser.add_argument("--expected-admission-sha256", required=True)
    parser.add_argument("--expected-sums-sha256", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--wait", action="store_true", default=False)
    args = parser.parse_args()
    if args.tag == 'umf-v0.10.10':
        return core.candidate01010_source_command(args, 'umf-codegen')
    root = Path(__file__).resolve().parents[1]
    raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATH], cwd=root)
    if args.command == "fetch-core-proofs":
        require(args.tag == TAG and args.source_sha == SOURCE, "exact coupled tag/S required")
        fetch_core_proofs(admission_identity(raw, args.expected_admission_sha256), args.assets_dir)
        print(json.dumps({"coreActionsFetched": True, "qualification": "not asserted"}))
        return 0
    value, sums, needed = verify_packet(args.assets_dir, raw, args.expected_admission_sha256,
        args.expected_sums_sha256, args.tag, args.source_sha)
    receipt = {"schema": "umf.codegen-publication-source/1", "source_sha": SOURCE, "source_tree": TREE,
        "tag": TAG, "distribution": DISTRIBUTION, "version": VERSION, "files": FILES, "protocols": PROTOCOLS,
        "resources": RESOURCE_PINS, "admission_sha256": args.expected_admission_sha256,
        "core": value["core"],
        "publisherProof": "UNVERIFIED" if value["publisher"]["proof"] is None else "provided_scoped_proof"}
    if args.command in ("prepare", "check-pypi"):
        check_core(value, args.assets_dir)
    if args.command == "prepare":
        require(args.release_json and args.tag_ref_json and args.output_dir, "prepare requires public release/ref and new output")
        verify_release(decode(args.release_json.read_bytes()), decode(args.tag_ref_json.read_bytes()),
            decode(args.tag_object_json.read_bytes()) if args.tag_object_json else None, sums, args.expected_sums_sha256)
        require(not args.output_dir.exists(), "verified output must be new")
        args.output_dir.mkdir()
        for name in {*needed, "SHA256SUMS"}:
            shutil.copyfile(args.assets_dir / name, args.output_dir / name)
        (args.output_dir / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    elif args.command == "check-pypi":
        receipt["registryState"] = (core.wait_for_pypi(DISTRIBUTION, VERSION, FILES) if args.wait
            else core.check_pypi(DISTRIBUTION, VERSION, FILES))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
                stream.write("status=" + receipt["registryState"] + "\n")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AccessReleaseError, core.ReleaseError, OSError, KeyError, TypeError, ValueError,
            tarfile.TarError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        raise SystemExit("Codegen publication refused: " + str(error))
