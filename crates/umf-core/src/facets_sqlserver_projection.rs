// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned authored Field Facets projection to SQL Server DDL.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use std::sync::{Arc, OnceLock};

const CORE: &str = include_str!("../../../spec/core/schema.json");
const FACET_AUTHOR: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const KIND_AUTHOR: &str = include_str!("../../../spec/core/kind-operation-v6.schema.json");
const RESULT: &str = include_str!("../../../spec/core/facets-sqlserver-projection.schema.json");
const RECOVERY: &str = "Recover source meaning with retained projection receipt; native-only import does not recover author intent";

struct Runtime {
    engine: Engine,
    registry: Registry,
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    if let Some(Value::Array(items)) = value {
        items
    } else {
        &[]
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    if let Some(Value::String(value)) = value {
        Some(value)
    } else {
        None
    }
}
fn text_owned(value: Option<&Value>) -> Option<String> {
    text(value).and_then(|v| v.to_utf8().ok())
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn parse(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
fn runtime(ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(runtime) = CACHE.get() {
            return Ok(runtime.clone());
        }
    }
    let engine = Engine::new(
        ResourceSet::new(
            parse(CORE, ctx)?,
            parse(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse(
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
        let _ = CACHE.set(value.clone());
    }
    Ok(value)
}
fn schemas(
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema, Value), EngineError> {
    let result_value = parse(RESULT, ctx)?;
    let mut resources = rt.engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        k("urn:umf:core:facet-operation:3.0.0"),
        parse(FACET_AUTHOR, ctx)?,
    ));
    resources.entries.push((
        k("urn:umf:core:kind-operation:6.0.0"),
        parse(KIND_AUTHOR, ctx)?,
    ));
    let result = CompiledSchema::compile(&result_value, &resources, ctx)?;
    let properties = get(&result_value, "properties").unwrap_or(&Value::Null);
    let request = get(properties, "request").ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_SCHEMA",
            "Request schema is unavailable",
            "",
        )
    })?;
    let binding_schema = get(properties, "binding").ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_SCHEMA",
            "Binding schema is unavailable",
            "",
        )
    })?;
    let binding = copy_json(
        get(binding_schema, "const").ok_or_else(|| {
            err(
                "FACETS_SQLSERVER_SCHEMA",
                "Binding constant is unavailable",
                "",
            )
        })?,
        ctx,
    )?;
    Ok((
        result,
        CompiledSchema::compile(request, &resources, ctx)?,
        binding,
    ))
}
fn validate(
    schema: &CompiledSchema,
    value: &Value,
    code: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let diagnostics = schema.validate(value, ctx)?;
    if let Some(diagnostic) = diagnostics.first() {
        return Err(EngineError::new(
            code,
            diagnostic.instance_path.clone(),
            diagnostic.message.clone(),
        ));
    }
    Ok(())
}
fn set(target: &mut Value, name: &str, value: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = target else {
        return Err(err("INVARIANT", "Expected object", ""));
    };
    if let Some((_, slot)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
        *slot = value;
    } else {
        fields.push((k(name), value));
    }
    Ok(())
}
fn join_path(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let suffix = Utf16::from(suffix);
    ctx.charge_text(base.len().saturating_add(suffix.len()), base.clone())?;
    let mut units = base.units().to_vec();
    units.extend_from_slice(suffix.units());
    Ok(Utf16::new(units))
}
fn pointer_segment(key: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(key.len());
    for unit in key.units() {
        match unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            value => out.push(*value),
        }
    }
    Utf16::new(out)
}
fn pointer(base: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        key.len().saturating_add(base.len()).saturating_add(1),
        base.clone(),
    )?;
    let mut units = base.units().to_vec();
    units.push(b'/' as u16);
    units.extend_from_slice(pointer_segment(key).units());
    Ok(Utf16::new(units))
}
fn loss(
    out: &mut Vec<Value>,
    path: impl Into<Utf16>,
    value: &Value,
    reason: &str,
    outcome: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let path = path.into();
    out.push(obj(vec![
        ("path", Value::String(path)),
        ("value", copy_json(value, ctx)?),
        ("reason", s(reason)),
        ("outcome", s(outcome)),
        ("recovery", s(RECOVERY)),
    ]));
    Ok(())
}
fn identifier(value: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), k(path))?;
    let text = value
        .to_utf8()
        .map_err(|_| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL", path))?;
    if text.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    if value.is_empty()
        || value.len() > 128
        || text.trim_matches(js_whitespace) != text
        || text.starts_with('#')
    {
        return Err(err("SQLSERVER_IDENTIFIER", "Expected a permanent, nonempty identifier of at most 128 UTF-16 units without edge whitespace", path));
    }
    Ok(format!("[{}]", text.replace(']', "]]")))
}
fn js_whitespace(ch: char) -> bool {
    matches!(
        ch,
        '\u{0009}'
            | '\u{000a}'
            | '\u{000b}'
            | '\u{000c}'
            | '\u{000d}'
            | ' '
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}
fn literal(value: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_work(value.len(), k(path))?;
    let text = value
        .to_utf8()
        .map_err(|_| err("SQLSERVER_TEXT", "Expected valid Unicode without NUL", path))?;
    if text.contains('\0') {
        return Err(err(
            "SQLSERVER_TEXT",
            "Expected valid Unicode without NUL",
            path,
        ));
    }
    Ok(format!("N'{}'", text.replace('\'', "''")))
}
fn canonical(value: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err(
            "LIMIT",
            "Canonical receipt exceeds the depth limit",
            "",
        ));
    }
    match value {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                ctx.charge_work(1, k("/receipt"))?;
                out.push(canonical(item, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (name, value) in fields {
                ctx.charge_work(name.len().saturating_add(1), k("/receipt"))?;
                out.push((name.clone(), canonical(value, ctx, depth + 1)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        _ => copy_json(value, ctx),
    }
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx, 0)? == canonical(b, ctx, 0)?)
}
fn number(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as u64)
        }
        _ => None,
    }
}
fn scalar_family(native: &str) -> Option<&'static str> {
    Some(match native {
        "bit" => "boolean",
        "tinyint" | "smallint" | "int" | "bigint" => "integer",
        "decimal" => "decimal",
        "real" | "float(53)" => "float",
        "nvarchar" | "nchar" | "varchar" | "char" => "string",
        "varbinary" | "binary" => "binary",
        "date" => "date",
        "time(7)" => "time",
        "datetime2(7)" | "datetimeoffset(7)" => "timestamp",
        _ => return None,
    })
}
fn verify_author(
    author: &Value,
    rt: &Runtime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let operation = text_owned(get(author, "operation")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_AUTHOR",
            "Author operation is required",
            "/operation",
        )
    })?;
    let target = get(author, "target").ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_AUTHOR",
            "Author target is required",
            "/target",
        )
    })?;
    let mut caps = NoCapabilities;
    match operation.as_str() {
        "declare-core-facets" => crate::facets::verify_core_facet_declaration(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        ),
        "declare-core-kind" => crate::core_kind::verify_core_kind_declaration(
            author,
            target,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        ),
        _ => Err(err(
            "FACETS_SQLSERVER_AUTHOR",
            "Expected a verified Facet or Field-kind declaration",
            "/operation",
        )),
    }
}
fn selected<'a>(
    source: &'a Value,
    identity: &Value,
    ctx: &mut Context<'_>,
) -> Result<(usize, usize, &'a Value, Utf16), EngineError> {
    let module_id = text(get(identity, "module")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_AUTHOR",
            "Module identity is required",
            "/identity/module",
        )
    })?;
    let element_id = text(get(identity, "element")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_AUTHOR",
            "Element identity is required",
            "/identity/element",
        )
    })?;
    let modules = array(get(source, "modules"));
    for (mi, module) in modules.iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if text(get(module, "id")) != Some(module_id) {
            continue;
        }
        for (ei, element) in array(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if text(get(element, "id")) == Some(element_id) {
                return Ok((
                    mi,
                    ei,
                    element,
                    Utf16::from(format!("/modules/{mi}/elements/{ei}")),
                ));
            }
        }
    }
    Err(err(
        "FACETS_SQLSERVER_AUTHOR",
        "Selected Field identity is unresolved",
        "/identity",
    ))
}
fn current_source(verified: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = get(verified, "target")
        .or_else(|| get(verified, "source"))
        .ok_or_else(|| {
            err(
                "FACETS_SQLSERVER_AUTHOR",
                "Verified author source is missing",
                "/target",
            )
        })?;
    copy_json(source, ctx)
}
fn unknown_content(
    source: &Value,
    selected_module: usize,
    selected_element: usize,
    namespace: &Utf16,
    losses: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Value::Object(fields) = source {
        for (key, value) in fields {
            ctx.charge_work(1, k("/source"))?;
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|known| key == &k(known))
            {
                loss(
                    losses,
                    pointer(&Utf16::default(), key, ctx)?,
                    value,
                    "Document metadata remains in the receipt and is not projected",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    if let Some(Value::Object(vocab)) = get(source, "vocabularies") {
        if !vocab.is_empty() {
            loss(
                losses,
                k("/vocabularies"),
                get(source, "vocabularies").unwrap(),
                "Vocabulary semantics are not projected",
                "unknown",
                ctx,
            )?;
        }
    }
    for (mi, module) in array(get(source, "modules")).iter().enumerate() {
        ctx.charge_work(1, k("/modules"))?;
        if mi != selected_module {
            loss(
                losses,
                format!("/modules/{mi}"),
                module,
                "Other module is outside selected Field projection",
                "unknown",
                ctx,
            )?;
            continue;
        }
        if let Value::Object(fields) = module {
            for (key, value) in fields {
                ctx.charge_work(1, k("/modules"))?;
                let known = key == &k("id")
                    || key == &k("elements")
                    || (key == &k("namespace")
                        && (value == &Value::String(Utf16::default())
                            || value == &Value::String(namespace.clone())));
                if !known {
                    loss(
                        losses,
                        pointer(&Utf16::from(format!("/modules/{mi}")), key, ctx)?,
                        value,
                        "Module metadata is not projected",
                        "unknown",
                        ctx,
                    )?;
                }
            }
        }
        for (ei, element) in array(get(module, "elements")).iter().enumerate() {
            ctx.charge_work(1, k("/modules"))?;
            if ei != selected_element {
                loss(
                    losses,
                    format!("/modules/{mi}/elements/{ei}"),
                    element,
                    "Other element is outside selected Field projection",
                    "unknown",
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}
fn project_inner(
    author_input: &Value,
    request_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, request_schema, binding) = schemas(&rt, ctx)?;
    let author_input = copy_json(author_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    validate(&request_schema, &request, "FACETS_SQLSERVER_REQUEST", ctx)?;
    let author = verify_author(&author_input, &rt, ctx)?;
    let source = current_source(&author, ctx)?;
    if text(get(&source, "umf")) != Some(&k("0.10.0")) {
        return Err(err(
            "FACETS_SQLSERVER_VERSION",
            "Current core 0.10.0 declaration required",
            "/umf",
        ));
    }
    let identity = get(&author, "identity").ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_AUTHOR",
            "Author identity is required",
            "/identity",
        )
    })?;
    let (mi, ei, element, path) = selected(&source, identity, ctx)?;
    if text(get(element, "kind")) != Some(&k("field")) {
        return Err(EngineError::new(
            "FACETS_SQLSERVER_FIELD",
            path.clone(),
            "Selected author must identify a Field",
        ));
    }
    let namespace = text(get(&request, "namespace")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_REQUEST",
            "namespace is required",
            "/request/namespace",
        )
    })?;
    let table_name = text(get(&request, "tableName")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_REQUEST",
            "tableName is required",
            "/request/tableName",
        )
    })?;
    let column_name = text(get(&request, "columnName")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_REQUEST",
            "columnName is required",
            "/request/columnName",
        )
    })?;
    let native = text_owned(get(&request, "nativeType")).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_REQUEST",
            "nativeType is required",
            "/request/nativeType",
        )
    })?;
    let mode = text_owned(get(&request, "mode")).unwrap_or_default();
    let encoding = text_owned(get(&request, "encoding")).unwrap_or_default();
    let obligation = text_owned(get(&request, "obligation")).unwrap_or_default();
    let namespace_sql = identifier(namespace, "/request/namespace", ctx)?;
    let table_sql = identifier(table_name, "/request/tableName", ctx)?;
    let column_sql = identifier(column_name, "/request/columnName", ctx)?;
    let mut residuals = Vec::new();
    let mut mapping_facets = Vec::<(Utf16, Value)>::new();
    unknown_content(&source, mi, ei, namespace, &mut residuals, ctx)?;
    if let Value::Object(fields) = element {
        for (key, value) in fields {
            ctx.charge_work(1, path.clone())?;
            let known = ["id", "kind", "name", "description", "scalarType", "facets"]
                .iter()
                .any(|name| key == &k(name));
            let empty_extensions = key == &k("extensions")
                && matches!(value, Value::Object(members) if members.is_empty());
            if !known && !empty_extensions {
                loss(&mut residuals, pointer(&path, key, ctx)?, value, "Field metadata is retained without implying composition with other concept bindings", "unknown", ctx)?;
            }
        }
    }
    if let Some(name) = text(get(element, "name")) {
        if name != column_name {
            loss(
                &mut residuals,
                join_path(&path, "/name", ctx)?,
                &Value::String(name.clone()),
                "Explicit native column name differs from ideal name",
                "not-expressible",
                ctx,
            )?;
        }
    }
    let mut intended = obj(Vec::new());
    let operation = text_owned(get(&author, "operation")).unwrap_or_default();
    if operation == "declare-core-facets" {
        let mut caps = NoCapabilities;
        let meaning = crate::facets::inspect_core_facets(
            &source,
            identity,
            &rt.engine,
            &rt.registry,
            &mut caps,
            ctx,
        )?;
        let meaning = copy_json(get(&meaning, "meaning").unwrap_or(&Value::Null), ctx)?;
        let state = text_owned(get(&meaning, "state")).unwrap_or_default();
        if state == "known" || state == "partial" {
            intended = crate::facets::historical_core_facet_patch(
                get(&meaning, "interpreted").unwrap_or(&Value::Null),
                &rt.engine,
                ctx,
            )?;
            if state == "partial" {
                loss(&mut residuals, join_path(&path, "/facets", ctx)?, get(&meaning, "facets").unwrap_or(&Value::Null), "Unknown facet qualifiers remain attached; no native interpretation is fabricated", "unknown", ctx)?;
            }
        }
    } else if let Some(facets) = get(element, "facets") {
        loss(
            &mut residuals,
            join_path(&path, "/facets", ctx)?,
            facets,
            "A Field-kind declaration does not establish authorship of facet members",
            "unknown",
            ctx,
        )?;
    }
    let cardinality = text_owned(get(element, "cardinality"));
    let scalar_shape = cardinality
        .as_deref()
        .is_none_or(|value| value == "one" || value == "unspecified")
        && get(element, "itemType").is_none()
        && !array(get(element, "references"))
            .iter()
            .any(|reference| text_owned(get(reference, "role")).as_deref() == Some("record-type"));
    if !scalar_shape {
        loss(
            &mut residuals,
            path.clone(),
            element,
            "Scalar carrier cannot project container or record-valued Field facets",
            "not-expressible",
            ctx,
        )?;
    }
    let family = scalar_family(&native).ok_or_else(|| {
        err(
            "FACETS_SQLSERVER_REQUEST",
            "Unsupported SQL Server carrier",
            "/request/nativeType",
        )
    })?;
    let string_carrier = ["nvarchar", "nchar", "varchar", "char"].contains(&native.as_str());
    let binary_carrier = ["varbinary", "binary"].contains(&native.as_str());
    let variable = ["nvarchar", "varchar", "varbinary"].contains(&native.as_str());
    let mut type_sql = if native == "decimal" {
        "decimal(38,9)".to_string()
    } else if string_carrier || binary_carrier {
        format!("{}({})", native, if variable { "max" } else { "1" })
    } else {
        native.clone()
    };
    let checked = encoding == "checked";
    let modifier = encoding == "type-modifier";
    let mut checks = Vec::<String>::new();
    if let Some(length) = get(&intended, "length") {
        let max = number(get(length, "max"));
        let unit = text_owned(get(length, "unit")).unwrap_or_default();
        let mut expressed = false;
        if scalar_shape && max.is_some_and(|value| value <= 2_147_483_647) {
            let max = max.unwrap();
            if binary_carrier && unit == "byte" {
                if checked && variable {
                    checks.push(format!("DATALENGTH({column_sql}) <= {max}"));
                    expressed = true;
                } else if modifier && max > 0 && max <= 8000 {
                    type_sql = format!("{native}({max})");
                    expressed = true;
                }
            } else if string_carrier && unit == "unicode-scalar" {
                if checked && variable {
                    checks.push(if max == 0 {
                        format!("DATALENGTH({column_sql}) = 0")
                    } else {
                        format!("LEN({column_sql}+N'x')-1 <= {max}")
                    });
                    expressed = true;
                } else if modifier
                    && max > 0
                    && max <= if native.starts_with('n') { 4000 } else { 8000 }
                {
                    type_sql = format!("{native}({max})");
                    expressed = true;
                    loss(&mut residuals, join_path(&path, "/facets/length", ctx)?, length, "Native type size counts UTF-16 units or code-page bytes, not Unicode scalars; supplementary values can be excluded", "approximated", ctx)?;
                }
            }
        }
        if expressed {
            mapping_facets.push((k("length"), copy_json(length, ctx)?));
        } else {
            loss(&mut residuals, join_path(&path, "/facets/length", ctx)?, length, "Selected carrier/encoding cannot honor the length; checked MAX carriers are bounded to 2147483647 and native modifiers require positive bounded sizes", "not-expressible", ctx)?;
        }
    }
    if let Some(width) = get(&intended, "integerWidth") {
        let bits = number(get(width, "bits"));
        let signed = matches!(get(width, "signed"), Some(Value::Bool(true)));
        let mut expressed = false;
        if scalar_shape && bits.is_some_and(|b| (1..=127).contains(&b)) {
            let bits = bits.unwrap() as u32;
            let (min, max) = if signed {
                (-(1i128 << (bits - 1)), (1i128 << (bits - 1)) - 1)
            } else {
                (0, ((1u128 << bits) - 1) as i128)
            };
            let native_bounds = match native.as_str() {
                "tinyint" => Some((0i128, 255i128)),
                "smallint" => Some((i16::MIN as i128, i16::MAX as i128)),
                "int" => Some((i32::MIN as i128, i32::MAX as i128)),
                "bigint" => Some((i64::MIN as i128, i64::MAX as i128)),
                _ => None,
            };
            if let Some((native_min, native_max)) = native_bounds {
                if min >= native_min && max <= native_max {
                    if min == native_min && max == native_max {
                        expressed = true;
                    } else if checked {
                        checks.push(format!("{column_sql} >= {min}"));
                        checks.push(format!("{column_sql} <= {max}"));
                        expressed = true;
                    }
                }
            } else if checked && native == "decimal" {
                let limit = 10i128.pow(38);
                if min > -limit && max < limit {
                    type_sql = "decimal(38,0)".to_string();
                    checks.push(format!("{column_sql} >= {min}"));
                    checks.push(format!("{column_sql} <= {max}"));
                    expressed = true;
                }
            }
        }
        if expressed {
            mapping_facets.push((k("integerWidth"), copy_json(width, ctx)?));
        } else {
            loss(&mut residuals, join_path(&path, "/facets/integerWidth", ctx)?, width, "Selected carrier cannot contain/enforce this integer domain; checked decimal width is bounded by the 38-digit coefficient domain", "not-expressible", ctx)?;
        }
    }
    if let Some(precision_value) = get(&intended, "precision") {
        let precision = number(Some(precision_value)).unwrap_or(0);
        let scale_value = get(&intended, "scale").unwrap_or(&Value::Null);
        let scale = number(Some(scale_value)).unwrap_or(0);
        if scalar_shape && native == "decimal" && precision <= 38 && (checked || modifier) {
            type_sql = format!("decimal({precision},{scale})");
            if checked {
                checks.push(format!("{column_sql} = ROUND({column_sql},{scale},1)"));
            }
            mapping_facets.push((k("precision"), copy_json(precision_value, ctx)?));
            mapping_facets.push((k("scale"), copy_json(scale_value, ctx)?));
        } else {
            loss(&mut residuals, join_path(&path, "/facets", ctx)?, &obj(vec![("precision", copy_json(precision_value, ctx)?), ("scale", copy_json(scale_value, ctx)?)]), "Native decimal precision/scale requires a checked or type-modifier decimal carrier with precision at most 38", "not-expressible", ctx)?;
        }
    }
    if string_carrier {
        type_sql.push_str(" COLLATE Latin1_General_100_CI_AS_SC");
        let length_zero_mapped =
            get(&intended, "length").and_then(|value| number(get(value, "max"))) == Some(0)
                && mapping_facets.iter().any(|(key, _)| key == &k("length"));
        if !length_zero_mapped {
            loss(
                &mut residuals,
                path.clone(),
                element,
                if native.starts_with('n') {
                    "UTF-16 storage admits isolated surrogates; LEN with a sentinel is not Unicode validity enforcement"
                } else {
                    "The selected legacy code page cannot represent the full Unicode scalar domain"
                },
                "not-expressible",
                ctx,
            )?;
        }
    }
    if ["char", "nchar", "binary"].contains(&native.as_str()) {
        loss(
            &mut residuals,
            path.clone(),
            element,
            "Fixed native storage pads values; a maximum length facet does not imply padding",
            "not-expressible",
            ctx,
        )?;
    }
    if obligation == "exact-input" {
        let rounding = native == "real" || native == "decimal" || string_carrier || binary_carrier;
        let reason = if native == "real" {
            "Binary64 1.0000000000000002 narrows to binary32 1.0"
        } else if native == "decimal" {
            "Decimal conversion can round before CHECK evaluation; runtime settings can instead produce errors or NULL"
        } else if rounding {
            "Native conversion can truncate, substitute or pad before CHECK evaluation"
        } else {
            "Catalog carrier and facet enforcement do not prove exact conversion of arbitrary SQL input expressions"
        };
        loss(
            &mut residuals,
            path.clone(),
            element,
            reason,
            if rounding { "approximated" } else { "unknown" },
            ctx,
        )?;
    }
    if let Some(scalar_type) = text(get(element, "scalarType")) {
        if scalar_type != &k(family) {
            loss(&mut residuals, join_path(&path, "/scalarType", ctx)?, &Value::String(scalar_type.clone()), "Native carrier belongs to a different scalar family; the checked representation does not authorize implicit value conversion", "not-expressible", ctx)?;
        }
    }
    let mut comment = String::new();
    if let Some(description) = text(get(element, "description")) {
        match literal(description, "/description", ctx) {
            Ok(description_sql) => {
                if description.len() > 3750 {
                    loss(
                        &mut residuals,
                        join_path(&path, "/description", ctx)?,
                        &Value::String(description.clone()),
                        "Description exceeds bounded extended-property size",
                        "not-expressible",
                        ctx,
                    )?;
                } else {
                    comment = format!("EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value={description_sql}, @level0type=N'SCHEMA', @level0name={}, @level1type=N'TABLE', @level1name={}, @level2type=N'COLUMN', @level2name={};\n", literal(namespace, "/request/namespace", ctx)?, literal(table_name, "/request/tableName", ctx)?, literal(column_name, "/request/columnName", ctx)?);
                }
            }
            Err(error) if error.code == "SQLSERVER_TEXT" => loss(
                &mut residuals,
                join_path(&path, "/description", ctx)?,
                &Value::String(description.clone()),
                "Native comments cannot preserve NUL or unpaired Unicode surrogates",
                "not-expressible",
                ctx,
            )?,
            Err(error) => return Err(error),
        }
    }
    let mut sql = format!(
        "CREATE TABLE {namespace_sql}.{table_sql} ({column_sql} {type_sql} NULL{});\n",
        if checks.is_empty() {
            String::new()
        } else {
            format!(" CHECK ({})", checks.join(" AND "))
        }
    );
    sql.push_str(&comment);
    let has_not_expressible = residuals
        .iter()
        .any(|r| text_owned(get(r, "outcome")).as_deref() == Some("not-expressible"));
    let has_unknown = residuals
        .iter()
        .any(|r| text_owned(get(r, "outcome")).as_deref() == Some("unknown"));
    let has_approx = residuals
        .iter()
        .any(|r| text_owned(get(r, "outcome")).as_deref() == Some("approximated"));
    let outcome = if has_not_expressible {
        "not-expressible"
    } else if has_unknown {
        "unknown"
    } else if has_approx {
        "approximated"
    } else {
        "exact"
    };
    let blocked = mode == "strict" && !residuals.is_empty();
    let mut diagnostics = Vec::with_capacity(residuals.len());
    for residual in &residuals {
        ctx.charge_work(1, k("/diagnostics"))?;
        let path = get(residual, "path")
            .ok_or_else(|| err("INVARIANT", "Residual path is missing", "/residuals/path"))?;
        let reason = get(residual, "reason").ok_or_else(|| {
            err(
                "INVARIANT",
                "Residual reason is missing",
                "/residuals/reason",
            )
        })?;
        diagnostics.push(obj(vec![
            ("code", s("FACETS_MEANING_NOT_PROJECTED")),
            ("path", copy_json(path, ctx)?),
            ("message", copy_json(reason, ctx)?),
            ("severity", s(if blocked { "error" } else { "warning" })),
        ]));
    }
    let mapping = obj(vec![
        ("origin", s("authored")),
        (
            "idealPath",
            Value::String(join_path(&path, "/facets", ctx)?),
        ),
        ("nativePath", s("/sql")),
        ("facets", Value::Object(mapping_facets)),
        (
            "encoding",
            copy_json(get(&request, "encoding").unwrap_or(&Value::Null), ctx)?,
        ),
        ("outcome", s(outcome)),
    ]);
    let mut result = obj(vec![
        ("operation", s("project-facets-sqlserver")),
        ("version", s("1.0.0")),
        ("status", s(if blocked { "blocked" } else { "projected" })),
        ("source", source),
        ("author", author),
        ("request", request),
        ("binding", copy_json(&binding, ctx)?),
        ("mapping", mapping),
        ("residuals", Value::Array(residuals)),
        ("diagnostics", Value::Array(diagnostics)),
    ]);
    if !blocked {
        set(
            &mut result,
            "target",
            obj(vec![("format", s("sqlserver-ddl")), ("sql", s(&sql))]),
        )?;
        set(&mut result, "nativeSql", s(&sql))?;
    }
    validate(&result_schema, &result, "FACETS_SQLSERVER_RESULT", ctx)?;
    Ok(result)
}
pub fn project_facets_to_sqlserver(
    author: &Value,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    project_inner(author, request, ctx)
}
pub fn recover_facets_from_sqlserver(
    receipt_input: &Value,
    native_input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(ctx)?;
    let (result_schema, _, _) = schemas(&rt, ctx)?;
    let receipt = copy_json(receipt_input, ctx)?;
    validate(&result_schema, &receipt, "FACETS_SQLSERVER_RECEIPT", ctx)?;
    if text_owned(get(&receipt, "status")).as_deref() != Some("projected")
        || get(&receipt, "target").is_none()
    {
        return Err(err(
            "FACETS_SQLSERVER_RECEIPT",
            "Expected projected receipt",
            "/status",
        ));
    }
    let author = get(&receipt, "author")
        .ok_or_else(|| err("FACETS_SQLSERVER_RECEIPT", "Author is missing", "/author"))?;
    let request = get(&receipt, "request")
        .ok_or_else(|| err("FACETS_SQLSERVER_RECEIPT", "Request is missing", "/request"))?;
    let expected = project_inner(author, request, ctx)?;
    if !equal(&receipt, &expected, ctx)? {
        return Err(err(
            "FACETS_SQLSERVER_RECEIPT",
            "Receipt disagrees with retained author and request",
            "/receipt",
        ));
    }
    let Value::String(native_text) = native_input else {
        return Err(err(
            "FACETS_SQLSERVER_STALE",
            "Native SQL text is required",
            "/nativeText",
        ));
    };
    if text(get(&receipt, "nativeSql")) != Some(native_text)
        || text(get(get(&receipt, "target").unwrap_or(&Value::Null), "sql")) != Some(native_text)
    {
        return Err(err(
            "FACETS_SQLSERVER_STALE",
            "Native target changed",
            "/nativeText",
        ));
    }
    copy_json(
        get(&receipt, "source")
            .ok_or_else(|| err("FACETS_SQLSERVER_RECEIPT", "Source is missing", "/source"))?,
        ctx,
    )
}
