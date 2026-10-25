// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    constraints::{execute_constraints_admitted, prepare_program, PreparedProgram},
    context::Context,
    error::{Diagnostic, EngineError, Severity, Validation},
    literal_policy::{prepare_policy, PreparedPolicy},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    value::{copy_json, Utf16, Value},
};
use std::sync::Arc;
#[derive(Clone, Debug)]
pub struct ResourceSet {
    pub core_schema: Value,
    pub reference_schema: Value,
    pub package_schema: Value,
    pub constraints: Value,
    pub domain_policy: Value,
}
impl ResourceSet {
    pub fn new(
        core_schema: Value,
        reference_schema: Value,
        package_schema: Value,
        constraints: Value,
        domain_policy: Value,
    ) -> Self {
        Self {
            core_schema,
            reference_schema,
            package_schema,
            constraints,
            domain_policy,
        }
    }
}
#[derive(Clone, Debug)]
pub struct SemanticContext {
    pub document: Value,
    /// Source-preserving Python view when validation entered through the
    /// Python compatibility API. Core callbacks continue to use `document`.
    pub source_document: Option<Arc<crate::python_value::PythonConsumerValue>>,
    pub source_payload: Option<Arc<crate::python_value::PythonConsumerValue>>,
    pub path: Utf16,
    pub scope: String,
}
#[derive(Clone, Debug, PartialEq)]
pub enum CapabilityError {
    Host(Utf16),
    HostPython {
        message: Utf16,
        source: crate::python_value::PyText,
    },
    Engine(EngineError),
}
pub trait Capabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16>;

    /// Context-aware callback path for bindings that must meter serialization
    /// or host-value materialization. Resource failures remain operation
    /// errors instead of becoming ordinary model diagnostics.
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        _ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        self.validate_extension(token, payload, context)
            .map_err(CapabilityError::Host)
    }

    /// Borrow the source-preserving Python document when the engine is using
    /// its compatibility carrier. Ordinary implementations return `None`.
    fn python_source_document(&self) -> Option<&crate::python_value::PythonConsumerValue> {
        None
    }
}
#[derive(Clone, Debug)]
pub struct Engine {
    resources: ResourceSet,
    core: CompiledSchema,
    reference: CompiledSchema,
    package: CompiledSchema,
    program: PreparedProgram,
    policy: PreparedPolicy,
}

struct SourceCapabilities<'a> {
    inner: &'a mut dyn Capabilities,
    source_document: Arc<crate::python_value::PythonConsumerValue>,
}
impl Capabilities for SourceCapabilities<'_> {
    fn python_source_document(&self) -> Option<&crate::python_value::PythonConsumerValue> {
        Some(&self.source_document)
    }
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        let mut source_context = SemanticContext {
            document: context.document.clone(),
            source_document: None,
            source_payload: None,
            path: context.path.clone(),
            scope: context.scope.clone(),
        };
        source_context.source_document = Some(Arc::clone(&self.source_document));
        self.inner
            .validate_extension(token, payload, &source_context)
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        let source_payload = self
            .source_document
            .pointer_get(&context.path, ctx)
            .map_err(CapabilityError::Engine)?
            .map(|payload| payload.snapshot_with_context(ctx))
            .transpose()
            .map_err(CapabilityError::Engine)?
            .map(Arc::new);
        let document = copy_json(&context.document, ctx).map_err(CapabilityError::Engine)?;
        ctx.charge_work(
            context.path.len().saturating_add(context.scope.len()),
            context.path.clone(),
        )
        .map_err(CapabilityError::Engine)?;
        let source_context = SemanticContext {
            document,
            source_document: Some(Arc::clone(&self.source_document)),
            source_payload,
            path: context.path.clone(),
            scope: context.scope.clone(),
        };
        self.inner
            .validate_extension_with_context(token, payload, &source_context, ctx)
    }
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(text) => Some(text),
        _ => None,
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn resource_id(v: &Value) -> Option<&Utf16> {
    get(v, "$id").and_then(|v| match v {
        Value::String(s) => Some(s),
        _ => None,
    })
}
fn is_model_admission_error(code: &str) -> bool {
    matches!(
        code,
        "NUMBER" | "PYTHON_SCHEMA_SOURCE_UNREPRESENTABLE" | "VALUE_INVALID"
    )
}
fn numeric_context_refusal_with_code(code: &str, message: &str) -> Validation {
    Validation {
        valid: false,
        complete: false,
        diagnostics: vec![Diagnostic {
            code: Utf16::from(code),
            path: Utf16::default(),
            python_source_path: false,
            message: Utf16::from(message),
            severity: Severity::Error,
            python_text_origin: None,
        }],
    }
}
fn field_value_refusal(code: &str, message: &str, path: &str) -> Validation {
    field_value_refusal_utf16(code, Utf16::from(message), Utf16::from(path))
}
fn field_value_refusal_utf16(code: &str, message: Utf16, path: Utf16) -> Validation {
    Validation {
        valid: false,
        complete: false,
        diagnostics: vec![Diagnostic {
            code: Utf16::from(code),
            path,
            python_source_path: false,
            message,
            severity: Severity::Error,
            python_text_origin: None,
        }],
    }
}
fn field_value_error(error: EngineError) -> Result<Validation, EngineError> {
    if error.is_control_failure() || !is_model_admission_error(&error.code) {
        return Err(error);
    }
    Ok(Validation {
        valid: false,
        complete: false,
        diagnostics: vec![Diagnostic {
            code: Utf16::from(error.code),
            path: error.path,
            python_source_path: false,
            message: error.message,
            severity: Severity::Error,
            python_text_origin: None,
        }],
    })
}
struct FieldValueNoCapabilities;
impl Capabilities for FieldValueNoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}
impl Engine {
    /// Resolve a declared core Field default without mutating its source.
    /// This is the Rust-owned CONTRACT-049 operation used by the opt-in
    /// model binding; missing and present-null remain distinct states.
    pub fn resolve_core_default_public(
        &self,
        source: &Value,
        identity: &Value,
        state: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let identity = copy_json(identity, ctx)?;
        let state = copy_json(state, ctx)?;
        let properties_error = |message: &str, path: &str| {
            EngineError::new("CORE_SCHEMA_PROPERTIES", Utf16::from(path), message)
        };
        let unknown = |name: &Utf16, base: &str| {
            let mut path = base.encode_utf16().collect::<Vec<_>>();
            path.extend(name.units());
            let mut message = "Unknown relevant qualifier: "
                .encode_utf16()
                .collect::<Vec<_>>();
            message.extend(name.units());
            EngineError::new(
                "CORE_SCHEMA_PROPERTY_UNKNOWN",
                Utf16::new(path),
                Utf16::new(message),
            )
        };
        let Value::Object(state_fields) = &state else {
            return Err(properties_error("Expected object", "/state"));
        };
        let state_name = get(&state, "state").and_then(as_utf16);
        let missing = state_name == Some(&Utf16::from("missing"));
        let present = state_name == Some(&Utf16::from("present"));
        for (key, _) in state_fields {
            if key != &k("state") && !(!missing && key == &k("value")) {
                ctx.charge_text(
                    key.len().saturating_mul(2).saturating_add(48),
                    Utf16::from("/state"),
                )?;
                return Err(unknown(key, "/state/"));
            }
        }
        if !missing && !present
            || present && get(&state, "value").is_none()
            || missing && state_fields.len() != 1
            || present && state_fields.len() != 2
        {
            return Err(properties_error(
                "Explicit missing/present state required",
                "",
            ));
        }

        // The TypeScript predecessor admits state before identity, so when
        // both are malformed its first refusal is state-owned.
        let Value::Object(identity_fields) = &identity else {
            return Err(properties_error("Expected object", "/identity"));
        };
        for (key, _) in identity_fields {
            if key != &k("module") && key != &k("element") {
                ctx.charge_text(
                    key.len().saturating_mul(2).saturating_add(48),
                    Utf16::from("/identity"),
                )?;
                return Err(unknown(key, "/identity/"));
            }
        }
        let module_id = get(&identity, "module").and_then(as_utf16);
        let element_id = get(&identity, "element").and_then(as_utf16);

        // The predecessor validates the source before identity cardinality
        // and nonempty checks, after its known-member refusal.
        let source = copy_json(source, ctx)?;
        if get(&source, "umf") != Some(&Value::string_utf8("0.10.0")) {
            return Err(properties_error(
                "Expected valid current 0.10.0 envelope",
                "",
            ));
        }
        let mut capabilities = FieldValueNoCapabilities;
        let document_validation =
            self.validate_document(&source, &Registry::default(), &mut capabilities, ctx)?;
        if !document_validation.valid {
            return Err(properties_error(
                "Expected valid current 0.10.0 envelope",
                "",
            ));
        }
        if identity_fields.len() != 2 {
            return Err(properties_error("Explicit identity required", ""));
        }
        let module_id = module_id
            .filter(|value| !value.is_empty())
            .ok_or_else(|| properties_error("Nonempty module ID required", ""))?;

        let module_index = match get(&source, "modules") {
            Some(Value::Array(modules)) => {
                let mut found = None;
                for (index, module) in modules.iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    if get(module, "id").and_then(as_utf16) == Some(module_id) {
                        found = Some((index, module));
                        break;
                    }
                }
                found
            }
            _ => None,
        }
        .ok_or_else(|| properties_error("Module not found", ""))?;
        let (module_index, module) = module_index;
        let element_id = element_id
            .filter(|value| !value.is_empty())
            .ok_or_else(|| properties_error("Nonempty element ID required", ""))?;
        let element = match get(module, "elements") {
            Some(Value::Array(elements)) => {
                let mut found = None;
                for (index, element) in elements.iter().enumerate() {
                    ctx.charge_work(1, Utf16::default())?;
                    if get(element, "id").and_then(as_utf16) == Some(element_id) {
                        found = Some((index, element));
                        break;
                    }
                }
                found
            }
            _ => None,
        }
        .ok_or_else(|| properties_error("Element not found", ""))?;
        let (element_index, field) = element;
        if get(field, "kind") != Some(&Value::string_utf8("field")) {
            return Err(properties_error("Default target must be a Field", ""));
        }
        let declaration = get(field, "default");
        if let Some(Value::Object(members)) = declaration {
            let default_path = format!("/modules/{module_index}/elements/{element_index}/default/");
            for (key, _) in members {
                if key != &k("value") && key != &k("on") {
                    ctx.charge_text(
                        key.len().saturating_mul(2).saturating_add(64),
                        Utf16::from("/default"),
                    )?;
                    return Err(unknown(key, &default_path));
                }
            }
        }
        let apply = declaration.is_some_and(|default| {
            let on = get(default, "on").and_then(as_utf16);
            if missing {
                on == Some(&Utf16::from("missing")) || on == Some(&Utf16::from("missing-or-null"))
            } else {
                get(&state, "value") == Some(&Value::Null)
                    && (on == Some(&Utf16::from("null"))
                        || on == Some(&Utf16::from("missing-or-null")))
            }
        });
        let result = if apply {
            object(vec![
                ("state", Value::string_utf8("present")),
                (
                    "value",
                    copy_json(get(declaration.unwrap(), "value").unwrap(), ctx)?,
                ),
            ])
        } else {
            copy_json(&state, ctx)?
        };
        if let Some(value) = get(&result, "value") {
            let validation =
                self.validate_core_field_value_public(&source, &identity, value, ctx)?;
            if !validation.valid {
                let mut diagnostic_units = 0usize;
                for diagnostic in &validation.diagnostics {
                    ctx.charge_work(1, diagnostic.path.clone())?;
                    diagnostic_units = diagnostic_units
                        .saturating_add(diagnostic.code.len())
                        .saturating_add(diagnostic.path.len())
                        .saturating_add(diagnostic.message.len())
                        .saturating_add(64);
                }
                // Compact JSON escaping can expand a UTF-16 unit to six
                // ASCII units. Admit that upper bound before allocating the
                // diagnostic envelope and serialized refusal string.
                ctx.charge_text(diagnostic_units.saturating_mul(6), Utf16::default())?;
                let diagnostics = Value::Array(
                    validation
                        .diagnostics
                        .iter()
                        .map(|diagnostic| {
                            object(vec![
                                ("code", Value::String(diagnostic.code.clone())),
                                ("path", Value::String(diagnostic.path.clone())),
                                ("message", Value::String(diagnostic.message.clone())),
                                (
                                    "severity",
                                    Value::string_utf8(match diagnostic.severity {
                                        Severity::Error => "error",
                                        Severity::Warning => "warning",
                                    }),
                                ),
                            ])
                        })
                        .collect(),
                );
                let message = crate::serialization::stringify_compact(&diagnostics)?;
                return Err(EngineError::new(
                    "CORE_SCHEMA_PROPERTIES",
                    Utf16::default(),
                    message,
                ));
            }
        }
        Ok(object(vec![
            ("operation", Value::string_utf8("resolve-core-default")),
            ("version", Value::string_utf8("2.0.0")),
            ("source", source),
            ("identity", identity),
            ("input", state),
            ("result", result),
            ("applied", Value::Bool(apply)),
        ]))
    }

    /// Evaluate the public CONTRACT-049 field-value operation. The caller does
    /// not provide a registry: like the TypeScript API, this operation uses an
    /// empty default registry while still validating the complete source.
    /// Identity members remain UTF-16 values until exact lookup is complete.
    pub fn validate_core_field_value_public(
        &self,
        source: &Value,
        identity: &Value,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let identity = match copy_json(identity, ctx) {
            Ok(value) => value,
            Err(error) => return field_value_error(error),
        };
        let value = match copy_json(value, ctx) {
            Ok(value) => value,
            Err(error) => return field_value_error(error),
        };
        let identity_fields = match &identity {
            Value::Object(fields) => fields,
            _ => {
                return Ok(field_value_refusal(
                    "CORE_SCHEMA_PROPERTIES",
                    "Expected object",
                    "/identity",
                ));
            }
        };
        for (name, _) in identity_fields {
            if name != &k("module") && name != &k("element") {
                let mut path = "/identity/".encode_utf16().collect::<Vec<_>>();
                path.extend(name.units());
                let mut message = "Unknown relevant qualifier: "
                    .encode_utf16()
                    .collect::<Vec<_>>();
                message.extend(name.units());
                return Ok(field_value_refusal_utf16(
                    "CORE_SCHEMA_PROPERTY_UNKNOWN",
                    Utf16::new(message),
                    Utf16::new(path),
                ));
            }
        }
        let source = match copy_json(source, ctx) {
            Ok(value) => value,
            Err(error) => return field_value_error(error),
        };
        let mut capabilities = FieldValueNoCapabilities;
        let document_validation =
            self.validate_document(&source, &Registry::default(), &mut capabilities, ctx)?;
        if get(&source, "umf") != Some(&Value::string_utf8("0.10.0")) || !document_validation.valid
        {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Expected valid current 0.10.0 envelope",
                "",
            ));
        }
        if identity_fields.len() != 2 {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Explicit identity required",
                "",
            ));
        }
        let module_id = get(&identity, "module").and_then(|v| match v {
            Value::String(s) if !s.is_empty() => Some(s),
            _ => None,
        });
        let Some(module_id) = module_id else {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Nonempty module ID required",
                "",
            ));
        };
        let module = match get(&source, "modules") {
            Some(Value::Array(items)) => items
                .iter()
                .find(|item| get(item, "id") == Some(&Value::String(module_id.clone()))),
            _ => None,
        };
        let Some(module) = module else {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Module not found",
                "",
            ));
        };
        let element_id = get(&identity, "element").and_then(|v| match v {
            Value::String(s) if !s.is_empty() => Some(s),
            _ => None,
        });
        let Some(element_id) = element_id else {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Nonempty element ID required",
                "",
            ));
        };
        let field = match get(module, "elements") {
            Some(Value::Array(items)) => items
                .iter()
                .find(|item| get(item, "id") == Some(&Value::String(element_id.clone()))),
            _ => None,
        };
        let Some(field) = field else {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Element not found",
                "",
            ));
        };
        if get(field, "kind") != Some(&Value::string_utf8("field")) {
            return Ok(field_value_refusal(
                "CORE_SCHEMA_PROPERTIES",
                "Value properties apply only to Fields",
                "",
            ));
        }
        self.validate_core_field_value_admitted(&source, field, &value, ctx)
    }

    /// Shared Field-value body for callers that already own an admitted
    /// immutable source and have selected the exact Field. This intentionally
    /// performs no source copy or document revalidation.
    pub(crate) fn validate_core_field_value_admitted(
        &self,
        source: &Value,
        field: &Value,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let mut diagnostics = crate::literal::literal_field_value_errors_admitted(
            source,
            field,
            value,
            true,
            &self.policy,
            ctx,
        )?;
        for diagnostic in &mut diagnostics {
            if diagnostic.code == Utf16::from("CORE_SCHEMA_PROPERTY_UNKNOWN") {
                diagnostic.severity = Severity::Error;
            }
        }
        let valid = !diagnostics
            .iter()
            .any(|item| item.severity == Severity::Error);
        let complete = diagnostics.is_empty();
        Ok(Validation {
            valid,
            complete,
            diagnostics,
        })
    }

    /// Evaluate a Field literal against an already selected, possibly edited
    /// source. This matches the predecessor schema-literal check used while
    /// declaring allowed values/defaults: it does not require the whole
    /// intermediate document to validate before the literal is checked.
    pub fn validate_schema_literal_public(
        &self,
        source: &Value,
        field: &Value,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let diagnostics = crate::literal::literal_field_value_errors_admitted(
            source,
            field,
            value,
            true,
            &self.policy,
            ctx,
        )?;
        let valid = !diagnostics
            .iter()
            .any(|item| item.severity == Severity::Error);
        let complete = diagnostics.is_empty();
        Ok(Validation {
            valid,
            complete,
            diagnostics,
        })
    }

    /// Apply the direct `checkSchemaLiteral` contract to an already admitted
    /// source, selected Field and literal. Unlike the validation projection,
    /// this returns the first literal diagnostic as an operation error.
    pub fn check_schema_literal_public(
        &self,
        source: &Value,
        field: &Value,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let validation = self.validate_schema_literal_public(source, field, value, ctx)?;
        if let Some(diagnostic) = validation.diagnostics.into_iter().next() {
            let code = diagnostic.code.to_utf8().map_err(|_| {
                EngineError::new(
                    "CONSTRAINT_POLICY",
                    Utf16::default(),
                    "Literal diagnostic code is not UTF-8",
                )
            })?;
            return Err(EngineError::new(code, diagnostic.path, diagnostic.message));
        }
        Ok(())
    }

    pub fn new(resources: ResourceSet, ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is unavailable",
            ));
        }
        let resources = ResourceSet {
            core_schema: copy_json(&resources.core_schema, ctx)?,
            reference_schema: copy_json(&resources.reference_schema, ctx)?,
            package_schema: copy_json(&resources.package_schema, ctx)?,
            constraints: copy_json(&resources.constraints, ctx)?,
            domain_policy: copy_json(&resources.domain_policy, ctx)?,
        };
        let mut schemas = SchemaResources::default();
        for v in [
            &resources.core_schema,
            &resources.reference_schema,
            &resources.package_schema,
        ] {
            if let Some(id) = resource_id(v) {
                ctx.charge_work(id.len(), Utf16::default())?;
                schemas.entries.push((id.clone(), copy_json(v, ctx)?))
            }
        }
        let core = CompiledSchema::compile(&resources.core_schema, &schemas, ctx)?;
        let reference = CompiledSchema::compile(&resources.reference_schema, &schemas, ctx)?;
        let package = CompiledSchema::compile(&resources.package_schema, &schemas, ctx)?;
        let program = prepare_program(&resources.constraints, ctx)?;
        let literal_value = get(&resources.domain_policy, "literal").ok_or_else(|| {
            EngineError::new(
                "CONSTRAINT_POLICY",
                Utf16::default(),
                "Missing literal policy",
            )
        })?;
        let literal = prepare_policy(literal_value, ctx)?;
        Ok(Self {
            resources,
            core,
            reference,
            package,
            program,
            policy: literal,
        })
    }
    pub fn validate_document(
        &self,
        value: &Value,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        self.validate_document_observed(value, registry, capabilities, ctx, None)
    }

    /// Validate a document while reporting the predecessor's observational
    /// work categories. The observer never charges or alters `Context`.
    pub(crate) fn validate_document_observed(
        &self,
        value: &Value,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
        mut observer: Option<&mut dyn FnMut(&'static str, usize)>,
    ) -> Result<Validation, EngineError> {
        let document = match copy_json(value, ctx) {
            Ok(v) => v,
            Err(e) => {
                if e.is_control_failure() || !is_model_admission_error(&e.code) {
                    return Err(e);
                }
                return Ok(Validation {
                    valid: false,
                    complete: false,
                    diagnostics: vec![Diagnostic {
                        code: Utf16::from(e.code),
                        path: e.path,
                        python_source_path: false,
                        message: e.message,
                        severity: Severity::Error,
                        python_text_origin: None,
                    }],
                });
            }
        };
        if let Some(observer) = observer.as_deref_mut() {
            observer("document-copy", crate::dataset_values::tree_values(value));
        }
        self.validate_admitted_document(document, None, registry, capabilities, ctx, observer)
    }

    /// Validate one value against an explicitly selected Field in the current
    /// core 0.10.0 document. This is the Rust counterpart used by the opt-in
    /// CONTRACT-049 JavaScript numeric context; it does not infer identity or
    /// treat an unqualified context as declared-domain validation.
    pub fn validate_core_field_value(
        &self,
        source: &Value,
        module_id: &str,
        element_id: &str,
        value: &Value,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let document = copy_json(source, ctx)?;
        if get(&document, "umf") != Some(&Value::string_utf8("0.10.0")) {
            return Ok(numeric_context_refusal_with_code(
                "CORE_SCHEMA_PROPERTIES",
                "Expected valid current 0.10.0 envelope",
            ));
        }
        let document_validation = self.validate_document(&document, registry, capabilities, ctx)?;
        if !document_validation.valid {
            return Ok(numeric_context_refusal_with_code(
                "CORE_SCHEMA_PROPERTIES",
                "Expected valid current 0.10.0 envelope",
            ));
        }
        let module = match get(&document, "modules") {
            Some(Value::Array(modules)) => modules
                .iter()
                .find(|module| get(module, "id") == Some(&Value::String(Utf16::from(module_id)))),
            _ => None,
        };
        let Some(module) = module else {
            return Ok(numeric_context_refusal_with_code(
                "CORE_SCHEMA_PROPERTIES",
                "Module not found",
            ));
        };
        let field = match get(module, "elements") {
            Some(Value::Array(elements)) => elements.iter().find(|element| {
                get(element, "id") == Some(&Value::String(Utf16::from(element_id)))
            }),
            _ => None,
        };
        let Some(field) = field else {
            return Ok(numeric_context_refusal_with_code(
                "CORE_SCHEMA_PROPERTIES",
                "Element not found",
            ));
        };
        if get(field, "kind") != Some(&Value::string_utf8("field")) {
            return Ok(numeric_context_refusal_with_code(
                "CORE_SCHEMA_PROPERTIES",
                "Literal target must be a Field",
            ));
        }
        let mut diagnostics =
            crate::literal::literal_errors(&document, field, value, true, &self.policy, ctx)?;
        for diagnostic in &mut diagnostics {
            if diagnostic.code == Utf16::from("CORE_SCHEMA_PROPERTY_UNKNOWN") {
                diagnostic.severity = Severity::Error;
            }
        }
        let valid = !diagnostics
            .iter()
            .any(|item| item.severity == Severity::Error);
        let complete = diagnostics.is_empty();
        Ok(Validation {
            valid,
            complete,
            diagnostics,
        })
    }

    /// Validate a Python-compatible source tree. Core semantics operate on a
    /// checked interoperable projection; extension callbacks also receive the
    /// original source tree through `SemanticContext::source_document`.
    pub fn validate_python_document(
        &self,
        source: &crate::python_value::PythonConsumerValue,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is unavailable",
            ));
        }
        let (document, source_snapshot) = match source.admit_core_snapshot(ctx) {
            Ok(pair) => pair,
            Err(error) if !error.is_control_failure() && is_model_admission_error(&error.code) => {
                return Ok(Validation {
                    valid: false,
                    complete: false,
                    diagnostics: vec![Diagnostic {
                        code: Utf16::from(error.code),
                        path: error.path,
                        python_source_path: false,
                        message: error.message,
                        severity: Severity::Error,
                        python_text_origin: None,
                    }],
                });
            }
            Err(error) => return Err(error),
        };
        self.validate_admitted_document(
            document,
            Some(Arc::new(source_snapshot)),
            registry,
            capabilities,
            ctx,
            None,
        )
    }

    fn validate_admitted_document(
        &self,
        document: Value,
        source_document: Option<Arc<crate::python_value::PythonConsumerValue>>,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
        observer: Option<&mut dyn FnMut(&'static str, usize)>,
    ) -> Result<Validation, EngineError> {
        let diagnostics = self.core_structure_diagnostics(&document, ctx)?;
        if !diagnostics.is_empty() {
            return Ok(Validation {
                valid: false,
                complete: false,
                diagnostics,
            });
        }
        let diagnostics = if let Some(source_document) = source_document {
            self.run_constraints_with_source(
                &document,
                source_document,
                registry,
                capabilities,
                ctx,
            )?
        } else {
            crate::constraints::execute_constraints_admitted_observed(
                &document,
                &self.program,
                &self.resources.domain_policy,
                registry,
                capabilities,
                ctx,
                observer,
            )?
        };
        let valid = !diagnostics.iter().any(|d| d.severity == Severity::Error);
        let complete = diagnostics.is_empty();
        Ok(Validation {
            valid,
            complete,
            diagnostics,
        })
    }

    /// Run only the core structural schema and normalize its diagnostics using
    /// the generated structuralDiagnostic policy. This intentionally skips
    /// the generic semantic constraint program.
    pub fn core_structure_diagnostics(
        &self,
        value: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, EngineError> {
        let structural = self.core.validate(value, ctx)?;
        if structural.is_empty() {
            return Ok(Vec::new());
        }
        let rule = get(&self.resources.domain_policy, "structuralDiagnostic").ok_or_else(|| {
            EngineError::new(
                "CONSTRAINT_PROGRAM",
                Utf16::default(),
                "Missing structural diagnostic policy",
            )
        })?;
        let code = match get(rule, "code") {
            Some(Value::String(code)) => Some(code),
            _ => None,
        };
        let configured_message = match get(rule, "message") {
            Some(Value::String(message)) => Some(message),
            _ => None,
        };
        let default_message = "Invalid core structure".encode_utf16().count();
        let code_units = code.map(Utf16::len).unwrap_or("SCHEMA_INVALID".len());
        let message_units = configured_message
            .map(Utf16::len)
            .unwrap_or(default_message);
        let severity = match get(rule, "severity") {
            Some(Value::String(value)) if value.units() == [119, 97, 114, 110, 105, 110, 103] => {
                Severity::Warning
            }
            _ => Severity::Error,
        };

        // Reserve enough metered work for the worst case (one normalized
        // diagnostic plus one `then` diagnostic per structural error) before
        // cloning model strings, normalizing messages, or allocating records.
        let record_slots = structural.len().checked_mul(2).ok_or_else(|| {
            EngineError::new("LIMIT", Utf16::default(), "Diagnostic count overflow")
        })?;
        let mut output_work = record_slots
            .saturating_add(record_slots.saturating_mul(code_units))
            .saturating_add(record_slots.saturating_mul(message_units));
        for error in &structural {
            output_work = output_work
                .saturating_add(error.instance_path.len().saturating_mul(2))
                .saturating_add(error.schema_path.len())
                .saturating_add(error.keyword.len())
                .saturating_add(error.message.len());
        }
        ctx.charge_work(output_work, Utf16::default())?;
        for error in &structural {
            charge_value_output(&error.params, ctx)?;
        }

        let code = code
            .cloned()
            .unwrap_or_else(|| Utf16::from("SCHEMA_INVALID"));
        let message = configured_message
            .cloned()
            .unwrap_or_else(|| Utf16::from("Invalid core structure"));
        let mut diagnostics = Vec::with_capacity(record_slots);
        for error in structural {
            diagnostics.push(Diagnostic {
                code: code.clone(),
                path: error.instance_path.clone(),
                python_source_path: error.python_source_path,
                message: if error.message.is_empty() {
                    message.clone()
                } else {
                    normalized_structural_message(&error, &message)
                },
                severity,
                python_text_origin: None,
            });
            if let Some(path) = then_failure_path(&error) {
                diagnostics.push(Diagnostic {
                    code: code.clone(),
                    path,
                    python_source_path: error.python_source_path,
                    message: Utf16::from("must match \"then\" schema"),
                    severity,
                    python_text_origin: None,
                });
            }
        }
        Ok(diagnostics)
    }

    /// Execute the core semantic program without performing structural
    /// validation. This preserves the predecessor constraint-only API.
    pub fn run_core_constraints(
        &self,
        document: &Value,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, EngineError> {
        let document = copy_json(document, ctx)?;
        let policy = copy_json(&self.resources.domain_policy, ctx)?;
        if let Some(literal) = get(&policy, "literal") {
            prepare_policy(literal, ctx)?;
        }
        execute_constraints_admitted(
            &document,
            &self.program,
            &policy,
            registry,
            capabilities,
            ctx,
        )
    }

    /// Execute only the core semantic program while preserving a Python
    /// source document for capability callbacks.
    pub fn run_python_core_constraints(
        &self,
        source: &crate::python_value::PythonConsumerValue,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, EngineError> {
        if ctx.profile() == crate::context::ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is not available",
            ));
        }
        let (document, source_snapshot) = source.admit_core_snapshot(ctx)?;
        self.run_constraints_with_source(
            &document,
            Arc::new(source_snapshot),
            registry,
            capabilities,
            ctx,
        )
    }

    fn run_constraints_with_source(
        &self,
        document: &Value,
        source_document: Arc<crate::python_value::PythonConsumerValue>,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, EngineError> {
        let mut source_capabilities = SourceCapabilities {
            inner: capabilities,
            source_document,
        };
        execute_constraints_admitted(
            document,
            &self.program,
            &self.resources.domain_policy,
            registry,
            &mut source_capabilities,
            ctx,
        )
    }
    pub fn package_schema(&self) -> &CompiledSchema {
        &self.package
    }
    pub fn schema_resources_with_context(
        &self,
        ctx: &mut Context<'_>,
    ) -> Result<SchemaResources, EngineError> {
        let mut resources = SchemaResources::default();
        for value in [
            &self.resources.core_schema,
            &self.resources.reference_schema,
            &self.resources.package_schema,
        ] {
            if let Some(id) = resource_id(value) {
                ctx.charge_work(id.len(), Utf16::default())?;
                resources.entries.push((id.clone(), copy_json(value, ctx)?));
            }
        }
        Ok(resources)
    }
    pub fn policy(&self) -> &PreparedPolicy {
        &self.policy
    }
    pub(crate) fn kind_policy(&self) -> &Value {
        get(&self.resources.domain_policy, "extensions").unwrap_or(&Value::Null)
    }
    pub fn reference_schema(&self) -> &CompiledSchema {
        &self.reference
    }
}

/// Charge the size and traversal work of diagnostic parameters before the
/// normalizer turns them into message text. This does not apply the source
/// text ceiling; these values are already admitted semantic data.
fn charge_value_output(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => ctx.charge_work(1, Utf16::default()),
        Value::String(text) => ctx.charge_work(1usize.saturating_add(text.len()), Utf16::default()),
        Value::Array(items) => {
            ctx.charge_work(1usize.saturating_add(items.len()), Utf16::default())?;
            for item in items {
                charge_value_output(item, ctx)?;
            }
            Ok(())
        }
        Value::Object(members) => {
            ctx.charge_work(1usize.saturating_add(members.len()), Utf16::default())?;
            for (key, value) in members {
                ctx.charge_work(key.len(), Utf16::default())?;
                charge_value_output(value, ctx)?;
            }
            Ok(())
        }
    }
}

fn then_failure_path(error: &crate::schema::StructuralError) -> Option<Utf16> {
    let schema_segments = error
        .schema_path
        .units()
        .split(|unit| *unit == 0x2f)
        .collect::<Vec<_>>();
    let then_index = schema_segments
        .iter()
        .position(|segment| *segment == "then".encode_utf16().collect::<Vec<_>>().as_slice())?;
    let descended = schema_segments[then_index + 1..]
        .iter()
        .filter(|segment| {
            **segment == "properties".encode_utf16().collect::<Vec<_>>().as_slice()
                || **segment == "items".encode_utf16().collect::<Vec<_>>().as_slice()
        })
        .count();
    let instance_segments = error
        .instance_path
        .units()
        .split(|unit| *unit == 0x2f)
        .collect::<Vec<_>>();
    if instance_segments.len().saturating_sub(1) < descended {
        return Some(Utf16::default());
    }
    let keep = instance_segments.len() - descended;
    let mut path = Vec::new();
    for (index, segment) in instance_segments[..keep].iter().enumerate() {
        if index > 0 {
            path.push(0x2f);
        }
        path.extend(*segment);
    }
    Some(Utf16::new(path))
}

fn normalized_structural_message(
    error: &crate::schema::StructuralError,
    fallback: &Utf16,
) -> Utf16 {
    let param_text = |name: &str| -> Option<String> {
        match &error.params {
            Value::Object(m) => m
                .iter()
                .find(|(k, _)| k.to_utf8().ok().as_deref() == Some(name))
                .and_then(|(_, v)| match v {
                    Value::String(s) => s.to_utf8().ok(),
                    Value::Number(n) => Some(crate::ecma_number_to_string(*n)),
                    _ => None,
                }),
            _ => None,
        }
    };
    let text = match error.keyword.as_str() {
        "enum" => Some("must pass \"enum\" keyword validation".to_owned()),
        "const" => Some("must pass \"const\" keyword validation".to_owned()),
        "anyOf" => Some("must match a schema in anyOf".to_owned()),
        "minItems" => param_text("limit").map(|n| format!("must NOT have fewer than {n} items")),
        "minLength" => {
            param_text("limit").map(|n| format!("must NOT have fewer than {n} characters"))
        }
        "minimum" => param_text("limit").map(|n| format!("must be >= {n}")),
        "maximum" => param_text("limit").map(|n| format!("must be <= {n}")),
        "minProperties" => {
            param_text("limit").map(|n| format!("must NOT have fewer than {n} properties"))
        }
        "pattern" => param_text("pattern").map(|n| format!("must match pattern '{n}'")),
        _ => None,
    };
    text.map(Utf16::from).unwrap_or_else(|| {
        if error.message.is_empty() {
            fallback.clone()
        } else {
            error.message.clone()
        }
    })
}
