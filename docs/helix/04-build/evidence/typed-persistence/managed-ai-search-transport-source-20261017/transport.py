"""Concrete exact-target HTTPS/SQL implementation; native entrypoint remains held."""

from __future__ import annotations

import base64
import hashlib
import http.client
import json
import re
import ssl
import time
import uuid
from pathlib import Path

HOST = "adb-7405607548213398.18.azuredatabricks.net"
WAREHOUSE = "d4b8eb5b4d6e34b8"
TABLE = "client_dev.umf_sdk_atomic_cf40c0c7aa74.search_qualification_20261017_docs"
INDEX = "client_dev.umf_sdk_atomic_cf40c0c7aa74.search_qualification_20261017_index"
ENDPOINT = "umf-typed-sdk-search-qualification-20261017"
EP = "/api/2.0/vector-search/endpoints"
IX = "/api/2.0/vector-search/indexes"
UC = "/api/2.1/unity-catalog/tables/"
NATIVE_EXECUTION_HELD = True


class Refused(ValueError):
    pass


class NativeHTTPError(Refused):
    def __init__(self, status):
        self.status = status
        super().__init__("native HTTP refusal " + str(status))


class UncertainDispatch(RuntimeError):
    pass


class CapabilityMissing(Refused):
    pass


def sha(b):
    return hashlib.sha256(b).hexdigest()


def canonical_uuid(s):
    if type(s) is not str:
        raise Refused("canonical native UUID required")
    try:
        value = str(uuid.UUID(s))
    except ValueError:
        raise Refused("canonical native UUID required") from None
    if value != s:
        raise Refused("canonical native UUID required")
    return s


def path_allowed(method, path):
    fixed = {
        ("POST", EP),
        ("GET", EP + "/" + ENDPOINT),
        ("DELETE", EP + "/" + ENDPOINT),
        ("GET", IX + "?endpoint_name=" + ENDPOINT),
        ("POST", IX),
        ("GET", IX + "/" + INDEX),
        ("DELETE", IX + "/" + INDEX),
        ("POST", IX + "/" + INDEX + "/query"),
        ("POST", IX + "/" + INDEX + "/upsert-data"),
        ("GET", UC + TABLE),
        ("GET", UC + INDEX),
        ("GET", UC + INDEX + "?include_manifest_capabilities=true"),
        ("GET", "/api/2.0/preview/scim/v2/Me"),
        ("POST", "/api/2.0/sql/statements"),
        ("GET", "/api/2.0/sql/warehouses/" + WAREHOUSE),
        ("POST", "/api/2.0/sql/warehouses/" + WAREHOUSE + "/stop"),
    }
    if (method, path) in fixed:
        return
    m = re.fullmatch(r"/api/2.0/sql/statements/([0-9a-f-]{36})(/cancel)?", path)
    if m:
        canonical_uuid(m[1])
        if method == ("POST" if m[2] else "GET"):
            return
    raise Refused("exact approved resource method/path required")


def validate_payload(method, path, body):
    plan = json.loads((Path(__file__).parent / "native-plan.json").read_text())
    if path == EP and method == "POST" and body != plan["endpoint"]["body"]:
        raise Refused("exact endpoint creation source required")
    if path == IX and method == "POST" and body != plan["index"]["body"]:
        raise Refused("exact index creation source required")
    if path == IX + "/" + INDEX + "/upsert-data" and body != plan["upsert"]["body"]:
        raise Refused("exact six fixture vectors required")
    if path == "/api/2.0/sql/statements" and (
        type(body) is not dict or body.get("warehouse_id") != WAREHOUSE
    ):
        raise Refused("exact warehouse required")
    if path == IX + "/" + INDEX + "/query" and (
        type(body) is not dict
        or set(body)
        - {"columns", "query_type", "query_vector", "query_text", "num_results"}
        or type(body.get("num_results")) is not int
        or not 1 <= body["num_results"] <= 4
    ):
        raise Refused("bounded original candidate request required")


def strict_native_object(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise Refused("duplicate native JSON member")
            value[key] = item
        return value

    def constant(_):
        raise Refused("non-JSON native numeric constant")

    value = json.loads(
        raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant
    )
    if type(value) is not dict:
        raise Refused("native object response required")
    return value


class HTTPS:
    """One request, exact TLS host. Token never included in request journals."""

    def __init__(self, token, journal):
        if (
            type(token) is not str
            or not 1 <= len(token) <= 16384
            or not token.isascii()
            or any(not 33 <= ord(c) <= 126 for c in token)
        ):
            raise Refused("token framing")
        self._token = token
        self.journal = Path(journal)
        self.journal.mkdir(exist_ok=False)
        self.count = 0
        self.phase = "work"
        self.phase_counts = {
            name: 0
            for name in ("work", "provision", "cleanup", "warehouse-stop", "cancel")
        }
        self.phase_limits = {
            "work": 240,
            "provision": 120,
            "cleanup": 40,
            "warehouse-stop": 32,
            "cancel": 10,
        }

    def request(self, method, path, body, *, deadline, phase=None):
        path_allowed(method, path)
        validate_payload(method, path, body)
        if method in ("GET", "DELETE") and body is not None:
            raise Refused("GET/DELETE body refused")
        selected = self.phase if phase is None else phase
        if (
            selected not in self.phase_limits
            or self.phase_counts[selected] >= self.phase_limits[selected]
        ):
            raise Refused("separate bounded native request phase exhausted")

        def left():
            t = deadline - time.monotonic()
            if t <= 0:
                raise TimeoutError("absolute request deadline")
            return min(20, t)

        encoded = (
            None
            if body is None
            else json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        )
        slot = self.count
        self.count += 1
        self.phase_counts[selected] += 1
        root = self.journal / f"{slot:03}"
        Path(str(root) + "-request.json").write_text(
            json.dumps(
                {
                    "method": method,
                    "host": HOST,
                    "path": path,
                    "body": body,
                    "bodySha256": None if encoded is None else sha(encoded),
                    "phase": selected,
                    "tokenRetained": False,
                },
                indent=2,
            )
            + "\n"
        )
        connection = http.client.HTTPSConnection(
            HOST, 443, timeout=left(), context=ssl.create_default_context()
        )
        parts = []
        response = None
        sent = False
        completed = False
        cert = None
        try:
            connection.connect()
            sock = connection.sock
            cert = sha(sock.getpeercert(binary_form=True))
            sock.settimeout(left())
            sent = True
            connection.request(
                method,
                path,
                encoded,
                {
                    "Authorization": "Bearer " + self._token,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            sock.settimeout(left())
            response = connection.getresponse()
            size = 0
            while True:
                sock.settimeout(left())
                chunk = response.read1(min(65536, 8_388_609 - size))
                if not chunk:
                    break
                parts.append(chunk)
                size += len(chunk)
                if size > 8_388_608:
                    raise Refused("bounded complete native body required")
            completed = True
            raw = b"".join(parts)
            if response.status >= 500 and method in ("POST", "DELETE"):
                raise UncertainDispatch(
                    "native server response does not prove write settlement"
                )
            if not 200 <= response.status < 300:
                raise NativeHTTPError(response.status)
            empty_ack = (
                method == "DELETE" and path in (EP + "/" + ENDPOINT, IX + "/" + INDEX)
            ) or (
                method == "POST"
                and (
                    path == "/api/2.0/sql/warehouses/" + WAREHOUSE + "/stop"
                    or re.fullmatch(
                        r"/api/2.0/sql/statements/[0-9a-f-]{36}/cancel", path
                    )
                )
            )
            if not raw and empty_ack:
                return {}
            try:
                value = strict_native_object(raw)
            except (ValueError, UnicodeError):
                raise Refused("strict native JSON required") from None
            if type(value) is not dict:
                raise Refused("native object response required")
            return value
        except NativeHTTPError:
            raise
        except Refused as error:
            if sent and method in ("POST", "DELETE"):
                raise UncertainDispatch(
                    "native response framing does not prove write settlement"
                ) from error
            raise
        except BaseException as error:
            if sent and method in ("POST", "DELETE"):
                raise UncertainDispatch(
                    "native request settlement unproved; no retry"
                ) from error
            raise
        finally:
            raw = b"".join(parts)
            Path(str(root) + "-response.bin").write_bytes(raw)
            Path(str(root) + "-response.json").write_text(
                json.dumps(
                    {
                        "status": None if response is None else response.status,
                        "complete": completed,
                        "nativeBodySha256": sha(raw),
                        "nativeBodyBase64": base64.b64encode(raw).decode(),
                        "peerCertificateSha256": cert,
                        "submissionAttempted": sent,
                        "redirects": 0,
                        "retries": 0,
                    },
                    indent=2,
                )
                + "\n"
            )
            connection.close()


def complete_rows(response):
    m = response.get("manifest")
    r = response.get("result")
    if (
        type(m) is not dict
        or type(r) is not dict
        or m.get("format") != "JSON_ARRAY"
        or m.get("truncated") is not False
    ):
        raise Refused("complete inline manifest required")
    n = m.get("total_row_count")
    chunks = m.get("total_chunk_count")
    schema = m.get("schema")
    if (
        type(n) is not int
        or not 0 <= n <= 20
        or type(chunks) is not int
        or type(schema) is not dict
    ):
        raise Refused("native row/chunk bound")
    columns = schema.get("columns")
    count = schema.get("column_count")
    if (
        type(count) is not int
        or type(columns) is not list
        or len(columns) != count
        or not 0 <= count <= 128
    ):
        raise Refused("column count")
    if (
        any(
            type(c) is not dict
            or type(c.get("position")) is not int
            or c["position"] != i
            or type(c.get("name")) is not str
            or not c["name"]
            or type(c.get("type_name")) is not str
            for i, c in enumerate(columns)
        )
        or len({c["name"] for c in columns}) != count
    ):
        raise Refused("schema identity")
    if any(
        k in r
        for k in (
            "external_links",
            "external_link",
            "next_chunk_index",
            "next_chunk_internal_link",
        )
    ):
        raise Refused("external/incomplete result")
    if n == 0:
        if chunks != 0 or m.get("chunks", []) != [] or r != {}:
            raise Refused("explicit empty result required")
        return columns, ()
    if (
        chunks != 1
        or m.get("chunks") != [{"chunk_index": 0, "row_count": n, "row_offset": 0}]
        or any(
            type(m["chunks"][0][k]) is not int
            for k in ("chunk_index", "row_count", "row_offset")
        )
        or any(
            type(r.get(k)) is not int
            for k in ("chunk_index", "row_count", "row_offset")
        )
        or (r["chunk_index"], r["row_count"], r["row_offset"]) != (0, n, 0)
    ):
        raise Refused("single complete chunk required")
    data = r.get("data_array")
    if (
        type(data) is not list
        or len(data) != n
        or any(type(row) is not list or len(row) != count for row in data)
    ):
        raise Refused("row count/arity")
    # No numeric/binary/vector coercion. Selected original hydration is String only.
    return columns, tuple(tuple(row) for row in data)


class NativeIO:
    def __init__(self, http, programs):
        self.http = http
        self.originals = {}
        for p in programs:
            s = p["hydration"]["statement"]
            self.originals[s["sql"]] = s
        self.fixed = {
            "SELECT current_user() AS principal",
            "SELECT version() AS native_version",
            "DESCRIBE DETAIL " + TABLE,
            "SELECT `id` FROM `client_dev`.`umf_sdk_atomic_cf40c0c7aa74`.`search_qualification_20261017_docs` LIMIT 0",
        }

    def api(self, method, path, body, *, deadline):
        return self.http.request(method, path, body, deadline=deadline)

    def _statement(self, sql, parameters, *, deadline):
        deadline = min(deadline, time.monotonic() + 30)
        payload = {
            "warehouse_id": WAREHOUSE,
            "statement": sql,
            "parameters": [
                {"name": k, "type": "STRING", "value": v} for k, v in parameters.items()
            ],
            "wait_timeout": "10s",
            "on_wait_timeout": "CONTINUE",
            "format": "JSON_ARRAY",
            "disposition": "INLINE",
            "row_limit": 20,
        }
        sid = None
        try:
            response = self.http.request(
                "POST", "/api/2.0/sql/statements", payload, deadline=deadline
            )
            try:
                sid = canonical_uuid(response.get("statement_id"))
            except Refused as error:
                raise UncertainDispatch(
                    "submitted SQL lacks original native statement id; no retry"
                ) from error
            while True:
                if response.get("statement_id") != sid:
                    raise UncertainDispatch(
                        "original statement id changed; original settlement unknown"
                    )
                state = response.get("status", {}).get("state")
                if state == "SUCCEEDED":
                    return response
                if state == "FAILED":
                    raise Refused("native terminal FAILED retained")
                if state not in ("PENDING", "RUNNING"):
                    raise UncertainDispatch("native terminal settlement unknown")
                t = deadline - time.monotonic()
                if t <= 0:
                    raise TimeoutError("native SQL absolute deadline")
                time.sleep(min(1.0, t))
                response = self.http.request(
                    "GET", "/api/2.0/sql/statements/" + sid, None, deadline=deadline
                )
        except (TimeoutError, UncertainDispatch):
            if sid is not None:
                try:
                    self.http.request(
                        "POST",
                        "/api/2.0/sql/statements/" + sid + "/cancel",
                        {},
                        deadline=time.monotonic() + 10,
                        phase="cancel",
                    )
                except BaseException as cleanup:
                    raise UncertainDispatch(
                        "statement uncertainty; cancellation failed; original exception retained"
                    ) from cleanup
            raise

    def sql(self, sql, parameters, *, deadline):
        original = self.originals.get(sql)
        if original is not None:
            expected = {p["name"] for p in original["parameters"]}
            if (
                set(parameters) != expected
                or any(p["carrier"] != "string" for p in original["parameters"])
                or any(type(v) is not str for v in parameters.values())
            ):
                raise Refused("original named String parameters required")
            # Neither before/after UUID nor same token is an ABA/DDL fence.
            # No qualified original native owner fence exists for this profile yet.
            raise CapabilityMissing(
                "UC_CURRENT_IDENTITY_FENCE_UNQUALIFIED: no hydration business SQL submitted"
            )
        if sql not in self.fixed or parameters:
            raise Refused("unidentified SQL or parameter inventory")
        columns, rows = complete_rows(
            self._statement(sql, parameters, deadline=deadline)
        )
        from native_runner import SQLRows

        return SQLRows(tuple(c["name"] for c in columns), rows)

    def observe_principal_equivalence(self, *, deadline):
        me = self.api("GET", "/api/2.0/preview/scim/v2/Me", None, deadline=deadline)
        if (
            type(me.get("id")) is not str
            or not me["id"]
            or type(me.get("userName")) is not str
        ):
            raise CapabilityMissing(
                "unambiguous native Me identity required; SP alternate subject unsupported"
            )
        columns, rows = complete_rows(
            self._statement("SELECT current_user() AS principal", {}, deadline=deadline)
        )
        if [c["name"] for c in columns] != ["principal"] or rows != (
            (me["userName"],),
        ):
            raise CapabilityMissing(
                "native SQL current_user and same-token REST Me differ"
            )
        return {
            "id": me["id"],
            "userName": me["userName"],
            "effectiveRoleObservation": "UNOBSERVED",
            "independentActorQualified": False,
            "sameTokenNativeObservationOnly": True,
        }

    def native_entrypoint(self):
        if NATIVE_EXECUTION_HELD:
            raise CapabilityMissing(
                "ROOT_RESOURCE_TRANSPORT_REVIEW_HELD; no native call"
            )
        raise CapabilityMissing("UC_CURRENT_IDENTITY_FENCE_UNQUALIFIED")
