// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned PostgreSQL declaration inventory and declared-table/composite projection.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
const SCHEMA: &str = include_str!("../../../spec/core/postgresql-ddl-kinds.schema.json");
const RECOVERY: &str = "Source and native fragments retained; resolve conflict then recompute whole record classification";
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(v: &Value) -> Option<&Utf16> {
    if let Value::String(x) = v {
        Some(x)
    } else {
        None
    }
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(xs: Vec<(&str, Value)>) -> Value {
    Value::Object(xs.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(n, _)| n == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn arr<'a>(v: &'a Value, k: &str) -> Option<&'a [Value]> {
    match get(v, k) {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    get(v, k).and_then(s)
}
fn err(code: &str, path: &str, msg: &str) -> EngineError {
    EngineError::new(code, u(path), msg)
}
fn set(v: &mut Value, k: &str, x: Value) -> Result<(), EngineError> {
    let Value::Object(m) = v else {
        return Err(err("POSTGRESQL_DDL_TARGET", "", "Expected object"));
    };
    if let Some((_, old)) = m.iter_mut().find(|(n, _)| n == &u(k)) {
        *old = x
    } else {
        m.push((u(k), x))
    }
    Ok(())
}
fn push(v: &mut Value, k: &str, x: Value) {
    if let Some(Value::Array(a)) = get_mut(v, k) {
        a.push(x)
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(n, _)| n == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn read(s: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&s.encode_utf16().collect::<Vec<_>>(), Format::Json, c)
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}
struct Rt {
    engine: Engine,
    registry: Registry,
    request: CompiledSchema,
    result: CompiledSchema,
}
fn runtime(c: &mut Context<'_>) -> Result<Rt, EngineError> {
    let core = |s: &str, c: &mut Context<'_>| read(s, c);
    let engine = Engine::new(
        ResourceSet::new(
            core(include_str!("../../../spec/core/schema.json"), c)?,
            core(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/core/extension-package.schema.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                c,
            )?,
            core(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                c,
            )?,
        ),
        c,
    )?;
    let resources = engine.schema_resources_with_context(c)?;
    let package = core(
        include_str!("../../../spec/extensions/postgresql/package.json"),
        c,
    )?;
    let mut registry = Registry::new();
    registry.register(&package, Some(47), engine.package_schema(), &resources, c)?;
    let schema = core(SCHEMA, c)?;
    let mut schemas = resources;
    schemas
        .entries
        .push((u("urn:umf:core:postgresql-ddl-kinds:1.0.0"), schema.clone()));
    let result = CompiledSchema::compile(&schema, &schemas, c)?;
    let request = CompiledSchema::compile(
        get(
            get(&schema, "properties").unwrap_or(&Value::Null),
            "request",
        )
        .ok_or_else(|| err("SCHEMA", "", "request schema missing"))?,
        &schemas,
        c,
    )?;
    Ok(Rt {
        engine,
        registry,
        request,
        result,
    })
}
fn validate_doc(doc: &Value, r: &Rt, c: &mut Context<'_>) -> Result<(), EngineError> {
    let mut caps = NoCallbacks;
    let report = r.engine.validate_document(doc, &r.registry, &mut caps, c)?;
    let sql_report = crate::postgresql_sql_runtime::inspect_postgresql_sql(doc, c)?;
    if !report.valid
        || get(&sql_report, "valid") != Some(&Value::Bool(true))
        || text(doc, "umf") != Some(&u("0.10.0"))
    {
        return Err(err(
            "POSTGRESQL_DDL_KIND_VERSION",
            "",
            "Valid current 0.10.0 envelope required",
        ));
    }
    Ok(())
}
pub(crate) fn tagged_plain(doc: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let root = crate::postgresql_sql_runtime::get_postgresql_node(doc, &u(""), c)?;
    tagged_to_plain(&root, c)
}
fn tagged_to_plain(root: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let tree = crate::native_json::NativeJsonTree::from_tagged_value(&root, c)?;
    let raw = tree.render_compact(c)?;
    serialization::read_json_value(raw.units(), Format::Json, c)
}
fn native(doc: &Value, path: &str, c: &mut Context<'_>) -> Result<Value, EngineError> {
    crate::postgresql_sql_runtime::get_postgresql_node(doc, &u(path), c)
}
fn scalar_type(col: &Value) -> Option<&'static str> {
    let tn = get(col, "typeName")?;
    let names = arr(tn, "names")?;
    let allowed = [
        "names",
        "typeOid",
        "setof",
        "pct_type",
        "typmods",
        "typemod",
        "arrayBounds",
        "location",
    ];
    if let Value::Object(members) = tn {
        if members
            .iter()
            .any(|(key, _)| !allowed.iter().any(|known| key == &u(known)))
        {
            return None;
        }
    } else {
        return None;
    }
    let type_oid = get(tn, "typeOid").is_some_and(|value| match value {
        Value::Null | Value::Bool(false) => false,
        Value::Number(number) => *number != 0.0,
        Value::String(value) => !value.is_empty(),
        _ => true,
    });
    if get(tn, "setof").is_some_and(|v| v != &Value::Null && v != &Value::Bool(false))
        || get(tn, "pct_type").is_some_and(|v| v != &Value::Null && v != &Value::Bool(false))
        || type_oid
        || arr(tn, "arrayBounds").is_some_and(|a| !a.is_empty())
        || names.len() != 2
    {
        return None;
    }
    let parts: Vec<_> = names
        .iter()
        .filter_map(|n| {
            let Value::Object(fields) = n else {
                return None;
            };
            if fields.len() != 1 || fields[0].0 != u("String") {
                return None;
            }
            let Value::Object(string_fields) = &fields[0].1 else {
                return None;
            };
            if string_fields.len() != 1 || string_fields[0].0 != u("sval") {
                return None;
            }
            s(&string_fields[0].1)
        })
        .collect();
    if parts.len() != 2 || parts[0] != &u("pg_catalog") {
        return None;
    }
    match parts[1].to_utf8().ok()?.as_str() {
        "bool" => Some("boolean"),
        "int2" | "int4" | "int8" => Some("integer"),
        "numeric" => Some("decimal"),
        "float4" | "float8" => Some("float"),
        "text" | "varchar" | "bpchar" => Some("string"),
        "bytea" => Some("binary"),
        "date" => Some("date"),
        "time" | "timetz" => Some("time"),
        "timestamp" | "timestamptz" => Some("timestamp"),
        _ => None,
    }
}
fn declarations_inner(doc: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let tree = tagged_plain(doc, c)?;
    let mut declarations = Vec::new();
    let mut unhandled = Vec::new();
    let sql_report = crate::postgresql_sql_runtime::inspect_postgresql_sql(doc, c)?;
    let mut diagnostics = arr(&sql_report, "diagnostics")
        .unwrap_or(&[])
        .iter()
        .map(|value| copy_json(value, c))
        .collect::<Result<Vec<_>, _>>()?;
    fn visit(
        doc: &Value,
        node: &Value,
        path: &str,
        idx: usize,
        ctx: Option<&Value>,
        decls: &mut Vec<Value>,
        unhandled: &mut Vec<Value>,
        diags: &mut Vec<Value>,
        c: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        c.charge_work(1, u(path))?;
        if let Some(body) = get(node, "CreateSchemaStmt") {
            if let Some(children) = arr(body, "schemaElts") {
                for (i, ch) in children.iter().enumerate() {
                    visit(
                        doc,
                        ch,
                        &format!("{path}/CreateSchemaStmt/schemaElts/{i}"),
                        idx,
                        get(body, "schemaname"),
                        decls,
                        unhandled,
                        diags,
                        c,
                    )?
                }
            }
            diags.push(obj(vec![("code",t("POSTGRESQL_DECLARATION_CONTEXT")),("path",t(path)),("severity",t("warning")),("message",t("CREATE SCHEMA context retained; authorization and execution order are not resolved"))]));
            return Ok(());
        }
        let (kind, key, body, base, basepath) = if let Some(b) = get(node, "CompositeTypeStmt") {
            (
                "create-composite",
                "CompositeTypeStmt",
                b,
                b,
                format!("{path}/CompositeTypeStmt"),
            )
        } else if let Some(b) = get(node, "CreateStmt") {
            (
                "create-table",
                "CreateStmt",
                b,
                b,
                format!("{path}/CreateStmt"),
            )
        } else if let Some(b) = get(node, "CreateForeignTableStmt") {
            (
                "create-foreign-table",
                "CreateForeignTableStmt",
                b,
                get(b, "base").unwrap_or(b),
                format!("{path}/CreateForeignTableStmt/base"),
            )
        } else if let Some(b) = get(node, "AlterTableStmt") {
            (
                "alter-table",
                "AlterTableStmt",
                b,
                b,
                format!("{path}/AlterTableStmt"),
            )
        } else {
            unhandled.push(obj(vec![
                ("path", t(path)),
                ("nativeStatement", native(doc, path, c)?),
            ]));
            diags.push(obj(vec![
                ("code", t("POSTGRESQL_DDL_UNRESOLVED")),
                ("path", t(path)),
                ("severity", t("warning")),
                (
                    "message",
                    t("Statement is retained without declaration extraction or execution"),
                ),
            ]));
            return Ok(());
        };
        let relationpath = if kind == "create-composite" {
            format!("{basepath}/typevar")
        } else {
            format!("{basepath}/relation")
        };
        let relation = get(
            base,
            if kind == "create-composite" {
                "typevar"
            } else {
                "relation"
            },
        );
        if relation.is_none() {
            unhandled.push(obj(vec![
                ("path", t(path)),
                ("nativeStatement", native(doc, path, c)?),
            ]));
            diags.push(obj(vec![
                ("code", t("POSTGRESQL_DDL_UNRESOLVED")),
                ("path", t(path)),
                ("severity", t("warning")),
                ("message", t("Declaration has no relation observation")),
            ]));
            return Ok(());
        }
        let rel = relation.unwrap();
        let mut cols = Vec::new();
        let mut expansion = kind == "alter-table"
            || arr(base, "inhRelations").is_some_and(|a| !a.is_empty())
            || get(base, "ofTypename").is_some()
            || get(base, "partbound").is_some();
        let sourcearr = if kind == "create-composite" {
            arr(body, "coldeflist")
        } else if kind == "alter-table" {
            arr(base, "cmds")
        } else {
            arr(base, "tableElts")
        };
        if let Some(items) = sourcearr {
            for (i, item) in items.iter().enumerate() {
                let (col, colpath, targetname) = if kind == "alter-table" {
                    let cmd = get(item, "AlterTableCmd");
                    (
                        cmd.and_then(|x| get(get(x, "def")?, "ColumnDef")),
                        format!("{basepath}/cmds/{i}/AlterTableCmd/def/ColumnDef"),
                        cmd.and_then(|x| get(x, "name")),
                    )
                } else {
                    (
                        get(item, "ColumnDef"),
                        format!(
                            "{basepath}/{}",
                            if kind == "create-composite" {
                                "coldeflist"
                            } else {
                                "tableElts"
                            }
                        ) + &format!("/{i}/ColumnDef"),
                        None,
                    )
                };
                if let Some(col) = col {
                    let st = scalar_type(col);
                    if st.is_none() {
                        diags.push(obj(vec![("code",t("POSTGRESQL_DDL_UNRESOLVED")),("path",t(&format!("{colpath}/typeName"))),("severity",t("warning")),("message",t("Type remains unresolved, structured, array-valued or outside the known qualified builtin families"))]))
                    }
                    let cname = get(col, "colname").or(targetname);
                    let mut element = obj(vec![("id", t(&colpath)), ("extensions", obj(vec![]))]);
                    if let Some(n) = cname.and_then(s) {
                        set(&mut element, "name", Value::String(n.clone()))?
                    }
                    if let Some(typ) = st {
                        set(&mut element, "scalarType", t(typ))?
                    }
                    cols.push(obj(vec![
                        ("path", t(&colpath)),
                        ("element", element),
                        (
                            "typeResolution",
                            t(if st.is_some() {
                                "builtin-syntax"
                            } else {
                                "unresolved"
                            }),
                        ),
                        ("nativeColumn", native(doc, &colpath, c)?),
                    ]));
                } else if kind != "alter-table" && get(item, "Constraint").is_none() {
                    expansion = true
                }
            }
        }
        if expansion {
            diags.push(obj(vec![("code",t("POSTGRESQL_DDL_EXPANSION")),("path",t(&basepath)),("severity",t("warning")),("message",t("Inheritance, LIKE, typed/partition tables or ALTER effects require catalog expansion; extracted columns are explicit syntax only"))]))
        }
        let mut d = obj(vec![
            ("path", t(&format!("{path}/{key}"))),
            ("statementIndex", Value::Number(idx as f64)),
            ("kind", t(kind)),
            (
                "schemaContext",
                match ctx {
                    Some(v) => copy_json(v, c)?,
                    None => Value::Null,
                },
            ),
            ("requiresCatalogExpansion", Value::Bool(expansion)),
            ("relation", native(doc, &relationpath, c)?),
            ("columns", Value::Array(cols)),
            ("nativeStatement", native(doc, &format!("{path}/{key}"), c)?),
        ]);
        if kind == "create-composite" && get(body, "typevar").is_none() {
            unhandled.push(obj(vec![
                ("path", t(path)),
                ("nativeStatement", native(doc, path, c)?),
            ]));
            return Ok(());
        }
        let _ = rel;
        decls.push(d);
        Ok(())
    }
    let stmts = arr(&tree, "stmts").unwrap_or(&[]);
    for (i, stmt) in stmts.iter().enumerate() {
        if let Some(node) = get(stmt, "stmt") {
            visit(
                doc,
                node,
                &format!("/stmts/{i}/stmt"),
                i,
                None,
                &mut declarations,
                &mut unhandled,
                &mut diagnostics,
                c,
            )?
        }
    }
    Ok(obj(vec![
        ("status", t("observed")),
        ("complete", Value::Bool(false)),
        ("declarations", Value::Array(declarations)),
        ("unhandled", Value::Array(unhandled)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}
pub fn declarations(doc: &Value, c: &mut Context<'_>) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    let report = crate::postgresql_sql_runtime::inspect_postgresql_sql(doc, c)?;
    if get(&report, "valid") != Some(&Value::Bool(true)) {
        return Ok(obj(vec![
            ("status", t("blocked")),
            ("complete", Value::Bool(false)),
            ("declarations", Value::Array(Vec::new())),
            ("unhandled", Value::Array(Vec::new())),
            (
                "diagnostics",
                copy_json(get(&report, "diagnostics").unwrap_or(&Value::Null), c)?,
            ),
        ]));
    }
    validate_doc(doc, &r, c)?;
    declarations_inner(doc, c)
}
pub fn prepare_parser_request(
    source: &Value,
    request: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    if !r.request.validate(request, c)?.is_empty() {
        return Err(err(
            "POSTGRESQL_DDL_KIND_REQUEST",
            "",
            "Invalid PostgreSQL DDL request",
        ));
    }
    validate_doc(source, &r, c)?;
    Ok(obj(vec![(
        "sql",
        crate::postgresql_sql_runtime::get_postgresql_source(source, c)?,
    )]))
}
fn validate_result(v: &Value, r: &Rt, c: &mut Context<'_>, code: &str) -> Result<(), EngineError> {
    if r.result.validate(v, c)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match PostgreSQL DDL classification schema",
        ))
    }
}
fn classify_inner(
    source: &Value,
    request: &Value,
    parser: &Value,
    r: &Rt,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !r.request.validate(request, c)?.is_empty() {
        return Err(err(
            "POSTGRESQL_DDL_KIND_REQUEST",
            "",
            "Invalid PostgreSQL DDL request",
        ));
    }
    validate_doc(source, r, c)?;
    let captured = crate::postgresql_sql_runtime::get_postgresql_node(source, &u(""), c)?;
    let captured_plain = tagged_to_plain(&captured, c)?;
    if !equal(&captured_plain, parser, c, 0)? {
        return Err(err(
            "POSTGRESQL_DDL_KIND_ARCHIVE",
            "/nativeSource",
            "Source archive differs from parser evidence; reimport reviewed native text before classification",
        ));
    }
    let inventory = declarations_inner(source, c)?;
    let declarations = arr(&inventory, "declarations").unwrap_or(&[]);
    let wanted = text(request, "declaration").unwrap();
    let declaration = declarations
        .iter()
        .find(|d| text(d, "path") == Some(wanted))
        .ok_or_else(|| {
            err(
                "POSTGRESQL_DDL_KIND_DECLARATION",
                "/declaration",
                "Selected native declaration is absent or unavailable",
            )
        })?;
    let kind = text(declaration, "kind").cloned().unwrap_or_default();
    let composite = kind == u("create-composite");
    let binding = if composite {
        obj(vec![("id",t("umf.postgresql.ddl.composite")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Explicit CREATE TYPE AS composite attributes only; no type resolution or statement replay"))])
    } else {
        obj(vec![("id",t("umf.postgresql.ddl.record")),("version",t("1.0.0")),("nativeVersion",t("17.4")),("subset",t("Explicit CREATE TABLE declaration only; no catalog expansion or statement replay"))])
    };
    let mut out=obj(vec![("operation",t("classify-postgresql-ddl-record")),("version",t("1.0.0")),("status",t("classified")),("source",copy_json(source,c)?),("request",copy_json(request,c)?),("binding",binding),("scope",t("declared-only")),("namespaceResolution",t("unresolved")),("mappings",Value::Array(Vec::new())),("residuals",Value::Array(Vec::new())),("diagnostics",Value::Array(vec![obj(vec![("code",t("POSTGRESQL_DECLARATION_ONLY")),("path",copy_json(get(declaration,"path").unwrap(),c)?),("message",t("Declared structure only; no catalog resolution, execution or later-statement replay")),("severity",t("warning"))])]))]);
    let strict = text(request, "mode") == Some(&u("strict"));
    let loss = |out: &mut Value,
                code: &str,
                path: &Value,
                value: &Value,
                reason: &str,
                fatal: bool,
                c: &mut Context<'_>|
     -> Result<(), EngineError> {
        let blocked = fatal || strict;
        if blocked {
            set(out, "status", t("blocked"))?
        }
        let residual = obj(vec![
            ("path", copy_json(path, c)?),
            ("value", copy_json(value, c)?),
            ("reason", t(reason)),
            ("recovery", t(RECOVERY)),
        ]);
        push(out, "residuals", residual);
        push(
            out,
            "diagnostics",
            obj(vec![
                ("code", t(code)),
                ("path", copy_json(path, c)?),
                ("message", t(reason)),
                ("severity", t(if blocked { "error" } else { "warning" })),
            ]),
        );
        Ok(())
    };
    let path = get(declaration, "path").unwrap();
    let native_statement = get(declaration, "nativeStatement").unwrap();
    let reqmodule = text(request, "module").unwrap();
    let modules = arr(source, "modules").unwrap_or(&[]);
    if modules.iter().any(|m| text(m, "id") == Some(reqmodule)) {
        loss(
            &mut out,
            "POSTGRESQL_DDL_KIND_COLLISION",
            &t("/modules"),
            &Value::String(reqmodule.clone()),
            "Output module already exists; existing meaning cannot be overwritten",
            true,
            c,
        )?
    }
    if ![u("create-table"), u("create-composite")].contains(&kind)
        || get(declaration, "requiresCatalogExpansion") == Some(&Value::Bool(true))
    {
        loss(
            &mut out,
            "POSTGRESQL_DDL_KIND_EXPANSION",
            path,
            native_statement,
            "Only explicit table/composite member lists without catalog expansion are covered",
            true,
            c,
        )?
    }
    // The declaration inventory retains `relation` as a tagged NativeJson
    // fragment, while the projection consumes the decoded PostgreSQL AST.
    // Decode only the observation used for decisions and keep the tagged value
    // intact for residual evidence.
    let relation_fragment = get(declaration, "relation").unwrap_or(&Value::Null);
    let relation = tagged_to_plain(relation_fragment, c)?;
    let members = &relation;
    let relname = text(members, "relname").ok_or_else(|| {
        err(
            "POSTGRESQL_DDL_KIND_RELATION",
            "/relation",
            "Missing native relation name",
        )
    })?;
    let explicit = text(members, "schemaname");
    let schema_context = get(declaration, "schemaContext").and_then(s);
    let namespace = explicit.or(schema_context);
    let resolution = if explicit.is_some() {
        "explicit"
    } else if schema_context.is_some() {
        "create-schema-context"
    } else {
        "unresolved"
    };
    set(&mut out, "namespaceResolution", t(resolution))?;
    if namespace.is_none() {
        loss(&mut out,"POSTGRESQL_DDL_NAMESPACE",path,relation_fragment,"Unqualified relation requires search_path; empty core namespace makes no default-schema assertion",false,c)?
    }
    let columns = arr(declaration, "columns").unwrap_or(&[]);
    let record_id = text(request, "recordId").unwrap();
    let module_len = modules.len();
    let base = format!("/modules/{module_len}/elements");
    let mut names = std::collections::BTreeSet::new();
    let mut elements = Vec::new();
    let mut maps = Vec::new();
    for (i, col) in columns.iter().enumerate() {
        let colname = text(get(col, "element").unwrap_or(&Value::Null), "name");
        if colname.is_none() || !names.insert(colname.unwrap().clone()) {
            loss(
                &mut out,
                "POSTGRESQL_DDL_MEMBER_NAME",
                get(col, "path").unwrap_or(path),
                get(col, "nativeColumn").unwrap_or(&Value::Null),
                "Declared column names must be nonempty and unique",
                true,
                c,
            )?
        }
        let mut element = copy_json(get(col, "element").unwrap_or(&Value::Null), c)?;
        let suffix = format!("/field/{i}");
        let mut id = record_id.units().to_vec();
        id.extend(suffix.encode_utf16());
        set(&mut element, "id", Value::String(Utf16::new(id)))?;
        set(&mut element, "kind", t("field"))?;
        elements.push(element);
        let basis = if composite {
            "checked-raw-composite-declaration"
        } else {
            "checked-raw-column-declaration"
        };
        let fieldpath = get(col, "path").unwrap_or(path);
        maps.push(obj(vec![
            ("origin", t("classified")),
            ("kind", t("field")),
            ("idealPath", t(&format!("{base}/{}/kind", i + 1))),
            ("nativePath", copy_json(fieldpath, c)?),
            (
                "nativeFragment",
                copy_json(get(col, "nativeColumn").unwrap_or(&Value::Null), c)?,
            ),
            ("basis", t(basis)),
            ("outcome", t("exact")),
        ]));
    }
    maps.insert(
        0,
        obj(vec![
            ("origin", t("classified")),
            ("kind", t("record")),
            ("idealPath", t(&format!("{base}/0/kind"))),
            ("nativePath", copy_json(path, c)?),
            ("nativeFragment", copy_json(native_statement, c)?),
            (
                "basis",
                t(if composite {
                    "checked-raw-composite-declaration"
                } else {
                    "checked-raw-table-declaration"
                }),
            ),
            (
                "outcome",
                t(if text(&out, "status") == Some(&u("classified")) {
                    "exact"
                } else {
                    "unknown"
                }),
            ),
        ]),
    );
    set(&mut out, "mappings", Value::Array(maps))?;
    if text(&out, "status") == Some(&u("classified")) {
        let mut refs = Vec::new();
        for el in &elements {
            refs.push(obj(vec![
                ("role", t("member")),
                ("module", Value::String(reqmodule.clone())),
                ("element", copy_json(get(el, "id").unwrap(), c)?),
            ]))
        }
        let record = obj(vec![
            (
                "id",
                Value::String(text(request, "recordId").unwrap().clone()),
            ),
            ("name", Value::String(relname.clone())),
            ("kind", t("record")),
            ("extensions", obj(vec![])),
            ("references", Value::Array(refs)),
        ]);
        let mut es = vec![record];
        es.extend(elements);
        let module = obj(vec![
            ("id", Value::String(reqmodule.clone())),
            (
                "namespace",
                namespace.map_or(Value::String(Utf16::default()), |x| {
                    Value::String(x.clone())
                }),
            ),
            ("elements", Value::Array(es)),
        ]);
        let mut target = copy_json(source, c)?;
        let Value::Array(ms) = get_mut(&mut target, "modules")
            .ok_or_else(|| err("POSTGRESQL_DDL_TARGET", "/modules", "Modules missing"))?
        else {
            return Err(err(
                "POSTGRESQL_DDL_TARGET",
                "/modules",
                "Modules must be an array",
            ));
        };
        ms.push(module);
        validate_doc(&target, r, c)?;
        set(&mut out, "target", target)?
    }
    validate_result(&out, r, c, "POSTGRESQL_DDL_KIND_RESULT")?;
    Ok(out)
}
pub fn classify(
    source: &Value,
    request: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    let source = copy_json(source, c)?;
    let request = copy_json(request, c)?;
    classify_inner(&source, &request, parser, &r, c)
}
fn equal(a: &Value, b: &Value, c: &mut Context<'_>, d: usize) -> Result<bool, EngineError> {
    if d > c.limits().max_depth {
        return Err(err("LIMIT", "", "Comparison depth exceeded"));
    }
    c.charge_work(1, Utf16::default())?;
    match (a, b) {
        (Value::String(x), Value::String(y)) => {
            c.charge_work(x.len().saturating_add(y.len()), Utf16::default())?;
            Ok(x == y)
        }
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (k, v) in x {
                let mut other = None;
                for (name, value) in y {
                    c.charge_work(
                        k.len().saturating_add(name.len()).saturating_add(1),
                        Utf16::default(),
                    )?;
                    if name == k {
                        other = Some(value);
                        break;
                    }
                }
                let Some(w) = other else {
                    return Ok(false);
                };
                if !equal(v, w, c, d + 1)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (i, v) in x.iter().enumerate() {
                if !equal(v, &y[i], c, d + 1)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(a == b),
    }
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let r = runtime(c)?;
    validate_result(receipt, &r, c, "POSTGRESQL_DDL_KIND_RECEIPT")?;
    if text(receipt, "status") != Some(&u("classified")) {
        return Err(err(
            "POSTGRESQL_DDL_KIND_RECEIPT",
            "/status",
            "Expected classified receipt",
        ));
    }
    let expected = classify_inner(
        get(receipt, "source").unwrap(),
        get(receipt, "request").unwrap(),
        parser,
        &r,
        c,
    )?;
    if !equal(receipt, &expected, c, 0)? {
        return Err(err(
            "POSTGRESQL_DDL_KIND_RECEIPT",
            "",
            "Receipt differs from recomputation",
        ));
    }
    if !equal(current, get(receipt, "target").unwrap(), c, 0)? {
        return Err(err(
            "POSTGRESQL_DDL_KIND_STALE",
            "",
            "Current model changed",
        ));
    }
    copy_json(receipt, c)
}
pub fn recover(
    receipt: &Value,
    current: &Value,
    parser: &Value,
    c: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let checked = verify(receipt, current, parser, c)?;
    let source = get(&checked, "source").unwrap();
    s(&crate::postgresql_sql_runtime::get_postgresql_source(
        source, c,
    )?)
    .cloned()
    .ok_or_else(|| {
        err(
            "POSTGRESQL_DDL_KIND_RECEIPT",
            "/source",
            "Native source required",
        )
    })
}
