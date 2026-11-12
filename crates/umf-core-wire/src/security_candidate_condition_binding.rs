// SPDX-License-Identifier: MIT OR Apache-2.0
//! Private compact security-condition evaluator with synchronous host reads.
use std::collections::BTreeMap;
use umf_core::{Context, EngineError, Utf16, Value};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.security-candidate-condition/0.1";
type Bindings = BTreeMap<usize, (usize, usize)>;
type PreflightBindings = BTreeMap<usize, usize>;

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn text(v: &Value) -> Option<&Utf16> {
    if let Value::String(s) = v {
        Some(s)
    } else {
        None
    }
}
fn integer(v: &Value) -> Option<usize> {
    match v {
        Value::Number(n)
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= usize::MAX as f64 =>
        {
            Some(*n as usize)
        }
        _ => None,
    }
}
fn number(n: usize) -> Value {
    Value::Number(n as f64)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn array(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}
fn annotated_term(value: &Value) -> Result<(Value, Value), EngineError> {
    let outer =
        text(field(value, "kind").ok_or_else(|| fail("CONDITION", "Term kind is required"))?)
            .and_then(|s| s.to_utf8().ok())
            .ok_or_else(|| fail("CONDITION", "Term kind must be text"))?;
    let descriptor =
        field(value, "term").ok_or_else(|| fail("CONDITION", "Term descriptor is required"))?;
    let inner = text(
        field(descriptor, "kind")
            .ok_or_else(|| fail("CONDITION", "Term descriptor kind is required"))?,
    )
    .and_then(|s| s.to_utf8().ok())
    .ok_or_else(|| fail("CONDITION", "Term descriptor kind must be text"))?;
    let class = match (outer.as_str(), inner.as_str()) {
        ("entity-term", "constant") => "entity-constant",
        ("entity-term", "context-attribute") => "entity-context-attribute",
        ("entity-term", "entity-identity") => "entity-identity",
        ("entity-term", "record-attribute") => "entity-record-attribute",
        ("witness-term", "record-identity") => "witness-record-identity",
        ("witness-term", "entity-identity") => "witness-entity-identity",
        ("witness-term", "record-attribute") => "witness-record-attribute",
        _ => return Err(fail("CONDITION", "Unsupported compiled term class")),
    };
    let mut descriptor_fields = match descriptor {
        Value::Object(fields) => fields.clone(),
        _ => return Err(fail("CONDITION", "Term descriptor must be an object")),
    };
    descriptor_fields.push((Utf16::from("classification"), Value::string_utf8(class)));
    let mut outer_fields = match value {
        Value::Object(fields) => fields.clone(),
        _ => return Err(fail("CONDITION", "Term must be an object")),
    };
    outer_fields.push((Utf16::from("classification"), Value::string_utf8(class)));
    outer_fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("term"))
        .map(|(_, v)| *v = Value::Object(descriptor_fields));
    Ok((Value::Object(outer_fields), Value::string_utf8(class)))
}

fn callback_value(
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    request: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    callback(&request, ctx)
}

fn step(
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let response = callback_value(
        callback,
        object(vec![("kind", Value::string_utf8("step"))]),
        ctx,
    )?;
    if matches!(response, Value::Bool(true)) {
        Ok(())
    } else {
        Err(fail("CALLBACK", "Condition step callback refused"))
    }
}

fn eval(
    expr: &Value,
    resource: usize,
    bindings: &Bindings,
    depth: usize,
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    ctx: &mut Context<'_>,
) -> Result<char, EngineError> {
    if depth > 16 {
        return Err(fail(
            "CONDITION_LIMIT",
            "Condition nesting exceeds 16 levels",
        ));
    }
    step(callback, ctx)?;
    let op =
        text(field(expr, "op").ok_or_else(|| fail("CONDITION", "Condition operator is required"))?)
            .and_then(|s| s.to_utf8().ok())
            .ok_or_else(|| fail("CONDITION", "Condition operator must be text"))?;
    match op.as_str() {
        "literal" => match field(expr, "value") {
            Some(Value::Bool(true)) => Ok('T'),
            Some(Value::Bool(false)) => Ok('F'),
            _ => Err(fail("CONDITION", "Literal condition must be boolean")),
        },
        "eq" => {
            let left = field(expr, "left")
                .ok_or_else(|| fail("CONDITION", "Left term is required"))?
                .clone();
            let right = field(expr, "right")
                .ok_or_else(|| fail("CONDITION", "Right term is required"))?
                .clone();
            let binding_values = bindings.iter().map(|(occ, (assoc, row))| {
                object(vec![
                    ("occurrence", number(*occ)),
                    ("association", number(*assoc)),
                    ("rowIndex", number(*row)),
                ])
            });
            let response = callback_value(
                callback,
                object(vec![
                    ("kind", Value::string_utf8("terms")),
                    ("left", annotated_term(&left)?.0),
                    ("right", annotated_term(&right)?.0),
                    ("resourceIndex", number(resource)),
                    ("bindings", array(binding_values)),
                ]),
                ctx,
            )?;
            let a = field(&response, "left")
                .ok_or_else(|| fail("CALLBACK", "Term callback omitted left value"))?;
            let b = field(&response, "right")
                .ok_or_else(|| fail("CALLBACK", "Term callback omitted right value"))?;
            match (a, b) {
                (Value::Null, _) | (_, Value::Null) => Ok('U'),
                (Value::String(a), Value::String(b)) => {
                    if a == b {
                        Ok('T')
                    } else {
                        Ok('F')
                    }
                }
                _ => Err(fail(
                    "CALLBACK",
                    "Term callback values must be strings or null",
                )),
            }
        }
        "not" => {
            let child =
                field(expr, "arg").ok_or_else(|| fail("CONDITION", "Not operand is required"))?;
            Ok(
                match eval(child, resource, bindings, depth + 1, callback, ctx)? {
                    'T' => 'F',
                    'F' => 'T',
                    _ => 'U',
                },
            )
        }
        "and" | "or" => {
            let args = match field(expr, "args") {
                Some(Value::Array(v)) => v,
                _ => return Err(fail("CONDITION", "Boolean operands must be an array")),
            };
            if args.is_empty() || args.len() > 64 {
                return Err(fail(
                    "CONDITION_LIMIT",
                    "Boolean condition requires 1–64 operands",
                ));
            }
            let mut result = if op == "and" { 'T' } else { 'F' };
            for arg in args {
                let value = eval(arg, resource, bindings, depth + 1, callback, ctx)?;
                if op == "and" {
                    if value == 'F' {
                        return Ok('F');
                    }
                    if value == 'U' {
                        result = 'U'
                    }
                } else {
                    if value == 'T' {
                        return Ok('T');
                    }
                    if value == 'U' {
                        result = 'U'
                    }
                }
            }
            Ok(result)
        }
        "exists" => {
            let association = integer(
                field(expr, "association")
                    .ok_or_else(|| fail("CONDITION", "Association index is required"))?,
            )
            .filter(|n| *n < 256)
            .ok_or_else(|| fail("CONDITION", "Association index is out of range"))?;
            let occurrence = integer(
                field(expr, "occurrence")
                    .ok_or_else(|| fail("CONDITION", "Occurrence index is required"))?,
            )
            .filter(|n| *n < 4096)
            .ok_or_else(|| fail("CONDITION", "Occurrence index is out of range"))?;
            let response = callback_value(
                callback,
                object(vec![
                    ("kind", Value::string_utf8("rows")),
                    ("association", number(association)),
                    ("resourceIndex", number(resource)),
                    (
                        "bindings",
                        array(bindings.iter().map(|(occ, (assoc, row))| {
                            object(vec![
                                ("occurrence", number(*occ)),
                                ("association", number(*assoc)),
                                ("rowIndex", number(*row)),
                            ])
                        })),
                    ),
                ]),
                ctx,
            )?;
            let count = integer(&response).ok_or_else(|| {
                fail(
                    "CALLBACK",
                    "Association callback must return a nonnegative row count",
                )
            })?;
            if count > 10_000 {
                return Err(fail(
                    "CONDITION_LIMIT",
                    "Association row count exceeds 10000",
                ));
            }
            let where_expr =
                field(expr, "where").ok_or_else(|| fail("CONDITION", "Exists body is required"))?;
            let mut unknown = false;
            if bindings.len() >= 256 {
                return Err(fail(
                    "CONDITION_LIMIT",
                    "Condition binding depth exceeds 256",
                ));
            }
            for row in 0..count {
                step(callback, ctx)?;
                let mut nested = bindings.clone();
                nested.insert(occurrence, (association, row));
                match eval(where_expr, resource, &nested, depth + 1, callback, ctx)? {
                    'T' => return Ok('T'),
                    'U' => unknown = true,
                    _ => (),
                }
            }
            Ok(if unknown { 'U' } else { 'F' })
        }
        _ => Err(fail("CONDITION", "Unknown compact condition operator")),
    }
}

fn preflight_event(
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    kind: &str,
    fields: Vec<(&str, Value)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut all = vec![("kind", Value::string_utf8(kind))];
    all.extend(fields);
    let response = callback_value(callback, object(all), ctx)?;
    if matches!(response, Value::Bool(true)) {
        Ok(())
    } else {
        Err(fail("CALLBACK", "Condition dependency callback refused"))
    }
}

fn term_dependencies(
    term: &Value,
    target: &Value,
    bindings: &PreflightBindings,
    associations: &[Value],
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    step(callback, ctx)?;
    let missing = || fail("CONDITION", "Incomplete dependency descriptor");
    let required = |source, key| field(source, key).cloned().ok_or_else(missing);
    let classification = field(term, "classification")
        .and_then(text)
        .and_then(|value| value.to_utf8().ok())
        .ok_or_else(missing)?;
    let descriptor = field(term, "term").ok_or_else(missing)?;
    macro_rules! send {
        ($kind:expr, $fields:expr) => {
            preflight_event(callback, $kind, $fields, ctx)
        };
    }
    if classification == "entity-constant" {
        return Ok(());
    }
    if classification == "entity-context-attribute" {
        return send!(
            "contextField",
            vec![("field", required(descriptor, "field")?)]
        );
    }
    let ty = required(descriptor, "type")?;
    if matches!(
        classification.as_str(),
        "entity-identity" | "entity-record-attribute"
    ) {
        send!("completeType", vec![("type", ty.clone())])?;
        if classification == "entity-record-attribute" {
            send!(
                "entityField",
                vec![
                    ("type", ty),
                    ("target", target.clone()),
                    ("context", required(descriptor, "context")?),
                    ("field", required(descriptor, "field")?)
                ]
            )?;
        }
        return Ok(());
    }
    let association = field(term, "occurrence")
        .and_then(integer)
        .and_then(|occurrence| bindings.get(&occurrence).copied())
        .ok_or_else(missing)?;
    let source = associations.get(association).ok_or_else(missing)?;
    let position = number(association);
    let graph = matches!(field(source, "graph"), Some(Value::Bool(true)));
    let attribute = classification == "witness-record-attribute";
    let endpoint = classification == "witness-entity-identity";
    if graph {
        send!(
            "completeAssociation",
            vec![("association", position.clone())]
        )?;
        if endpoint {
            let role = required(descriptor, "role")?;
            send!(
                "graphRoleCoverage",
                vec![("association", position.clone()), ("role", role.clone())]
            )?;
            send!("completeType", vec![("type", ty)])?;
            return send!(
                "graphRoleProjection",
                vec![("association", position), ("role", role)]
            );
        }
        if !matches!(field(source, "recordWitness"), Some(Value::Bool(true))) {
            return Err(fail("CONDITION", "Opaque witness is not a Record"));
        }
        send!("completeType", vec![("type", ty.clone())])?;
        if attribute {
            send!(
                "graphField",
                vec![
                    ("association", position),
                    ("type", ty),
                    ("field", required(descriptor, "field")?)
                ]
            )?;
        }
    } else {
        let record = required(source, "type")?;
        send!("completeType", vec![("type", record.clone())])?;
        if attribute {
            send!(
                "associationField",
                vec![
                    ("association", position.clone()),
                    ("type", ty.clone()),
                    ("field", required(descriptor, "field")?)
                ]
            )?;
        }
        if endpoint {
            send!("completeType", vec![("type", ty.clone())])?;
            let fields = required(descriptor, "fields")?;
            let Value::Array(fields) = fields else {
                return Err(missing());
            };
            for field in &fields {
                send!(
                    "associationField",
                    vec![
                        ("association", position.clone()),
                        ("type", record.clone()),
                        ("field", field.clone())
                    ]
                )?;
            }
            send!(
                "memberEndpoints",
                vec![
                    ("association", position),
                    ("type", ty),
                    ("fields", Value::Array(fields))
                ]
            )?;
        }
    }
    Ok(())
}

fn preflight(
    expr: &Value,
    target: &Value,
    bindings: &PreflightBindings,
    associations: Option<&[Value]>,
    depth: usize,
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if depth > 16 {
        return Err(fail(
            "CONDITION_LIMIT",
            "Condition nesting exceeds 16 levels",
        ));
    }
    step(callback, ctx)?;
    let op =
        text(field(expr, "op").ok_or_else(|| fail("CONDITION", "Condition operator is required"))?)
            .and_then(|s| s.to_utf8().ok())
            .ok_or_else(|| fail("CONDITION", "Condition operator must be text"))?;
    match op.as_str() {
        "literal" => match field(expr, "value") {
            Some(Value::Bool(_)) => Ok(()),
            _ => Err(fail("CONDITION", "Literal condition must be boolean")),
        },
        "eq" => {
            let entries = bindings.iter().map(|(occ, assoc)| {
                object(vec![
                    ("occurrence", number(*occ)),
                    ("association", number(*assoc)),
                ])
            });
            let left = annotated_term(
                field(expr, "left").ok_or_else(|| fail("CONDITION", "Left term is required"))?,
            )?
            .0;
            let right = annotated_term(
                field(expr, "right").ok_or_else(|| fail("CONDITION", "Right term is required"))?,
            )?
            .0;
            if let Some(associations) = associations {
                term_dependencies(&left, target, bindings, associations, callback, ctx)?;
                return term_dependencies(&right, target, bindings, associations, callback, ctx);
            }
            preflight_event(
                callback,
                "preflightTerms",
                vec![
                    ("left", left),
                    ("right", right),
                    ("target", target.clone()),
                    ("bindings", array(entries)),
                ],
                ctx,
            )
        }
        "not" => preflight(
            field(expr, "arg").ok_or_else(|| fail("CONDITION", "Not operand is required"))?,
            target,
            bindings,
            associations,
            depth + 1,
            callback,
            ctx,
        ),
        "and" | "or" => {
            let args = match field(expr, "args") {
                Some(Value::Array(a)) => a,
                _ => return Err(fail("CONDITION", "Boolean operands must be an array")),
            };
            if args.is_empty() || args.len() > 64 {
                return Err(fail(
                    "CONDITION_LIMIT",
                    "Boolean condition requires 1–64 operands",
                ));
            }
            for arg in args {
                preflight(
                    arg,
                    target,
                    bindings,
                    associations,
                    depth + 1,
                    callback,
                    ctx,
                )?;
            }
            Ok(())
        }
        "exists" => {
            let association = integer(
                field(expr, "association")
                    .ok_or_else(|| fail("CONDITION", "Association index is required"))?,
            )
            .filter(|n| *n < 256)
            .ok_or_else(|| fail("CONDITION", "Association index is out of range"))?;
            let occurrence = integer(
                field(expr, "occurrence")
                    .ok_or_else(|| fail("CONDITION", "Occurrence index is required"))?,
            )
            .filter(|n| *n < 4096)
            .ok_or_else(|| fail("CONDITION", "Occurrence index is out of range"))?;
            if let Some(associations) = associations {
                associations
                    .get(association)
                    .ok_or_else(|| fail("CONDITION", "Unknown association"))?;
                preflight_event(
                    callback,
                    "completeAssociation",
                    vec![("association", number(association))],
                    ctx,
                )?;
            } else {
                preflight_event(
                    callback,
                    "preflightAssociation",
                    vec![
                        ("association", number(association)),
                        ("target", target.clone()),
                        (
                            "bindings",
                            array(bindings.iter().map(|(occ, assoc)| {
                                object(vec![
                                    ("occurrence", number(*occ)),
                                    ("association", number(*assoc)),
                                ])
                            })),
                        ),
                    ],
                    ctx,
                )?;
            }
            if bindings.len() >= 256 {
                return Err(fail(
                    "CONDITION_LIMIT",
                    "Condition binding depth exceeds 256",
                ));
            }
            let mut nested = bindings.clone();
            nested.insert(occurrence, association);
            preflight(
                field(expr, "where").ok_or_else(|| fail("CONDITION", "Exists body is required"))?,
                target,
                &nested,
                associations,
                depth + 1,
                callback,
                ctx,
            )
        }
        _ => Err(fail("CONDITION", "Unknown compact condition operator")),
    }
}

pub fn execute_wire_with_callback(
    wire: &str,
    callback: &mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let profile = text(
            field(&request, "profile")
                .ok_or_else(|| fail("REQUEST", "Candidate condition profile is required"))?,
        )
        .and_then(|s| s.to_utf8().ok());
        if profile.as_deref() != Some(PROFILE) {
            return Err(fail("REQUEST", "Candidate condition profile mismatch"));
        }
        let expr = field(&request, "expression")
            .ok_or_else(|| fail("REQUEST", "Condition expression is required"))?;
        if matches!(
            field(&request, "mode")
                .and_then(text)
                .and_then(|s| s.to_utf8().ok())
                .as_deref(),
            Some("normalize")
        ) {
            let expression = SourceCompiler {
                callback,
                ctx: &mut ctx,
                nodes: 0,
                aliases: Vec::new(),
            }
            .walk(expr, 0, "", 1)?;
            return encode(&expression, &mut ctx);
        }
        if matches!(
            field(&request, "mode")
                .and_then(text)
                .and_then(|s| s.to_utf8().ok())
                .as_deref(),
            Some("preflight")
        ) {
            let target = field(&request, "target")
                .ok_or_else(|| fail("REQUEST", "Preflight target is required"))?;
            let associations = match field(&request, "associations") {
                Some(Value::Array(values)) => Some(values.as_slice()),
                None => None,
                _ => return Err(fail("REQUEST", "Preflight associations must be an array")),
            };
            preflight(
                expr,
                target,
                &PreflightBindings::new(),
                associations,
                1,
                callback,
                &mut ctx,
            )?;
            return encode(&Value::Bool(true), &mut ctx);
        }
        let resource = integer(
            field(&request, "resourceIndex")
                .ok_or_else(|| fail("REQUEST", "Resource index is required"))?,
        )
        .ok_or_else(|| fail("REQUEST", "Resource index must be nonnegative"))?;
        if resource > 10_000 {
            return Err(fail("CONDITION_LIMIT", "Resource index exceeds 10000"));
        }
        let value = Value::string_utf8(
            match eval(expr, resource, &Bindings::new(), 1, callback, &mut ctx)? {
                'T' => "T",
                'F' => "F",
                _ => "U",
            },
        );
        encode(&value, &mut ctx)
    })();
    result_envelope(result)
}

fn source_error() -> EngineError {
    fail(
        "SECURITY_ASSOCIATION_EXPRESSION_UNSUPPORTED",
        "SECURITY_ASSOCIATION_EXPRESSION_UNSUPPORTED",
    )
}

fn source_shape(value: &Value, keys: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(source_error());
    };
    if fields.len() != keys.len() || keys.iter().any(|key| field(value, key).is_none()) {
        return Err(source_error());
    }
    Ok(())
}

struct SourceCompiler<'a, 'b> {
    callback: &'a mut dyn FnMut(&Value, &mut Context<'_>) -> Result<Value, EngineError>,
    ctx: &'a mut Context<'b>,
    nodes: usize,
    aliases: Vec<Utf16>,
}
impl SourceCompiler<'_, '_> {
    fn event(&mut self, kind: &str, mut args: Vec<(&str, Value)>) -> Result<Value, EngineError> {
        args.insert(0, ("kind", Value::string_utf8(kind)));
        (self.callback)(&object(args), self.ctx)
    }

    fn term(&mut self, term: &Value, scope: usize, path: String) -> Result<Value, EngineError> {
        self.event(
            "term",
            vec![
                ("term", term.clone()),
                ("scope", number(scope)),
                ("path", Value::string_utf8(path)),
            ],
        )
    }

    fn walk(
        &mut self,
        value: &Value,
        scope: usize,
        path: &str,
        depth: usize,
    ) -> Result<Value, EngineError> {
        self.nodes += 1;
        if self.nodes > 4096 || depth > 16 {
            return Err(source_error());
        }
        self.ctx.charge_work(1, Utf16::default())?;
        let read = |key| field(value, key).ok_or_else(source_error);
        let op = text(read("op")?)
            .and_then(|value| value.to_utf8().ok())
            .ok_or_else(source_error)?;
        match op.as_str() {
            "literal" => {
                source_shape(value, &["op", "value"])?;
                if !matches!(read("value")?, Value::Bool(_)) {
                    return Err(source_error());
                }
                Ok(value.clone())
            }
            "eq" => {
                source_shape(value, &["op", "left", "right"])?;
                let left = self.term(read("left")?, scope, format!("{path}/left"))?;
                let right = self.term(read("right")?, scope, format!("{path}/right"))?;
                let domains = self.event(
                    "domains",
                    vec![("left", left.clone()), ("right", right.clone())],
                )?;
                let Value::Array(domains) = domains else {
                    return Err(source_error());
                };
                if domains.len() != 2 {
                    return Err(source_error());
                }
                if let (Some(left), Some(right)) = (text(&domains[0]), text(&domains[1])) {
                    if left != right {
                        return Err(source_error());
                    }
                }
                Ok(object(vec![
                    ("op", Value::string_utf8(op)),
                    ("left", left),
                    ("right", right),
                ]))
            }
            "not" => {
                source_shape(value, &["op", "arg"])?;
                let child = self.walk(read("arg")?, scope, &format!("{path}/arg"), depth + 1)?;
                Ok(object(vec![("op", Value::string_utf8(op)), ("arg", child)]))
            }
            "and" | "or" => {
                source_shape(value, &["op", "args"])?;
                let Value::Array(args) = read("args")? else {
                    return Err(source_error());
                };
                if args.is_empty() || args.len() > 64 {
                    return Err(source_error());
                }
                let args = args
                    .iter()
                    .enumerate()
                    .map(|(index, value)| {
                        self.walk(value, scope, &format!("{path}/args/{index}"), depth + 1)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(object(vec![
                    ("op", Value::string_utf8(op)),
                    ("args", Value::Array(args)),
                ]))
            }
            "exists" => {
                source_shape(value, &["op", "association", "as", "where"])?;
                let alias = text(read("as")?).ok_or_else(source_error)?;
                let count = char::decode_utf16(alias.units().iter().copied()).count();
                if count == 0 || count > 4096 || self.aliases.contains(alias) {
                    return Err(source_error());
                }
                let binding = self.event(
                    "bind",
                    vec![
                        ("association", read("association")?.clone()),
                        ("alias", Value::String(alias.clone())),
                        ("scope", number(scope)),
                    ],
                )?;
                let nested = field(&binding, "scope")
                    .and_then(integer)
                    .ok_or_else(source_error)?;
                let witness = field(&binding, "witness")
                    .cloned()
                    .ok_or_else(source_error)?;
                self.aliases.push(alias.clone());
                let body = self.walk(read("where")?, nested, &format!("{path}/where"), depth + 1);
                self.aliases.pop();
                Ok(object(vec![
                    ("op", Value::string_utf8(op)),
                    ("witness", witness),
                    ("where", body?),
                ]))
            }
            _ => Err(source_error()),
        }
    }
}
