"""PG18 native analyzed-SQL inventory; fixed source only, no runtime SQL rewriting."""

from __future__ import annotations

import ast
import hashlib
import re
from pathlib import Path


class NodeError(ValueError):
    pass


def node_tree(text):
    """Read bounded PG18 nodeToString output without eval or executing content."""
    if len(text) > 16_777_216:
        raise NodeError("native node tree exceeds bound")
    tokens = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        if text[i] in "{}()[]":
            tokens.append(text[i])
            i += 1
            continue
        value = ""
        quoted = False
        if text[i] == '"':
            quoted = True
            i += 1
        while i < len(text):
            c = text[i]
            if c == "\\":
                i += 1
                if i >= len(text):
                    raise NodeError("dangling native escape")
                value += text[i]
                i += 1
                continue
            if quoted and c == '"':
                i += 1
                break
            if not quoted and (c.isspace() or c in "{}()[]"):
                break
            value += c
            i += 1
        else:
            if quoted:
                raise NodeError("unclosed native quoted token")
        tokens.append(value)
        if len(tokens) > 1_000_000:
            raise NodeError("native node token bound")
    cursor = 0

    def read(depth=0):
        nonlocal cursor
        if depth > 256 or cursor >= len(tokens):
            raise NodeError("native node depth/truncation")
        value = tokens[cursor]
        cursor += 1
        if value == "{":
            if cursor >= len(tokens):
                raise NodeError("native tag absent")
            tag = tokens[cursor]
            cursor += 1
            fields = {}
            while cursor < len(tokens) and tokens[cursor] != "}":
                key = tokens[cursor]
                cursor += 1
                if not key.startswith(":") or key[1:] in fields:
                    raise NodeError("native field malformed/duplicate")
                field = key[1:]
                parsed = read(depth + 1)
                if (
                    field == "constvalue"
                    and cursor < len(tokens)
                    and tokens[cursor] == "["
                ):
                    parsed = ["DATUM", parsed, read(depth + 1)]
                fields[field] = parsed
            if cursor >= len(tokens):
                raise NodeError("unclosed native object")
            cursor += 1
            return {"tag": tag, "fields": fields}
        if value in ["(", "["]:
            end = ")" if value == "(" else "]"
            values = []
            while cursor < len(tokens) and tokens[cursor] != end:
                values.append(read(depth + 1))
            if cursor >= len(tokens):
                raise NodeError("unclosed native list")
            cursor += 1
            return values
        if value in ["}", ")", "]"]:
            raise NodeError("unexpected closing token")
        if re.fullmatch(r"-?\d+", value):
            return int(value)
        if value == "<>":
            return None
        return value

    result = read()
    if cursor != len(tokens):
        raise NodeError("native trailing tokens")
    return result


KNOWN_TAGS = {
    "QUERY",
    "RANGETBLENTRY",
    "RTEPERMISSIONINFO",
    "ALIAS",
    "FROMEXPR",
    "JOINEXPR",
    "RANGETBLREF",
    "TARGETENTRY",
    "VAR",
    "CONST",
    "FUNCEXPR",
    "OPEXPR",
    "DISTINCTEXPR",
    "NULLIFEXPR",
    "BOOLEXPR",
    "BOOLEANTEST",
    "NULLTEST",
    "SUBLINK",
    "CASEEXPR",
    "CASEWHEN",
    "CASETESTEXPR",
    "RELABELTYPE",
    "COERCEVIAIO",
    "ARRAYCOERCEEXPR",
    "ARRAYEXPR",
    "AGGREF",
    "SORTGROUPCLAUSE",
    "SQLVALUEFUNCTION",
    "SUBSCRIPTINGREF",
    "COMMONTABLEEXPR",
    "ROWEXPR",
    "RANGETBLFUNCTION",
    "COLLATEEXPR",
    "SCALARARRAYOPEXPR",
    "COALESCEEXPR",
    "PARAM",
    "WINDOWFUNC",
    "CONVERTROWTYPEEXPR",
    "COERCETODOMAIN",
    "COERCETODOMAINVALUE",
    "FIELDSELECT",
}
TYPE_FIELDS = {
    "vartype",
    "consttype",
    "paramtype",
    "funcresulttype",
    "opresulttype",
    "aggtype",
    "wintype",
    "resulttype",
    "refcontainertype",
    "refelemtype",
    "refrestype",
    "row_typeid",
    "casetype",
    "type",
    "coalescetype",
    "array_typeid",
    "element_typeid",
}


def expr_type(node):
    if not isinstance(node, dict):
        return None
    f = node["fields"]
    for key in [
        "vartype",
        "consttype",
        "paramtype",
        "funcresulttype",
        "opresulttype",
        "aggtype",
        "resulttype",
        "refrestype",
        "row_typeid",
        "casetype",
        "type",
        "coalescetype",
        "array_typeid",
    ]:
        if isinstance(f.get(key), int) and f[key] > 0:
            return f[key]
    return None


def analyze(text):
    root = node_tree(text)
    functions = set()
    operators = set()
    types = set()
    sorts = set()
    casts = []
    permissions = []
    intrinsic = []
    tags = set()

    def visit(value):
        if isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, dict):
            tag = value["tag"]
            f = value["fields"]
            tags.add(tag)
            if tag not in KNOWN_TAGS:
                raise NodeError("unreviewed PG18 execution/structure node " + tag)
            for key in TYPE_FIELDS:
                if isinstance(f.get(key), int) and f[key] > 0:
                    types.add(f[key])
            for key in ["funcid", "aggfnoid", "winfnoid", "opfuncid"]:
                if isinstance(f.get(key), int) and f[key] > 0:
                    functions.add(f[key])
            for key in ["opno", "eqop", "sortop"]:
                if isinstance(f.get(key), int) and f[key] > 0:
                    operators.add(f[key])
            if tag == "SORTGROUPCLAUSE" and f.get("sortop"):
                sorts.add(f["sortop"])
            if tag in [
                "COERCEVIAIO",
                "RELABELTYPE",
                "ARRAYCOERCEEXPR",
                "CONVERTROWTYPEEXPR",
                "COERCETODOMAIN",
            ]:
                casts.append(
                    {
                        "node": tag,
                        "sourceTypeOid": expr_type(f.get("arg")),
                        "targetTypeOid": expr_type(value),
                    }
                )
            if tag == "FUNCEXPR" and f.get("funcformat") in [1, 2]:
                casts.append(
                    {
                        "node": "FUNCEXPR",
                        "functionOid": f["funcid"],
                        "targetTypeOid": f["funcresulttype"],
                        "argumentTypeOids": [expr_type(a) for a in f.get("args") or []],
                    }
                )
            if tag == "RTEPERMISSIONINFO" and f.get("requiredPerms", 0):
                permissions.append(f)
            if tag in [
                "SQLVALUEFUNCTION",
                "BOOLEXPR",
                "BOOLEANTEST",
                "NULLTEST",
                "CASEEXPR",
                "COALESCEEXPR",
                "ARRAYEXPR",
                "SUBSCRIPTINGREF",
                "FIELDSELECT",
            ]:
                intrinsic.append(
                    {
                        "node": tag,
                        **{
                            k: f[k]
                            for k in [
                                "op",
                                "boolop",
                                "booltesttype",
                                "nulltesttype",
                                "type",
                                "resulttype",
                                "refcontainertype",
                                "refelemtype",
                                "refrestype",
                            ]
                            if k in f
                        },
                    }
                )
            for child in f.values():
                visit(child)

    visit(root)
    return {
        "functionOids": sorted(functions),
        "operatorOids": sorted(operators),
        "typeOids": sorted(types),
        "sortOperatorOids": sorted(sorts),
        "casts": casts,
        "relationPermissions": permissions,
        "intrinsicNodes": intrinsic,
        "nodeTags": sorted(tags),
    }


def fixed_statements(source):
    text = Path(source).read_text()
    tree = ast.parse(text)
    named = {
        n.value.value: n.targets[0].id
        for n in tree.body
        if isinstance(n, ast.Assign)
        and len(n.targets) == 1
        and isinstance(n.targets[0], ast.Name)
        and isinstance(n.value, ast.Constant)
        and isinstance(n.value.value, str)
    }
    statements = {}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and re.match(r"^(SELECT |WITH |SET TRANSACTION )", node.value)
        ):
            query = node.value
            digest = hashlib.sha256(query.encode()).hexdigest()
            key = named.get(query, "inline-" + digest[:12])
            statements.setdefault(
                key, {"id": key, "sql": query, "sha256": digest, "sourceLines": []}
            )["sourceLines"].append(node.lineno)
    if len(statements) != 12:
        raise ValueError(
            "fixed runtime SQL inventory changed; explicit review required"
        )
    return list(statements.values())


def substitute(query, values):
    # Only the fixed hashed source statements reach this function. Scan SQL
    # strings/comments so an accidental placeholder inside a literal refuses.

    if "--" in query or "/*" in query:
        raise ValueError("unreviewed fixed/probe SQL comments")
    result = ""
    i = 0
    count = 0
    quoted = False
    while i < len(query):
        c = query[i]
        if c == "'":
            result += c
            i += 1
            if quoted and i < len(query) and query[i] == "'":
                result += "'"
                i += 1
                continue
            quoted = not quoted
            continue
        if query[i : i + 2] == "%s":
            if quoted or count >= len(values):
                raise ValueError("invalid fixed placeholder inventory")
            result += values[count]
            count += 1
            i += 2
            continue
        result += c
        i += 1
    if quoted or count != len(values):
        raise ValueError("fixed parameter arity mismatch")
    return result


# No dynamic user expression is accepted. These represent native parameter types,
# not values or replacement runtime SQL; only parse-only probe views use them.
PARAMS = {
    "_ROLE": [("no-params", [])],
    "_TABLE": [("unknown-strings", ["NULL", "NULL"])],
    "_COLUMNS": [(t, ["NULL::pg_catalog." + t]) for t in ["int2", "int4", "int8"]],
    "_KEYS": [(t, ["NULL::pg_catalog." + t]) for t in ["int2", "int4", "int8"]],
    "_SHAPE": [
        (t + "[]", ["NULL::pg_catalog." + t + "[]"]) for t in ["int2", "int4", "int8"]
    ],
    "_RESOLUTION": [
        ("text-array-bool-unknown", ["NULL", "NULL::pg_catalog.bool", "NULL"])
    ],
}
OUTPUTS = {
    "_ROLE": 4,
    "_TABLE": 5,
    "_COLUMNS": 4,
    "_KEYS": 1,
    "_SHAPE": 4,
    "_RESOLUTION": 9,
}


def rows(connection, query, params=None):
    cursor = connection.execute(query, params)
    names = [c.name for c in cursor.description]
    return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]


def resolve(connection, analysis):
    """Observe stable native identities; OIDs are version-specific witnesses."""
    procs = {}
    ops = {}
    types = {}
    pending = set(analysis["functionOids"])
    type_pending = set(analysis["typeOids"])
    aggregate = []
    sort_support = []
    io = []
    if analysis["operatorOids"]:
        for r in rows(
            connection,
            "SELECT o.*,o.oprcode::pg_catalog.oid AS oprcode,n.nspname AS schema FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace WHERE o.oid=ANY(%s::pg_catalog.oid[]) ORDER BY o.oid",
            (analysis["operatorOids"],),
        ):
            ops[r["oid"]] = r
            pending.add(r["oprcode"])
            type_pending.update([r["oprleft"], r["oprright"], r["oprresult"]])
    for oid in analysis["sortOperatorOids"]:
        # SortGroupClause's actual operator, not an arbitrary same-name opclass.
        memberships = rows(
            connection,
            "SELECT m.*,c.oid AS opclass_oid,c.opcname,n.nspname AS schema FROM pg_catalog.pg_amop m JOIN pg_catalog.pg_opclass c ON c.opcfamily=m.amopfamily AND c.opcintype=m.amoplefttype JOIN pg_catalog.pg_am a ON a.oid=c.opcmethod JOIN pg_catalog.pg_namespace n ON n.oid=c.opcnamespace WHERE m.amopopr=%s::pg_catalog.oid AND a.amname='btree' AND c.opcdefault",
            (oid,),
        )
        if len(memberships) != 1:
            raise ValueError("sort default native opclass ambiguous " + str(oid))
        m = memberships[0]
        support = rows(
            connection,
            "SELECT *,amproc::pg_catalog.oid AS amproc FROM pg_catalog.pg_amproc WHERE amprocfamily=%s::pg_catalog.oid AND amproclefttype=%s::pg_catalog.oid AND amprocrighttype=%s::pg_catalog.oid ORDER BY amprocnum",
            (m["amopfamily"], m["amoplefttype"], m["amoprighttype"]),
        )
        sort_support.append(
            {"operatorOid": oid, "nativeMembership": m, "support": support}
        )
        pending.update(r["amproc"] for r in support)
    # Expand function signatures, aggregates, composite/array types and their
    # handlers. Internal references are recorded separately from grant needs.
    while pending or type_pending:
        ids = sorted(pending - set(procs))
        pending.clear()
        if ids:
            found = rows(
                connection,
                "SELECT p.*,p.prosupport::pg_catalog.oid AS prosupport,p.proargtypes::pg_catalog.oid[] AS arg_oids,n.nspname AS schema FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=ANY(%s::pg_catalog.oid[]) ORDER BY p.oid",
                (ids,),
            )
            if len(found) != len(ids):
                raise ValueError("native function OID absent")
            for r in found:
                procs[r["oid"]] = r
                pending.add(r["prosupport"])
                type_pending.add(r["prorettype"])
                type_pending.update(int(x) for x in r["arg_oids"])
                type_pending.add(r["provariadic"])
                if r["prokind"] == "a":
                    a = rows(
                        connection,
                        "SELECT *,aggtransfn::pg_catalog.oid AS aggtransfn,aggfinalfn::pg_catalog.oid AS aggfinalfn,aggcombinefn::pg_catalog.oid AS aggcombinefn,aggserialfn::pg_catalog.oid AS aggserialfn,aggdeserialfn::pg_catalog.oid AS aggdeserialfn,aggmtransfn::pg_catalog.oid AS aggmtransfn,aggminvtransfn::pg_catalog.oid AS aggminvtransfn,aggmfinalfn::pg_catalog.oid AS aggmfinalfn FROM pg_catalog.pg_aggregate WHERE aggfnoid=%s::pg_catalog.oid",
                        (r["oid"],),
                    )
                    assert len(a) == 1
                    aggregate += a
                    for key in [
                        "aggtransfn",
                        "aggfinalfn",
                        "aggcombinefn",
                        "aggserialfn",
                        "aggdeserialfn",
                        "aggmtransfn",
                        "aggminvtransfn",
                        "aggmfinalfn",
                    ]:
                        pending.add(a[0][key])
                    type_pending.update([a[0]["aggtranstype"], a[0]["aggmtranstype"]])
        tids = sorted(type_pending - set(types) - {0})
        type_pending.clear()
        if tids:
            found = rows(
                connection,
                "SELECT t.*,typsubscript::pg_catalog.oid AS typsubscript,typinput::pg_catalog.oid AS typinput,typoutput::pg_catalog.oid AS typoutput,typreceive::pg_catalog.oid AS typreceive,typsend::pg_catalog.oid AS typsend,typmodin::pg_catalog.oid AS typmodin,typmodout::pg_catalog.oid AS typmodout,typanalyze::pg_catalog.oid AS typanalyze,n.nspname AS schema FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE t.oid=ANY(%s::pg_catalog.oid[]) ORDER BY t.oid",
                (tids,),
            )
            if len(found) != len(tids):
                raise ValueError("native type OID absent")
            for t in found:
                types[t["oid"]] = t
                type_pending.update([t["typelem"], t["typbasetype"]])
                handlers = {
                    k: t[k]
                    for k in [
                        "typsubscript",
                        "typinput",
                        "typoutput",
                        "typreceive",
                        "typsend",
                        "typmodin",
                        "typmodout",
                        "typanalyze",
                    ]
                    if t[k]
                }
                io.append(
                    {
                        "typeOid": t["oid"],
                        "handlers": handlers,
                        "scope": "native implementation references; no direct EXECUTE requirement inferred",
                    }
                )
                pending.update(handlers.values())
                if t["typrelid"]:
                    type_pending.update(
                        r["atttypid"]
                        for r in rows(
                            connection,
                            "SELECT atttypid FROM pg_catalog.pg_attribute WHERE attrelid=%s::pg_catalog.oid AND attnum>0 AND NOT attisdropped",
                            (t["typrelid"],),
                        )
                    )
        pending.discard(0)

    def tid(oid):
        if not oid:
            return None
        t = types[oid]
        return {"schema": t["schema"], "name": t["typname"], "oid": oid}

    functions = []
    for r in procs.values():
        functions.append(
            {
                "oid": r["oid"],
                "schema": r["schema"],
                "name": r["proname"],
                "arguments": [tid(int(v)) for v in r["arg_oids"]],
                "result": tid(r["prorettype"]),
                "kind": r["prokind"],
                "variadicType": tid(r["provariadic"]),
                "plannerSupportOid": r["prosupport"],
                "languageOid": r["prolang"],
                "securityDefiner": r["prosecdef"],
                "acl": r["proacl"],
                "origin": "analyzed call/operator/cast or explicitly labeled internal implementation reference",
            }
        )
    operators = [
        {
            "oid": r["oid"],
            "schema": r["schema"],
            "symbol": r["oprname"],
            "left": tid(r["oprleft"]),
            "right": tid(r["oprright"]),
            "result": tid(r["oprresult"]),
            "implementationOid": r["oprcode"],
        }
        for r in ops.values()
    ]
    casts = []
    for c in analysis["casts"]:
        src = c.get("sourceTypeOid")
        dst = c.get("targetTypeOid")
        native = (
            rows(
                connection,
                "SELECT * FROM pg_catalog.pg_cast WHERE castsource=%s::pg_catalog.oid AND casttarget=%s::pg_catalog.oid",
                (src, dst),
            )
            if src and dst
            else []
        )
        casts.append(
            {
                **c,
                "source": tid(src) if src else None,
                "target": tid(dst) if dst else None,
                "nativeCatalogCast": native,
                "scope": "exact analyzed cast node; absent pg_cast row for CoerceViaIO is not missing proof",
            }
        )
    return {
        "functions": sorted(functions, key=lambda x: x["oid"]),
        "operators": sorted(operators, key=lambda x: x["oid"]),
        "casts": casts,
        "aggregates": aggregate,
        "sortSupport": sort_support,
        "typeImplementationReferences": io,
        "types": [
            {
                "oid": t["oid"],
                "schema": t["schema"],
                "name": t["typname"],
                "elementOid": t["typelem"],
                "rowRelationOid": t["typrelid"],
            }
            for t in types.values()
        ],
        "directAnalyzedFunctionOids": analysis["functionOids"],
        "internalReferencesAreNotGrantRequirements": True,
    }


def runtime_probe(connection, statement, index, schema):
    from psycopg import sql

    query = statement["sql"]
    name = statement["id"]
    if query.startswith("SET TRANSACTION"):
        return [
            {
                "statement": statement,
                "controlOperation": query,
                "functions": [],
                "operators": [],
                "scope": "transaction control, no invented SQL routine",
            }
        ]
    variants = PARAMS.get(name)
    count = OUTPUTS.get(name)
    if variants is None:
        arity = query.count("%s")
        variants = [("unknown-strings", ["NULL"] * arity)]
        count = (
            1
            if "to_regclass" in query or query.count("set_config(") == 1
            else query.count("set_config(")
        )
    result = []
    for vi, (label, params) in enumerate(variants):
        probe = substitute(query, params)
        view = f"probe_{index}_{vi}"
        cols = sql.SQL(",").join(sql.Identifier("c" + str(i)) for i in range(count))
        connection.execute(
            sql.SQL("CREATE VIEW {}.{} ({}) AS ").format(
                sql.Identifier(schema), sql.Identifier(view), cols
            )
            + sql.SQL(probe)
        )
        definition = connection.execute(
            "SELECT r.ev_action::pg_catalog.text FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s AND r.rulename=%s",
            (schema, view, "_RETURN"),
        ).fetchone()[0]
        analysis = analyze(definition)
        native = resolve(connection, analysis)
        result.append(
            {
                "statement": statement,
                "parameterVariant": label,
                "probeSql": probe,
                "probeSha256": hashlib.sha256(probe.encode()).hexdigest(),
                "view": view,
                "nativeNodeText": definition,
                "nativeNodeSha256": hashlib.sha256(definition.encode()).hexdigest(),
                "analysis": analysis,
                "resolved": native,
            }
        )
    return result


def relation_inventory(connection, probes, probe_schema, first_invalid_attribute):
    references = {}
    for p in probes:
        for item in p.get("analysis", {}).get("relationPermissions", []):
            oid = item["relid"]
            flags = item["requiredPerms"]
            if flags != 2:
                raise ValueError("unexpected runtime metadata permission mask")
            if item.get("checkAsUser", 0):
                raise ValueError("native owner-mediated rule must be separated")
            relation = rows(
                connection,
                "SELECT c.oid,n.nspname AS schema,c.relname,c.relkind,c.relowner,c.reloptions FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=%s::pg_catalog.oid",
                (oid,),
            )[0]
            if relation["schema"] == probe_schema:
                continue
            if relation["schema"] != "pg_catalog":
                raise ValueError(
                    "runtime metadata unexpectedly references noncatalog relation"
                )
            bitmap = item["selectedCols"] or []
            assert not bitmap or bitmap[0] == "b"
            attnums = {int(v) + first_invalid_attribute for v in bitmap[1:]}
            columns = rows(
                connection,
                "SELECT attnum,attname,atttypid,attacl FROM pg_catalog.pg_attribute WHERE attrelid=%s::pg_catalog.oid AND attnum>0 AND NOT attisdropped ORDER BY attnum",
                (oid,),
            )
            whole = 0 in attnums
            selected = [c for c in columns if whole or c["attnum"] in attnums]
            if any(n < 0 for n in attnums):
                raise ValueError("unreviewed native system column ACL")
            entry = references.setdefault(
                oid, {**relation, "wholeRow": False, "columns": {}, "statements": []}
            )
            entry["wholeRow"] |= whole
            for c in selected:
                entry["columns"][c["attname"]] = c
            entry["statements"].append(p["statement"]["id"])
    return [
        {
            **r,
            "columns": list(r["columns"].values()),
            "statements": sorted(set(r["statements"])),
        }
        for r in references.values()
    ]
