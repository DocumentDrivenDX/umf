//! End-to-end GraphQL SDL family surface over the concrete Apollo/overlay
//! backend. The core adapter can translate serde_json values at its boundary.
use crate::{apollo_mapper, graphql17_overlay};
use serde_json::{json, Value};

pub const EXTENSION: &str = "umf.graphql";
pub const PROFILE: &str = "graphql-js-17.0.2-sdl";
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Issue {
    pub code: &'static str,
    pub path: String,
    pub error: bool,
    pub message: String,
}
fn err(code: &'static str, path: &str, msg: impl Into<String>) -> Issue {
    Issue {
        code,
        path: path.into(),
        error: true,
        message: msg.into(),
    }
}
fn warn(code: &'static str, path: &str, msg: impl Into<String>) -> Issue {
    Issue {
        code,
        path: path.into(),
        error: false,
        message: msg.into(),
    }
}
fn canonical(v: &Value) -> String {
    match v {
        Value::Object(m) => {
            let mut keys = m.keys().collect::<Vec<_>>();
            keys.sort();
            format!(
                "{{{}}}",
                keys.iter()
                    .map(|k| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&m[*k])
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::Array(a) => format!(
            "[{}]",
            a.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        _ => serde_json::to_string(v).unwrap_or_default(),
    }
}
fn source_ast(source: &str) -> Result<Value, String> {
    source_ast_limit(source, 1_000_000, 128)
}
fn source_ast_limit(source: &str, max_tokens: usize, max_depth: usize) -> Result<Value, String> {
    let (ast, _) = graphql17_overlay::parse_with_overlay_limits(source, max_tokens, max_depth)?;
    Ok(ast)
}

pub fn import(source: &str, id: &str, mode: Option<&str>) -> Result<Value, Vec<Issue>> {
    import_inner(source, id, mode, 1_000_000, 4_000_000, 128)
}
pub fn import_with_limits(
    source: &str,
    id: &str,
    mode: Option<&str>,
    max_tokens: usize,
    max_text_units: usize,
    max_depth: usize,
) -> Result<Value, Vec<Issue>> {
    import_inner(source, id, mode, max_tokens, max_text_units, max_depth)
}
fn import_inner(
    source: &str,
    id: &str,
    mode: Option<&str>,
    max_tokens: usize,
    max_text_units: usize,
    max_depth: usize,
) -> Result<Value, Vec<Issue>> {
    let units = source.encode_utf16().count();
    if units > max_text_units {
        return Err(vec![err(
            "GRAPHQL_LIMIT",
            "/originalSource",
            "Source exceeds text limit",
        )]);
    }
    let mode_requested = mode;
    let mode = mode.unwrap_or("schema");
    if !["schema", "fragment"].contains(&mode) {
        return Err(vec![err(
            "GRAPHQL_MODE",
            "/mode",
            "Mode must be schema or fragment",
        )]);
    }
    let ast = source_ast_limit(source, max_tokens, max_depth)
        .map_err(|e| vec![err("GRAPHQL_PARSE", "/originalSource", e)])?;
    let diagnostics = profile_issues_with_limits(source, &ast, mode, max_tokens, max_depth);
    if diagnostics.iter().any(|d| d.error) {
        return Err(diagnostics);
    }
    let mut payload = json!({"profile":PROFILE,"ast":ast,"originalSource":source});
    if let Some(mode) = mode_requested {
        payload["mode"] = Value::String(mode.into());
    }
    Ok(
        json!({"umf":"0.10.0","id":id,"vocabularies":{(EXTENSION):{"version":"0.1.0"}},"modules":[{"id":"schema","namespace":"","elements":[{"id":"schema","extensions":{(EXTENSION):payload}}]}]}),
    )
}
fn payload<'a>(doc: &'a Value) -> Result<&'a Value, Issue> {
    let modules = doc
        .get("modules")
        .and_then(Value::as_array)
        .ok_or_else(|| err("GRAPHQL_PAYLOAD", "/modules", "Missing modules"))?;
    for m in modules {
        if m.get("id").and_then(Value::as_str) == Some("schema") {
            if let Some(elements) = m.get("elements").and_then(Value::as_array) {
                for e in elements {
                    if e.get("id").and_then(Value::as_str) == Some("schema") {
                        if let Some(p) = e.get("extensions").and_then(|x| x.get(EXTENSION)) {
                            return Ok(p);
                        }
                    }
                }
            }
        }
    }
    Err(err(
        "GRAPHQL_PAYLOAD",
        "",
        "Missing GraphQL SDL schema element payload",
    ))
}
fn payload_mut(doc: &mut Value) -> Result<&mut Value, Issue> {
    let modules = doc
        .get_mut("modules")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| err("GRAPHQL_PAYLOAD", "/modules", "Missing modules"))?;
    for m in modules {
        if m.get("id").and_then(Value::as_str) == Some("schema") {
            if let Some(elements) = m.get_mut("elements").and_then(Value::as_array_mut) {
                for e in elements {
                    if e.get("id").and_then(Value::as_str) == Some("schema") {
                        if let Some(p) = e.get_mut("extensions").and_then(|x| x.get_mut(EXTENSION))
                        {
                            return Ok(p);
                        }
                    }
                }
            }
        }
    }
    Err(err(
        "GRAPHQL_PAYLOAD",
        "",
        "Missing GraphQL SDL schema element payload",
    ))
}
fn profile_issues(source: &str, ast: &Value, mode: &str) -> Vec<Issue> {
    profile_issues_with_limit(source, ast, mode, 1_000_000)
}
fn profile_issues_with_limit(
    source: &str,
    ast: &Value,
    mode: &str,
    max_tokens: usize,
) -> Vec<Issue> {
    profile_issues_with_limits(source, ast, mode, max_tokens, 128)
}
fn profile_issues_with_limits(
    source: &str,
    ast: &Value,
    mode: &str,
    max_tokens: usize,
    max_depth: usize,
) -> Vec<Issue> {
    let mut out = Vec::new();
    for m in
        graphql17_overlay::validate_profile_with_limits(source, ast, mode, max_tokens, max_depth)
    {
        out.push(err("GRAPHQL_SCHEMA", "/ast", m));
    }
    walk_warnings(ast, "/ast", &mut out);
    unknown_fields(ast, "/ast", &mut out);
    if mode == "fragment" {
        out.push(warn("GRAPHQL_FRAGMENT","/ast","Syntax-only SDL fragment: references, roots and composition require an explicit schema context"));
    }
    out
}
fn walk_warnings(v: &Value, path: &str, out: &mut Vec<Issue>) {
    match v {
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                walk_warnings(x, &format!("{path}/{i}"), out)
            }
        }
        Value::Object(m) => {
            match m.get("kind").and_then(Value::as_str) {
                Some("ScalarTypeDefinition") => out.push(warn(
                    "GRAPHQL_SCALAR",
                    path,
                    "Custom scalar coercion and serialization are external to SDL",
                )),
                Some("DirectiveExtension") | Some("DirectiveDefinition")
                    if m.get("directives")
                        .and_then(Value::as_array)
                        .is_some_and(|x| !x.is_empty()) =>
                {
                    out.push(warn(
                        "GRAPHQL_PROFILE_EXTENSION",
                        path,
                        "GraphQL.js grammar addition beyond the September 2025 SDL profile",
                    ))
                }
                Some("Directive") => {
                    if let Some(n) = m
                        .get("name")
                        .and_then(|x| x.get("value"))
                        .and_then(Value::as_str)
                    {
                        if !["deprecated", "specifiedBy", "oneOf"].contains(&n) {
                            out.push(warn(
                                "GRAPHQL_DIRECTIVE",
                                path,
                                "Custom directive behavior is retained but not implemented",
                            ));
                        }
                    }
                }
                _ => {}
            }
            for (k, x) in m {
                walk_warnings(
                    x,
                    &format!("{path}/{}", k.replace('~', "~0").replace('/', "~1")),
                    out,
                )
            }
        }
        _ => {}
    }
}
pub fn inspect(doc: &Value) -> Vec<Issue> {
    inspect_with_limits(doc, 1_000_000, 4_000_000, 128)
}
pub fn inspect_with_limits(
    doc: &Value,
    max_tokens: usize,
    max_text_units: usize,
    max_depth: usize,
) -> Vec<Issue> {
    let p = match payload(doc) {
        Ok(x) => x,
        Err(e) => return vec![e],
    };
    let mut out = Vec::new();
    if let Some(m) = p.as_object() {
        for k in m.keys() {
            if !["profile", "mode", "ast", "originalSource"].contains(&k.as_str()) {
                out.push(warn(
                    "GRAPHQL_REPRESENTATION",
                    &format!("/{}", k),
                    "Unknown payload field has no SDL destination",
                ));
            }
        }
    }
    if p.get("profile").and_then(Value::as_str) != Some(PROFILE) {
        out.push(err(
            "GRAPHQL_PROFILE",
            "/profile",
            "Unsupported GraphQL profile",
        ));
    }
    let Some(ast) = p.get("ast") else {
        return vec![err("GRAPHQL_AST", "/ast", "Missing AST")];
    };
    let Some(source) = p.get("originalSource").and_then(Value::as_str) else {
        return vec![err(
            "GRAPHQL_SOURCE_ARCHIVE",
            "/originalSource",
            "Missing source archive",
        )];
    };
    if source.encode_utf16().count() > max_text_units {
        return vec![err(
            "GRAPHQL_LIMIT",
            "/originalSource",
            "Source exceeds text limit",
        )];
    }
    let mode = p.get("mode").and_then(Value::as_str).unwrap_or("schema");
    if !["schema", "fragment"].contains(&mode) {
        out.push(err(
            "GRAPHQL_MODE",
            "/mode",
            "Mode must be schema or fragment",
        ));
    }
    match source_ast_limit(source, max_tokens, max_depth) {
        Ok(original) => {
            if !original.is_object() {
                out.push(err("GRAPHQL_AST", "/ast", "AST must be object"))
            }
        }
        Err(e) => out.push(err("GRAPHQL_SOURCE_ARCHIVE", "/originalSource", e)),
    };
    let validation_source =
        apollo_mapper::print_umf_ast(ast).unwrap_or_else(|_| source.to_owned());
    out.extend(profile_issues_with_limits(
        &validation_source,
        ast,
        mode,
        max_tokens,
        max_depth,
    ));
    if let Ok(printed) = apollo_mapper::print_umf_ast(ast) {
        match source_ast_limit(&printed, max_tokens, max_depth) {
            Ok(back) if canonical(&back) == canonical(ast) => {}
            Ok(_) => out.push(warn(
                "GRAPHQL_PRINT_CHANGE",
                "/ast",
                "Printing changes AST content; conservative export is blocked",
            )),
            Err(e) => out.push(warn(
                "GRAPHQL_PRINT_CHANGE",
                "/ast",
                format!("Printed AST cannot be reparsed: {e}"),
            )),
        }
    }
    match graphql_adapter_schema_shape(ast) {
        Ok(()) => {}
        Err(e) => out.push(err("GRAPHQL_AST", "/ast", e)),
    }
    out
}
fn graphql_adapter_schema_shape(ast: &Value) -> Result<(), String> {
    if ast.get("kind").and_then(Value::as_str) != Some("Document") {
        return Err("AST kind must be Document".into());
    }
    let defs = ast
        .get("definitions")
        .and_then(Value::as_array)
        .ok_or("Document.definitions must be array")?;
    if defs.is_empty() {
        return Err("SDL document must not be empty".into());
    }
    for d in defs {
        let k = d
            .get("kind")
            .and_then(Value::as_str)
            .ok_or("definition missing kind")?;
        if matches!(k, "OperationDefinition" | "FragmentDefinition") {
            return Err("Executable definitions are excluded".into());
        }
    }
    Ok(())
}
pub fn export(doc: &Value) -> Result<String, Vec<Issue>> {
    export_with_limits(doc, 1_000_000, 4_000_000, 128)
}
pub fn export_with_limits(
    doc: &Value,
    max_tokens: usize,
    max_text_units: usize,
    max_depth: usize,
) -> Result<String, Vec<Issue>> {
    let issues = inspect_with_limits(doc, max_tokens, max_text_units, max_depth);
    if issues
        .iter()
        .any(|x| x.error || x.code == "GRAPHQL_REPRESENTATION" || x.code == "GRAPHQL_PRINT_CHANGE")
    {
        return Err(issues);
    }
    let p = payload(doc).map_err(|e| vec![e])?;
    let ast = p
        .get("ast")
        .ok_or_else(|| vec![err("GRAPHQL_AST", "/ast", "Missing AST")])?;
    let source = p
        .get("originalSource")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            vec![err(
                "GRAPHQL_SOURCE_ARCHIVE",
                "/originalSource",
                "Missing source",
            )]
        })?;
    let parsed = source_ast_limit(source, max_tokens, max_depth)
        .map_err(|e| vec![err("GRAPHQL_SOURCE_ARCHIVE", "/originalSource", e)])?;
    if canonical(&parsed) == canonical(ast) {
        return Ok(source.into());
    }
    apollo_mapper::print_umf_ast(ast).map_err(|e| vec![err("GRAPHQL_PRINT", "/ast", e)])
}

/// Callback mutates a detached AST copy. Source document is committed only when
/// schema validation and native printer/parser canonical comparison both pass.
pub fn edit<F>(doc: &Value, callback: F) -> Result<Value, Vec<Issue>>
where
    F: FnOnce(&mut Value) -> Result<(), String>,
{
    let pre = inspect(doc);
    if pre.iter().any(|i| {
        i.error
            || matches!(
                i.code,
                "GRAPHQL_FRAGMENT"
                    | "GRAPHQL_SCALAR"
                    | "GRAPHQL_DIRECTIVE"
                    | "GRAPHQL_PROFILE_EXTENSION"
                    | "GRAPHQL_REPRESENTATION"
            )
    }) {
        return Err(pre);
    }
    let mut candidate = doc.clone();
    let p = payload_mut(&mut candidate).map_err(|e| vec![e])?;
    let ast = p
        .get_mut("ast")
        .ok_or_else(|| vec![err("GRAPHQL_AST", "/ast", "Missing AST")])?;
    callback(ast).map_err(|e| vec![err("GRAPHQL_EDIT", "/ast", e)])?;
    let output = export(&candidate)?;
    let roundtrip =
        source_ast(&output).map_err(|e| vec![err("GRAPHQL_PRINT_CHANGE", "/ast", e)])?;
    let p = payload(&candidate).map_err(|e| vec![e])?;
    let changed = p
        .get("ast")
        .ok_or_else(|| vec![err("GRAPHQL_AST", "/ast", "Missing AST")])?;
    if canonical(&roundtrip) != canonical(changed) {
        return Err(vec![err(
            "GRAPHQL_PRINT_CHANGE",
            "/ast",
            "Printing changes AST content; edit cannot be committed",
        )]);
    }
    let mode = p.get("mode").and_then(Value::as_str).unwrap_or("schema");
    let errors = profile_issues(&output, &roundtrip, mode)
        .into_iter()
        .filter(|i| i.error)
        .collect::<Vec<_>>();
    if !errors.is_empty() {
        return Err(errors);
    }
    Ok(candidate)
}

fn unknown_fields(ast: &Value, path: &str, out: &mut Vec<Issue>) {
    const COMMON: &[&str] = &["kind"];
    fn allowed(kind: &str) -> &'static [&'static str] {
        match kind {
            "Document" => &["kind", "definitions"],
            "Name" => &["kind", "value"],
            "StringValue" => &["kind", "value", "block"],
            "IntValue" | "FloatValue" | "EnumValue" => &["kind", "value"],
            "BooleanValue" => &["kind", "value"],
            "NullValue" => COMMON,
            "SchemaDefinition" => &["kind", "description", "directives", "operationTypes"],
            "SchemaExtension" => &["kind", "directives", "operationTypes"],
            "OperationTypeDefinition" => &["kind", "operation", "type"],
            "ScalarTypeDefinition" => &["kind", "description", "name", "directives"],
            "ScalarTypeExtension" => &["kind", "name", "directives"],
            "ObjectTypeDefinition" | "InterfaceTypeDefinition" => &[
                "kind",
                "description",
                "name",
                "interfaces",
                "directives",
                "fields",
            ],
            "ObjectTypeExtension" | "InterfaceTypeExtension" => {
                &["kind", "name", "interfaces", "directives", "fields"]
            }
            "UnionTypeDefinition" => &["kind", "description", "name", "directives", "types"],
            "UnionTypeExtension" => &["kind", "name", "directives", "types"],
            "EnumTypeDefinition" => &["kind", "description", "name", "directives", "values"],
            "EnumTypeExtension" => &["kind", "name", "directives", "values"],
            "EnumValueDefinition" => &["kind", "description", "name", "directives"],
            "InputObjectTypeDefinition" => &["kind", "description", "name", "directives", "fields"],
            "InputObjectTypeExtension" => &["kind", "name", "directives", "fields"],
            "DirectiveDefinition" => &[
                "kind",
                "description",
                "name",
                "arguments",
                "directives",
                "repeatable",
                "locations",
            ],
            "DirectiveExtension" => &["kind", "name", "directives"],
            "Directive" => &["kind", "name", "arguments"],
            "Argument" => &["kind", "name", "value"],
            "FieldDefinition" => &[
                "kind",
                "description",
                "name",
                "arguments",
                "type",
                "directives",
            ],
            "InputValueDefinition" => &[
                "kind",
                "description",
                "name",
                "type",
                "defaultValue",
                "directives",
            ],
            "NamedType" => &["kind", "name"],
            "ListType" => &["kind", "type"],
            "NonNullType" => &["kind", "type"],
            "ListValue" => &["kind", "values"],
            "ObjectValue" => &["kind", "fields"],
            "ObjectField" => &["kind", "name", "value"],
            _ => COMMON,
        }
    }
    match ast {
        Value::Array(a) => {
            for (i, v) in a.iter().enumerate() {
                unknown_fields(v, &format!("{path}/{i}"), out)
            }
        }
        Value::Object(m) => {
            let kind = m.get("kind").and_then(Value::as_str).unwrap_or("");
            let fields = allowed(kind);
            for k in m.keys() {
                if !fields.contains(&k.as_str()) {
                    out.push(warn(
                        "GRAPHQL_REPRESENTATION",
                        &format!("{path}/{}", k.replace('~', "~0").replace('/', "~1")),
                        "Unknown AST field has no SDL destination",
                    ));
                }
            }
            for (k, v) in m {
                if k != "kind" {
                    unknown_fields(
                        v,
                        &format!("{path}/{}", k.replace('~', "~0").replace('/', "~1")),
                        out,
                    )
                }
            }
        }
        _ => {}
    }
}

pub fn inspect_payload(p: &Value) -> Vec<Issue> {
    inspect_payload_with_limits(p, 1_000_000, 4_000_000, 128)
}
pub fn inspect_payload_with_limits(
    p: &Value,
    max_tokens: usize,
    max_text_units: usize,
    max_depth: usize,
) -> Vec<Issue> {
    let mut extensions = serde_json::Map::new();
    extensions.insert(EXTENSION.to_owned(), p.clone());
    let doc = json!({"umf":"0.10.0","id":"graphql-validation","vocabularies":{(EXTENSION):{"version":"0.1.0"}},"modules":[{"id":"schema","namespace":"","elements":[{"id":"schema","extensions":extensions}]}]});
    inspect_with_limits(&doc, max_tokens, max_text_units, max_depth)
}

/// Whether the retained source archive no longer parses to the authored AST.
pub fn source_layout_changed(payload: &Value) -> bool {
    let Some(source) = payload.get("originalSource").and_then(Value::as_str) else {
        return true;
    };
    let Some(ast) = payload.get("ast") else {
        return true;
    };
    source_ast(source)
        .map(|parsed| canonical(&parsed) != canonical(ast))
        .unwrap_or(true)
}
