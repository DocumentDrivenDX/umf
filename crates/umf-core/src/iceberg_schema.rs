// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded standalone Iceberg 1.11 schema JSON preservation operations.
//!
//! This module owns only the schema profile in CONTRACT-020. Native JSON is
//! retained as `NativeJsonTree`; the extension grammar and envelope are trusted
//! resources and all operations share one caller-owned Context.

use std::collections::HashMap;

use num_bigint::BigInt;

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.iceberg";
const PROFILE: &str = "iceberg-schema-json";
const TOKEN: u64 = 0x4943_4542_4552_4701;

#[derive(Clone, Debug)]
pub struct IcebergSchemaResources {
    engine: Engine,
    registry: Registry,
    datatype: CompiledSchema,
    manifest: Value,
}

impl IcebergSchemaResources {
    /// Build the seven pinned resources independently under this operation's
    /// meter: the five core engine resources, package manifest, and datatype
    /// grammar. No filesystem or host JSON parser participates.
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = source.encode_utf16().collect::<Vec<_>>();
            serialization::read_json_value(&units, Format::Json, ctx)
        }
        let core = ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json"), ctx)?,
            resource(include_str!("../../../spec/core/semantic-type-reference.schema.json"), ctx)?,
            resource(include_str!("../../../spec/core/extension-package.schema.json"), ctx)?,
            resource(include_str!("../../../spec/metamodel/generated/core-constraints.json"), ctx)?,
            resource(include_str!("../../../spec/metamodel/generated/domain-policy.json"), ctx)?,
        );
        let manifest = resource(include_str!("../../../spec/extensions/iceberg/package.json"), ctx)?;
        let grammar = resource(include_str!("../../../spec/extensions/iceberg/datatype-schema.json"), ctx)?;
        let engine = Engine::new(core, ctx)?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let datatype = CompiledSchema::compile(&grammar, &schema_resources, ctx)?;
        let mut registry = Registry::new();
        registry.register(&manifest, Some(TOKEN), engine.package_schema(), &schema_resources, ctx)?;
        Ok(Self { engine, registry, datatype, manifest })
    }

    pub fn package(&self) -> &Value { &self.manifest }
}

struct IcebergCapabilities<'a> {
    datatype: &'a CompiledSchema,
}
impl Capabilities for IcebergCapabilities<'_> {
    fn validate_extension(&mut self, _token: u64, _payload: &Value, _context: &SemanticContext) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }

    fn validate_extension_with_context(&mut self, token: u64, payload: &Value, _semantic: &SemanticContext, ctx: &mut Context<'_>) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN { return Ok(Vec::new()); }
        let mut diagnostics = vec![diagnostic("ICEBERG_CONTEXT_UNVERIFIED", "", "Standalone schema does not establish table format-version, evolution legality, default execution or data-reader support", Severity::Warning)];
        let fields = object(payload).ok_or_else(|| CapabilityError::Engine(err("ICEBERG_PAYLOAD", "Iceberg payload must be an object")))?;
        let profile = field(fields, "profile");
        if !matches!(profile, Some(Value::String(v)) if v == &Utf16::from(PROFILE)) {
            return Ok(vec![diagnostic("ICEBERG_PAYLOAD", "", "Expected pinned Iceberg schema payload", Severity::Error)]);
        }
        let root_value = field(fields, "root").ok_or_else(|| CapabilityError::Engine(err("ICEBERG_PAYLOAD", "Iceberg payload root is missing")))?;
        // The tagged representation schema is also checked by the registered
        // envelope. NativeJson admission preserves extension fields for edits.
        let native = NativeJsonTree::from_tagged_value(root_value, ctx).map_err(CapabilityError::Engine)?;
        if let Some(Value::Object(members)) = Some(payload) {
            for (key, _) in members {
                if !["profile", "root"].iter().any(|known| key == &Utf16::from(*known)) {
                    diagnostics.push(diagnostic("ICEBERG_REPRESENTATION", "", "Unknown representation fields must remain in UMF", Severity::Warning));
                }
            }
        }
        if native.has_representation_extras() {
            diagnostics.push(diagnostic("ICEBERG_REPRESENTATION", "/root", "Unknown tagged-tree fields must remain in UMF", Severity::Warning));
        }
        let mut numeric_ordinal = 0;
        let view = native_to_shape_value(native.root(), ctx, &mut numeric_ordinal).map_err(CapabilityError::Engine)?;
        let grammar_errors = self.datatype.validate(&view, ctx).map_err(CapabilityError::Engine)?;
        for issue in grammar_errors {
            diagnostics.push(Diagnostic { code: Utf16::from("ICEBERG_STRUCTURE"), path: issue.instance_path, python_source_path: false, message: issue.message, severity: Severity::Error, python_text_origin: None });
        }
        if diagnostics.iter().any(|d| d.severity == Severity::Error) { return Ok(diagnostics); }
        inspect_native(native.root(), &mut diagnostics, ctx).map_err(CapabilityError::Engine)?;
        Ok(diagnostics)
    }
}

pub fn iceberg_registry(resources: &IcebergSchemaResources) -> &Registry { &resources.registry }

pub fn inspect_iceberg(document: &Value, resources: &IcebergSchemaResources, ctx: &mut Context<'_>) -> Result<Validation, EngineError> {
    let mut capabilities = IcebergCapabilities { datatype: &resources.datatype };
    resources.engine.validate_document(document, &resources.registry, &mut capabilities, ctx)
}

pub fn import_iceberg_schema(source: &[u16], id: &Utf16, resources: &IcebergSchemaResources, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let root = NativeJsonTree::parse_json(source, ctx)?;
    let tagged = tree_as_tagged_value(&root, ctx)?;
    let document = document(id, tagged, ctx)?;
    let validation = inspect_iceberg(&document, resources, ctx)?;
    if !validation.valid { return Err(validation_error("ICEBERG_DOCUMENT", &validation, ctx)?); }
    Ok(document)
}

pub fn export_iceberg_schema(document: &Value, resources: &IcebergSchemaResources, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let validation = inspect_iceberg(document, resources, ctx)?;
    if !validation.valid { return Err(validation_error("ICEBERG_DOCUMENT", &validation, ctx)?); }
    if validation.diagnostics.iter().any(|d| d.code == Utf16::from("ICEBERG_REPRESENTATION")) {
        return Err(err("ICEBERG_EXPORT", "Unknown representation content cannot be discarded"));
    }
    let tree = payload_tree(document, ctx)?;
    tree.render_compact(ctx)
}

pub fn get_iceberg_node(document: &Value, pointer: &Utf16, resources: &IcebergSchemaResources, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let validation = inspect_iceberg(document, resources, ctx)?;
    if !validation.valid { return Err(validation_error("ICEBERG_DOCUMENT", &validation, ctx)?); }
    let tree = payload_tree(document, ctx)?;
    tree.subtree_clone(pointer, ctx)
}

pub fn propose_iceberg_node_edit(document: &Value, pointer: &Utf16, replacement: &[u16], resources: &IcebergSchemaResources, ctx: &mut Context<'_>) -> Result<(Value, Validation), EngineError> {
    let validation = inspect_iceberg(document, resources, ctx)?;
    if !validation.valid { return Err(validation_error("ICEBERG_DOCUMENT", &validation, ctx)?); }
    let mut tree = payload_tree(document, ctx)?;
    // Pointer syntax is deliberately checked before replacement JSON parsing.
    crate::native_json::native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement, ctx)?;
    tree = tree.replace_node(pointer, &replacement, ctx)?;
    let tagged = tree_as_tagged_value(&tree, ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_payload_root(&mut candidate, tagged)?;
    let validation = inspect_iceberg(&candidate, resources, ctx)?;
    if !validation.valid { return Err(validation_error("ICEBERG_EDIT", &validation, ctx)?); }
    Ok((candidate, validation))
}

fn inspect_native(root: &NativeJsonNode, diagnostics: &mut Vec<Diagnostic>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let NativeJsonNode::Object(fields) = root else { return Ok(()); };
    let mut ids: HashMap<BigInt, (bool, Option<Utf16>)> = HashMap::new();
    if let Some(value) = member(fields, "schema-id") {
        if let NativeJsonNode::Number(token) = value {
            if let Some(message) = int32_problem(token) {
                diagnostics.push(diagnostic("ICEBERG_STRUCTURE", "/schema-id", message, Severity::Error));
            }
        }
    }
    visit_type(root, &Utf16::default(), true, false, true, &mut ids, diagnostics, ctx)?;
    if let Some(NativeJsonNode::Array(items)) = member(fields, "identifier-field-ids") {
        let mut seen = std::collections::HashSet::new();
        for (index, item) in items.iter().enumerate() {
            let path = join_path(&join_path(&Utf16::default(), &Utf16::from("identifier-field-ids")), &Utf16::from(index.to_string()));
            let id = match item { NativeJsonNode::Number(token) => exact_int32(token), _ => None };
            let Some(id) = id else { diagnostics.push(diagnostic("ICEBERG_STRUCTURE", &path, match item { NativeJsonNode::Number(token) => int32_problem(token).unwrap_or("Expected signed int32 identifier field ID"), _ => "Expected signed int32 identifier field ID" }, Severity::Error)); continue; };
            if !seen.insert(id.clone()) {
                diagnostics.push(diagnostic("ICEBERG_STRUCTURE", &path, "Identifier field IDs must be unique", Severity::Error));
                continue;
            }
            match ids.get(&id) {
                Some((true, Some(type_name))) => {
                    let name = type_name.to_utf8().ok();
                    if name.as_deref().is_some_and(|s| !is_atomic(s) && decimal_parts(s).is_none() && fixed_part(s).is_none()) {
                        diagnostics.push(diagnostic("ICEBERG_IDENTIFIER_UNVERIFIED", &path, "Unknown primitive meaning cannot establish identifier eligibility", Severity::Warning));
                    }
                }
                _ => diagnostics.push(diagnostic("ICEBERG_IDENTIFIER", &path, "Identifier requires a required primitive field under required structs, outside collections", Severity::Error)),
            }
        }
    }
    if member(fields, "schema-id").is_none() { diagnostics.push(diagnostic("ICEBERG_SCHEMA_ID_CONTEXT", "", "Missing schema-id is retained; table format version determines whether it is required", Severity::Warning)); }
    Ok(())
}

fn visit_type(node: &NativeJsonNode, path: &Utf16, required_chain: bool, in_collection: bool, root: bool, ids: &mut HashMap<BigInt, (bool, Option<Utf16>)>, ds: &mut Vec<Diagnostic>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    match node {
        NativeJsonNode::String(value) => {
            let s = value.to_utf8().ok();
            if let Some(s) = s {
                if let Some((p, scale)) = decimal_parts(&s) { if p < 1 || p > 38 || scale > p { ds.push(diagnostic("ICEBERG_TYPE_PARAMETERS", path, "Decimal requires 1..38 precision and 0..precision scale", Severity::Error)); } }
                else if let Some(n) = fixed_part(&s) { if n < 1 || n > i32::MAX as u64 { ds.push(diagnostic("ICEBERG_TYPE_PARAMETERS", path, "Fixed length must be a positive int32", Severity::Error)); } }
                else if !is_atomic(&s) { ds.push(diagnostic("ICEBERG_UNKNOWN_TYPE", path, "Uninterpreted native type spelling; geospatial and future type parameters require separate checks", Severity::Warning)); }
            } else { ds.push(diagnostic("ICEBERG_UNKNOWN_TYPE", path, "Uninterpreted native type spelling; geospatial and future type parameters require separate checks", Severity::Warning)); }
        }
        NativeJsonNode::Object(members) => {
            let kind = member(members, "type").and_then(as_string).and_then(|x| x.to_utf8().ok());
            match kind.as_deref() {
                Some("struct") => {
                    unknown_fields(members, if root { &["type","fields","schema-id","identifier-field-ids"] } else { &["type","fields"] }, path, ds);
                    let mut names = std::collections::HashSet::<Utf16>::new();
                    if let Some(NativeJsonNode::Array(fields)) = member(members, "fields") {
                        for (i, field) in fields.iter().enumerate() {
                            let at = join_path(&join_path(path, &Utf16::from("fields")), &Utf16::from(i.to_string()));
                            // Charge each sibling-name lookup/insertion so the
                            // expected O(1) hash-set path remains operation-metered.
                            ctx.charge_work(1, at.clone())?;
                            ctx.charge_work(1, at.clone())?;
                            if let NativeJsonNode::Object(f) = field {
                                if let Some(name) = member(f, "name").and_then(as_string) {
                                    if !names.insert(name.clone()) { ds.push(diagnostic("ICEBERG_DUPLICATE_NAME", &at, "Sibling names must be unique", Severity::Error)); }
                                }
                                let id_node = member(f, "id"); let type_node = member(f, "type");
                                let id_path = join_path(&at, &Utf16::from("id"));
                                register_id(id_node, type_node, required_chain && member(f, "required") == Some(&NativeJsonNode::Boolean(true)) && !in_collection, &id_path, ids, ds);
                                if let Some(NativeJsonNode::Number(token)) = id_node { if let Some(message)=int32_problem(token) { ds.push(diagnostic("ICEBERG_STRUCTURE", &id_path, message, Severity::Error)); } }
                                unknown_fields(f, &["id","name","type","required","doc","initial-default","write-default"], &at, ds);
                                if type_node.is_some() { visit_type(type_node.unwrap(), &join_path(&at, &Utf16::from("type")), required_chain && member(f, "required") == Some(&NativeJsonNode::Boolean(true)), in_collection, false, ids, ds, ctx)?; }
                                for key in ["initial-default", "write-default"] { if member(f,key).is_some() { ds.push(diagnostic("ICEBERG_DEFAULT_UNVERIFIED", &join_path(&at,&Utf16::from(key)), "Default retained exactly; type encoding and historical execution require separate checks", Severity::Warning)); } }
                            }
                        }
                    }
                }
                Some("list") => {
                    unknown_fields(members,&["type","element-id","element-required","element"],path,ds);
                    register_id(member(members,"element-id"), member(members,"element"), false, &join_path(path,&Utf16::from("element-id")),ids,ds);
                    if let Some(NativeJsonNode::Number(token))=member(members,"element-id"){if let Some(message)=int32_problem(token){ds.push(diagnostic("ICEBERG_STRUCTURE",&join_path(path,&Utf16::from("element-id")),message,Severity::Error));}}
                    if let Some(child)=member(members,"element") { visit_type(child,&join_path(path,&Utf16::from("element")),false,true,false,ids,ds,ctx)?; }
                }
                Some("map") => {
                    unknown_fields(members,&["type","key-id","key","value-id","value-required","value"],path,ds);
                    register_id(member(members,"key-id"),member(members,"key"),false,&join_path(path,&Utf16::from("key-id")),ids,ds);
                    register_id(member(members,"value-id"),member(members,"value"),false,&join_path(path,&Utf16::from("value-id")),ids,ds);
                    for key in ["key-id","value-id"] { if let Some(NativeJsonNode::Number(token))=member(members,key){if let Some(message)=int32_problem(token){ds.push(diagnostic("ICEBERG_STRUCTURE",&join_path(path,&Utf16::from(key)),message,Severity::Error));}} }
                    for key in ["key","value"] { if let Some(child)=member(members,key) { visit_type(child,&join_path(path,&Utf16::from(key)),false,true,false,ids,ds,ctx)?; } }
                }
                _ => ds.push(diagnostic("ICEBERG_UNKNOWN_TYPE",path,"Unknown object-form type preserved without interpretation",Severity::Warning)),
            }
        }
        _ => {}
    }
    Ok(())
}

fn register_id(id: Option<&NativeJsonNode>, ty: Option<&NativeJsonNode>, eligible: bool, path: &Utf16, ids: &mut HashMap<BigInt,(bool,Option<Utf16>)>, ds: &mut Vec<Diagnostic>) {
    let Some(NativeJsonNode::Number(token))=id else { return; };
    let Some(value)=exact_int32(token) else { return; };
    let entry = (eligible && primitive_name(ty).is_some() && !matches!(primitive_name(ty).and_then(|v|v.to_utf8().ok()).as_deref(),Some("float"|"double")), primitive_name(ty));
    if ids.contains_key(&value) { ds.push(diagnostic("ICEBERG_DUPLICATE_ID",path,"Field IDs must be unique across fields and list/map components",Severity::Error)); }
    else { ids.insert(value.clone(), entry); }
    if value <= BigInt::from(0) { ds.push(diagnostic("ICEBERG_ID_CONTEXT",path,"Nonpositive ID retained; allocation legality requires table context",Severity::Warning)); }
    if value > BigInt::from(2_147_483_447u32) { ds.push(diagnostic("ICEBERG_RESERVED_ID",path,"Reserved metadata-column range requires table context",Severity::Warning)); }
}

fn primitive_name(node: Option<&NativeJsonNode>) -> Option<Utf16> { match node { Some(NativeJsonNode::String(s))=>Some(s.clone()), _=>None } }
fn unknown_fields(fields:&[(Utf16,NativeJsonNode)],known:&[&str],path:&Utf16,ds:&mut Vec<Diagnostic>){for (key,_) in fields {if !known.iter().any(|k|key==&Utf16::from(*k)){ds.push(diagnostic("ICEBERG_UNKNOWN",&join_path(path,key),"Unknown native property preserved without interpretation",Severity::Warning));}}}
fn is_atomic(s:&str)->bool { ["unknown","boolean","int","long","float","double","date","time","timestamp","timestamptz","timestamp_ns","timestamptz_ns","string","uuid","binary","variant"].contains(&s) }
// Saturate parameter parsing instead of rejecting syntactically known types when
// their decimal parameters exceed machine integer range.
fn bounded_digits(s: &str) -> Option<u64> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) { return None; }
    // Keep the sentinel above every supported parameter maximum so very large
    // syntactically valid values remain recognized and are rejected as invalid.
    Some(s.bytes().fold(0u64, |n, b| n.saturating_mul(10).saturating_add((b-b'0') as u64)).min(i32::MAX as u64 + 1))
}
fn decimal_parts(s:&str)->Option<(u64,u64)>{let x=s.strip_prefix("decimal(")?.strip_suffix(')')?;let (a,b)=x.split_once(',')?;Some((bounded_digits(a)?,bounded_digits(b.trim())?))}
fn fixed_part(s:&str)->Option<u64>{bounded_digits(s.strip_prefix("fixed[")?.strip_suffix(']')?)}

fn classify_int32_decimal(token: &str) -> Result<BigInt, &'static str> {
    let (mantissa, exponent) = match token.find(|c| c == 'e' || c == 'E') {
        Some(index) => {
            let raw = &token[index + 1..];
            let negative = raw.starts_with('-');
            let digits = raw.trim_start_matches(['+', '-']);
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) { return Err("must be an integer"); }
            let magnitude = digits.bytes().fold(0i64, |n,b| n.saturating_mul(10).saturating_add((b-b'0') as i64)).min(1_000_000_000);
            (&token[..index], if negative { -magnitude } else { magnitude })
        }
        None => (token, 0),
    };
    let negative = mantissa.starts_with('-');
    let body = mantissa.strip_prefix('-').unwrap_or(mantissa);
    let (whole, fraction) = body.split_once('.').unwrap_or((body, ""));
    let digits = format!("{whole}{fraction}");
    if digits.bytes().all(|byte| byte == b'0') { return Ok(BigInt::from(0)); }
    let decimal_point = (whole.len() as i64).saturating_add(exponent);
    let mut integer = if decimal_point <= 0 {
        "0".to_owned()
    } else if decimal_point as usize >= digits.len() {
        let zeros = (decimal_point as usize).saturating_sub(digits.len());
        if digits.trim_start_matches('0').len().saturating_add(zeros) > 10 {
            return Err(if negative { "must be >= -2147483648" } else { "must be <= 2147483647" });
        }
        format!("{digits}{}", "0".repeat(zeros))
    } else {
        digits[..decimal_point as usize].to_owned()
    };
    let fractional_nonzero = if decimal_point <= 0 {
        digits.bytes().any(|byte| byte != b'0')
    } else if decimal_point as usize >= digits.len() {
        false
    } else {
        digits[decimal_point as usize..].bytes().any(|byte| byte != b'0')
    };
    let significant = integer.trim_start_matches('0');
    integer = if significant.is_empty() { "0".to_owned() } else { significant.to_owned() };
    if integer.len() > 10 {
        return Err(if negative { "must be >= -2147483648" } else { "must be <= 2147483647" });
    }
    let magnitude = integer.parse::<u64>().map_err(|_| if negative { "must be >= -2147483648" } else { "must be <= 2147483647" })?;
    let limit = if negative { 2_147_483_648u64 } else { 2_147_483_647u64 };
    if magnitude > limit {
        return Err(if negative { "must be >= -2147483648" } else { "must be <= 2147483647" });
    }
    if fractional_nonzero {
        if magnitude == limit {
            return Err(if negative { "must be >= -2147483648" } else { "must be <= 2147483647" });
        }
        return Err("must be an integer");
    }
    if negative { integer.insert(0, '-'); }
    let value = BigInt::parse_bytes(integer.as_bytes(), 10).ok_or("must be an integer")?;
    if value < BigInt::from(i32::MIN) { return Err("must be >= -2147483648"); }
    if value > BigInt::from(i32::MAX) { return Err("must be <= 2147483647"); }
    Ok(value)
}
fn exact_int32(token:&str)->Option<BigInt>{classify_int32_decimal(token).ok()}
fn int32_problem(token:&str)->Option<&'static str>{classify_int32_decimal(token).err()}

fn payload_tree(document:&Value,ctx:&mut Context<'_>)->Result<NativeJsonTree,EngineError>{let payload=find_payload(document).ok_or_else(||err("ICEBERG_PAYLOAD","Expected pinned Iceberg schema payload"))?;let f=object(payload).ok_or_else(||err("ICEBERG_PAYLOAD","Payload must be an object"))?;if field(f,"profile")!=Some(&Value::string_utf8(PROFILE)){return Err(err("ICEBERG_PAYLOAD","Expected pinned Iceberg schema payload"));}NativeJsonTree::from_tagged_value(field(f,"root").ok_or_else(||err("ICEBERG_PAYLOAD","Payload root is missing"))?,ctx)}
fn find_payload(document:&Value)->Option<&Value>{let modules=array(field(object(document)?,"modules")?)?;for m in modules {let mf=object(m)?;if field(mf,"id")==Some(&Value::string_utf8("schema")){for e in array(field(mf,"elements")?)?{let ef=object(e)?;if field(ef,"id")==Some(&Value::string_utf8("schema")){let ext=object(field(ef,"extensions")?)?;if let Some(p)=field(ext,EXT){return Some(p)}}}}}None}
fn document(id:&Utf16,tagged:Value,ctx:&mut Context<'_>)->Result<Value,EngineError>{let payload=Value::Object(vec![(Utf16::from("profile"),Value::string_utf8(PROFILE)),(Utf16::from("root"),tagged)]);let ext=Value::Object(vec![(Utf16::from(EXT),payload)]);let element=Value::Object(vec![(Utf16::from("id"),Value::string_utf8("schema")),(Utf16::from("extensions"),ext)]);let module=Value::Object(vec![(Utf16::from("id"),Value::string_utf8("schema")),(Utf16::from("namespace"),Value::string_utf8("")),(Utf16::from("elements"),Value::Array(vec![element]))]);let vocab=Value::Object(vec![(Utf16::from(EXT),Value::Object(vec![(Utf16::from("version"),Value::string_utf8("0.1.0"))]))]);let value=Value::Object(vec![(Utf16::from("umf"),Value::string_utf8("0.10.0")),(Utf16::from("id"),Value::String(id.clone())),(Utf16::from("vocabularies"),vocab),(Utf16::from("modules"),Value::Array(vec![module]))]);copy_json(&value,ctx)}
fn tree_as_tagged_value(tree:&NativeJsonTree,ctx:&mut Context<'_>)->Result<Value,EngineError>{tree.tagged_value_preserving_extras(ctx)}
fn set_payload_root(document:&mut Value,tagged:Value)->Result<(),EngineError>{let modules=match field_mut(document,"modules"){Some(Value::Array(x))=>x,_=>return Err(err("ICEBERG_PAYLOAD","Document schema module is missing"))};for m in modules{if named(m,"id")==Some(&Value::string_utf8("schema")){if let Some(Value::Array(elements))=field_mut(m,"elements"){for e in elements{if named(e,"id")==Some(&Value::string_utf8("schema")){if let Some(ext)=field_mut(e,"extensions"){if let Some(payload)=field_mut(ext,EXT){if let Some(root)=field_mut(payload,"root"){*root=tagged;return Ok(())}}}}}}}}Err(err("ICEBERG_PAYLOAD","Document schema payload is missing"))}
fn native_to_shape_value(node:&NativeJsonNode,ctx:&mut Context<'_>,numeric_ordinal:&mut usize)->Result<Value,EngineError>{ctx.charge_work(1,Utf16::default())?;Ok(match node{NativeJsonNode::Null=>Value::Null,NativeJsonNode::Boolean(b)=>Value::Bool(*b),NativeJsonNode::String(s)=>Value::String(s.clone()),NativeJsonNode::Number(_)=>{let ordinal=*numeric_ordinal;*numeric_ordinal=numeric_ordinal.saturating_add(1);Value::Number(ordinal as f64)},NativeJsonNode::Array(a)=>Value::Array(a.iter().map(|v|native_to_shape_value(v,ctx,numeric_ordinal)).collect::<Result<_,_>>()?),NativeJsonNode::Object(o)=>Value::Object(o.iter().map(|(k,v)|Ok((k.clone(),native_to_shape_value(v,ctx,numeric_ordinal)?))).collect::<Result<_,EngineError>>()?)} )}

#[cfg(test)]
#[path = "../tests/support/iceberg_schema.rs"]
mod tests;

fn object(v:&Value)->Option<&[(Utf16,Value)]>{if let Value::Object(x)=v{Some(x)}else{None}}
fn array(v:&Value)->Option<&[Value]>{if let Value::Array(x)=v{Some(x)}else{None}}
fn field<'a>(o:&'a[(Utf16,Value)],name:&str)->Option<&'a Value>{o.iter().find(|(k,_)|k==&Utf16::from(name)).map(|(_,v)|v)}
fn named<'a>(value:&'a Value,name:&str)->Option<&'a Value>{field(object(value)?,name)}
fn field_mut<'a>(v:&'a mut Value,name:&str)->Option<&'a mut Value>{let Value::Object(o)=v else{return None};o.iter_mut().find(|(k,_)|k==&Utf16::from(name)).map(|(_,v)|v)}
fn as_string(v:&NativeJsonNode)->Option<&Utf16>{if let NativeJsonNode::String(s)=v{Some(s)}else{None}}
fn member<'a>(o:&'a[(Utf16,NativeJsonNode)],name:&str)->Option<&'a NativeJsonNode>{o.iter().find(|(k,_)|k==&Utf16::from(name)).map(|(_,v)|v)}
fn join_path(base:&Utf16,key:&Utf16)->Utf16{let mut out=base.units().to_vec();out.push(b'/' as u16);for c in key.units(){match c{0x7e=>out.extend([b'~' as u16,b'0' as u16]),0x2f=>out.extend([b'~' as u16,b'1' as u16]),x=>out.push(*x)}}Utf16::new(out)}
trait DiagnosticPath { fn into_utf16(self) -> Utf16; }
impl DiagnosticPath for &Utf16 { fn into_utf16(self) -> Utf16 { self.clone() } }
impl DiagnosticPath for &str { fn into_utf16(self) -> Utf16 { Utf16::from(self) } }
fn diagnostic(code:&str,path:impl DiagnosticPath,message:impl AsRef<str>,severity:Severity)->Diagnostic{Diagnostic{code:Utf16::from(code),path:path.into_utf16(),python_source_path:false,message:Utf16::from(message.as_ref()),severity,python_text_origin:None}}
fn err(code:&str,message:&str)->EngineError{EngineError::new(code,Utf16::default(),message)}
fn validation_error(code:&str,v:&Validation,ctx:&mut Context<'_>)->Result<EngineError,EngineError>{
    // Preserve the complete ordered predecessor diagnostic payload, not only
    // its first (often informational) warning.
    let (units,bytes)=diagnostic_payload_size(v)?;
    ctx.charge_text(units,Utf16::default())?;
    let mut message=String::with_capacity(bytes);message.push('[');
    for (index,d) in v.diagnostics.iter().enumerate(){
        if index>0{message.push(',');}
        message.push_str("{\"code\":");json_quote_utf16_into(&mut message,&d.code);
        message.push_str(",\"path\":");json_quote_utf16_into(&mut message,&d.path);
        if d.severity==Severity::Warning {
            if d.code==Utf16::from("ICEBERG_CONTEXT_UNVERIFIED") {
                message.push_str(",\"severity\":\"warning\",\"message\":");json_quote_utf16_into(&mut message,&d.message);
            } else {
                message.push_str(",\"message\":");json_quote_utf16_into(&mut message,&d.message);
                message.push_str(",\"severity\":\"warning\"");
            }
        } else {
            message.push_str(",\"message\":");json_quote_utf16_into(&mut message,&d.message);
            message.push_str(",\"severity\":\"error\"");
        }
        message.push('}');
    }
    message.push(']');
    Ok(EngineError::new(code,Utf16::default(),message))
}
fn diagnostic_payload_size(validation:&Validation)->Result<(usize,usize),EngineError>{
    let mut units=2usize;let mut bytes=2usize;
    for (index,d) in validation.diagnostics.iter().enumerate(){
        if index>0{checked_add_size(&mut units,1)?;checked_add_size(&mut bytes,1)?;}
        for literal in ["{\"code\":",",\"path\":"]{checked_add_literal(&mut units,&mut bytes,literal)?;}
        for value in [&d.code,&d.path]{let (u,b)=json_quoted_size(value)?;checked_add_size(&mut units,u)?;checked_add_size(&mut bytes,b)?;}
        if d.severity==Severity::Warning && d.code==Utf16::from("ICEBERG_CONTEXT_UNVERIFIED"){
            for literal in [",\"severity\":\"warning\",\"message\":"]{checked_add_literal(&mut units,&mut bytes,literal)?;}
            let (u,b)=json_quoted_size(&d.message)?;checked_add_size(&mut units,u)?;checked_add_size(&mut bytes,b)?;
        }else{
            checked_add_literal(&mut units,&mut bytes,",\"message\":")?;
            let (u,b)=json_quoted_size(&d.message)?;checked_add_size(&mut units,u)?;checked_add_size(&mut bytes,b)?;
            if d.severity==Severity::Warning{checked_add_literal(&mut units,&mut bytes,",\"severity\":\"warning\"")?;}else{checked_add_literal(&mut units,&mut bytes,",\"severity\":\"error\"")?;}
        }
        checked_add_literal(&mut units,&mut bytes,"}")?;
    }
    Ok((units,bytes))
}
fn checked_add_size(total:&mut usize,amount:usize)->Result<(),EngineError>{*total=total.checked_add(amount).ok_or_else(||err("LIMIT","Diagnostic output size overflow"))?;Ok(())}
fn checked_add_literal(units:&mut usize,bytes:&mut usize,literal:&str)->Result<(),EngineError>{checked_add_size(units,literal.encode_utf16().count())?;checked_add_size(bytes,literal.len())}
fn json_quoted_size(value:&Utf16)->Result<(usize,usize),EngineError>{
    let u=value.units();let(mut units,mut bytes)=(2usize,2usize);let mut i=0;
    while i<u.len(){let unit=u[i];let (du,db,skip)=match unit{
        0x0022|0x005c|0x0008|0x000c|0x000a|0x000d|0x0009=>(2,2,0),
        0x0000..=0x001f=>(6,6,0),
        0xd800..=0xdbff if i+1<u.len()&&(0xdc00..=0xdfff).contains(&u[i+1])=>(2,4,1),
        0xd800..=0xdfff=>(6,6,0),
        _=>(1,char::from_u32(unit as u32).expect("non-surrogate UTF-16 unit").len_utf8(),0),
    };checked_add_size(&mut units,du)?;checked_add_size(&mut bytes,db)?;i+=skip+1;}
    Ok((units,bytes))
}
fn json_quote_utf16_into(out:&mut String,value:&Utf16){
    let units=value.units();out.push('"');let mut i=0;
    while i<units.len(){let unit=units[i];match unit{
        0x0022=>out.push_str("\\\""),0x005c=>out.push_str("\\\\"),0x0008=>out.push_str("\\b"),0x000c=>out.push_str("\\f"),0x000a=>out.push_str("\\n"),0x000d=>out.push_str("\\r"),0x0009=>out.push_str("\\t"),
        0x0000..=0x001f=>out.push_str(&format!("\\u{:04x}",unit)),
        0xd800..=0xdbff if i+1<units.len() && (0xdc00..=0xdfff).contains(&units[i+1])=>{let scalar=0x10000+(((unit as u32)-0xd800)<<10)+((units[i+1] as u32)-0xdc00);out.push(char::from_u32(scalar).expect("valid surrogate pair"));i+=1;},
        0xd800..=0xdfff=>out.push_str(&format!("\\u{:04x}",unit)),
        _=>out.push(char::from_u32(unit as u32).expect("non-surrogate UTF-16 unit")),
    }i+=1;}
    out.push('"');
}
