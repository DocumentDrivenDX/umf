"""Exact fixture lifecycle, hard-held pending resource/transport/capability review."""

from __future__ import annotations

import importlib
import json
import sys
import time
from pathlib import Path

from transport import (
    ENDPOINT,
    EP,
    HOST,
    INDEX,
    IX,
    TABLE,
    UC,
    WAREHOUSE,
    CapabilityMissing,
    NativeHTTPError,
    Refused,
    UncertainDispatch,
    canonical_uuid,
    sha,
)

NATIVE_RESOURCE_EXECUTION_HELD = True


class Resources:
    def __init__(self, io, plan, journal):
        original = json.loads((Path(__file__).parent / "native-plan.json").read_text())
        if plan != original:
            raise Refused("exact reviewed resource plan required")
        self.io, self.plan, self.path = io, plan, Path(journal)
        self.path.mkdir(exist_ok=False)
        self.owned = {}
        self.ledger = {}
        self.uncertain = False

    def save(self):
        (self.path / "ownership.json").write_text(
            json.dumps(
                {
                    "submitted": self.ledger,
                    "identified": self.owned,
                    "uncertainDispatch": self.uncertain,
                },
                indent=2,
            )
            + "\n"
        )

    def identity(self, kind, *, deadline):
        if kind == "endpoint":
            x = self.io.api("GET", EP + "/" + ENDPOINT, None, deadline=deadline)
            if (
                x.get("name") != ENDPOINT
                or x.get("endpoint_type") != "STANDARD"
                or type(x.get("creation_timestamp")) is not int
                or type(x.get("creator")) is not str
            ):
                raise Refused("native endpoint identity incomplete")
            return {
                "id": canonical_uuid(x.get("id")),
                "created": x["creation_timestamp"],
                "creator": x["creator"],
                "name": ENDPOINT,
            }
        name = INDEX if kind == "index" else TABLE
        suffix = "?include_manifest_capabilities=true" if kind == "index" else ""
        x = self.io.api("GET", UC + name + suffix, None, deadline=deadline)
        if kind == "index":
            manifest = x.get("securable_kind_manifest")
            if (
                type(manifest) is not dict
                or manifest.get("securable_type") != "TABLE"
                or manifest.get("securable_kind") != "TABLE_ONLINE_VECTOR_INDEX_DIRECT"
                or x.get("data_source_format") != "VECTOR_INDEX_FORMAT"
            ):
                raise Refused("actual native index kind/format manifest required")
        elif x.get("table_type") != "MANAGED" or x.get("data_source_format") != "DELTA":
            raise Refused("actual native managed Delta fixture required")
        if (
            x.get("full_name") != name
            or type(x.get("created_at")) is not int
            or type(x.get("owner")) is not str
        ):
            raise Refused("native UC resource identity incomplete")
        if kind == "index":
            native = self.io.api("GET", IX + "/" + INDEX, None, deadline=deadline)
            spec = self.plan["index"]["body"]
            if any(
                native.get(k) != spec[k]
                for k in (
                    "name",
                    "endpoint_name",
                    "index_type",
                    "primary_key",
                    "direct_access_index_spec",
                )
            ):
                raise Refused("native index original spec mismatch")
        return {
            "id": canonical_uuid(x.get("table_id")),
            "created": x["created_at"],
            "owner": x["owner"],
            "name": name,
        }

    def _absent(self, kind, deadline):
        try:
            self.identity(kind, deadline=deadline)
        except NativeHTTPError as e:
            if e.status == 404:
                return
            raise
        raise Refused("fresh exact fixture name already exists")

    def _create(self, kind, deadline):
        if kind not in ("endpoint", "table", "index"):
            raise Refused("unknown resource kind")
        self._absent(kind, deadline)
        if kind == "table":
            method, path, body = "SQL", None, self.plan["createTableSql"]
        else:
            request = self.plan[kind]
            method, path, body = request["method"], request["path"], request["body"]
        self.ledger[kind] = {
            "submissionAttempted": True,
            "acknowledged": False,
            "sourceSha256": sha(
                json.dumps([method, path, body], sort_keys=True).encode()
            ),
        }
        self.save()
        try:
            if kind == "table":
                self.io._statement(body, {}, deadline=deadline)
            else:
                self.io.api(method, path, body, deadline=deadline)
            self.ledger[kind]["acknowledged"] = True
            self.save()
            self.owned[kind] = self.identity(kind, deadline=deadline)
            self.save()
        except UncertainDispatch:
            self.uncertain = True
            self.save()
            raise

    def cleanup(self, *, deadline):
        results = {}
        pending = set(self.ledger) - set(self.owned)
        for kind in ("index", "endpoint", "table"):
            if kind not in self.owned:
                continue
            try:
                if self.identity(kind, deadline=deadline) != self.owned[kind]:
                    raise Refused("cleanup refuses changed exact native identity")
                if kind == "endpoint":
                    listed = self.io.api(
                        "GET",
                        IX + "?endpoint_name=" + ENDPOINT,
                        None,
                        deadline=deadline,
                    )
                    if (
                        set(listed) - {"vector_indexes", "next_page_token"}
                        or listed.get("next_page_token")
                        or listed.get("vector_indexes") != []
                    ):
                        raise Refused(
                            "endpoint contains foreign or incomplete index inventory"
                        )
                if kind == "table":
                    self.io._statement("DROP TABLE " + TABLE, {}, deadline=deadline)
                else:
                    self.io.api(
                        "DELETE",
                        (IX + "/" + INDEX if kind == "index" else EP + "/" + ENDPOINT),
                        None,
                        deadline=deadline,
                    )
                while True:
                    try:
                        self.identity(kind, deadline=deadline)
                    except NativeHTTPError as e:
                        if e.status == 404:
                            break
                        raise
                    if time.monotonic() >= deadline:
                        raise TimeoutError("deletion settlement deadline")
                    time.sleep(min(3.0, max(0, deadline - time.monotonic())))
                results[kind] = (
                    "exact-native-identity-observed-before-delete-and-absence-after"
                )
            except (Refused, UncertainDispatch, TimeoutError, OSError) as e:
                results[kind] = {"errorType": type(e).__name__, "message": str(e)}
        result = {
            "resources": results,
            "pendingUnidentifiedCreations": sorted(pending),
            "uncertainSubmission": self.uncertain,
            "complete": not pending
            and not self.uncertain
            and set(results) == set(self.owned)
            and all(type(v) is str for v in results.values()),
            "nativeConditionalDeleteABAProof": False,
            "qualification": False,
        }
        (self.path / "cleanup.json").write_text(json.dumps(result, indent=2) + "\n")
        return result

    def _wait_ready(self, kind, deadline):
        until = min(deadline, time.monotonic() + 300)
        previous = self.io.http.phase
        self.io.http.phase = "provision"
        try:
            for _ in range(60):
                if time.monotonic() >= until:
                    raise TimeoutError("provision deadline")
                path = EP + "/" + ENDPOINT if kind == "endpoint" else IX + "/" + INDEX
                value = self.io.api(
                    "GET", path, None, deadline=min(until, time.monotonic() + 30)
                )
                if (
                    kind == "endpoint"
                    and value.get("endpoint_status", {}).get("state") == "ONLINE"
                ):
                    return
                if kind == "index" and value.get("status", {}).get("ready") is True:
                    return
                time.sleep(min(5, max(0, until - time.monotonic())))
            raise TimeoutError("sixty provisioning observations exhausted")
        finally:
            self.io.http.phase = previous

    def _stop_warehouse(self, *, deadline):
        state = self.io.api(
            "GET", "/api/2.0/sql/warehouses/" + WAREHOUSE, None, deadline=deadline
        )
        if (
            state.get("id") != WAREHOUSE
            or state.get("odbc_params", {}).get("hostname") != HOST
        ):
            raise Refused("warehouse cleanup refuses foreign identity")
        self.io.api(
            "POST",
            "/api/2.0/sql/warehouses/" + WAREHOUSE + "/stop",
            None,
            deadline=deadline,
        )
        while True:
            state = self.io.api(
                "GET", "/api/2.0/sql/warehouses/" + WAREHOUSE, None, deadline=deadline
            )
            if (
                state.get("id") != WAREHOUSE
                or state.get("odbc_params", {}).get("hostname") != HOST
            ):
                raise Refused("warehouse cleanup identity changed")
            if state.get("state") == "STOPPED":
                return {"warehouseStopped": True, "identity": WAREHOUSE}
            if time.monotonic() >= deadline:
                raise TimeoutError("warehouse stop deadline")
            time.sleep(min(4.0, max(0, deadline - time.monotonic())))

    def execute(self, fresh_generated_root):
        if NATIVE_RESOURCE_EXECUTION_HELD:
            raise CapabilityMissing(
                "resource execution held before any native operation"
            )
        # This checks native owner fence capability BEFORE resource costs, not a
        # caller-supplied flag. Current implementation refuses; no native proof exists.
        self.io.native_entrypoint()
        deadline = time.monotonic() + self.plan["bounds"]["wholeRunSeconds"]
        cleanup = None
        warehouse = None
        try:
            self._create("table", deadline)
            for row in self.plan["seedRows"]:
                values = {
                    "id": row["id"],
                    "body": row["body"],
                    "x": str(row["embedding"][0]),
                    "y": str(row["embedding"][1]),
                    "z": str(row["embedding"][2]),
                    "count": str(row["count"]),
                    "amount": row["amount"],
                    "payload": row["payload"],
                }
                self.io._statement(self.plan["seedSql"], values, deadline=deadline)
            principal = self.io.observe_principal_equivalence(deadline=deadline)
            from compile_fresh import compile_fresh

            platform = self.io.sql(
                "SELECT version() AS native_version", {}, deadline=deadline
            )
            if (
                platform.columns != ("native_version",)
                or len(platform.rows) != 1
                or len(platform.rows[0]) != 1
            ):
                raise Refused("exact native platform observation required")
            version = platform.rows[0][0]
            prepared = compile_fresh(
                self.owned["table"]["id"],
                version,
                fresh_generated_root,
                deadline=deadline,
            )
            if any(
                n == "search_docs" or n.startswith("search_docs.") for n in sys.modules
            ):
                raise Refused(
                    "fresh process required; no older generated package reuse"
                )
            sys.path.insert(0, str(prepared))
            queries = importlib.import_module("search_docs.queries")
            original_programs = [
                getattr(queries, "_S" + str(i)).variants[0].entries[0].artifact()
                for i in range(3)
            ]
            self.io.originals = {
                p["hydration"]["statement"]["sql"]: p["hydration"]["statement"]
                for p in original_programs
            }
            import native_runner as runner

            (self.path / "native-principal-observation.json").write_text(
                json.dumps(principal, indent=2) + "\n"
            )
            self._create("endpoint", deadline)
            self._wait_ready("endpoint", deadline)
            self._create("index", deadline)
            self._wait_ready("index", deadline)
            upsert = self.plan["upsert"]
            self.io.api(
                upsert["method"], upsert["path"], upsert["body"], deadline=deadline
            )
            return runner.run_queries(
                queries, self.io, self.owned["table"]["id"], version
            )
        finally:
            self.io.http.phase = "cleanup"
            try:
                cleanup = self.cleanup(deadline=time.monotonic() + 120)
            finally:
                try:
                    self.io.http.phase = "warehouse-stop"
                    warehouse = self._stop_warehouse(deadline=time.monotonic() + 120)
                finally:
                    (self.path / "settlement.json").write_text(
                        json.dumps(
                            {
                                "fixtureCleanup": cleanup,
                                "warehouse": warehouse,
                                "qualification": False,
                                "nativeConditionalDeleteABAProof": False,
                            },
                            indent=2,
                        )
                        + "\n"
                    )
            if not cleanup["complete"] or warehouse.get("warehouseStopped") is not True:
                raise Refused("resource settlement incomplete")
