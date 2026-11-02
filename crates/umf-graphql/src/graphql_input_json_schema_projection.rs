// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned GraphQL input type to JSON Schema 2020-12 projection.
use std::collections::HashMap;

use apollo_compiler::{ast::Type as GraphqlType, schema::ExtendedType, Schema};
use umf_core::{
    context::Context,
    error::EngineError,
    json_schema_adapter,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const DRAFT: &str = "https://json-schema.org/draft/2020-12/schema";
const FATAL_DIAGNOSTICS: &[&str] = &[
    "GRAPHQL_FRAGMENT",
    "GRAPHQL_REPRESENTATION",
    "GRAPHQL_PRINT_CHANGE",
    "GRAPHQL_PROFILE_EXTENSION",
];

fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn key(text: &str) -> Utf16 {
    Utf16::from(text)
}
fn s(text: &str) -> Value {
    Value::string_utf8(text)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(text)) => Ok(text),
        _ => Err(err(
            "GRAPHQL_BINDINGS",
            "/policy",
            &format!("{name} must be a string"),
        )),
    }
}
fn issue(path: &str, code: &str, class: &str, detail: &str) -> Value {
    obj(vec![
        ("path", Value::String(Utf16::from(path))),
        ("code", s(code)),
        ("classification", s(class)),
        ("detail", s(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn push_issue(
    issues: &mut Vec<Value>,
    ctx: &mut Context<'_>,
    path: &str,
    code: &str,
    class: &str,
    detail: &str,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::from(path))?;
    issues.push(issue(path, code, class, detail));
    Ok(())
}

fn render_pretty(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    serialization::write_json_value(value, Format::Json, ctx)
}

struct Projection<'schema, 'ctx, 'cap> {
    schema: &'schema Schema,
    ctx: &'ctx mut Context<'cap>,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    names: HashMap<String, String>,
    definitions: Vec<(Utf16, Value)>,
    fatal: bool,
}
impl Projection<'_, '_, '_> {
    fn fail(&mut self, path: &str, detail: &str) -> Result<Value, EngineError> {
        self.fatal = true;
        push_issue(
            &mut self.issues,
            self.ctx,
            path,
            "GRAPHQL_INPUT_UNSUPPORTED",
            "unsupported",
            detail,
        )?;
        Ok(Value::Object(Vec::new()))
    }
    fn shape(&mut self, ty: &GraphqlType, path: &str) -> Result<Value, EngineError> {
        let non_null = ty.is_non_null();
        let value = match ty {
            GraphqlType::NonNullNamed(name) | GraphqlType::Named(name) => {
                self.named_type(name.as_str(), path)?
            }
            GraphqlType::NonNullList(inner) | GraphqlType::List(inner) => {
                push_issue(&mut self.issues, self.ctx, path, "LIST_COERCION", "representation-change", "Target requires arrays; GraphQL also wraps a non-list input into a singleton list, recursively")?;
                obj(vec![
                    ("type", s("array")),
                    ("items", self.shape(inner, &format!("{path}/items"))?),
                ])
            }
        };
        if non_null {
            Ok(value)
        } else {
            Ok(obj(vec![(
                "anyOf",
                Value::Array(vec![value, obj(vec![("type", s("null"))])]),
            )]))
        }
    }
    fn named_type(&mut self, name: &str, path: &str) -> Result<Value, EngineError> {
        match self.schema.types.iter().find(|(candidate, _)| candidate.as_str() == name).map(|(_, ty)| ty) {
            Some(ExtendedType::Scalar(_)) => match name {
                "String" => Ok(obj(vec![("type", s("string"))])),
                "Boolean" => Ok(obj(vec![("type", s("boolean"))])),
                "Int" => Ok(obj(vec![("type", s("integer")), ("minimum", Value::Number(-2147483648.0)), ("maximum", Value::Number(2147483647.0))])),
                "Float" => {
                    push_issue(&mut self.issues, self.ctx, path, "FLOAT_RUNTIME", "not-enforced", "JSON Schema mathematical numbers do not enforce finite host double-precision parsing")?;
                    Ok(obj(vec![("type", s("number"))]))
                }
                "ID" => {
                    push_issue(&mut self.issues, self.ctx, path, "ID_COERCION", "representation-change", "String/integer ID inputs are accepted, but integer-to-string coercion and host precision are not performed")?;
                    Ok(obj(vec![("anyOf", Value::Array(vec![obj(vec![("type", s("string"))]), obj(vec![("type", s("integer"))])]))]))
                }
                _ => self.fail(path, &format!("Custom scalar {name} requires an explicit coercion/representation contract")),
            },
            Some(ExtendedType::Enum(enum_type)) => Ok(obj(vec![
                ("type", s("string")),
                ("enum", Value::Array(enum_type.values.keys().map(|value| s(value.as_str())).collect())),
            ])),
            Some(ExtendedType::InputObject(input)) => self.input_object(input, path),
            _ => self.fail(path, "Unsupported GraphQL input kind"),
        }
    }
    fn input_object(
        &mut self,
        input: &apollo_compiler::schema::InputObjectType,
        path: &str,
    ) -> Result<Value, EngineError> {
        let name = input.name.as_str().to_owned();
        if let Some(target) = self.names.get(&name) {
            return Ok(obj(vec![("$ref", s(&format!("#/$defs/{target}")))]));
        }
        let target = format!("input_{}", self.names.len());
        self.names.insert(name.clone(), target.clone());
        self.mappings.push(obj(vec![
            ("name", s(&name)),
            ("targetPointer", s(&format!("/$defs/{target}"))),
        ]));
        let definition_index = self.definitions.len();
        self.definitions
            .push((key(&target), Value::Object(Vec::new())));
        let mut properties = Vec::new();
        let mut required = Vec::new();
        for input_field in input.fields.values() {
            let field_name = input_field.name.as_str();
            let field_path = format!(
                "/types/{}/fields/{field_name}",
                name.replace('~', "~0").replace('/', "~1")
            );
            let mut property = self.shape(&input_field.ty, &field_path)?;
            if let Some(description) = &input_field.description {
                if let Value::Object(members) = &mut property {
                    members.push((key("description"), Value::string_utf8(description.as_str())));
                }
            }
            if input_field
                .directives
                .0
                .iter()
                .any(|directive| directive.name == "deprecated")
            {
                if let Value::Object(members) = &mut property {
                    members.push((key("deprecated"), Value::Bool(true)));
                }
            }
            properties.push((key(field_name), property));
            if input_field.is_required() {
                required.push(s(field_name));
            }
            if input_field.default_value.is_some() {
                push_issue(&mut self.issues, self.ctx, &format!("{field_path}/default"), "INPUT_DEFAULT", "not-enforced", "Omission is accepted where GraphQL supplies a default, but JSON validation does not insert or coerce that value")?;
            }
        }
        let one_of = input
            .directives
            .0
            .iter()
            .any(|directive| directive.name == "oneOf");
        let mut definition = vec![
            (key("title"), s(&name)),
            (key("type"), s("object")),
            (key("properties"), Value::Object(properties)),
            (key("additionalProperties"), Value::Bool(false)),
        ];
        if let Some(description) = &input.description {
            definition.push((key("description"), Value::string_utf8(description.as_str())));
        }
        if !required.is_empty() {
            definition.push((key("required"), Value::Array(required)));
        }
        if one_of {
            let properties = match &definition[2].1 {
                Value::Object(fields) => fields,
                _ => unreachable!(),
            };
            let alternatives = properties
                .iter()
                .map(|(name, _)| {
                    let non_null = obj(vec![("not", obj(vec![("type", s("null"))]))]);
                    obj(vec![
                        ("required", Value::Array(vec![Value::String(name.clone())])),
                        ("properties", Value::Object(vec![(name.clone(), non_null)])),
                    ])
                })
                .collect();
            definition.push((key("minProperties"), Value::Number(1.0)));
            definition.push((key("maxProperties"), Value::Number(1.0)));
            definition.push((key("oneOf"), Value::Array(alternatives)));
        }
        self.definitions[definition_index].1 = Value::Object(definition);
        Ok(obj(vec![("$ref", s(&format!("#/$defs/{target}")))]))
    }
}

pub fn project(
    document: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy_copy = copy_json(policy, ctx)?;
    let policy_fields = match policy {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "GRAPHQL_BINDINGS",
                "/policy",
                "Explicit GraphQL input bindings are required",
            ))
        }
    };
    let allowed = [
        "id",
        "schemaId",
        "inputType",
        "list",
        "idEncoding",
        "lossPolicy",
    ];
    if policy_fields
        .iter()
        .any(|(name, _)| !allowed.iter().any(|candidate| name == &key(candidate)))
    {
        return Err(err(
            "GRAPHQL_BINDINGS",
            "/policy",
            "Explicit GraphQL input bindings are required",
        ));
    }
    let id = text(field(policy, "id"), "id")?.clone();
    let schema_id = text(field(policy, "schemaId"), "schemaId")?.clone();
    let input_type = text(field(policy, "inputType"), "inputType")?.clone();
    if id.is_empty()
        || input_type.is_empty()
        || text(field(policy, "list"), "list")? != &key("array-only")
        || text(field(policy, "idEncoding"), "idEncoding")? != &key("string-or-integer")
    {
        return Err(err(
            "GRAPHQL_BINDINGS",
            "/policy",
            "Explicit supported GraphQL input bindings are required",
        ));
    }
    let loss = text(field(policy, "lossPolicy"), "lossPolicy")?.clone();
    if loss != key("strict") && loss != key("allow-reported-loss") {
        return Err(err(
            "GRAPHQL_BINDINGS",
            "/policy/lossPolicy",
            "Unsupported loss policy",
        ));
    }
    let schema_url = schema_id
        .to_utf8()
        .ok()
        .and_then(|url| url::Url::parse(&url).ok())
        .filter(|url| url.fragment().is_none_or(str::is_empty));
    if schema_url.is_none() {
        return Err(err(
            "GRAPHQL_BINDINGS",
            "/policy/schemaId",
            "Schema ID must be absolute and fragment-free",
        ));
    }
    let source_copy = copy_json(document, ctx)?;
    let serde_document = crate::core_value_bridge::from_core(document)
        .map_err(|message| err("GRAPHQL_SOURCE", "", &message))?;
    let diagnostics = crate::graphql_adapter::inspect(&serde_document);
    if diagnostics.iter().any(|diagnostic| diagnostic.error) {
        return Err(err("GRAPHQL_SOURCE", "", "Invalid GraphQL source"));
    }
    let payload = serde_document
        .get("modules")
        .and_then(serde_json::Value::as_array)
        .and_then(|modules| {
            modules.iter().find(|module| {
                module.get("id").and_then(serde_json::Value::as_str) == Some("schema")
            })
        })
        .and_then(|module| module.get("elements").and_then(serde_json::Value::as_array))
        .and_then(|elements| {
            elements.iter().find(|element| {
                element.get("id").and_then(serde_json::Value::as_str) == Some("schema")
            })
        })
        .and_then(|element| element.get("extensions"))
        .and_then(|extensions| extensions.get(crate::graphql_adapter::EXTENSION))
        .ok_or_else(|| err("GRAPHQL_SOURCE", "", "Missing GraphQL schema payload"))?;
    let ast = payload
        .get("ast")
        .ok_or_else(|| err("GRAPHQL_SOURCE", "/ast", "Missing GraphQL AST"))?;
    let printed = crate::apollo_mapper::print_umf_ast(ast)
        .map_err(|message| err("GRAPHQL_SOURCE", "/ast", &message))?;
    let apollo_source = crate::graphql17_overlay::apollo_validation_source(&printed, ast);
    let schema = Schema::parse_and_validate(apollo_source, "graphql-input-projection")
        .map_err(|errors| err("GRAPHQL_SOURCE", "", &errors.to_string()))?;
    let type_text = input_type.to_utf8().map_err(|_| {
        err(
            "GRAPHQL_BINDINGS",
            "/policy/inputType",
            "Input type must be valid UTF-16",
        )
    })?;
    let mut issues = Vec::new();
    let mut fatal = false;
    for diagnostic in diagnostics {
        ctx.charge_work(1, Utf16::from(diagnostic.path.as_str()))?;
        let is_fatal = FATAL_DIAGNOSTICS.contains(&diagnostic.code);
        fatal |= is_fatal;
        issues.push(issue(
            &diagnostic.path,
            diagnostic.code,
            "unsupported",
            &diagnostic.message,
        ));
    }
    if fatal {
        return Ok(result(
            "blocked",
            source_copy,
            policy_copy,
            issues,
            Vec::new(),
            None,
            None,
        ));
    }
    let root_type = match GraphqlType::parse(type_text, "inputType") {
        Ok(ty)
            if schema.types.iter().any(|(name, value)| {
                name == ty.inner_named_type()
                    && matches!(
                        value,
                        ExtendedType::Scalar(_)
                            | ExtendedType::Enum(_)
                            | ExtendedType::InputObject(_)
                    )
            }) =>
        {
            ty
        }
        Ok(_) => {
            push_issue(
                &mut issues,
                ctx,
                "/policy/inputType",
                "GRAPHQL_INPUT_UNSUPPORTED",
                "unsupported",
                "Unknown or non-input type",
            )?;
            return Ok(result(
                "blocked",
                source_copy,
                policy_copy,
                issues,
                Vec::new(),
                None,
                None,
            ));
        }
        Err(errors) => {
            push_issue(
                &mut issues,
                ctx,
                "/policy/inputType",
                "GRAPHQL_INPUT_UNSUPPORTED",
                "unsupported",
                &errors.to_string(),
            )?;
            return Ok(result(
                "blocked",
                source_copy,
                policy_copy,
                issues,
                Vec::new(),
                None,
                None,
            ));
        }
    };
    let mut projection = Projection {
        schema: &schema,
        ctx,
        issues,
        mappings: Vec::new(),
        names: HashMap::new(),
        definitions: Vec::new(),
        fatal: false,
    };
    let target_shape = projection.shape(&root_type, "/inputType")?;
    push_issue(&mut projection.issues, projection.ctx, "", "INPUT_MODEL_ONLY", "not-enforced", "Selected input shape does not represent operations, output selection, resolvers, directive behavior, variable/argument processing or source schema identity")?;
    if projection.fatal || (loss == key("strict") && !projection.issues.is_empty()) {
        return Ok(result(
            "blocked",
            source_copy,
            policy_copy,
            projection.issues,
            projection.mappings,
            None,
            None,
        ));
    }
    let mut root_fields = match target_shape {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "GRAPHQL_TARGET",
                "",
                "Generated root schema must be an object",
            ))
        }
    };
    let mut schema_fields = vec![
        (key("$schema"), s(DRAFT)),
        (key("$id"), Value::String(schema_id.clone())),
    ];
    schema_fields.append(&mut root_fields);
    schema_fields.push((key("$defs"), Value::Object(projection.definitions)));
    let schema_value = Value::Object(schema_fields);
    let schema_text = render_pretty(&schema_value, projection.ctx)?;
    let target = json_schema_adapter::import_json_schema(
        schema_text.units(),
        &id,
        &schema_id,
        &[],
        projection.ctx,
    )?;
    let target_check = json_schema_adapter::inspect_json_schema(&target, projection.ctx)?;
    if !target_check.valid {
        return Err(err(
            "GRAPHQL_TARGET",
            "",
            "Generated input schema is invalid",
        ));
    }
    Ok(result(
        "projected",
        source_copy,
        policy_copy,
        projection.issues,
        projection.mappings,
        Some(target),
        Some(Value::String(schema_text)),
    ))
}

fn result(
    status: &str,
    source: Value,
    policy: Value,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    target: Option<Value>,
    native: Option<Value>,
) -> Value {
    let mut fields = vec![
        (key("status"), s(status)),
        (key("source"), source),
        (key("policy"), policy),
        (key("issues"), Value::Array(issues)),
        (key("mappings"), Value::Array(mappings)),
    ];
    if let Some(target) = target {
        fields.push((key("target"), target));
    }
    if let Some(native) = native {
        fields.push((key("nativeSchema"), native));
    }
    Value::Object(fields)
}
