//! GraphQL package registration and native operations on UMF's ordered core Value.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use serde_json::{json, Value as Json};
const TOKEN: u64 = 0x4752_4150_4851_4c01;
const EXT: &str = "umf.graphql";
pub struct GraphqlResources {
    engine: Engine,
    registry: Registry,
}
impl GraphqlResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(src: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let u = src.encode_utf16().collect::<Vec<_>>();
            ctx.charge_text(u.len(), Utf16::default())?;
            serialization::read_json_value(&u, Format::Json, ctx)
        }
        let engine = Engine::new(
            ResourceSet::new(
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let package = read(
            include_str!("../../../spec/extensions/graphql/package.json"),
            ctx,
        )?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn member<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &key(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn member_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &key(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn text(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn object(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn array(v: Vec<Value>) -> Value {
    Value::Array(v)
}
fn strv(s: &str) -> Value {
    Value::String(Utf16::from(s))
}
fn preflight_value(
    v: &Value,
    depth: usize,
    path: Utf16,
    ctx: &mut Context<'_>,
    count: &mut usize,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            path,
            "GraphQL JSON depth limit exceeded",
        ));
    }
    *count = (*count).saturating_add(1);
    ctx.check_tree_value_count(*count, path.clone())?;
    ctx.charge_work(1, path.clone())?;
    match v {
        Value::String(s) => ctx.charge_text(s.len(), path)?,
        Value::Array(items) => {
            for (i, x) in items.iter().enumerate() {
                preflight_value(
                    x,
                    depth + 1,
                    Utf16::from(format!("{}/{}", path.to_utf8().unwrap_or_default(), i)),
                    ctx,
                    count,
                )?
            }
        }
        Value::Object(items) => {
            for (k, x) in items {
                let seg = k.to_utf8().unwrap_or_else(|_| "<utf16>".into());
                preflight_value(
                    x,
                    depth + 1,
                    Utf16::from(format!(
                        "{}/{}",
                        path.to_utf8().unwrap_or_default(),
                        seg.replace('~', "~0").replace('/', "~1")
                    )),
                    ctx,
                    count,
                )?
            }
        }
        _ => {}
    }
    Ok(())
}
fn preflight_payload(p: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let mut count = 0usize;
    preflight_value(p, 0, key("/extensions/umf.graphql"), ctx, &mut count)?;
    let source_units = member(p, "originalSource")
        .and_then(|v| {
            if let Value::String(s) = v {
                Some(s.len())
            } else {
                None
            }
        })
        .unwrap_or(0);
    let estimate = count
        .saturating_mul(8)
        .saturating_add(source_units.saturating_mul(8));
    ctx.charge_work(estimate, key("/extensions/umf.graphql"))
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn find_payload(doc: &Value) -> Option<&Value> {
    let ms = member(doc, "modules")?;
    let Value::Array(ms) = ms else { return None };
    for m in ms {
        if text(member(m, "id")?)?.as_str() == "schema" {
            let es = member(m, "elements")?;
            let Value::Array(es) = es else { continue };
            for e in es {
                if text(member(e, "id")?)?.as_str() == "schema" {
                    if let Some(p) = member(member(e, "extensions")?, EXT) {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}
fn find_payload_mut(doc: &mut Value) -> Option<&mut Value> {
    let ms = member_mut(doc, "modules")?;
    let Value::Array(ms) = ms else { return None };
    for m in ms {
        if text(member(m, "id")?)? == "schema" {
            let Some(es) = member_mut(m, "elements") else {
                continue;
            };
            let Value::Array(es) = es else { continue };
            for e in es {
                if text(member(e, "id")?)? == "schema" {
                    if let Some(p) = member_mut(member_mut(e, "extensions")?, EXT) {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}
fn project_payload(p: &Value) -> Result<Json, String> {
    let mut m = serde_json::Map::new();
    for k in ["profile", "mode", "originalSource"] {
        if let Some(v) = member(p, k) {
            m.insert(k.into(), crate::core_value_bridge::from_core(v)?);
        }
    }
    if let Some(ast) = member(p, "ast") {
        m.insert("ast".into(),crate::core_value_bridge::from_core(ast).map_err(|_|"GRAPHQL_REPRESENTATION: AST contains UTF-16 content without a safe GraphQL JSON projection")?);
    }
    Ok(Json::Object(m))
}
fn issues_diags(items: Vec<crate::graphql_adapter::Issue>) -> Vec<Diagnostic> {
    items
        .into_iter()
        .map(|i| Diagnostic {
            code: Utf16::from(i.code),
            path: Utf16::from(i.path),
            python_source_path: false,
            message: Utf16::from(i.message),
            severity: if i.error {
                Severity::Error
            } else {
                Severity::Warning
            },
            python_text_origin: None,
        })
        .collect()
}
fn unknown_payload_diagnostics(payload: &Value) -> Vec<Diagnostic> {
    let Value::Object(fields) = payload else {
        return vec![];
    };
    fields.iter().filter_map(|(k,_)|{if ["profile","mode","ast","originalSource"].iter().any(|x|k==&key(x)){return None}Some(Diagnostic{code:key("GRAPHQL_REPRESENTATION"),path:key("/payload"),python_source_path:false,message:key("Unknown GraphQL payload field has no SDL destination; native export is blocked"),severity:Severity::Warning,python_text_origin:None})}).collect()
}
struct GraphqlCallbacks;
impl Capabilities for GraphqlCallbacks {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token != TOKEN {
            return Ok(vec![]);
        }
        let serde = match project_payload(payload) {
            Ok(v) => v,
            Err(e) => {
                return Ok(vec![Diagnostic {
                    code: key("GRAPHQL_REPRESENTATION"),
                    path: key("/ast"),
                    python_source_path: false,
                    message: Utf16::from(e),
                    severity: Severity::Warning,
                    python_text_origin: None,
                }])
            }
        };
        let mut ds = issues_diags(crate::graphql_adapter::inspect_payload(&serde));
        ds.extend(unknown_payload_diagnostics(payload));
        Ok(ds)
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(vec![]);
        }
        preflight_payload(payload, ctx).map_err(CapabilityError::Engine)?;
        let serde = match project_payload(payload) {
            Ok(v) => v,
            Err(e) => {
                return Ok(vec![Diagnostic {
                    code: key("GRAPHQL_REPRESENTATION"),
                    path: key("/ast"),
                    python_source_path: false,
                    message: Utf16::from(e),
                    severity: Severity::Warning,
                    python_text_origin: None,
                }])
            }
        };
        let mut ds = issues_diags(crate::graphql_adapter::inspect_payload_with_limits(
            &serde,
            ctx.limits().max_values,
            ctx.limits().max_text_units,
            ctx.limits().max_depth,
        ));
        ds.extend(unknown_payload_diagnostics(payload));
        let _ = context;
        Ok(std::mem::take(&mut ds))
    }
}
pub fn validate_document(
    r: &mut GraphqlResources,
    d: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    r.engine
        .validate_document(d, &r.registry, &mut GraphqlCallbacks, ctx)
}
pub fn import_sdl(
    r: &mut GraphqlResources,
    source: &str,
    id: &str,
    mode: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let units = source.encode_utf16().count();
    ctx.charge_text(units, key("/originalSource"))?;
    ctx.charge_work(units.saturating_mul(12), key("/originalSource"))?;
    let parsed = crate::graphql_adapter::import_with_limits(
        source,
        id,
        mode,
        ctx.limits().max_values,
        ctx.limits().max_text_units,
        ctx.limits().max_depth,
    )
    .map_err(|x| {
        err(
            "GRAPHQL_IMPORT",
            x.first()
                .map(|d| d.message.as_str())
                .unwrap_or("GraphQL import failed"),
        )
    })?;
    let mut document =
        crate::core_value_bridge::to_core(&parsed).map_err(|e| err("GRAPHQL_IMPORT", &e))?;
    let report = validate_document(r, &document, ctx)?;
    if !report.valid {
        return Err(err(
            "GRAPHQL_IMPORT",
            "GraphQL document failed UMF engine validation",
        ));
    }
    Ok(document)
}
pub fn export_sdl(
    r: &mut GraphqlResources,
    d: &Value,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let report = validate_document(r, d, ctx)?;
    if !report.valid {
        return Err(err("GRAPHQL_EXPORT", "GraphQL document is invalid"));
    }
    if report.diagnostics.iter().any(|x| {
        matches!(
            x.code.to_utf8().ok().as_deref(),
            Some("GRAPHQL_REPRESENTATION" | "GRAPHQL_PRINT_CHANGE")
        )
    }) {
        return Err(err(
            "GRAPHQL_EXPORT",
            "Native SDL export would lose or cannot preserve GraphQL representation",
        ));
    }
    let p =
        find_payload(d).ok_or_else(|| err("GRAPHQL_PAYLOAD", "Missing GraphQL schema payload"))?;
    preflight_payload(p, ctx)?;
    let serde = project_payload(p).map_err(|e| err("GRAPHQL_EXPORT", &e))?;
    let doc = payload_document(&serde);
    let out = crate::graphql_adapter::export_with_limits(
        &doc,
        ctx.limits().max_values,
        ctx.limits().max_text_units,
        ctx.limits().max_depth,
    )
    .map_err(|x| {
        err(
            "GRAPHQL_EXPORT",
            x.first()
                .map(|d| d.message.as_str())
                .unwrap_or("GraphQL export failed"),
        )
    })?;
    Ok(Utf16::from(out))
}
fn payload_document(p: &Json) -> Json {
    json!({"umf":"0.10.0","id":"graphql-validation","vocabularies":{(EXT):{"version":"0.1.0"}},"modules":[{"id":"schema","namespace":"","elements":[{"id":"schema","extensions":{(EXT):p}}]}]})
}
pub fn get_graphql_ast(
    r: &mut GraphqlResources,
    d: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let report = validate_document(r, d, ctx)?;
    if !report.valid {
        return Err(err("GRAPHQL_DOCUMENT", "GraphQL document is invalid"));
    }
    let p =
        find_payload(d).ok_or_else(|| err("GRAPHQL_PAYLOAD", "Missing GraphQL schema payload"))?;
    let ast = member(p, "ast").ok_or_else(|| err("GRAPHQL_AST", "Missing GraphQL AST"))?;
    copy_json(ast, ctx)
}
pub fn edit_ast<F>(
    r: &mut GraphqlResources,
    d: &Value,
    callback: F,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError>
where
    F: FnOnce(&mut Value) -> Result<(), String>,
{
    let pre = validate_document(r, d, ctx)?;
    if !pre.valid
        || !pre.complete
        || pre.diagnostics.iter().any(|x| {
            x.code
                .to_utf8()
                .map(|s| s == "GRAPHQL_REPRESENTATION")
                .unwrap_or(false)
        })
    {
        return Err(err(
            "GRAPHQL_EDIT",
            "GraphQL document must be valid and complete before editing",
        ));
    }
    let p =
        find_payload(d).ok_or_else(|| err("GRAPHQL_PAYLOAD", "Missing GraphQL schema payload"))?;
    preflight_payload(p, ctx)?;
    let projected = project_payload(p).map_err(|e| err("GRAPHQL_EDIT", &e))?;
    let issues = crate::graphql_adapter::inspect_payload_with_limits(
        &projected,
        ctx.limits().max_values,
        ctx.limits().max_text_units,
        ctx.limits().max_depth,
    );
    if issues.iter().any(|i| {
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
        return Err(err(
            "GRAPHQL_EDIT",
            "GraphQL AST has unsupported native semantics or incomplete representation",
        ));
    }
    let mut candidate = copy_json(d, ctx)?;
    let p = find_payload_mut(&mut candidate)
        .ok_or_else(|| err("GRAPHQL_PAYLOAD", "Missing GraphQL schema payload"))?;
    let ast = member_mut(p, "ast").ok_or_else(|| err("GRAPHQL_AST", "Missing GraphQL AST"))?;
    callback(ast).map_err(|e| err("GRAPHQL_EDIT", &e))?;
    let post = validate_document(r, &candidate, ctx)?;
    if !post.valid || !post.complete {
        return Err(err(
            "GRAPHQL_EDIT",
            "Edited GraphQL AST failed UMF engine validation",
        ));
    }
    let p = find_payload(&candidate).unwrap();
    let projected = project_payload(p).map_err(|e| err("GRAPHQL_EDIT", &e))?;
    let issues = crate::graphql_adapter::inspect_payload_with_limits(
        &projected,
        ctx.limits().max_values,
        ctx.limits().max_text_units,
        ctx.limits().max_depth,
    );
    if issues.iter().any(|i| {
        i.error
            || matches!(
                i.code,
                "GRAPHQL_PRINT_CHANGE"
                    | "GRAPHQL_REPRESENTATION"
                    | "GRAPHQL_FRAGMENT"
                    | "GRAPHQL_SCALAR"
                    | "GRAPHQL_DIRECTIVE"
                    | "GRAPHQL_PROFILE_EXTENSION"
            )
    }) {
        return Err(err(
            "GRAPHQL_EDIT",
            "Edited AST failed native representation, profile, or parse-back validation",
        ));
    }
    Ok(candidate)
}

/// Native schema text plus a lossless UMF source artifact and operation diagnostics.
#[derive(Clone, Debug, PartialEq)]
pub struct GraphqlBundle {
    pub schema: Utf16,
    pub source: Value,
    pub diagnostics: Vec<Diagnostic>,
}
pub fn export_graphql_bundle(
    r: &mut GraphqlResources,
    d: &Value,
    ctx: &mut Context<'_>,
) -> Result<GraphqlBundle, EngineError> {
    let report = validate_document(r, d, ctx)?;
    if !report.valid {
        return Err(err("GRAPHQL_EXPORT", "GraphQL document is invalid"));
    }
    let schema = export_sdl(r, d, ctx)?;
    let source = copy_json(d, ctx)?;
    let mut diagnostics = report.diagnostics;
    let p =
        find_payload(d).ok_or_else(|| err("GRAPHQL_PAYLOAD", "Missing GraphQL schema payload"))?;
    preflight_payload(p, ctx)?;
    let projected = project_payload(p).map_err(|e| err("GRAPHQL_REPRESENTATION", &e))?;
    let changed = crate::graphql_adapter::source_layout_changed(&projected);
    if changed {
        diagnostics.push(Diagnostic{code:key("GRAPHQL_SOURCE_LAYOUT"),path:Utf16::default(),python_source_path:false,message:key("Native SDL export prints edited AST; comments and original formatting remain in retained originalSource"),severity:Severity::Warning,python_text_origin:None});
    }
    diagnostics.push(Diagnostic {
        code: key("SOURCE_ARTIFACT_REQUIRED"),
        path: Utf16::default(),
        python_source_path: false,
        message: key(
            "Native SDL cannot preserve unrelated UMF metadata; retain the source artifact",
        ),
        severity: Severity::Warning,
        python_text_origin: None,
    });
    Ok(GraphqlBundle {
        schema,
        source,
        diagnostics,
    })
}
