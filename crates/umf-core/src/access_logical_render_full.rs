// SPDX-License-Identifier: MIT OR Apache-2.0
//! Expanded Rust-owned pre-Weft renderer for captured Python access variants.
//!
//! This remains opt-in while predecessor parity is being established. It does
//! not capture Python declarations, access files, or invoke Weft.

use super::{invalid, key, refuse, LogicalRenderError, FULL_PROFILE};
use crate::{Context, PyText, PythonConsumerValue, Utf16};
use num_bigint::BigInt;
use num_traits::ToPrimitive;

#[derive(Clone, Debug)]
struct Field {
    module: String,
    element: String,
    field_module: String,
    field_id: String,
    name: Option<String>,
    alias: Option<String>,
}
#[derive(Clone, Debug)]
struct Record {
    module: String,
    element: String,
    namespace: Option<String>,
    name: Option<String>,
    alias: Option<String>,
    key: Vec<Field>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Owner(String, String, Option<String>);

fn text_value(value: &PythonConsumerValue) -> Result<String, LogicalRenderError> {
    match value {
        PythonConsumerValue::String(value) => value
            .codepoints()
            .iter()
            .map(|point| char::from_u32(*point).ok_or_else(invalid))
            .collect(),
        _ => Err(invalid()),
    }
}

fn object_fields(
    value: &PythonConsumerValue,
) -> Result<&[(PyText, PythonConsumerValue)], LogicalRenderError> {
    match value {
        PythonConsumerValue::Object(fields) => Ok(fields),
        _ => Err(invalid()),
    }
}

fn get<'a>(
    fields: &'a [(PyText, PythonConsumerValue)],
    name: &str,
) -> Result<&'a PythonConsumerValue, LogicalRenderError> {
    fields
        .iter()
        .find(|(candidate, _)| candidate == &key(name))
        .map(|(_, value)| value)
        .ok_or_else(invalid)
}

fn exact_fields<'a>(
    value: &'a PythonConsumerValue,
    expected: &[&str],
) -> Result<&'a [(PyText, PythonConsumerValue)], LogicalRenderError> {
    let fields = object_fields(value)?;
    if fields.len() != expected.len()
        || fields.iter().enumerate().any(|(index, (name, _))| {
            fields[..index].iter().any(|(prior, _)| prior == name)
                || !expected.iter().any(|candidate| name == &key(candidate))
        })
        || expected.iter().any(|name| !fields.iter().any(|(member, _)| member == &key(name)))
    {
        return Err(invalid());
    }
    Ok(fields)
}

fn tagged<'a>(
    value: &'a PythonConsumerValue,
    class_name: &str,
    expected: &[&str],
) -> Result<&'a [(PyText, PythonConsumerValue)], LogicalRenderError> {
    let outer = exact_fields(value, &["$type", "fields"])?;
    if text_value(get(outer, "$type")?)? != class_name {
        return Err(invalid());
    }
    exact_fields(get(outer, "fields")?, expected)
}

fn tuple(value: &PythonConsumerValue) -> Result<&[PythonConsumerValue], LogicalRenderError> {
    let wrapper = exact_fields(value, &["$tuple"])?;
    match get(wrapper, "$tuple")? {
        PythonConsumerValue::Array(items) => Ok(items),
        _ => Err(invalid()),
    }
}

fn nullable_text(value: &PythonConsumerValue) -> Result<Option<String>, LogicalRenderError> {
    match value {
        PythonConsumerValue::Null => Ok(None),
        PythonConsumerValue::String(_) => Ok(Some(text_value(value)?)),
        _ => Err(invalid()),
    }
}

fn field(value: &PythonConsumerValue) -> Result<Field, LogicalRenderError> {
    let values = tagged(
        value,
        "umf_access.dsl._nodes.FieldRef",
        &[
            "alias",
            "element",
            "field",
            "field_module",
            "logical_name",
            "module",
            "source",
            "temporal",
        ],
    )?;
    Ok(Field {
        module: text_value(get(values, "module")?)?,
        element: text_value(get(values, "element")?)?,
        field_module: text_value(get(values, "field_module")?)?,
        field_id: text_value(get(values, "field")?)?,
        name: nullable_text(get(values, "logical_name")?)?,
        alias: nullable_text(get(values, "alias")?)?,
    })
}

fn record(value: &PythonConsumerValue) -> Result<Record, LogicalRenderError> {
    let values = tagged(
        value,
        "umf_access.dsl._nodes.RecordRef",
        &[
            "alias",
            "element",
            "key",
            "key_id",
            "logical_name",
            "logical_namespace",
            "module",
            "source",
        ],
    )?;
    let module = text_value(get(values, "module")?)?;
    let element = text_value(get(values, "element")?)?;
    let key = tuple(get(values, "key")?)?
        .iter()
        .map(field)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Record {
        module,
        element,
        namespace: nullable_text(get(values, "logical_namespace")?)?,
        name: nullable_text(get(values, "logical_name")?)?,
        alias: nullable_text(get(values, "alias")?)?,
        key,
    })
}

fn owner_field(field: &Field) -> Owner {
    Owner(field.module.clone(), field.element.clone(), field.alias.clone())
}

fn owner_record(record: &Record) -> Owner {
    Owner(record.module.clone(), record.element.clone(), record.alias.clone())
}

fn quote(value: &str) -> Result<String, LogicalRenderError> {
    if value.is_empty() || value.contains('\0') || value.chars().any(|c| (0xd800..=0xdfff).contains(&(c as u32))) {
        return Err(refuse("CAPTURE_UNSUPPORTED", "logical identifier is outside Weft text profile"));
    }
    Ok(format!("\"{}\"", value.replace('"', "\"\"")))
}

fn marker(value: &str) -> Result<String, LogicalRenderError> {
    let mut chars = value.chars();
    if !chars.next().is_some_and(|c| c == '_' || c.is_ascii_alphabetic())
        || !chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
    {
        return Err(refuse("CAPTURE_SIGNATURE", "parameter is outside Weft marker grammar"));
    }
    Ok(format!(":{value}"))
}

fn node(value: &PythonConsumerValue) -> Result<(String, Vec<PythonConsumerValue>), LogicalRenderError> {
    let values = tagged(value, "umf_access.dsl._nodes.Node", &["args", "op"])?;
    Ok((
        text_value(get(values, "op")?)?,
        tuple(get(values, "args")?)?.to_vec(),
    ))
}

fn field_column(
    value: &PythonConsumerValue,
    mutation: bool,
    aliases: &[(Owner, String)],
) -> Result<String, LogicalRenderError> {
    let field = field(value)?;
    let Some(name) = field.name.as_deref().filter(|name| !name.is_empty()) else {
        return Err(refuse("CAPTURE_UNSUPPORTED", "Field has no authored logical name"));
    };
    if mutation {
        return quote(name);
    }
    let alias = aliases
        .iter()
        .find(|(owner, _)| owner == &owner_field(&field))
        .map(|(_, alias)| alias)
        .ok_or_else(|| refuse("CAPTURE_UNSUPPORTED", "column owner absent from joined query"))?;
    Ok(format!("{}.{}", quote(alias)?, quote(name)?))
}

fn key_component_values(
    value: &PythonConsumerValue,
    mutation: bool,
    aliases: &[(Owner, String)],
) -> Result<Vec<String>, LogicalRenderError> {
    let (op, args) = node(value)?;
    if op == "key_param" && args.len() >= 2 {
        let name = text_value(&args[0])?;
        return tuple(&args[1])?.iter().map(|part| {
            let component = text_value(part)?;
            marker(&format!("{name}__{component}"))
        }).collect();
    }
    if op == "key" && !args.is_empty() {
        let values = tagged(&args[0], "umf_access.dsl._nodes.KeyLiteral", &["identity", "source", "values"])?;
        return tuple(get(values, "values")?)?.iter().map(|item| expression(item, mutation, aliases)).collect();
    }
    Ok(vec![expression(value, mutation, aliases)?])
}

fn expression(
    value: &PythonConsumerValue,
    mutation: bool,
    aliases: &[(Owner, String)],
) -> Result<String, LogicalRenderError> {
    let (op, args) = node(value)?;
    match op.as_str() {
        "column" if args.len() == 1 => field_column(&args[0], mutation, aliases),
        "param" if args.len() == 1 => marker(&text_value(&args[0])?),
        "null" if args.is_empty() => Ok("NULL".into()),
        "bool" if args.len() == 1 => match args[0] { PythonConsumerValue::Bool(true) => Ok("TRUE".into()), PythonConsumerValue::Bool(false) => Ok("FALSE".into()), _ => Err(invalid()) },
        "str" if args.len() == 1 => {
            let value = text_value(&args[0])?;
            if value.contains('\0') { return Err(refuse("CAPTURE_UNSUPPORTED", "literal outside Weft text profile")); }
            Ok(format!("'{}'", value.replace('\'', "''")))
        }
        "int" if args.len() == 1 => {
            let PythonConsumerValue::Integer(value) = &args[0] else { return Err(invalid()) };
            if value.bits() > 33220 { return Err(refuse("CAPTURE_UNSUPPORTED", "Integer literal exceeds exact token profile")); }
            let token = value.to_string();
            if token.trim_start_matches('-').len() > 10000 { return Err(refuse("CAPTURE_UNSUPPORTED", "Integer literal exceeds exact token profile")); }
            Ok(token)
        }
        "decimal" if args.len() == 1 => {
            let values = exact_fields(&args[0], &["$decimal"])?;
            let token = decimal_fixed(&text_value(get(values, "$decimal")?)?)?;
            Ok(if token.contains('.') { token } else { format!("{token}.0") })
        }
        "aggregate" => aggregate(&args, aliases),
        "bucket_width" => bucket_width(&args, mutation, aliases),
        "missing" | "binary" | "date" | "instant" | "local" => Err(refuse("CAPTURE_UNSUPPORTED", "literal requires typed parameter or newer Weft grammar")),
        _ => Err(refuse("CAPTURE_UNSUPPORTED", "unsupported scalar selection")),
    }
}

fn decimal_fixed(raw: &str) -> Result<String, LogicalRenderError> {
    let (mantissa, exp) = raw.split_once(['e', 'E']).map_or((raw, 0i32), |(m, e)| {
        (m, e.parse::<i32>().unwrap_or(i32::MAX))
    });
    if exp == i32::MAX { return Err(refuse("CAPTURE_UNSUPPORTED", "finite Decimal literal required")); }
    let negative = mantissa.starts_with('-');
    let positive = mantissa.starts_with('+');
    let body = mantissa.trim_start_matches(['-', '+']);
    let mut split = body.split('.');
    let whole = split.next().unwrap_or("");
    let fraction = split.next().unwrap_or("");
    if split.next().is_some() || whole.is_empty() && fraction.is_empty()
        || !whole.bytes().chain(fraction.bytes()).all(|b| b.is_ascii_digit())
        || whole.len() + fraction.len() > 10000 || exp.unsigned_abs() > 10000
    { return Err(refuse("CAPTURE_UNSUPPORTED", "Decimal literal exceeds token profile")); }
    let digits = format!("{whole}{fraction}");
    let scale = fraction.len() as i32 - exp;
    let mut result = if scale <= 0 {
        format!("{}{zeros}", digits, zeros = "0".repeat((-scale) as usize))
    } else if scale as usize >= digits.len() {
        format!("0.{}{zeros}{digits}", "", zeros = "0".repeat(scale as usize - digits.len()))
    } else {
        let at = digits.len() - scale as usize;
        format!("{}.{}", &digits[..at], &digits[at..])
    };
    if negative { result.insert(0, '-'); }
    let _ = positive;
    Ok(result)
}

fn aggregate(args: &[PythonConsumerValue], aliases: &[(Owner, String)]) -> Result<String, LogicalRenderError> {
    if args.len() != 3 { return Err(refuse("CAPTURE_UNSUPPORTED", "unknown exact aggregate")); }
    let operation = text_value(&args[0])?;
    if operation == "count" && matches!(args[1], PythonConsumerValue::Null) {
        return Ok("COUNT(*)".into());
    }
    let column = field_column(&args[1], false, aliases)?;
    match operation.as_str() {
        "avg" => {
            let PythonConsumerValue::Integer(scale) = &args[2] else { return Err(refuse("CAPTURE_UNSUPPORTED", "unknown exact aggregate")); };
            let scale = scale.to_i32().filter(|n| (0..=1000).contains(n)).ok_or_else(|| refuse("CAPTURE_UNSUPPORTED", "unknown exact aggregate"))?;
            Ok(format!("AVG_SCALE({column}, {scale})"))
        }
        "count_distinct" => Ok(format!("COUNT(DISTINCT {column})")),
        "approx_count_distinct" => Ok(format!("APPROX_COUNT_DISTINCT({column})")),
        "sum" | "min" | "max" if matches!(args[2], PythonConsumerValue::Null) => Ok(format!("{}({column})", operation.to_ascii_uppercase())),
        _ => Err(refuse("CAPTURE_UNSUPPORTED", "unknown exact aggregate")),
    }
}

fn scalar(
    value: &PythonConsumerValue,
    mutation: bool,
    aliases: &[(Owner, String)],
) -> Result<String, LogicalRenderError> {
    if matches!(value, PythonConsumerValue::Object(_)) {
        let fields = object_fields(value)?;
        if fields.iter().any(|(name, _)| name == &key("$type")) {
            let type_name = text_value(get(exact_fields(value, &["$type", "fields"] )?, "$type")?)?;
            if type_name == "umf_access.dsl._nodes.FieldRef" {
                return field_column(value, mutation, aliases);
            }
        }
    }
    let (op, args) = node(value)?;
    match op.as_str() {
        "aggregate" => aggregate(&args, aliases),
        "bucket_width" => bucket_width(&args, mutation, aliases),
        _ => expression(value, mutation, aliases),
    }
}

fn bucket_width(args: &[PythonConsumerValue], mutation: bool, aliases: &[(Owner, String)]) -> Result<String, LogicalRenderError> {
    if args.len() != 2 { return Err(refuse("CAPTURE_UNSUPPORTED", "bucket requires a numeric literal")); }
    let (field_value, width) = (&args[0], &args[1]);
    let token = match width {
        PythonConsumerValue::Integer(value) => value.to_string(),
        PythonConsumerValue::Object(_) => {
            let values = exact_fields(width, &["$decimal"])?;
            decimal_fixed(&text_value(get(values, "$decimal")?)?)?
        }
        _ => return Err(refuse("CAPTURE_UNSUPPORTED", "bucket requires a numeric literal")),
    };
    let nonzero = token.trim_start_matches(['-', '0', '.']).len() > 0;
    if !nonzero || token.starts_with('-') { return Err(refuse("CAPTURE_UNSUPPORTED", "bucket width must be positive")); }
    let rendered = expression(&node_value("column", vec![field_value.clone()]), mutation, aliases)?;
    Ok(format!("BUCKET_WIDTH({rendered}, {})", if token.contains('.') { token } else { format!("{token}.0") }))
}

fn node_value(op: &str, args: Vec<PythonConsumerValue>) -> PythonConsumerValue {
    use PythonConsumerValue::{Object, String as S};
    let tuple = Object(vec![(key("$tuple"), PythonConsumerValue::Array(args))]);
    Object(vec![
        (key("$type"), S(PyText::from_utf8("umf_access.dsl._nodes.Node"))),
        (key("fields"), Object(vec![(key("args"), tuple), (key("op"), S(PyText::from_utf8(op)))])),
    ])
}

fn predicate(
    value: &PythonConsumerValue,
    mutation: bool,
    aliases: &[(Owner, String)],
) -> Result<Option<String>, LogicalRenderError> {
    let (op, args) = node(value)?;
    match op.as_str() {
        "omitted" if args.is_empty() => Ok(None),
        "and" | "or" => {
            let mut parts = Vec::new();
            for child in &args {
                if let Some(part) = predicate(child, mutation, aliases)? { parts.push(part); }
            }
            Ok(match parts.len() {
                0 => None,
                1 => parts.pop(),
                _ => Some(format!("({})", parts.join(&format!(" {} ", op.to_ascii_uppercase())))),
            })
        }
        "not" if args.len() == 1 => Ok(predicate(&args[0], mutation, aliases)?.map(|p| format!("NOT ({p})"))),
        "=" | "<>" | "<" | "<=" | ">" | ">=" | "IS DISTINCT FROM" | "IS NOT DISTINCT FROM" if args.len() == 2 => {
            Ok(Some(format!("{} {op} {}", expression(&args[0], mutation, aliases)?, expression(&args[1], mutation, aliases)?)))
        }
        "IS NULL" | "IS NOT NULL" | "IS MISSING" | "IS NOT MISSING" if args.len() == 1 => {
            Ok(Some(format!("{} {op}", expression(&args[0], mutation, aliases)?)))
        }
        "IN" | "NOT IN" if args.len() == 2 => {
            let (right_op, right_args) = node(&args[1])?;
            let values = if right_op == "list" {
                if right_args.is_empty() {
                    let check = format!("IN_EMPTY({})", expression(&args[0], mutation, aliases)?);
                    return Ok(Some(if op == "IN" { check } else { format!("NOT ({check})") }));
                }
                right_args.iter().map(|v| expression(v, mutation, aliases)).collect::<Result<Vec<_>, _>>()?.join(", ")
            } else { expression(&args[1], mutation, aliases)? };
            Ok(Some(format!("{} {op} ({values})", expression(&args[0], mutation, aliases)?)))
        }
        "BETWEEN" if args.len() == 3 => Ok(Some(format!("{} BETWEEN {} AND {}", expression(&args[0], mutation, aliases)?, expression(&args[1], mutation, aliases)?, expression(&args[2], mutation, aliases)?))),
        "STARTS_WITH" | "MATCHES_ALL_TERMS" | "MATCHES_ANY_TERM" if args.len() == 2 => Ok(Some(format!("{op}({}, {})", expression(&args[0], mutation, aliases)?, expression(&args[1], mutation, aliases)?))),
        "HAS_RELATED" | "HAS_INVERSE_RELATED" if args.len() >= 2 => {
            let key_values = key_component_values(&args[1], mutation, aliases)?;
            let mut rendered = format!("{op}({}, KEY({})", expression(&args[0], mutation, aliases)?, key_values.join(", "));
            if op == "HAS_INVERSE_RELATED" {
                if args.len() != 4 { return Err(refuse("CAPTURE_SIGNATURE", "original inverse relationship identity required")); }
                rendered.push_str(&format!(", {}, {}", expression(&node_value("str", vec![args[2].clone()]), mutation, aliases)?, expression(&node_value("str", vec![args[3].clone()]), mutation, aliases)?));
            }
            rendered.push(')');
            Ok(Some(rendered))
        }
        _ => Err(refuse("CAPTURE_UNSUPPORTED", "unsupported logical predicate")),
    }
}

fn full_owner_aliases(root_record: &Record, steps: &[PythonConsumerValue]) -> Result<Vec<(Owner, String)>, LogicalRenderError> {
    let mut aliases = vec![(owner_record(root_record), "r".to_string())];
    for step in steps {
        let (op, args) = node(step)?;
        if op == "join" && !args.is_empty() {
            let join = tagged(&args[0], "umf_access.dsl._expressions.Join", &["direction", "key_target", "optional", "ref", "target"]);
            let join = match join { Ok(v) => v, Err(_) => tagged(&args[0], "umf_access.dsl._expressions.OptionalJoin", &["direction", "key_target", "optional", "ref", "target"]).or_else(|_| tagged(&args[0], "umf_access.dsl._expressions.RequiredJoin", &["direction", "key_target", "optional", "ref", "target"]))? };
            let target = record(get(join, "target")?)?;
            let alias = format!("j{}", aliases.len());
            aliases.push((owner_record(&target), alias));
        }
    }
    Ok(aliases)
}

fn full_render(
    input: &PythonConsumerValue,
    ctx: &mut Context<'_>,
) -> Result<String, LogicalRenderError> {
    input.admit(ctx)?;
    let envelope = exact_fields(input, &["binding", "ownerBound", "profile", "variant"])?;
    if text_value(get(envelope, "profile")?)? != FULL_PROFILE {
        return Err(refuse("CAPTURE_DTO_PROFILE", "captured variant profile mismatch"));
    }
    let binding = get(envelope, "binding")?;
    let owner_bound = match get(envelope, "ownerBound")? { PythonConsumerValue::Bool(value) => *value, _ => return Err(invalid()) };
    let variant = tagged(get(envelope, "variant")?, "umf_access.capture.CapturedVariant", &["node", "parameters", "presence"])?;
    let (terminal, terminal_args) = node(get(variant, "node")?)?;
    if terminal_args.len() < 2 { return Err(refuse("CAPTURE_UNSUPPORTED", "unsupported terminal form")); }
    let record = record(&terminal_args[0])?;
    if record.namespace.as_deref().is_none_or(str::is_empty) || record.name.as_deref().is_none_or(str::is_empty) {
        return Err(refuse("CAPTURE_UNSUPPORTED", "Record requires authored namespace and logical name"));
    }
    let steps = tuple(&terminal_args[1])?;
    let aliases = full_owner_aliases(&record, steps)?;
    let source = format!("{}.{}", quote(record.namespace.as_deref().unwrap())?, quote(record.name.as_deref().unwrap())?);
    let mutation = terminal == "update";
    let mut predicates = Vec::new();
    let mut having = Vec::new();
    let mut selected: Option<Vec<PythonConsumerValue>> = None;
    let mut projection_names = Vec::new();
    let mut grouped = Vec::new();
    let mut group_seen = false;
    let mut order: Vec<(PythonConsumerValue, String, String)> = Vec::new();
    let mut includes: Vec<String> = Vec::new();
    let mut joins: Vec<String> = Vec::new();
    let mut limit: Option<BigInt> = None;
    let mut group_limit: Option<BigInt> = None;
    for (step_index, step) in steps.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let (op, args) = node(step)?;
        match op.as_str() {
            "filter" => for item in &args { if let Some(value) = predicate(item, mutation, &aliases)? { predicates.push(value); } },
            "having" => for item in &args { if let Some(value) = predicate(item, mutation, &aliases)? { having.push(value); } },
            "select" => selected = Some(args),
            "into" if args.len() == 1 => {
                let projection = tagged(&args[0], "umf_access.dsl._nodes.ProjectionRef", &["fields", "module", "name", "names"])?;
                selected = Some(tuple(get(projection, "fields")?)?.to_vec());
                projection_names = tuple(get(projection, "names")?)?.iter().map(text_value).collect::<Result<Vec<_>, _>>()?;
            }
            "group" => { if group_seen { return Err(refuse("CAPTURE_UNSUPPORTED", "repeated grouping requires explicit grouping semantics")); } group_seen = true; if limit.is_some() { return Err(refuse("CAPTURE_UNSUPPORTED", "input-row limit before grouping has no admitted semantics")); } grouped = args; },
            "order" => for item in &args {
                let fields = tagged(item, "umf_access.dsl._expressions.Ordering", &["direction", "field", "nulls"])?;
                order.push((get(fields, "field")?.clone(), text_value(get(fields, "direction")?)?, text_value(get(fields, "nulls")?)?));
            },
            "limit" if args.len() == 1 => { let PythonConsumerValue::Integer(number) = &args[0] else { return Err(invalid()) }; if group_seen { group_limit = Some(number.clone()) } else { limit = Some(number.clone()) } },
            "group_limit" if args.len() == 1 => { let PythonConsumerValue::Integer(number) = &args[0] else { return Err(invalid()) }; group_limit = Some(number.clone()) },
            "join" => {
                if mutation || matches!(binding, PythonConsumerValue::Null) {
                    return Err(refuse("CAPTURE_UNSUPPORTED", "join rendering requires declared build-time bindings"));
                }
                joins.push(join_sql(step, &record, &steps[..step_index], binding, &aliases)?);
            }
            "snapshot" => { if (terminal != "page" && !owner_bound) || args != [PythonConsumerValue::Bool(true)] { return Err(refuse("CAPTURE_UNSUPPORTED", "snapshot requires a page declaration")); } },
            "include_keys" if args.len() >= 2 => {
                let field = field(&args[0])?;
                let bound = match &args[1] { PythonConsumerValue::Integer(n) => n.to_string(), _ => return Err(invalid()) };
                let direction = if args.len() == 4 { text_value(&args[3])? } else { "forward".into() };
                let function = if direction == "inverse" { "INVERSE_RELATED_KEYS" } else { "RELATED_KEYS" };
                let mut include = format!("{function}({}, {bound}", field_column(&field_to_value(&field), false, &aliases)?);
                if direction == "inverse" {
                    if field.field_module.is_empty() { return Err(refuse("CAPTURE_SIGNATURE", "original inverse relationship module required")); }
                    include.push_str(&format!(", {}, {}", expression(&node_value("str", vec![PythonConsumerValue::String(PyText::from_utf8(&field.field_module))]), false, &aliases)?, expression(&node_value("str", vec![PythonConsumerValue::String(PyText::from_utf8(&field.field_id))]), false, &aliases)?));
                }
                include.push_str(&format!(") AS {}", quote(&format!("{}_keys", field.field_id))?));
                includes.push(include);
            },
            "related" => return Err(refuse("WEFT_BLOCKED", "WR-A6 navigation requires one original source")),
            _ => return Err(refuse("CAPTURE_UNSUPPORTED", "unsupported logical query step")),
        }
    }
    let aggregate_query = !grouped.is_empty() || selected.as_ref().is_some_and(|values| values.iter().any(|value| node(value).ok().is_some_and(|(op, _)| op == "aggregate")));
    if group_limit.is_some() && terminal != "group_count" {
        if grouped.is_empty() || limit.is_some() { return Err(refuse("CAPTURE_UNSUPPORTED", "conflicting or ungrouped result limits")); }
        limit = group_limit.clone();
    }
    if !having.is_empty() && !aggregate_query { return Err(refuse("CAPTURE_UNSUPPORTED", "having requires aggregation")); }
    if mutation {
        if selected.is_some() || !grouped.is_empty() || !order.is_empty() || !includes.is_empty() || limit.is_some() || predicates.is_empty() {
            return Err(refuse("CAPTURE_UNSUPPORTED", "bulk update requires a filtered unprojected selection"));
        }
        if terminal_args.len() < 3 { return Err(invalid()); }
        let mut assignments = Vec::new();
        for assignment in tuple(&terminal_args[2])? {
            let pair = tuple(assignment)?;
            if pair.len() != 2 { return Err(invalid()); }
            assignments.push(format!("{} = {}", field_column(&pair[0], true, &aliases)?, expression(&pair[1], true, &aliases)?));
        }
        return Ok(format!("UPDATE {source} SET {} WHERE {}", assignments.join(", "), predicates.join(" AND ")));
    }
    let mut projection = if matches!(terminal.as_str(), "count" | "group_count") {
        let mut names = grouped.iter().map(|v| scalar(v, false, &aliases)).collect::<Result<Vec<_>, _>>()?;
        names.push("COUNT(*)".into());
        if terminal == "group_count" && !projection_names.is_empty() {
            names = names.into_iter().zip(projection_names.iter()).map(|(v, n)| Ok(format!("{v} AS {}", quote(n)?))).collect::<Result<Vec<_>, LogicalRenderError>>()?;
        }
        names.join(", ")
    } else if terminal == "exists" {
        record.key.iter().map(|key| field_column(&field_to_value(key), false, &aliases)).collect::<Result<Vec<_>, _>>()?.join(", ")
    } else if let Some(selected) = &selected {
        let mut values = selected.iter().map(|v| scalar(v, false, &aliases)).collect::<Result<Vec<_>, _>>()?;
        if !projection_names.is_empty() { values = values.into_iter().zip(projection_names.iter()).map(|(v, n)| Ok(format!("{v} AS {}", quote(n)?))).collect::<Result<Vec<_>, LogicalRenderError>>()?; }
        values.join(", ")
    } else { "\"r\".*".into() };
    if !includes.is_empty() { projection.push_str(&format!(", {}", includes.join(", "))); }
    if terminal == "get" {
        if terminal_args.len() < 3 { return Err(invalid()); }
        let values = key_component_values(&terminal_args[2], false, &aliases)?;
        if values.len() != record.key.len() { return Err(refuse("CAPTURE_UNSUPPORTED", "Key component count differs from declared Key")); }
        for (field, value) in record.key.iter().zip(values) { predicates.push(format!("{} = {value}", field_column(&field_to_value(field), false, &aliases)?)); }
    }
    match terminal.as_str() {
        "first" | "exists" => limit = Some(BigInt::from(1)),
        "one" => limit = Some(BigInt::from(2)),
        "page" => { if terminal_args.len() < 3 { return Err(invalid()); } let PythonConsumerValue::Integer(n) = &terminal_args[2] else { return Err(invalid()) }; limit = Some(n.clone()); if order.is_empty() { for key in &record.key { order.push((field_to_value(key), "ASC".into(), "LAST".into())); } } },
        "all" | "count" | "group_count" | "get" => (),
        _ => return Err(refuse("CAPTURE_UNSUPPORTED", "unsupported terminal form")),
    }
    if terminal == "group_count" && (grouped.is_empty() || group_limit.is_none()) { return Err(refuse("CAPTURE_UNSUPPORTED", "grouped count requires an explicit result-group limit")); }
    if terminal == "all" && !grouped.is_empty() && group_limit.is_none() { return Err(refuse("CAPTURE_UNSUPPORTED", "grouped list reads require an explicit result-group limit")); }
    let valid_group_count_projection = terminal == "group_count"
        && selected.as_ref().is_some_and(|selected| is_group_count_projection(selected, &grouped).unwrap_or(false));
    if matches!(terminal.as_str(), "count" | "group_count")
        && (!order.is_empty() || !includes.is_empty() || limit.is_some()
            || selected.is_some() && !valid_group_count_projection)
    {
        return Err(refuse("CAPTURE_UNSUPPORTED", "count with projection/order/limit requires explicit Weft semantics"));
    }
    if !matches!(terminal.as_str(), "count" | "group_count" | "get") && limit.is_none() && !owner_bound && !aggregate_query { return Err(refuse("CAPTURE_UNSUPPORTED", "list reads require an explicit bound")); }
    if terminal == "group_count" { limit = group_limit.clone(); }
    let mut sql = format!("SELECT {projection} FROM {source} AS \"r\"");
    if !joins.is_empty() { sql.push(' '); sql.push_str(&joins.join(" ")); }
    if !predicates.is_empty() { sql.push_str(&format!(" WHERE {}", predicates.join(" AND "))); }
    if !grouped.is_empty() { sql.push_str(&format!(" GROUP BY {}", grouped.iter().map(|v| scalar(v, false, &aliases)).collect::<Result<Vec<_>, _>>()?.join(", "))); }
    if !having.is_empty() { sql.push_str(&format!(" HAVING {}", having.join(" AND "))); }
    if !order.is_empty() {
        if !aggregate_query {
            let existing: Vec<String> = order.iter().map(|(field, _, _)| field_key(field)).collect::<Result<_, _>>()?;
            for key in &record.key { if !existing.contains(&field_key(&field_to_value(key))?) { order.push((field_to_value(key), "ASC".into(), "LAST".into())); } }
        }
        let rendered = order.iter().map(|(field, direction, nulls)| Ok(format!("{} {direction} NULLS {nulls}", scalar(field, false, &aliases)?))).collect::<Result<Vec<_>, LogicalRenderError>>()?;
        sql.push_str(&format!(" ORDER BY {}", rendered.join(", ")));
    }
    if let Some(limit) = limit { sql.push_str(&format!(" LIMIT {limit}")); }
    let units = sql.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    Ok(sql)
}

fn field_to_value(field: &Field) -> PythonConsumerValue {
    use PythonConsumerValue::{Null, Object, String as S};
    let fields = Object(vec![
        (key("alias"), field.alias.clone().map(|v| S(PyText::from_utf8(&v))).unwrap_or(Null)),
        (key("element"), S(PyText::from_utf8(&field.element))),
        (key("field"), S(PyText::from_utf8(&field.field_id))),
        (key("field_module"), S(PyText::from_utf8(&field.field_module))),
        (key("logical_name"), field.name.clone().map(|v| S(PyText::from_utf8(&v))).unwrap_or(Null)),
        (key("module"), S(PyText::from_utf8(&field.module))),
        (key("source"), Null),
        (key("temporal"), Null),
    ]);
    Object(vec![(key("$type"), S(PyText::from_utf8("umf_access.dsl._nodes.FieldRef"))), (key("fields"), fields)])
}

fn field_key(value: &PythonConsumerValue) -> Result<String, LogicalRenderError> {
    let field = field(value)?;
    Ok(format!("{}\0{}\0{}\0{}", field.module, field.element, field.alias.as_deref().unwrap_or(""), field.field_id))
}

fn is_count_aggregate(value: &PythonConsumerValue) -> bool {
    let Ok((op, args)) = node(value) else { return false };
    op == "aggregate"
        && args.len() == 3
        && matches!(&args[0], PythonConsumerValue::String(_) if text_value(&args[0]).is_ok_and(|text| text == "count"))
        && matches!(args[1], PythonConsumerValue::Null)
        && matches!(args[2], PythonConsumerValue::Null)
}

fn is_group_count_projection(
    selected: &[PythonConsumerValue],
    grouped: &[PythonConsumerValue],
) -> Result<bool, LogicalRenderError> {
    if selected.len() != grouped.len() + 1 || !is_count_aggregate(selected.last().unwrap()) {
        return Ok(false);
    }
    for (selected, grouped) in selected.iter().zip(grouped) {
        if scalar_field_key(selected)? != scalar_field_key(grouped)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn scalar_field_key(value: &PythonConsumerValue) -> Result<String, LogicalRenderError> {
    if let Ok(key) = field_key(value) { return Ok(key); }
    let (op, args) = node(value)?;
    if op == "column" && args.len() == 1 { return field_key(&args[0]); }
    Err(invalid())
}

fn string_array(value: &PythonConsumerValue) -> Result<Vec<String>, LogicalRenderError> {
    let PythonConsumerValue::Array(items) = value else { return Err(invalid()) };
    items.iter().map(text_value).collect()
}

fn pair_list(value: &PythonConsumerValue) -> Result<Vec<(String, String)>, LogicalRenderError> {
    let PythonConsumerValue::Array(items) = value else { return Err(invalid()) };
    items.iter().map(|item| {
        let PythonConsumerValue::Array(pair) = item else { return Err(invalid()) };
        if pair.len() != 2 { return Err(invalid()); }
        Ok((text_value(&pair[0])?, text_value(&pair[1])?))
    }).collect()
}

fn join_sql(
    step: &PythonConsumerValue,
    root_record: &Record,
    prior_steps: &[PythonConsumerValue],
    binding: &PythonConsumerValue,
    aliases: &[(Owner, String)],
) -> Result<String, LogicalRenderError> {
    let (op, args) = node(step)?;
    if op != "join" || args.len() != 2 { return Err(refuse("CAPTURE_UNSUPPORTED", "join rendering requires declared build-time bindings")); }
    let join_tag = exact_fields(&args[0], &["$type", "fields"])?;
    let class_name = text_value(get(join_tag, "$type")?)?;
    if !matches!(class_name.as_str(), "umf_access.dsl._expressions.Join" | "umf_access.dsl._expressions.RequiredJoin" | "umf_access.dsl._expressions.OptionalJoin") {
        return Err(invalid());
    }
    let join_fields = exact_fields(get(join_tag, "fields")?, &["direction", "key_target", "optional", "ref", "target"])?;
    let relation_ref = field(get(join_fields, "ref")?)?;
    let target = record(get(join_fields, "target")?)?;
    let binding_fields = object_fields(binding).map_err(|_| refuse("CAPTURE_UNSUPPORTED", "join rendering requires declared build-time bindings"))?;
    let relationships = match get(binding_fields, "relationships")? { PythonConsumerValue::Array(items) => items, _ => return Err(refuse("CAPTURE_UNSUPPORTED", "relationship binding is absent or ambiguous")) };
    let mut matches = Vec::new();
    for relationship in relationships {
        let members = object_fields(relationship)?;
        if text_value(get(members, "id")?)? == relation_ref.field_id { matches.push(members); }
    }
    if matches.len() != 1 { return Err(refuse("CAPTURE_UNSUPPORTED", "relationship binding is absent or ambiguous")); }
    let relation = matches[0];
    let source_alias = aliases.iter().find(|(owner, _)| owner == &owner_field(&relation_ref)).map(|(_, alias)| alias.as_str()).ok_or_else(|| refuse("CAPTURE_UNSUPPORTED", "relationship endpoint differs from generated declaration"))?;
    let target_alias = aliases.iter().find(|(owner, _)| owner == &owner_record(&target)).map(|(_, alias)| alias.as_str()).ok_or_else(|| refuse("CAPTURE_UNSUPPORTED", "relationship endpoint differs from generated declaration"))?;
    let source_record = if source_alias == "r" {
        root_record.clone()
    } else {
        let mut found = None;
        for prior in prior_steps {
            let (prior_op, prior_args) = node(prior)?;
            if prior_op != "join" || prior_args.is_empty() { continue; }
            let j = exact_fields(&prior_args[0], &["$type", "fields"])?;
            let jf = object_fields(get(j, "fields")?)?;
            let candidate = record(get(jf, "target")?)?;
            if aliases.iter().any(|(owner, alias)| owner == &owner_record(&candidate) && alias == source_alias) { found = Some(candidate); break; }
        }
        found.ok_or_else(|| refuse("CAPTURE_UNSUPPORTED", "relationship endpoint differs from generated declaration"))?
    };
    let source = string_array(get(relation, "source")?)?;
    let target_name = string_array(get(relation, "target")?)?;
    if source != [source_record.namespace.clone().unwrap_or_default(), source_record.name.clone().unwrap_or_default()]
        || target_name != [target.namespace.clone().unwrap_or_default(), target.name.clone().unwrap_or_default()]
        || !matches!(get(relation, "toOne")?, PythonConsumerValue::Bool(true))
    { return Err(refuse("CAPTURE_UNSUPPORTED", "relationship endpoint differs from generated declaration")); }
    let tables = match get(binding_fields, "tables")? { PythonConsumerValue::Array(items) => items, _ => return Err(refuse("CAPTURE_UNSUPPORTED", "join target binding absent")) };
    let mut target_is_bound = false;
    for table in tables {
        let members = object_fields(table)?;
        if string_array(get(members, "logical")?)? == target_name { target_is_bound = true; }
    }
    if !target_is_bound { return Err(refuse("CAPTURE_UNSUPPORTED", "join target binding absent")); }
    let pairs = pair_list(get(relation, "pairs")?)?;
    let on = pairs.iter().map(|(left, right)| Ok(format!("{}.{} = {}.{}", quote(source_alias)?, quote(left)?, quote(target_alias)?, quote(right)?))).collect::<Result<Vec<_>, LogicalRenderError>>()?.join(" AND ");
    let join_kind = text_value(&args[1])?.to_ascii_uppercase();
    Ok(format!("{join_kind} JOIN {}.{} AS {} ON {on}", quote(target.namespace.as_deref().unwrap_or(""))?, quote(target.name.as_deref().unwrap_or(""))?, quote(target_alias)?))
}

/// Render the expanded `umf-access-logical-render/0.2.0` DTO.
pub fn render_captured_variant(
    input: &PythonConsumerValue,
    ctx: &mut Context<'_>,
) -> Result<String, LogicalRenderError> {
    full_render(input, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::access_logical_render::LogicalRenderRefusal;
    use num_bigint::BigInt;

    fn string(value: &str) -> PythonConsumerValue {
        PythonConsumerValue::String(PyText::from_utf8(value))
    }

    fn object(values: Vec<(&str, PythonConsumerValue)>) -> PythonConsumerValue {
        PythonConsumerValue::Object(values.into_iter().map(|(name, value)| (key(name), value)).collect())
    }

    fn tuple_value(values: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        object(vec![("$tuple", PythonConsumerValue::Array(values))])
    }

    fn tagged(name: &str, values: Vec<(&str, PythonConsumerValue)>) -> PythonConsumerValue {
        object(vec![("$type", string(name)), ("fields", object(values))])
    }

    fn field(logical_name: &str, field_id: &str) -> PythonConsumerValue {
        tagged("umf_access.dsl._nodes.FieldRef", vec![
            ("alias", PythonConsumerValue::Null),
            ("element", string("Invoice")),
            ("field", string(field_id)),
            ("field_module", string("billing")),
            ("logical_name", string(logical_name)),
            ("module", string("billing")),
            ("source", PythonConsumerValue::Null),
            ("temporal", PythonConsumerValue::Null),
        ])
    }

    fn record() -> PythonConsumerValue {
        tagged("umf_access.dsl._nodes.RecordRef", vec![
            ("alias", PythonConsumerValue::Null),
            ("element", string("Invoice")),
            ("key", tuple_value(vec![field("invoiceId", "id")])),
            ("key_id", PythonConsumerValue::Null),
            ("logical_name", string("Invoice")),
            ("logical_namespace", string("com.example.billing")),
            ("module", string("billing")),
            ("source", PythonConsumerValue::Null),
        ])
    }

    fn request(terminal: &str, args: Vec<PythonConsumerValue>, binding: PythonConsumerValue) -> PythonConsumerValue {
        let terminal = node_value(terminal, args);
        let variant = tagged("umf_access.capture.CapturedVariant", vec![
            ("node", terminal),
            ("parameters", tuple_value(vec![])),
            ("presence", tuple_value(vec![])),
        ]);
        object(vec![
            ("binding", binding),
            ("ownerBound", PythonConsumerValue::Bool(false)),
            ("profile", string(FULL_PROFILE)),
            ("variant", variant),
        ])
    }

    fn render(value: &PythonConsumerValue) -> Result<String, LogicalRenderError> {
        full_render(value, &mut Context::ordinary())
    }

    #[test]
    fn full_profile_matches_frozen_direct_and_filter_outputs() {
        let steps = vec![node_value("limit", vec![PythonConsumerValue::Integer(BigInt::from(4))])];
        let input = request("all", vec![record(), tuple_value(steps)], PythonConsumerValue::Null);
        assert_eq!(render(&input).unwrap(), "SELECT \"r\".* FROM \"com.example.billing\".\"Invoice\" AS \"r\" LIMIT 4");

        let predicate = node_value("=", vec![
            node_value("column", vec![field("status", "status-id")]),
            node_value("param", vec![string("value")]),
        ]);
        let steps = vec![node_value("filter", vec![predicate]), node_value("limit", vec![PythonConsumerValue::Integer(BigInt::from(4))])];
        let input = request("all", vec![record(), tuple_value(steps)], PythonConsumerValue::Null);
        assert_eq!(render(&input).unwrap(), "SELECT \"r\".* FROM \"com.example.billing\".\"Invoice\" AS \"r\" WHERE \"r\".\"status\" = :value LIMIT 4");
    }

    #[test]
    fn full_profile_preserves_global_count_and_literal_escaping() {
        let input = request("count", vec![record(), tuple_value(vec![])], PythonConsumerValue::Null);
        assert_eq!(render(&input).unwrap(), "SELECT COUNT(*) FROM \"com.example.billing\".\"Invoice\" AS \"r\"");

        let predicate = node_value("=", vec![node_value("column", vec![field("status", "status-id")]), node_value("str", vec![string("O'Reilly")])]);
        let steps = vec![node_value("filter", vec![predicate]), node_value("limit", vec![PythonConsumerValue::Integer(BigInt::from(2))])];
        let input = request("all", vec![record(), tuple_value(steps)], PythonConsumerValue::Null);
        assert_eq!(render(&input).unwrap(), "SELECT \"r\".* FROM \"com.example.billing\".\"Invoice\" AS \"r\" WHERE \"r\".\"status\" = 'O''Reilly' LIMIT 2");
    }

    #[test]
    fn group_count_accepts_only_its_canonical_projection_and_applies_group_limit() {
        let group = node_value("group", vec![node_value("column", vec![field("status", "status-id")])]);
        let group_limit = node_value("group_limit", vec![PythonConsumerValue::Integer(BigInt::from(3))]);
        let aggregate = node_value("aggregate", vec![string("count"), PythonConsumerValue::Null, PythonConsumerValue::Null]);
        let selection = node_value("select", vec![node_value("column", vec![field("status", "status-id")]), aggregate.clone()]);
        let input = request("group_count", vec![record(), tuple_value(vec![group.clone(), group_limit.clone(), selection])], PythonConsumerValue::Null);
        assert_eq!(render(&input).unwrap(), "SELECT \"r\".\"status\", COUNT(*) FROM \"com.example.billing\".\"Invoice\" AS \"r\" GROUP BY \"r\".\"status\" LIMIT 3");

        let bad_selection = node_value("select", vec![node_value("column", vec![field("memo", "memo-id")]), aggregate]);
        let input = request("group_count", vec![record(), tuple_value(vec![group, group_limit, bad_selection])], PythonConsumerValue::Null);
        let error = render(&input).unwrap_err();
        assert!(matches!(error, LogicalRenderError::Refused(LogicalRenderRefusal { code: "CAPTURE_UNSUPPORTED", message }) if message == "count with projection/order/limit requires explicit Weft semantics"));
    }

    #[test]
    fn update_join_refuses_with_the_python_predecessor_reason() {
        let join = node_value("join", vec![]);
        let input = request("update", vec![record(), tuple_value(vec![join]), tuple_value(vec![])], PythonConsumerValue::Null);
        let error = render(&input).unwrap_err();
        assert!(matches!(error, LogicalRenderError::Refused(LogicalRenderRefusal { code: "CAPTURE_UNSUPPORTED", message }) if message == "join rendering requires declared build-time bindings"));
    }
}
