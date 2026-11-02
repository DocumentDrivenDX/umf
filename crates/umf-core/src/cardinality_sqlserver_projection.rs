// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored cardinality projection to the pinned SQL Server DDL subset.
use crate::{
    cardinality,
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-sqlserver-projection.schema.json");
const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
const DECLARATION_SCHEMA: &str =
    include_str!("../../../spec/core/cardinality-operation-v4.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";
const BASIS: &str = "Explicit author declaration and selected native carrier; residuals qualify unrepresented obligations";
const BINDING: &str = "umf.core.cardinality.sqlserver";
const NATIVE_VERSION: &str = "16.0.4295.3";

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn s(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(key, _)| key == &k(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn arr(v: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(a)) = v {
        a
    } else {
        &[]
    }
}
fn txt(v: Option<&Value>) -> Option<String> {
    if let Some(Value::String(s)) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn json(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}
struct Runtime {
    engine: Engine,
    registry: Registry,
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static R: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = R.get() {
            return Ok(r.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            json(CORE_SCHEMA, ctx)?,
            json(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            json(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let value = Arc::new(Runtime {
        engine,
        registry: Registry::default(),
    });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = R.set(value.clone());
    }
    Ok(value)
}
fn schemas(ctx: &mut Context<'_>) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let op = json(RESULT_SCHEMA, ctx)?;
    let resources = SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                json(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (k("urn:umf:core:0.10.0"), json(CORE_SCHEMA, ctx)?),
            (
                k("urn:umf:core:cardinality-operation:4.0.0"),
                json(DECLARATION_SCHEMA, ctx)?,
            ),
        ],
    };
    let result = CompiledSchema::compile(&op, &resources, ctx)?;
    let req = get(get(&op, "properties").unwrap_or(&Value::Null), "request")
        .ok_or_else(|| err("CARDINALITY_SQLSERVER_RESULT", "Missing request schema", ""))?;
    Ok((result, CompiledSchema::compile(req, &resources, ctx)?))
}
fn identifier(value: &str, path: &str) -> Result<String, EngineError> {
    if value.is_empty()
        || value.encode_utf16().count() > 128
        || value.trim() != value
        || value.starts_with('#')
        || value.contains('\0')
        || !valid_utf16(value)
    {
        return Err(err("CARDINALITY_SQLSERVER_IDENTIFIER","Expected a permanent, nonempty SQL Server identifier of at most 128 UTF-16 units without edge whitespace",path));
    }
    Ok(format!("[{}]", value.replace(']', "]]")))
}
fn valid_utf16(s: &str) -> bool {
    let units = s.encode_utf16().collect::<Vec<_>>();
    let mut i = 0;
    while i < units.len() {
        let u = units[i];
        if (0xD800..=0xDBFF).contains(&u) {
            if i + 1 >= units.len() || !(0xDC00..=0xDFFF).contains(&units[i + 1]) {
                return false;
            }
            i += 2;
        } else if (0xDC00..=0xDFFF).contains(&u) {
            return false;
        } else {
            i += 1;
        }
    }
    true
}
fn literal(value: &str, path: &str) -> Result<String, EngineError> {
    if value.contains('\0') || !valid_utf16(value) {
        return Err(err(
            "CARDINALITY_SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    Ok(format!("N'{}'", value.replace('\'', "''")))
}
fn pointer(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
fn native_family(native: &str) -> Option<&'static str> {
    Some(match native {
        "bit" => "boolean",
        "tinyint" | "smallint" | "int" | "bigint" => "integer",
        "decimal(38,9)" => "decimal",
        "real" | "float(53)" => "float",
        "nvarchar(max)" => "string",
        "varbinary(max)" => "binary",
        "date" => "date",
        "time(7)" => "time",
        "datetime2(7)" | "datetimeoffset(7)" => "timestamp",
        _ => return None,
    })
}
fn loss(
    out: &mut Vec<Value>,
    path: String,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    out.push(obj(vec![
        ("path", Value::String(Utf16::from(path))),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    let (result_schema, request_schema) = schemas(ctx)?;
    if let Some(d) = request_schema.validate(&request, ctx)?.first() {
        return Err(EngineError::new(
            "CARDINALITY_SQLSERVER_REQUEST",
            d.instance_path.clone(),
            d.message.clone(),
        ));
    }
    let request_text = |name: &str| txt(get(&request, name));
    let native = request_text("nativeType").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_REQUEST",
            "nativeType must be text",
            "/request/nativeType",
        )
    })?;
    let family = native_family(&native).ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_REQUEST",
            "Unsupported SQL Server native type",
            "/request/nativeType",
        )
    })?;
    let run = runtime(ctx)?;
    let mut caps = NoCapabilities;
    let author_target = get(&author_input, "target").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_AUTHOR",
            "Author target is required",
            "/author/target",
        )
    })?;
    let author = cardinality::verify_core_cardinality_declaration(
        &author_input,
        author_target,
        &run.engine,
        &run.registry,
        &mut caps,
        ctx,
    )?;
    let source = copy_json(
        get(&author, "target").ok_or_else(|| {
            err(
                "CARDINALITY_SQLSERVER_AUTHOR",
                "Author target is required",
                "/author/target",
            )
        })?,
        ctx,
    )?;
    if txt(get(&source, "umf")).as_deref() != Some("0.10.0") {
        return Err(err("CARDINALITY_SQLSERVER_VERSION","This binding requires a core 0.10.0 declaration; facet-envelope projection requires a separately qualified binding","/author/target/umf"));
    }
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_AUTHOR",
            "Identity is required",
            "/author/identity",
        )
    })?;
    let module_id = txt(get(identity, "module")).ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_AUTHOR",
            "Module identity is required",
            "/author/identity/module",
        )
    })?;
    let element_id = txt(get(identity, "element")).ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_AUTHOR",
            "Element identity is required",
            "/author/identity/element",
        )
    })?;
    let modules = arr(get(&source, "modules"));
    let mi = modules
        .iter()
        .position(|m| txt(get(m, "id")).as_deref() == Some(&module_id))
        .ok_or_else(|| {
            err(
                "CARDINALITY_SQLSERVER_AUTHOR",
                "Authored module is absent",
                "/author/identity/module",
            )
        })?;
    let module = &modules[mi];
    let elements = arr(get(module, "elements"));
    let ei = elements
        .iter()
        .position(|e| txt(get(e, "id")).as_deref() == Some(&element_id))
        .ok_or_else(|| {
            err(
                "CARDINALITY_SQLSERVER_AUTHOR",
                "Authored element is absent",
                "/author/identity/element",
            )
        })?;
    let element = &elements[ei];
    let path = format!("/modules/{mi}/elements/{ei}");
    if txt(get(element, "kind")).as_deref() != Some("field") {
        return Err(err(
            "CARDINALITY_SQLSERVER_AUTHOR",
            "Cardinality author must identify a Field",
            "/author/identity",
        ));
    }
    let namespace = request_text("namespace").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table = request_text("tableName").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let column = request_text("columnName").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_REQUEST",
            "columnName is required",
            "/request/columnName",
        )
    })?;
    let ns_sql = identifier(&namespace, "/request/namespace")?;
    let table_sql = identifier(&table, "/request/tableName")?;
    let column_sql = identifier(&column, "/request/columnName")?;
    let storage = request_text("storage").unwrap_or_default();
    let mode = request_text("mode").unwrap_or_default();
    let binding=obj(vec![("id",s(BINDING)),("version",s("1.0.0")),("nativeVersion",s(NATIVE_VERSION)),("subset",s("Single authored Field and explicit scalar/checked JSON text carrier; item/value conversion and native equivalence are not implied"))]);
    let cardinality = txt(get(
        get(&author, "provenance").unwrap_or(&Value::Null),
        "cardinality",
    ))
    .unwrap_or_else(|| "unspecified".into());
    let mut residuals = Vec::new();
    if let Some(Value::String(name)) = get(element, "name") {
        if name != &Utf16::from(column.as_str()) {
            loss(
                &mut residuals,
                format!("{path}/name"),
                get(element, "name").unwrap(),
                "Explicit native column name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if let Value::Object(props) = &source {
        for (key, value) in props {
            let Some(key) = key.to_utf8().ok() else {
                continue;
            };
            if !["umf", "id", "modules", "vocabularies"].contains(&key.as_str()) {
                loss(
                    &mut residuals,
                    format!("/{}", pointer(&key)),
                    value,
                    "Document metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Some(v) = get(&source, "vocabularies") {
        if let Value::Object(vocs) = v {
            if !vocs.is_empty() {
                loss(
                    &mut residuals,
                    "/vocabularies".into(),
                    v,
                    "Native vocabulary semantics are not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    for (i, m) in modules.iter().enumerate() {
        if i != mi {
            loss(
                &mut residuals,
                format!("/modules/{i}"),
                m,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Some(Value::String(ns)) = get(m, "namespace") {
            if !ns.is_empty() && ns != &Utf16::from(namespace.as_str()) {
                loss(
                    &mut residuals,
                    format!("/modules/{i}/namespace"),
                    get(m, "namespace").unwrap(),
                    "Native schema name differs from ideal namespace",
                    "not-expressible",
                    ctx,
                )?;
            }
        }
        if let Value::Object(props) = m {
            for (key, value) in props {
                let Some(key) = key.to_utf8().ok() else {
                    continue;
                };
                if !["id", "namespace", "elements"].contains(&key.as_str()) {
                    loss(
                        &mut residuals,
                        format!("/modules/{i}/{}", pointer(&key)),
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
        for (j, e) in arr(get(m, "elements")).iter().enumerate() {
            if j != ei {
                loss(
                    &mut residuals,
                    format!("/modules/{i}/elements/{j}"),
                    e,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Value::Object(props) = element {
        for (key, value) in props {
            let Some(key) = key.to_utf8().ok() else {
                continue;
            };
            if ![
                "id",
                "kind",
                "name",
                "description",
                "scalarType",
                "cardinality",
                "itemType",
            ]
            .contains(&key.as_str())
                && !(key == "extensions" && matches!(value,Value::Object(v) if v.is_empty()))
            {
                loss(
                    &mut residuals,
                    format!("{path}/{}", pointer(&key)),
                    value,
                    "Field metadata is retained but not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    let expected = match storage.as_str() {
        "scalar" => "one",
        "json-array" => "array",
        _ => "map",
    };
    let shape_mismatch = cardinality != "unspecified" && cardinality != expected;
    let mut encoding = storage.clone();
    let mut mapping_outcome = "exact".to_string();
    if shape_mismatch {
        encoding = "carrier-only".into();
        loss(&mut residuals,format!("{path}/cardinality"),get(get(&author,"provenance").unwrap_or(&Value::Null),"cardinality").unwrap_or(&Value::Null),"Selected native representation does not express authored shape; no value conversion is implied","not-expressible",ctx)?;
    }
    if matches!(get(&request, "requireExactValues"), Some(Value::Bool(true))) {
        let reason = if native == "real" {
            "Binary32 narrows binary64 1.0000000000000002 to 1.0"
        } else {
            "This schema binding does not establish exact value-domain conversion"
        };
        loss(
            &mut residuals,
            path.clone(),
            element,
            reason,
            "approximated",
            ctx,
        )?;
    }
    if storage != "scalar" {
        loss(&mut residuals,format!("{path}/cardinality"),get(get(&author,"provenance").unwrap_or(&Value::Null),"cardinality").unwrap_or(&Value::Null),"JSON text storage requires JSON-compatible values within native text limits; arbitrary ideal member domains are not implicitly converted","approximated",ctx)?;
    }
    if storage == "json-object" {
        loss(&mut residuals,format!("{path}/cardinality"),get(get(&author,"provenance").unwrap_or(&Value::Null),"cardinality").unwrap_or(&Value::Null),"ISJSON OBJECT does not enforce unique keys; duplicate-member and comparison intent remain separate","approximated",ctx)?;
    }
    if let Some(item) = get(element, "itemType") {
        let reference = get(item, "module")
            .and_then(|v| txt(Some(v)))
            .zip(get(item, "element").and_then(|v| txt(Some(v))));
        loss(&mut residuals,format!("{path}/itemType"),item,"Item reference is retained; JSON shape checks do not enforce item type, availability or nested constraints","approximated",ctx)?;
        if let Some((im_id, ie_id)) = reference {
            if let Some((im, ie, item_definition)) =
                modules.iter().enumerate().find_map(|(a, m)| {
                    (txt(get(m, "id")).as_deref() == Some(&im_id))
                        .then(|| {
                            arr(get(m, "elements"))
                                .iter()
                                .enumerate()
                                .find(|(_, e)| txt(get(e, "id")).as_deref() == Some(&ie_id))
                                .map(|(b, e)| (a, b, e))
                        })
                        .flatten()
                })
            {
                loss(
                    &mut residuals,
                    format!("/modules/{im}/elements/{ie}"),
                    item_definition,
                    "Full item definition retained; recursive native conversion is not fabricated",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    let clause = match storage.as_str() {
        "scalar" => String::new(),
        "json-array" => format!(" CHECK (ISJSON({column_sql},ARRAY)=1)"),
        _ => format!(" CHECK (ISJSON({column_sql},OBJECT)=1)"),
    };
    let mut sql =
        format!("CREATE TABLE {ns_sql}.{table_sql} ({column_sql} {native} NULL{clause});\n");
    if let Some(description_value) = get(element, "description") {
        let Value::String(description_utf16) = description_value else {
            return Err(err(
                "CARDINALITY_SQLSERVER_TEXT",
                "Description must be a string",
                &format!("{path}/description"),
            ));
        };
        let description = description_utf16.to_utf8().map_err(|_| {
            err(
                "CARDINALITY_SQLSERVER_TEXT",
                "Expected valid Unicode without NUL",
                &format!("{path}/description"),
            )
        })?;
        if description.encode_utf16().count() > 3750 {
            loss(
                &mut residuals,
                format!("{path}/description"),
                get(element, "description").unwrap(),
                "Description exceeds the bounded extended-property value size",
                "not-expressible",
                ctx,
            )?;
        } else {
            sql.push_str(&format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={}, @level2type=N'COLUMN', @level2name={};\n",literal(&description,&format!("{path}/description"))?,literal(&namespace,"/request/namespace")?,literal(&table,"/request/tableName")?,literal(&column,"/request/columnName")?));
        }
    }
    if let Some(stated) = txt(get(element, "scalarType")) {
        if stated != family {
            loss(
                &mut residuals,
                format!("{path}/scalarType"),
                get(element, "scalarType").unwrap(),
                "Explicit native type does not establish the stated scalar family",
                "not-expressible",
                ctx,
            )?;
        }
    }
    if !residuals.is_empty() {
        mapping_outcome = if residuals
            .iter()
            .any(|r| txt(get(r, "outcome")).as_deref() == Some("not-expressible"))
        {
            "not-expressible"
        } else if residuals
            .iter()
            .any(|r| txt(get(r, "outcome")).as_deref() == Some("unknown"))
        {
            "unknown"
        } else {
            "approximated"
        }
        .into();
    }
    let blocked = mode == "strict" && !residuals.is_empty();
    let mut fields = vec![
        ("operation", s("project-cardinality-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        ("binding", binding),
        (
            "mapping",
            obj(vec![
                ("origin", s("authored")),
                ("cardinality", s(&cardinality)),
                ("encoding", s(&encoding)),
                ("basis", s(BASIS)),
                ("idealPath", s(&format!("{path}/cardinality"))),
                ("nativePath", s("/sql")),
                ("outcome", s(&mapping_outcome)),
            ]),
        ),
    ];
    if !blocked {
        fields.push((
            "target",
            obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
        ));
        fields.push(("nativeSql", s(&sql)));
    }
    let diagnostics = Value::Array(
        residuals
            .iter()
            .map(|r| {
                obj(vec![
                    ("code", s("CARDINALITY_MEANING_NOT_PROJECTED")),
                    ("path", get(r, "path").cloned().unwrap_or(Value::Null)),
                    ("message", get(r, "reason").cloned().unwrap_or(Value::Null)),
                    ("severity", s(if blocked { "error" } else { "warning" })),
                ])
            })
            .collect(),
    );
    fields.push(("residuals", Value::Array(residuals)));
    fields.push(("diagnostics", diagnostics));
    let output = obj(fields);
    if let Some(e) = result_schema.validate(&output, ctx)?.first() {
        return Err(EngineError::new(
            "CARDINALITY_SQLSERVER_RESULT",
            e.instance_path.clone(),
            e.message.clone(),
        ));
    }
    Ok(output)
}
pub fn project_cardinality_to_sqlserver(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut normalized = copy_json(v, ctx)?;
    sort(&mut normalized);
    serialization::stringify_compact_metered(&normalized, ctx)
}
fn sort(v: &mut Value) {
    match v {
        Value::Object(m) => {
            m.sort_by(|a, b| a.0.cmp(&b.0));
            for (_, v) in m {
                sort(v)
            }
        }
        Value::Array(a) => {
            for v in a {
                sort(v)
            }
        }
        _ => {}
    }
}
pub fn recover_cardinality_from_sqlserver(
    receipt: &Value,
    native_text: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    let native_text = copy_json(native_text, ctx)?;
    if txt(get(&receipt, "status")).as_deref() != Some("projected") {
        return Err(err(
            "CARDINALITY_SQLSERVER_RECEIPT",
            "Expected projected receipt",
            "/receipt/status",
        ));
    }
    let author = get(&receipt, "author").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_RECEIPT",
            "Missing author",
            "/receipt/author",
        )
    })?;
    let request = get(&receipt, "request").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_RECEIPT",
            "Missing request",
            "/receipt/request",
        )
    })?;
    let expected = project_inner(author, request, ctx)?;
    if canonical(&expected, ctx)? != canonical(&receipt, ctx)? {
        return Err(err(
            "CARDINALITY_SQLSERVER_RECEIPT",
            "Receipt does not match retained source and binding",
            "/receipt",
        ));
    }
    let expected_native = get(&receipt, "nativeSql").ok_or_else(|| {
        err(
            "CARDINALITY_SQLSERVER_RECEIPT",
            "Missing SQL target",
            "/receipt/nativeSql",
        )
    })?;
    let expected_target =
        get(get(&receipt, "target").unwrap_or(&Value::Null), "sql").ok_or_else(|| {
            err(
                "CARDINALITY_SQLSERVER_RECEIPT",
                "Missing target SQL",
                "/receipt/target/sql",
            )
        })?;
    if canonical(expected_native, ctx)? != canonical(&native_text, ctx)?
        || canonical(expected_target, ctx)? != canonical(&native_text, ctx)?
    {
        return Err(err(
            "CARDINALITY_SQLSERVER_STALE",
            "Native target changed; retained report cannot assert recovery",
            "/nativeText",
        ));
    }
    get(&receipt, "source")
        .map(|v| copy_json(v, ctx))
        .transpose()?
        .ok_or_else(|| {
            err(
                "CARDINALITY_SQLSERVER_RECEIPT",
                "Missing retained source",
                "/receipt/source",
            )
        })
}
