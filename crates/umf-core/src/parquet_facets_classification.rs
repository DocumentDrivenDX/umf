// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-owned profile-qualified Parquet scalar facet classification.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};
use num_bigint::BigUint;
use std::collections::BTreeSet;
use std::sync::{Arc, OnceLock};

const RESULT_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-facet-classification.schema.json");
const FACET_SCHEMA: &str = include_str!("../../../spec/core/facet-operation-v3.schema.json");
const PACKAGE: &str = include_str!("../../../spec/extensions/parquet-facets/package.json");
const EXT: &str = "umf.parquet.facets";
const BASIS: &str = "Selected present non-null scalar declarations with retained unions, named dependencies and explicit Apache Python 1.12.0/fastavro 1.12.2 writer limitations; no native equivalence";
const RECOVERY: &str = "Retain original native archive and authored facets; interpretation does not replace native meaning";
const NATIVE_VERSION: &str =
    "parquet-format 219e3f12a62f9476e830c21e26d030d231f7c017 / PyArrow 21.0.0";
const SUBSET: &str = "Explicit present non-null physical leaf declarations; native bytes, container context and unknown metadata retained; input conversion and enforcement remain separate";

fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (u(k), v)).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &u(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn string(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn text<'a>(v: &'a Value, k: &str) -> Option<&'a Utf16> {
    get(v, k).and_then(string)
}
fn as_text(v: &Value) -> Option<String> {
    string(v).and_then(|s| s.to_utf8().ok())
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, u(path), message)
}
fn parse_json(raw: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    serialization::read_json_value(&raw.encode_utf16().collect::<Vec<_>>(), Format::Json, ctx)
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, u(""))?;
    Ok(match v {
        Value::Array(a) => Value::Array(
            a.iter()
                .map(|v| canonical(v, ctx))
                .collect::<Result<_, _>>()?,
        ),
        Value::Object(m) => {
            let mut out = Vec::with_capacity(m.len());
            for (k, v) in m {
                ctx.charge_work(k.len().saturating_add(1), u(""))?;
                out.push((k.clone(), canonical(v, ctx)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(out)
        }
        _ => copy_json(v, ctx)?,
    })
}
struct Runtime {
    result: CompiledSchema,
    request: CompiledSchema,
}
fn runtime(engine: &Engine, ctx: &mut Context<'_>) -> Result<Arc<Runtime>, EngineError> {
    static CACHE: OnceLock<Arc<Runtime>> = OnceLock::new();
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        if let Some(r) = CACHE.get() {
            return Ok(Arc::clone(r));
        }
    }
    let mut resources = engine.schema_resources_with_context(ctx)?;
    resources.entries.push((
        u("urn:umf:core:facet-operation:3.0.0"),
        parse_json(FACET_SCHEMA, ctx)?,
    ));
    let schema = parse_json(RESULT_SCHEMA, ctx)?;
    let result = CompiledSchema::compile(&schema, &resources, ctx)?;
    let request = get(
        get(&schema, "properties").unwrap_or(&Value::Null),
        "request",
    )
    .ok_or_else(|| {
        err(
            "PARQUET_FACET_SCHEMA",
            "/properties/request",
            "Request schema is missing",
        )
    })?;
    let request = CompiledSchema::compile(request, &resources, ctx)?;
    let ready = Arc::new(Runtime { result, request });
    if ctx.profile() == crate::context::ResourceProfile::Cooperative
        && ctx.limits() == crate::context::Limits::ordinary()
    {
        let _ = CACHE.set(Arc::clone(&ready));
    }
    Ok(ready)
}
fn validate(
    value: &Value,
    schema: &CompiledSchema,
    ctx: &mut Context<'_>,
    code: &str,
) -> Result<(), EngineError> {
    if schema.validate(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "",
            "Value does not match the pinned Parquet facet classification schema",
        ))
    }
}
struct NoCallbacks;
impl Capabilities for NoCallbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
#[derive(Clone)]
enum Meaning {
    Integer {
        bits: u64,
        signed: bool,
    },
    Float {
        bits: u64,
    },
    String,
    Binary {
        exact: Option<u64>,
    },
    Decimal {
        precision: u64,
        scale: u64,
        exact: Option<u64>,
    },
}
impl Meaning {
    fn family(&self) -> &'static str {
        match self {
            Self::Integer { .. } => "integer",
            Self::Float { .. } => "float",
            Self::String => "string",
            Self::Binary { .. } => "binary",
            Self::Decimal { .. } => "decimal",
        }
    }
}
fn safe_integer(v: Option<&Value>) -> Option<u64> {
    let s = as_text(v?)?;
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) || (s.len() > 1 && s.starts_with('0'))
    {
        return None;
    }
    let n = s.parse::<u64>().ok()?;
    (n <= 9_007_199_254_740_991).then_some(n)
}
fn object_members(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(o) = v {
        Some(o)
    } else {
        None
    }
}
fn unknown(v: &Value) -> bool {
    matches!(get(v,"$unknown"),Some(Value::Array(a))if !a.is_empty())
}
fn pointer_segment(segment: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(segment.len().saturating_mul(2).saturating_add(1));
    units.push(b'/' as u16);
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            unit => units.push(*unit),
        }
    }
    Utf16::new(units)
}
fn append_pointer(base: &Utf16, suffix: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(base.len().saturating_add(suffix.len()));
    units.extend_from_slice(base.units());
    units.extend_from_slice(suffix.units());
    Utf16::new(units)
}
fn inspect_native(
    native: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Option<Meaning>, String, Vec<Utf16>), EngineError> {
    let Some(fields) = object_members(native) else {
        return Ok((
            None,
            "Expected a decoded native SchemaElement".into(),
            vec![Utf16::default()],
        ));
    };
    let mut claimed = BTreeSet::<Utf16>::new();
    macro_rules! fail {
        ($reason:expr $(,)?) => {{
            let reason: String = $reason;
            let paths: Vec<Utf16> = fields
                .iter()
                .filter(|(key, _)| !claimed.contains(key))
                .map(|(key, _)| pointer_segment(key))
                .collect();
            return Ok((None, reason, paths));
        }};
    }
    if get(native, "num_children").is_some() {
        fail!("Groups and child counts require separate shape interpretation".into());
    }
    if unknown(native) {
        fail!("Unknown Thrift members may refine the declaration".into());
    }
    let type_code = as_text(get(native, "type").unwrap_or(&Value::Null));
    claimed.insert(u("type"));
    let Some(type_code) =
        type_code.filter(|v| matches!(v.as_str(), "1" | "2" | "4" | "5" | "6" | "7"))
    else {
        fail!("Physical type is outside this scalar facet profile".into());
    };
    let mut exact = None;
    if type_code == "7" {
        claimed.insert(u("type_length"));
        exact = safe_integer(get(native, "type_length"));
        if exact.unwrap_or(0) == 0 {
            fail!("Fixed byte length must be an exact positive supported integer token".into(),);
        }
    } else if get(native, "type_length").is_some() {
        fail!("Type length on a non-fixed carrier is not interpreted".into());
    }
    let mut logical_name = None::<String>;
    let mut parameters = Value::Object(vec![]);
    if let Some(logical) = get(native, "logicalType") {
        let Some(members) = object_members(logical) else {
            fail!("Logical annotation must select exactly one known alternative".into());
        };
        if members.len() != 1 {
            fail!("Logical annotation must select exactly one known alternative".into());
        }
        let name = members[0].0.to_utf8().unwrap_or_default();
        if !matches!(name.as_str(), "INTEGER" | "DECIMAL" | "STRING")
            || object_members(&members[0].1).is_none()
        {
            fail!(
                "Unknown or unsupported logical meaning; physical fallback is not implied".into(),
            );
        }
        let params = object_members(&members[0].1).unwrap();
        let allowed: &[&str] = match name.as_str() {
            "INTEGER" => &["bitWidth", "isSigned"],
            "DECIMAL" => &["precision", "scale"],
            _ => &[],
        };
        if params
            .iter()
            .any(|(k, _)| !allowed.iter().any(|a| k == &u(a)))
        {
            fail!("Unknown logical parameters must remain uninterpreted".into());
        }
        parameters = members[0].1.clone();
        logical_name = Some(name);
        claimed.insert(u("logicalType"));
    }
    let converted = get(native, "converted_type").and_then(as_text);
    if let Some(code) = &converted {
        if !matches!(
            code.as_str(),
            "0" | "5" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18"
        ) {
            fail!("Unsupported converted type; physical fallback is not implied".into());
        }
        let legacy = if code == "0" {
            "STRING"
        } else if code == "5" {
            "DECIMAL"
        } else {
            "INTEGER"
        };
        if logical_name.as_deref().is_some_and(|n| n != legacy) {
            fail!("Logical and converted annotations disagree".into());
        }
        if logical_name.is_none() {
            logical_name = Some(legacy.into());
            if legacy == "INTEGER" {
                let c = code.parse::<u64>().unwrap_or(11);
                let bits = [8u64, 16, 32, 64][((c - 11) % 4) as usize];
                parameters = obj(vec![
                    ("bitWidth", t(&bits.to_string())),
                    ("isSigned", Value::Bool(c >= 15)),
                ]);
            } else if legacy == "DECIMAL" {
                let precision = get(native, "precision").cloned().unwrap_or(Value::Null);
                let scale = get(native, "scale").cloned().unwrap_or_else(|| t("0"));
                parameters = obj(vec![("precision", precision), ("scale", scale)]);
            }
        }
        claimed.insert(u("converted_type"));
    }
    if logical_name.as_deref() != Some("DECIMAL")
        && (get(native, "precision").is_some() || get(native, "scale").is_some())
    {
        fail!("Decimal parameters without decimal meaning are not interpreted".into());
    }
    let meaning = match logical_name.as_deref() {
        Some("INTEGER") => {
            let bits = safe_integer(get(&parameters, "bitWidth"));
            let signed = match get(&parameters, "isSigned") {
                Some(Value::Bool(v)) => Some(*v),
                _ => None,
            };
            let (Some(bits), Some(signed)) = (bits, signed) else {
                fail!(
                    "Integer annotation requires supported exact width and boolean signedness"
                        .into(),
                );
            };
            if ![8, 16, 32, 64].contains(&bits) || type_code != if bits == 64 { "2" } else { "1" } {
                fail!("Integer annotation exceeds or disagrees with physical carrier".into(),);
            }
            if let Some(c) = &converted {
                let expected = (if signed { 15 } else { 11 })
                    + [8u64, 16, 32, 64].iter().position(|x| *x == bits).unwrap() as u64;
                if c.parse::<u64>().ok() != Some(expected) {
                    fail!("Logical and converted integer parameters disagree".into());
                }
            }
            Meaning::Integer { bits, signed }
        }
        Some("DECIMAL") => {
            let precision = safe_integer(get(&parameters, "precision"));
            let scale = safe_integer(get(&parameters, "scale"));
            let (Some(precision), Some(scale)) = (precision, scale) else {
                fail!("Decimal requires exact positive precision and nonnegative scale no greater than precision".into());
            };
            if precision < 1
                || scale > precision
                || !matches!(type_code.as_str(), "1" | "2" | "6" | "7")
            {
                fail!("Decimal requires an integer or binary physical carrier and valid precision/scale".into());
            }
            for key in ["precision", "scale"] {
                if let Some(v) = get(native, key) {
                    let expected = if key == "precision" { precision } else { scale }.to_string();
                    if as_text(v).as_deref() != Some(expected.as_str()) {
                        fail!("Logical and legacy decimal parameters disagree or have unsupported tokens".into());
                    }
                    claimed.insert(u(key));
                }
            }
            if type_code == "1" && precision > 9 || type_code == "2" && precision > 18 {
                fail!("Decimal precision exceeds integer carrier capacity".into());
            }
            if type_code == "7" {
                let bytes = exact.unwrap_or(0);
                if bytes > 4096 {
                    fail!("Decimal precision exceeds fixed-byte exact arithmetic profile".into(),);
                }
                let maximum = (BigUint::from(1u8) << (bytes as usize * 8 - 1)) - 1u8;
                let maximum_decimal_digits =
                    maximum.to_str_radix(10).len().saturating_sub(1) as u64;
                ctx.charge_work(maximum.to_str_radix(10).len(), u(""))?;
                if precision > maximum_decimal_digits {
                    fail!("Decimal precision exceeds fixed-byte exact arithmetic profile".into(),);
                }
            }
            Meaning::Decimal {
                precision,
                scale,
                exact,
            }
        }
        Some("STRING") => {
            if type_code == "6" {
                Meaning::String
            } else {
                fail!("STRING requires BYTE_ARRAY".into());
            }
        }
        _ => match type_code.as_str() {
            "1" => Meaning::Integer {
                bits: 32,
                signed: true,
            },
            "2" => Meaning::Integer {
                bits: 64,
                signed: true,
            },
            "4" => Meaning::Float { bits: 32 },
            "5" => Meaning::Float { bits: 64 },
            "6" => Meaning::Binary { exact: None },
            "7" => Meaning::Binary { exact },
            _ => fail!("Physical type is outside this scalar facet profile".into()),
        },
    };
    for key in ["precision", "scale"] {
        if meaning.family() != "decimal" && get(native, key).is_some() {
            fail!("Decimal parameters without decimal meaning are not interpreted".into());
        }
    }
    let rest: Vec<Utf16> = fields
        .iter()
        .filter(|(key, _)| !claimed.contains(key))
        .map(|(key, _)| pointer_segment(key))
        .collect();
    for path in &rest {
        ctx.charge_work(path.len(), u(""))?;
    }
    Ok((Some(meaning), String::new(), rest))
}
fn push_residual(
    residuals: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    value: &Value,
    reason: &str,
    outcome: &str,
    concept: &str,
    path: &str,
    ideal_path: &Utf16,
    location: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", t(path)),
        ("location", copy_json(location, ctx)?),
        ("targetPath", Value::String(ideal_path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("recovery", t(RECOVERY)),
    ]));
    observations.push(obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(ideal_path.clone())),
        ("location", copy_json(location, ctx)?),
        (
            "interpretation",
            t(if outcome == "not-expressible" {
                "unsupported"
            } else {
                "unknown"
            }),
        ),
        ("outcome", t(outcome)),
        ("basis", t(reason)),
    ]));
    Ok(())
}
fn push_residual_utf16(
    residuals: &mut Vec<Value>,
    observations: &mut Vec<Value>,
    value: &Value,
    reason: &str,
    outcome: &str,
    concept: &str,
    path: &Utf16,
    ideal_path: &Utf16,
    location: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    residuals.push(obj(vec![
        ("path", Value::String(path.clone())),
        ("location", copy_json(location, ctx)?),
        ("targetPath", Value::String(ideal_path.clone())),
        ("value", copy_json(value, ctx)?),
        ("reason", t(reason)),
        ("outcome", t(outcome)),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        ("recovery", t(RECOVERY)),
    ]));
    observations.push(obj(vec![
        ("concept", t(concept)),
        ("idealPath", Value::String(ideal_path.clone())),
        ("location", copy_json(location, ctx)?),
        (
            "interpretation",
            t(if outcome == "not-expressible" {
                "unsupported"
            } else {
                "unknown"
            }),
        ),
        ("outcome", t(outcome)),
        ("basis", t(reason)),
    ]));
    Ok(())
}
fn diag(code: &str, path: &str, msg: &str, severity: &str) -> Value {
    obj(vec![
        ("code", t(code)),
        ("path", t(path)),
        ("message", t(msg)),
        ("severity", t(severity)),
    ])
}
fn set(v: &mut Value, k: &str, x: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(key, _)| key == &u(k)) {
            *old = x
        } else {
            m.push((u(k), x));
        }
    }
}
fn number(v: u64) -> Value {
    Value::Number(v as f64)
}
fn same(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}
fn validate_source(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let report = engine.validate_document(source, registry, caps, ctx)?;
    if !report.valid || text(source, "umf") != Some(&u("0.10.0")) {
        return Err(err(
            "PARQUET_FACET_SOURCE",
            "",
            "Valid core 0.10.0 source required; migrate explicitly",
        ));
    }
    Ok(())
}
fn classify_inner(
    source_in: &Value,
    request_in: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rt = runtime(engine, ctx)?;
    validate(request_in, &rt.request, ctx, "PARQUET_FACET_REQUEST")?;
    let source = copy_json(source_in, ctx)?;
    let request = copy_json(request_in, ctx)?;
    validate_source(&source, engine, registry, caps, ctx)?;
    let metadata_report = crate::parquet_capture_inspection::inspect_parquet_metadata(
        &source, engine, registry, caps, ctx,
    )?;
    let loc = get(&request, "location")
        .ok_or_else(|| err("PARQUET_FACET_REQUEST", "/location", "Location is required"))?;
    let index = get(loc, "index")
        .and_then(|value| match value {
            Value::Number(number)
                if number.is_finite()
                    && *number >= 0.0
                    && *number <= 9_007_199_254_740_991.0
                    && number.fract() == 0.0 =>
            {
                Some(*number as u64)
            }
            _ => None,
        })
        .and_then(|index| usize::try_from(index).ok())
        .ok_or_else(|| {
            err(
                "PARQUET_FACET_REQUEST",
                "/location/index",
                "Safe selected index required",
            )
        })?;
    let identity = get(&request, "identity")
        .ok_or_else(|| err("PARQUET_FACET_REQUEST", "/identity", "Identity is required"))?;
    let module = string(get(identity, "module").unwrap_or(&Value::Null))
        .cloned()
        .ok_or_else(|| {
            err(
                "PARQUET_FACET_REQUEST",
                "/identity/module",
                "Module identity required",
            )
        })?;
    let element_id = string(get(identity, "element").unwrap_or(&Value::Null))
        .cloned()
        .ok_or_else(|| {
            err(
                "PARQUET_FACET_REQUEST",
                "/identity/element",
                "Element identity required",
            )
        })?;
    let (mi, ei, element) = locate(&source, &module, &element_id).ok_or_else(|| {
        err(
            "PARQUET_FACET_FIELD",
            "/identity",
            "Explicit logical Field identity required",
        )
    })?;
    let ideal_path = u(&format!("/modules/{mi}/elements/{ei}/facets"));
    let source_bytes = crate::parquet_capture_inspection::export_parquet_capture(
        &source, engine, registry, caps, ctx,
    )?;
    let shape_node = crate::parquet_cardinality_classification::inspect_shape_node(
        &source, index, engine, registry, caps, ctx,
    )?;
    let native = copy_json(
        get(&shape_node, "nativeFragment").unwrap_or(&Value::Null),
        ctx,
    )?;
    let shape_name = as_text(get(&shape_node, "shape").unwrap_or(&Value::Null)).unwrap_or_default();
    let role_name = as_text(get(&shape_node, "role").unwrap_or(&Value::Null)).unwrap_or_default();
    let scalar = shape_name == "one" && role_name == "scalar";
    let (meaning, unsupported, unclaimed) = inspect_native(&native, ctx)?;
    let profile = as_text(get(&request, "profile").unwrap_or(&Value::Null)).unwrap_or_default();
    let obligation =
        as_text(get(&request, "obligation").unwrap_or(&Value::Null)).unwrap_or_default();
    let mut facets = obj(vec![]);
    let mut observations = Vec::<Value>::new();
    let mut residuals = Vec::<Value>::new();
    let mut conflict = false;
    macro_rules! add_loss {
        ($value:expr, $reason:expr, $outcome:expr, $concept:expr, $path:expr $(,)?) => {
            push_residual(
                &mut residuals,
                &mut observations,
                $value,
                $reason,
                $outcome,
                $concept,
                $path,
                &ideal_path,
                loc,
                ctx,
            )
        };
    }

    if module == u("parquet")
        || module == u("parquet.fields")
        || as_text(get(element, "kind").unwrap_or(&Value::Null)).as_deref() != Some("field")
        || as_text(get(element, "cardinality").unwrap_or(&Value::Null)).as_deref() != Some("one")
        || get(element, "references").and_then(array).is_some_and(|a| {
            a.iter().any(|r| {
                as_text(get(r, "role").unwrap_or(&Value::Null)).as_deref() == Some("record-type")
            })
        })
    {
        conflict = true;
        add_loss!(element,"An explicitly scalar logical Field is required; native representation elements cannot be relabeled","unknown","native",&ideal_path.to_utf8().unwrap_or_default())?;
    }
    if get(get(element, "extensions").unwrap_or(&Value::Null), EXT).is_some() {
        conflict = true;
        add_loss!(
            get(element, "extensions").unwrap(),
            "Existing binding cannot be overwritten",
            "unknown",
            "native",
            &ideal_path.to_utf8().unwrap_or_default(),
        )?;
    }
    if let Some(vocabs) = get(&source, "vocabularies") {
        if let Some(v) = get(vocabs, EXT) {
            if as_text(get(v, "version").unwrap_or(&Value::Null)).as_deref() != Some("1.0.0") {
                conflict = true;
                add_loss!(
                    v,
                    "Incompatible facet vocabulary",
                    "unknown",
                    "native",
                    &ideal_path.to_utf8().unwrap_or_default(),
                )?;
            }
        }
    }
    if !scalar {
        add_loss!(&native,"Select a logical scalar leaf explicitly; a container, wrapper, record or ambiguous repetition is not a scalar","not-expressible","native",&format!("/schema/{index}"))?;
    }
    for shape_residual in
        array(get(&shape_node, "residuals").unwrap_or(&Value::Null)).unwrap_or(&[])
    {
        let path = as_text(get(shape_residual, "path").unwrap_or(&Value::Null))
            .unwrap_or_else(|| format!("/schema/{index}"));
        let reason = as_text(get(shape_residual, "reason").unwrap_or(&Value::Null))
            .unwrap_or_else(|| "Native shape remains unresolved".into());
        add_loss!(&native, &reason, "unknown", "native", &path)?;
    }
    if profile == "unresolved" {
        add_loss!(
            &native,
            "An explicit declaration or PyArrow input profile is required",
            "unknown",
            "native",
            &format!("/schema/{index}"),
        )?;
    }
    if meaning.is_none() {
        add_loss!(
            &native,
            &unsupported,
            "not-expressible",
            "native",
            &format!("/schema/{index}"),
        )?;
    } else if scalar && profile != "unresolved" {
        let meaning = meaning.as_ref().unwrap();
        let family = as_text(get(element, "scalarType").unwrap_or(&Value::Null));
        if family.as_deref() != Some(meaning.family()) {
            conflict = true;
            add_loss!(
                element,
                "Logical scalar family differs from native declaration",
                "unknown",
                "native",
                &ideal_path.to_utf8().unwrap_or_default(),
            )?;
        } else {
            match meaning {
                Meaning::Integer { bits, signed } => set(
                    &mut facets,
                    "integerWidth",
                    obj(vec![
                        ("bits", number(*bits)),
                        ("signed", Value::Bool(*signed)),
                    ]),
                ),
                Meaning::Decimal {
                    precision, scale, ..
                } => {
                    set(&mut facets, "precision", number(*precision));
                    set(&mut facets, "scale", number(*scale));
                }
                Meaning::Binary {
                    exact: Some(length),
                } => {
                    set(
                        &mut facets,
                        "length",
                        obj(vec![("max", number(*length)), ("unit", t("byte"))]),
                    );
                    add_loss!(&native,"Fixed exact byte length includes a lower bound not represented by the maximum-length ideal","not-expressible","length",&ideal_path.to_utf8().unwrap_or_default())?;
                }
                _ => {}
            }
            let facet_keys = object_members(&facets)
                .map(|a| a.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>())
                .unwrap_or_default();
            for key in facet_keys {
                if key != u("scale") {
                    let concept = if key == u("precision") {
                        "decimal"
                    } else if key == u("integerWidth") {
                        "integerWidth"
                    } else if key == u("length") {
                        "length"
                    } else {
                        "native"
                    };
                    observations.push(obj(vec![("concept",t(concept)),("idealPath",Value::String(ideal_path.clone())),("location",copy_json(loc,ctx)?),("interpretation",t("declared")),("outcome",t("exact")),("basis",t("Declared present non-null leaf domain; does not verify stored rows, writer origin or runtime enforcement"))]));
                }
            }
        }
        if profile == "pyarrow-safe-array-input" {
            add_loss!(&native,"A retained file does not establish which Arrow construction path produced it; native declaration is separate from input acceptance","unknown","conversion",&format!("/schema/{index}"))?;
        }
        if obligation == "exact-input" {
            let reason = match meaning {
                Meaning::Float { bits: 32 } => {
                    "Binary64 1.0000000000000002 narrows to binary32 1.0"
                }
                Meaning::Integer { .. } => {
                    "PyArrow safe array construction truncates fractional input 1.5 to integer 1"
                }
                _ => "Native declaration does not prove exact conversion of arbitrary host inputs",
            };
            let outcome = if matches!(
                meaning,
                Meaning::Integer { .. } | Meaning::Float { bits: 32 }
            ) {
                "approximated"
            } else {
                "unknown"
            };
            add_loss!(
                &native,
                reason,
                outcome,
                "conversion",
                &ideal_path.to_utf8().unwrap_or_default(),
            )?;
        }
    }
    let metadata_value = get(&metadata_report, "metadata").unwrap_or(&Value::Null);
    if let Some(entries) = get(metadata_value, "key_value_metadata").and_then(array) {
        for (i, entry) in entries.iter().enumerate() {
            add_loss!(entry,"Native key/value metadata remains attached without facet enforcement interpretation","unknown","native",&format!("/key_value_metadata/{i}"))?;
        }
    }
    for path in unclaimed {
        if path != u("/name") && path != u("/repetition_type") && path != u("/field_id") {
            let residual_path = append_pointer(&u(&format!("/schema/{index}")), &path);
            push_residual_utf16(
                &mut residuals,
                &mut observations,
                &native,
                "Unclaimed native field refinement remains attached",
                "unknown",
                "native",
                &residual_path,
                &ideal_path,
                loc,
                ctx,
            )?;
        }
    }
    if let Some(author) = get(&request, "author") {
        match crate::facets::verify_core_facet_declaration(
            author, &source, engine, registry, caps, ctx,
        ) {
            Ok(verified) => {
                let author_identity = get(&verified, "identity").unwrap_or(&Value::Null);
                if text(author_identity, "module") != Some(&module)
                    || text(author_identity, "element") != Some(&element_id)
                {
                    conflict = true;
                    add_loss!(
                        author_identity,
                        "Author receipt identifies a different Field",
                        "unknown",
                        "native",
                        &ideal_path.to_utf8().unwrap_or_default(),
                    )?;
                } else {
                    let inspected = crate::facets::inspect_core_facets(
                        &source,
                        author_identity,
                        engine,
                        registry,
                        caps,
                        ctx,
                    )?;
                    let meaning_report = get(&inspected, "meaning").unwrap_or(&Value::Null);
                    if matches!(
                        as_text(get(meaning_report, "state").unwrap_or(&Value::Null)).as_deref(),
                        Some("known" | "partial")
                    ) {
                        let interpreted =
                            get(meaning_report, "interpreted").unwrap_or(&Value::Null);
                        for key in ["length", "precision", "scale", "integerWidth"] {
                            let declared = get(interpreted, key);
                            let native_facet = get(&facets, key);
                            if let Some(declared) = declared {
                                if let Some(native_facet) = native_facet {
                                    if !same(declared, native_facet, ctx)? {
                                        conflict = true;
                                        add_loss!(
                                            declared,
                                            &format!(
                                                "Authored {key} conflicts with native declaration"
                                            ),
                                            "unknown",
                                            "native",
                                            &ideal_path.to_utf8().unwrap_or_default(),
                                        )?;
                                    }
                                } else {
                                    add_loss!(declared,&format!("Authored bound is retained but not established by the selected native declaration"),"unknown",if key=="precision"||key=="scale"{"decimal"}else if key=="integerWidth"{"integerWidth"}else{"length"},&format!("{}/{key}",ideal_path.to_utf8().unwrap_or_default()))?;
                                }
                            }
                        }
                        if as_text(get(meaning_report, "state").unwrap_or(&Value::Null)).as_deref()
                            == Some("partial")
                        {
                            add_loss!(
                                get(meaning_report, "facets").unwrap_or(&Value::Null),
                                "Unknown authored facet qualifiers remain attached",
                                "unknown",
                                "native",
                                &ideal_path.to_utf8().unwrap_or_default(),
                            )?;
                        }
                    }
                }
            }
            Err(e) if e.is_control_failure() || e.code == "LIMIT" => return Err(e),
            Err(e) => {
                conflict = true;
                add_loss!(
                    &Value::Null,
                    &format!("Author provenance is invalid or stale: {}", e.code),
                    "unknown",
                    "native",
                    &ideal_path.to_utf8().unwrap_or_default(),
                )?;
            }
        }
    } else if get(element, "facets").is_some() {
        conflict = true;
        add_loss!(
            get(element, "facets").unwrap(),
            "Existing facets require verified author provenance",
            "unknown",
            "native",
            &ideal_path.to_utf8().unwrap_or_default(),
        )?;
    }
    let outcome = if residuals.is_empty() {
        "exact"
    } else if residuals
        .iter()
        .any(|r| as_text(get(r, "outcome").unwrap_or(&Value::Null)).as_deref() == Some("unknown"))
    {
        "unknown"
    } else if residuals.iter().any(|r| {
        as_text(get(r, "outcome").unwrap_or(&Value::Null)).as_deref() == Some("not-expressible")
    }) {
        "not-expressible"
    } else {
        "approximated"
    };
    let mode = as_text(get(&request, "mode").unwrap_or(&Value::Null)).unwrap_or_default();
    let blocked = conflict || (mode == "strict" && !residuals.is_empty());
    let mut result = obj(vec![
        ("operation", t("classify-parquet-facets")),
        ("version", t("1.0.0")),
        ("status", t(if blocked { "blocked" } else { "classified" })),
        ("outcome", t(outcome)),
        ("source", copy_json(&source, ctx)?),
        ("request", copy_json(&request, ctx)?),
        (
            "binding",
            obj(vec![
                ("id", t(EXT)),
                ("version", t("1.0.0")),
                ("nativeVersion", t(NATIVE_VERSION)),
                ("subset", t(SUBSET)),
            ]),
        ),
        (
            "mapping",
            obj(vec![
                ("origin", t("classified")),
                ("idealPath", Value::String(ideal_path.clone())),
                ("location", copy_json(loc, ctx)?),
                ("nativeFragment", native.clone()),
                ("facets", facets.clone()),
                ("observations", Value::Array(observations.clone())),
            ]),
        ),
        ("residuals", Value::Array(residuals.clone())),
        ("diagnostics", Value::Array(vec![])),
    ]);
    if !blocked {
        let mut target = copy_json(&source, ctx)?;
        let target_vocabularies = get_mut(&mut target, "vocabularies").ok_or_else(|| {
            err(
                "PARQUET_FACET_TARGET",
                "/vocabularies",
                "Vocabulary inventory missing",
            )
        })?;
        if get(target_vocabularies, EXT).is_none() {
            set(target_vocabularies, EXT, obj(vec![("version", t("1.0.0"))]));
        }
        let module_list = get_mut(&mut target, "modules")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "PARQUET_FACET_TARGET",
                    "/modules",
                    "Module inventory missing",
                )
            })?;
        let target_module = module_list
            .get_mut(mi)
            .ok_or_else(|| err("PARQUET_FACET_TARGET", "/modules", "Target module missing"))?;
        let target_elements = get_mut(target_module, "elements")
            .and_then(|v| {
                if let Value::Array(a) = v {
                    Some(a)
                } else {
                    None
                }
            })
            .ok_or_else(|| {
                err(
                    "PARQUET_FACET_TARGET",
                    "/modules/elements",
                    "Target elements missing",
                )
            })?;
        let target_field = target_elements.get_mut(ei).ok_or_else(|| {
            err(
                "PARQUET_FACET_TARGET",
                "/modules/elements",
                "Target field missing",
            )
        })?;
        if get(&request, "author").is_none()
            && object_members(&facets).is_some_and(|v| !v.is_empty())
        {
            set(target_field, "facets", facets.clone());
        }
        if let Some(exts) = get_mut(target_field, "extensions") {
            set(
                exts,
                EXT,
                obj(vec![
                    ("origin", t("classified")),
                    ("location", copy_json(loc, ctx)?),
                    (
                        "binding",
                        obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
                    ),
                    ("profile", t(&profile)),
                    ("obligation", t(&obligation)),
                    ("outcome", t(outcome)),
                    ("observations", Value::Array(observations.clone())),
                ]),
            );
        } else {
            set(
                target_field,
                "extensions",
                obj(vec![(
                    EXT,
                    obj(vec![
                        ("origin", t("classified")),
                        ("location", copy_json(loc, ctx)?),
                        (
                            "binding",
                            obj(vec![("id", t(EXT)), ("version", t("1.0.0"))]),
                        ),
                        ("profile", t(&profile)),
                        ("obligation", t(&obligation)),
                        ("outcome", t(outcome)),
                        ("observations", Value::Array(observations.clone())),
                    ]),
                )]),
            );
        }
        let validation = engine.validate_document(&target, registry, caps, ctx)?;
        if !validation.valid {
            return Err(err(
                "PARQUET_FACET_TARGET",
                "/target",
                "Classification would violate core constraints",
            ));
        }
        let bytes = crate::parquet_capture_inspection::export_parquet_capture(
            &target, engine, registry, caps, ctx,
        )?;
        if bytes != source_bytes {
            return Err(err(
                "PARQUET_FACET_NATIVE",
                "/target",
                "Native archive changed",
            ));
        }
        if let Value::Object(fields) = &mut result {
            fields.push((u("target"), target));
        }
    }
    let diagnostics = residuals
        .iter()
        .map(|r| {
            diag(
                if conflict {
                    "PARQUET_FACET_CONFLICT"
                } else {
                    "PARQUET_FACET_UNRESOLVED"
                },
                &as_text(get(r, "path").unwrap_or(&Value::Null)).unwrap_or_default(),
                &as_text(get(r, "reason").unwrap_or(&Value::Null)).unwrap_or_default(),
                if blocked { "error" } else { "warning" },
            )
        })
        .collect();
    set(&mut result, "diagnostics", Value::Array(diagnostics));
    validate(&result, &rt.result, ctx, "PARQUET_FACET_RESULT")?;
    Ok(result)
}
fn locate<'a>(source: &'a Value, module: &Utf16, id: &Utf16) -> Option<(usize, usize, &'a Value)> {
    let modules = array(get(source, "modules")?)?;
    let mut found = None;
    for (mi, m) in modules.iter().enumerate() {
        if text(m, "id") != Some(module) {
            continue;
        }
        for (ei, e) in array(get(m, "elements")?)?.iter().enumerate() {
            if text(e, "id") == Some(id) {
                if found.is_some() {
                    return None;
                }
                found = Some((mi, ei, e));
            }
        }
    }
    found
}
pub fn classify(
    input: &Value,
    request: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    classify_inner(input, request, engine, registry, caps, ctx)
}
pub fn verify(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt, ctx)?;
    validate(
        &receipt,
        &runtime(engine, ctx)?.result,
        ctx,
        "PARQUET_FACET_RECEIPT",
    )?;
    if as_text(get(&receipt, "status").unwrap_or(&Value::Null)).as_deref() != Some("classified") {
        return Err(err(
            "PARQUET_FACET_RECEIPT",
            "",
            "Expected successful classification",
        ));
    }
    let expected = classify_inner(
        get(&receipt, "source").unwrap(),
        get(&receipt, "request").unwrap(),
        engine,
        registry,
        caps,
        ctx,
    )?;
    if !same(&receipt, &expected, ctx)? {
        return Err(err(
            "PARQUET_FACET_RECEIPT",
            "",
            "Receipt differs from retained source and request",
        ));
    }
    if !same(
        current,
        get(&receipt, "target").unwrap_or(&Value::Null),
        ctx,
    )? {
        return Err(err(
            "PARQUET_FACET_STALE",
            "/target",
            "Current target differs from retained target",
        ));
    }
    Ok(receipt)
}
pub fn recover_source(
    receipt: &Value,
    current: &Value,
    engine: &Engine,
    registry: &Registry,
    caps: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let r = verify(receipt, current, engine, registry, caps, ctx)?;
    crate::parquet_capture_inspection::export_parquet_capture(
        get(&r, "source").unwrap(),
        engine,
        registry,
        caps,
        ctx,
    )
}
