#!/usr/bin/env python3
"""Closed Access delivery controller. Never builds or changes production S.

The admission record belongs to reviewed main, not to a dispatch caller or an
artifact producer. No admitted record is shipped with this source-only patch.
Pure verification is separate from explicit GitHub staging and PyPI OIDC jobs.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import zipfile
import urllib.error
import urllib.parse
import urllib.request
from email.parser import BytesParser
from pathlib import Path

import publish_core_pypi_release as core

REPOSITORY = "DocumentDrivenDX/umf"
SOURCE = "e3f38ef6f05ae636d2837f9d69f8d6805222664b"
TREE = "a21368a92df488882ef9771e4a1d92205267ddd3"
VERSION = "0.1.0.dev10"
TAG = "access-v" + VERSION
DISTRIBUTION = "umf-access"
WORKFLOW = "publish-access-pypi.yml"
ADMISSION_PATH = ".github/release-admissions/" + TAG + ".json"
FILES = {
    "umf_access-0.1.0.dev10-py3-none-any.whl": "493c5f92cc9795403e08a421b6b3ba4a6e5799b94a4980f1613f38ecf2f1c2d7",
    "umf_access-0.1.0.dev10.tar.gz": "2649ada2f316f15912c141309fe7d97913ac436feb86cee904f5714b443a4214",
}
VERSION_MEMBER_SHA = "ec305898465a838d70f00499e1fbcf20bb8087344a0d1c15d198b55d887b7ea8"
TYPES_MEMBER_SHA = "b2f6c45377df09d9b11f777f8e5f911cbff56ee797a8ca3b8928c13c63973cc1"
RESOURCE_IDENTITIES = {
    "python/src/umf/action_runtime_resource_manifest.json": "5eecd2e367ac58a38df0f4f32a8a7d9bef8020b8340dc4704583f7806d83d571",
    "python/umf_codegen/src/umf_codegen/_resources/manifest.json": "5ebd51f10967ba1a92ed82784cef017ece06633ab158155c26247732f641837e",
    "spec/metamodel/generated/manifest.json": "801cdbfb3c53a483067d55d0227900b3f6b835dfd9d7cc2b8e089444cc852c9e",
}
MAX_ARCHIVE = 2 * 1024 * 1024
MAX_EXPANDED = 16 * 1024 * 1024
REQUIREMENTS = {
    "pydantic<3,>=2.13", "typing-extensions<5,>=4.16", "umf-core==0.10.8",
    "cryptography==50.0.2;extra=='owner-authority'", "pglast==7.20;extra=='sql-containment'",
}


class AccessReleaseError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise AccessReleaseError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON member")
            result[key] = value
        return result
    def constant(_):
        raise AccessReleaseError("nonfinite JSON")
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise AccessReleaseError("invalid release JSON") from error


def safe_name(name):
    require(type(name) is str and bool(re.fullmatch(r"[A-Za-z0-9_.+-]+", name))
            and name not in (".", ".."), "unsafe asset filename")
    return name


def read_asset(directory, name, expected):
    safe_name(name)
    require(type(expected) is str and core.SHA.fullmatch(expected), "invalid asset digest")
    path = directory / name
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 8 * 1024 * 1024,
            "missing, oversized or unsafe asset: " + name)
    raw = path.read_bytes()
    require(digest(raw) == expected, "asset bytes differ: " + name)
    return raw


def pointer(value, path):
    require(type(path) is str and path.startswith("/") and len(path) <= 1024, "invalid proof pointer")
    try:
        for part in path[1:].split("/"):
            require(not re.search(r"~(?![01])", part), "invalid pointer escape")
            key = part.replace("~1", "/").replace("~0", "~")
            if type(value) is list:
                require(bool(re.fullmatch(r"0|[1-9][0-9]*", key)), "invalid proof array index")
                value = value[int(key)]
            else:
                value = value[key]
        return value
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise AccessReleaseError("required qualification evidence missing") from error


def proof(directory, item, *, source=True):
    require(type(item) is dict and set(item) == {"file", "sha256", "assertions"}, "closed proof reference required")
    value = decode(read_asset(directory, item["file"], item["sha256"]))
    checks = item["assertions"]
    require(type(checks) is dict and checks, "actual proof assertions required")
    if source:
        require(any(p in checks and checks[p] == SOURCE for p in ("/sourceCommit", "/artifactSourceS", "/source_sha")),
                "proof must bind actual artifact source S")
    require(any(v is True or v == "passed" for v in checks.values()), "positive qualification check required")
    for path, expected in checks.items():
        actual = pointer(value, path)
        require(type(actual) is type(expected) and actual == expected, "qualification assertion differs: " + path)
    return value


def admission(raw, expected_sha256, assets):
    require(digest(raw) == expected_sha256, "reviewed admission digest differs")
    value = decode(raw)
    require(type(value) is dict and set(value) == {"schema", "repository", "tag", "source_sha", "source_tree",
        "distribution", "version", "files", "resources", "qualification", "gates", "publisher", "core"},
        "closed reviewed admission required")
    require(value["schema"] == "umf.access-publication-admission/1" and value["repository"] == REPOSITORY
            and value["tag"] == TAG and value["source_sha"] == SOURCE and value["source_tree"] == TREE
            and value["distribution"] == DISTRIBUTION and value["version"] == VERSION and value["files"] == FILES,
            "admission source/tag/identity/archive roster differs")
    require(value["resources"] == RESOURCE_IDENTITIES, "canonical S resource identity differs")
    gates = value["gates"]
    require(type(gates) is dict and set(gates) == {"access-macos-installed", "access-linux-installed", "full-cohort"},
            "complete actual Access/cohort qualification required")
    for gate in gates.values():
        proof(assets, gate)
    publisher = value["publisher"]
    require(type(publisher) is dict and set(publisher) == {"repository", "distribution", "workflow", "environment", "proof"}
            and publisher["repository"] == REPOSITORY and publisher["distribution"] == DISTRIBUTION
            and publisher["workflow"] == WORKFLOW and publisher["environment"] == "pypi", "publisher identity differs")
    # Null is explicitly UNVERIFIED, not failed, absent authority or a prior
    # human approval requirement. Actual qualified upload may establish scope.
    if publisher["proof"] is not None:
        capability = proof(assets, publisher["proof"], source=False)
        require(capability.get("repository") == REPOSITORY and capability.get("distribution") == DISTRIBUTION
                and capability.get("workflow") == WORKFLOW and capability.get("environment") == "pypi"
                and capability.get("status") == "passed", "provided scoped publisher proof differs")
    require(type(value["core"]) is dict and set(value["core"]) == {"publication", "consumer"}, "Core public proof roster required")
    published = proof(assets, value["core"]["publication"])
    require(published.get("schema") == "pypi-publication-receipt.v1" and published.get("status") == "passed"
            and published.get("source_sha") == SOURCE and published.get("distribution") == "umf-core"
            and published.get("version") == "0.10.8" and published.get("registry") == "pypi"
            and published.get("registry_bytes_verified") is True and type(published.get("files")) is dict
            and published["files"], "qualified public Core0.10.8 publication missing")
    consumer = proof(assets, value["core"]["consumer"], source=False)
    require(consumer.get("schema") == "pypi-consumer-receipt.v1" and consumer.get("status") == "passed"
            and consumer.get("index") == "https://pypi.org/simple" and consumer.get("umf_core_version") == "0.10.8",
            "fresh public Core consumer proof missing")
    qualification = proof(assets, value["qualification"])
    require(qualification.get("files") == FILES and qualification.get("resources") == RESOURCE_IDENTITIES,
            "actual qualification archive/resource binding differs")
    return value


def metadata(raw):
    item = BytesParser().parsebytes(raw)
    for name in ("Name", "Version", "Requires-Python"):
        require(len(item.get_all(name, [])) == 1, "duplicate/missing archive metadata field")
    require(re.sub(r"[-_.]+", "-", item["Name"]).lower() == DISTRIBUTION and item["Version"] == VERSION,
            "archive distribution/version differs")
    require(set(re.sub(r"\s", "", item["Requires-Python"]).split(",")) == {">=3.11", "<3.15"},
            "archive Python range differs")
    requirements = [re.sub(r"\s", "", r) for r in item.get_all("Requires-Dist", [])]
    require(len(requirements) == len(REQUIREMENTS) and set(requirements) == REQUIREMENTS,
            "archive dependency closure differs")


def archive_metadata(path):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= MAX_ARCHIVE, "unsafe Access archive")
    wheel = path.name.endswith(".whl")
    if wheel:
        with zipfile.ZipFile(path) as archive:
            rows = archive.infolist()
            require(len(rows) <= 2000 and sum(r.file_size for r in rows) <= MAX_EXPANDED, "wheel bounds exceeded")
            require(all(stat.S_IFMT(r.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR) for r in rows), "wheel links refused")
            names = [r.filename for r in rows if not r.is_dir()]
            read = archive.read
            _archive_members(names, read, True)
    else:
        with tarfile.open(path, "r:gz") as archive:
            rows = archive.getmembers()
            require(len(rows) <= 2000 and sum(r.size for r in rows) <= MAX_EXPANDED
                    and all(r.isfile() or r.isdir() for r in rows), "sdist bounds/links refused")
            names = [r.name for r in rows if r.isfile()]
            def read(name):
                stream = archive.extractfile(name)
                require(stream is not None, "sdist member missing")
                return stream.read()
            _archive_members(names, read, False)


def _archive_members(names, read, wheel):
    require(len(set(names)) == len(names), "duplicate archive members")
    require(all(not n.startswith("/") and "\\" not in n and ":" not in n
                and all(p not in (".", "..", "") for p in n.split("/")) for n in names), "unsafe archive member")
    require(not any(n.lower().endswith((".so", ".pyd", ".dll", ".dylib")) for n in names), "Access archive contains native binary")
    root = "umf_access-" + VERSION
    prefix = "" if wheel else root + "/src/"
    require(digest(read(prefix + "umf_access/_version.py")) == VERSION_MEMBER_SHA
            and digest(read(prefix + "umf_access/types.py")) == TYPES_MEMBER_SHA, "authoritative runtime identity source differs")
    expected = root + (".dist-info/METADATA" if wheel else "/PKG-INFO")
    require([n for n in names if n.endswith(".dist-info/METADATA" if wheel else "/PKG-INFO")] == [expected],
            "ambiguous package metadata")
    metadata(read(expected))
    if wheel:
        item = BytesParser().parsebytes(read(root + ".dist-info/WHEEL"))
        require(item.get_all("Root-Is-Purelib") == ["true"] and item.get_all("Tag") == ["py3-none-any"],
                "Access wheel must be genuine py3-none-any purelib")


def verify_packet(*, assets, admission_raw, admission_sha256, sums_sha256, tag, source_sha):
    require(tag == TAG and source_sha == SOURCE, "only exact Access tag at S is supported")
    admitted = admission(admission_raw, admission_sha256, assets)
    sums_raw = read_asset(assets, "SHA256SUMS", sums_sha256)
    sums = core.parse_sums(sums_raw)
    references = [admitted["qualification"], *admitted["gates"].values(), *admitted["core"].values()]
    if admitted["publisher"]["proof"] is not None:
        references.append(admitted["publisher"]["proof"])
    expected_sums = {**FILES}
    for reference in references:
        name, sha = reference["file"], reference["sha256"]
        require(name not in ("SHA256SUMS", "release-pins.json", "source-receipt.json") and name not in FILES,
                "reserved proof asset name")
        require(name not in expected_sums or expected_sums[name] == sha, "conflicting proof asset binding")
        expected_sums[name] = sha
    require(set(sums) == {*expected_sums, "release-pins.json"}
            and all(sums[n] == sha for n, sha in expected_sums.items()), "proof/checksum roster differs")
    pins_raw = read_asset(assets, "release-pins.json", sums.get("release-pins.json"))
    pins = decode(pins_raw)
    qualification = admitted["qualification"]
    require(pins == {"tag": TAG, "commit": SOURCE, "sourceTree": TREE, "distribution": DISTRIBUTION,
        "version": VERSION, "files": FILES, "requires": "umf-core==0.10.8", "resources": RESOURCE_IDENTITIES,
        "qualification": {"file": qualification["file"], "sha256": qualification["sha256"]}}, "release pins differ from reviewed admission")
    selected = {n for n in sums if n.startswith(("umf_access-", "umf-access-")) and n.endswith((".whl", ".tar.gz"))}
    actual = {p.name for p in assets.iterdir() if p.name.startswith(("umf_access-", "umf-access-")) and p.name.endswith((".whl", ".tar.gz"))}
    require(selected == set(FILES) == actual, "missing or extra selected Access archives")
    for name, expected in FILES.items():
        require(sums[name] == expected, "checksum roster differs from qualified archives")
        read_asset(assets, name, expected)
        archive_metadata(assets / name)
    for name, expected in sums.items():
        read_asset(assets, name, expected)
    return {"schema": "umf.access-publication-source/1", "source_sha": SOURCE, "source_tree": TREE,
            "tag": TAG, "distribution": DISTRIBUTION, "version": VERSION, "files": FILES,
            "admission_sha256": admission_sha256, "sums_sha256": sums_sha256, "core": admitted["core"],
            "publisherProof": "UNVERIFIED" if admitted["publisher"]["proof"] is None else "provided_scoped_proof"}


class CapabilityServiceFailure(Exception):
    def __init__(self, status, details):
        super().__init__("capability service rejected request")
        self.status, self.details = status, details


def _capability_request(request):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=30) as response:
            raw = response.read(65537)
            require(len(raw) <= 65536, "bounded capability response required")
            return decode(raw)
    except urllib.error.HTTPError as error:
        # Never propagate raw HTTP bodies, headers, URLs or exception strings.
        raw = error.read(65537)
        try:
            details = decode(raw) if len(raw) <= 65536 else None
        except (AccessReleaseError, ValueError):
            details = None
        raise CapabilityServiceFailure(error.code, details) from None


def sanitized_service_reasons(value, secrets):
    rows = value.get("errors", []) if type(value) is dict else []
    result = []
    for row in rows[:8] if type(rows) is list else []:
        if type(row) is not dict:
            continue
        fields = []
        for key in ("code", "description"):
            text = row.get(key)
            if type(text) is not str:
                continue
            for secret in secrets:
                if secret:
                    text = text.replace(secret, "[REDACTED]")
            text = re.sub(r"(?i)(?:pypi-|gh[opsur]_)[A-Za-z0-9_.-]+|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED]", text)
            text = re.sub(r"(?i)(bearer\s+|(?:token|password|authorization)\s*[=:]\s*)\S+", r"\1[REDACTED]", text)
            fields.append(key + ": " + " ".join(text.split())[:400])
        if fields:
            result.append("; ".join(fields))
    return result or ["service supplied no safely reportable structured reason"]


def capability_exchange(environ, transport=None):
    """Mint and discard in memory. No upload, files, outputs, or qualification.

    Exchange success can match multiple projects; it is not Access scope proof.
    Official protocol: docs.pypi.org/trusted-publishers/using-a-publisher/
    """
    result = {"schema": "umf.access-publisher-exchange/1", "repository": REPOSITORY,
              "workflow": WORKFLOW, "environment": "pypi", "accessProjectAuthorization": "UNVERIFIED"}
    stage, secrets = "context", []
    transport = transport or _capability_request
    try:
        exact = {"GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
                 "GITHUB_REPOSITORY": REPOSITORY, "GITHUB_REF": "refs/heads/main",
                 "GITHUB_WORKFLOW_REF": REPOSITORY + "/.github/workflows/" + WORKFLOW + "@refs/heads/main",
                 "ACCESS_CAPABILITY_ENVIRONMENT": "pypi", "ACCESS_CAPABILITY_ONLY": "true", "ACCESS_PUBLISH": "false"}
        require(all(environ.get(k) == v for k, v in exact.items()), "exact capability-only workflow context required")
        url, bearer = environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", ""), environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
        secrets.append(bearer)
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.hostname and parsed.hostname.endswith(".actions.githubusercontent.com")
                and not parsed.username and not parsed.password and parsed.port in (None, 443) and not parsed.fragment
                and bearer and not any(k == "audience" for k, _ in urllib.parse.parse_qsl(parsed.query)),
                "valid GitHub OIDC endpoint required")
        url = urllib.parse.urlunsplit(parsed._replace(query=parsed.query + ("&" if parsed.query else "") + "audience=pypi"))
        stage = "github-oidc"
        response = transport(urllib.request.Request(url, headers={"Authorization": "bearer " + bearer}))
        token = response.get("value") if type(response) is dict else None
        require(type(token) is str and 0 < len(token) <= 32768, "GitHub token response missing")
        secrets.append(token)
        parts = token.split(".")
        require(len(parts) == 3, "GitHub token shape differs")
        claims = decode(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        require(type(claims) is dict and all(claims.get(k) == v for k, v in {
            "repository": REPOSITORY, "ref": "refs/heads/main", "workflow_ref": exact["GITHUB_WORKFLOW_REF"],
            "sub": "repo:" + REPOSITORY + ":environment:pypi", "aud": "pypi"}.items()), "OIDC workflow/environment claims differ")
        # PyPI verifies the token signature and trust configuration. Local claim
        # checks above only prevent an accidental different workflow context.
        stage = "pypi-exchange"
        response = transport(urllib.request.Request("https://pypi.org/_/oidc/mint-token",
            data=json.dumps({"token": token}).encode(), headers={"Content-Type": "application/json"}, method="POST"))
        require(type(response) is dict and type(response.get("token")) is str
                and response["token"].startswith("pypi-") and len(response["token"]) > 5, "PyPI mint response missing")
        result["status"] = "EXCHANGE_SUCCESS"
        # Deliberately never return, print, persist or use the minted credential.
    except CapabilityServiceFailure as error:
        result.update(status="EXCHANGE_FAILED", stage=stage, httpStatus=error.status,
                      serviceReasons=sanitized_service_reasons(error.details, secrets))
    except Exception:
        result.update(status="EXCHANGE_FAILED", stage=stage, serviceReasons=["context, transport or response validation failed; no raw exception retained"])
    return result


def verify_release(release, tag_ref, tag_object, sums):
    require(core.resolve_tag_commit(tag_ref, tag_object, TAG) == SOURCE, "release tag is not production S")
    require(release.get("tag_name") == TAG and release.get("draft") is False
            and release.get("prerelease") is True, "expected published Access component prerelease")
    verify_github_assets(release, sums)


def verify_github_assets(release, expected):
    rows = release.get("assets")
    require(type(rows) is list and all(type(r) is dict for r in rows), "GitHub asset inventory missing")
    require(len(rows) == len(expected) and {r.get("name") for r in rows} == set(expected), "GitHub asset roster differs")
    for row in rows:
        require(row.get("digest") == "sha256:" + expected[row["name"]], "GitHub asset digest differs")


def gh(*arguments):
    return subprocess.check_output(["gh", *arguments], text=True)


def main_controller(root):
    """Remote read authority is normal gh; no token/credential introspection."""
    repo = decode(gh("api", "repos/" + REPOSITORY))
    require(repo.get("default_branch") == "main", "review publisher routing if default branch changes")
    remote = decode(gh("api", "repos/" + REPOSITORY + "/commits/main"))
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    require(head == remote["sha"], "upload controller must be the current reviewed main")
    dirty = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=root, text=True)
    require(not dirty.strip(), "upload controller checkout must be clean reviewed main")
    subprocess.run(["git", "merge-base", "--is-ancestor", SOURCE, head], cwd=root, check=True)
    tree = subprocess.check_output(["git", "rev-parse", SOURCE + "^{tree}"], cwd=root, text=True).strip()
    require(tree == TREE, "production source tree differs")


def check_core(value, assets):
    published = proof(assets, value["core"]["publication"])
    require(core.check_pypi("umf-core", "0.10.8", published["files"]) == "matching",
            "qualified Core0.10.8 is not public with exact bytes")


def stage_github(assets, sums, sums_sha256):
    expected = {**sums, "SHA256SUMS": sums_sha256}
    lookup = subprocess.run(["gh", "api", "repos/" + REPOSITORY + "/releases/tags/" + TAG],
                            capture_output=True, text=True)
    if lookup.returncode == 0:
        release = decode(lookup.stdout)
        ref = decode(gh("api", "repos/" + REPOSITORY + "/git/ref/tags/" + TAG))
        annotated = decode(gh("api", "repos/" + REPOSITORY + "/git/tags/" + ref["object"]["sha"])) if ref["object"]["type"] == "tag" else None
        verify_release(release, ref, annotated, expected)
        return "existing_exact_bytes"
    require("HTTP 404" in lookup.stderr, "GitHub release lookup failed; absence is not established")
    existing_tag = subprocess.run(["gh", "api", "repos/" + REPOSITORY + "/git/ref/tags/" + TAG],
                                  capture_output=True, text=True)
    if existing_tag.returncode == 0:
        ref = decode(existing_tag.stdout)
        annotated = decode(gh("api", "repos/" + REPOSITORY + "/git/tags/" + ref["object"]["sha"])) if ref["object"]["type"] == "tag" else None
        require(core.resolve_tag_commit(ref, annotated, TAG) == SOURCE, "existing tag collides with S")
    else:
        require("HTTP 404" in existing_tag.stderr, "tag absence not established")
        # GitHub may defer a draft's implicit tag until publication. Create the
        # already-admitted immutable source ref explicitly, never force it.
        gh("api", "--method", "POST", "repos/" + REPOSITORY + "/git/refs",
           "-f", "ref=refs/tags/" + TAG, "-f", "sha=" + SOURCE)
    # No clobber, replacement, rebuild, rename or retry after partial mutation.
    gh("release", "create", TAG, *[str(assets / n) for n in sorted(expected)], "--repo", REPOSITORY,
       "--target", SOURCE, "--verify-tag", "--draft", "--prerelease", "--title", "UMF Access " + VERSION,
       "--notes", "Qualified unchanged Access archives from production " + SOURCE)
    release = decode(gh("api", "repos/" + REPOSITORY + "/releases/tags/" + TAG))
    verify_github_assets(release, expected)
    ref = decode(gh("api", "repos/" + REPOSITORY + "/git/ref/tags/" + TAG))
    annotated = decode(gh("api", "repos/" + REPOSITORY + "/git/tags/" + ref["object"]["sha"])) if ref["object"]["type"] == "tag" else None
    require(core.resolve_tag_commit(ref, annotated, TAG) == SOURCE, "new component tag source differs")
    gh("release", "edit", TAG, "--repo", REPOSITORY, "--draft=false", "--prerelease")
    return "created_exact_bytes"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "prepare", "stage-github", "check-pypi", "capability-only"))
    parser.add_argument("--assets-dir", type=Path)
    parser.add_argument("--expected-admission-sha256")
    parser.add_argument("--expected-sums-sha256")
    parser.add_argument("--tag")
    parser.add_argument("--source-sha")
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--upload", action="store_true", default=False)
    parser.add_argument("--wait", action="store_true", default=False)
    args = parser.parse_args()
    if args.command == "capability-only":
        require(all(v is None or v is False for k, v in vars(args).items() if k != "command"),
                "capability-only cannot accept package, upload or output arguments")
        observation = capability_exchange(os.environ)
        print(json.dumps(observation, indent=2))
        return 0 if observation["status"] == "EXCHANGE_SUCCESS" else 1
    require(all((args.assets_dir, args.expected_admission_sha256, args.expected_sums_sha256, args.tag, args.source_sha)),
            "package route requires all immutable admission/source pins")
    require(not args.upload or args.command == "stage-github", "upload is only supported for explicit GitHub staging")
    root = Path(__file__).resolve().parents[1]
    # Require tracked controller bytes, not a producer/caller supplied admission.
    raw = subprocess.check_output(["git", "show", "HEAD:" + ADMISSION_PATH], cwd=root)
    receipt = verify_packet(assets=args.assets_dir, admission_raw=raw, admission_sha256=args.expected_admission_sha256,
                            sums_sha256=args.expected_sums_sha256, tag=args.tag, source_sha=args.source_sha)
    value = decode(raw)
    if args.command == "stage-github":
        if args.upload:
            main_controller(root)
            check_core(value, args.assets_dir)
            receipt["githubStage"] = stage_github(args.assets_dir, core.parse_sums((args.assets_dir / "SHA256SUMS").read_bytes()), args.expected_sums_sha256)
        else:
            receipt["githubStage"] = "verification_only_upload_disabled"
    elif args.command in ("prepare", "check-pypi"):
        check_core(value, args.assets_dir)
        if args.command == "prepare":
            require(args.release_json and args.tag_ref_json and args.output_dir, "prepare requires release/tag objects and output")
            sums = {**core.parse_sums((args.assets_dir / "SHA256SUMS").read_bytes()), "SHA256SUMS": args.expected_sums_sha256}
            verify_release(decode(args.release_json.read_bytes()), decode(args.tag_ref_json.read_bytes()),
                           decode(args.tag_object_json.read_bytes()) if args.tag_object_json else None, sums)
            require(not args.output_dir.exists(), "verified output directory must be new")
            args.output_dir.mkdir()
            for name in sums:
                shutil.copyfile(args.assets_dir / name, args.output_dir / name)
            (args.output_dir / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        else:
            receipt["registryState"] = (core.wait_for_pypi(DISTRIBUTION, VERSION, FILES) if args.wait
                                        else core.check_pypi(DISTRIBUTION, VERSION, FILES))
            output = os.environ.get("GITHUB_OUTPUT")
            if output:
                with open(output, "a", encoding="utf-8") as stream:
                    stream.write("status=" + receipt["registryState"] + "\n")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AccessReleaseError, core.ReleaseError, OSError, KeyError, TypeError, tarfile.TarError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        raise SystemExit("Access publication refused: " + str(error))
