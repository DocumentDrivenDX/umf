// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit immutable resource ownership for codegen operations.

use crate::value::member;
use umf_core::{
    schema::{CompiledSchema, SchemaResources},
    Capabilities, Context, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
};

/// Trusted inputs needed by table lifecycle and code generation operations.
///
/// The schemas and extension package manifests are supplied by the embedding
/// application; no implicit host or process-global resource lookup occurs.
/// The operation declaration schema is a fixed compiler asset, included
/// separately and resolved against the supplied table schema.
#[derive(Clone, Debug)]
pub struct CodegenResources {
    engine: Engine,
    tables_registry: Registry,
    actions_registry: Registry,
    binding_registry: Registry,
    binding_package: Value,
    binding_compiled: CompiledSchema,
    stable_binding_package: Value,
    stable_binding_compiled: CompiledSchema,
    tables_package: Value,
    tables_schema: Value,
    tables_compiled: CompiledSchema,
    actions_package: Value,
    actions_schema: Value,
    actions_compiled: CompiledSchema,
    actions_literal_compiled: CompiledSchema,
    actions_action_compiled: CompiledSchema,
    operation_schema: Value,
    operation_compiled: CompiledSchema,
    schema_resources: SchemaResources,
}

impl CodegenResources {
    /// Compile the explicit core resources and retain the explicitly trusted
    /// table/action schemas and both binding packages for operation validation.
    pub fn new(
        core: ResourceSet,
        tables_package: Value,
        tables_schema: Value,
        actions_package: Value,
        actions_schema: Value,
        binding_package: Value,
        stable_binding_package: Value,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let tables_package = umf_core::copy_json(&tables_package, ctx)?;
        let tables_schema = umf_core::copy_json(&tables_schema, ctx)?;
        let actions_package = umf_core::copy_json(&actions_package, ctx)?;
        let actions_schema = umf_core::copy_json(&actions_schema, ctx)?;
        let binding_package = umf_core::copy_json(&binding_package, ctx)?;
        let stable_binding_package = umf_core::copy_json(&stable_binding_package, ctx)?;
        let engine = Engine::new(core, ctx)?;
        let mut schema_resources = engine.schema_resources_with_context(ctx)?;
        // Operation declarations are governed by the package-owned schema
        // shipped with this crate. Its only external reference is the table
        // package's `$defs/ref`; resolve it against the exact explicit schema
        // supplied to this resource constructor.
        let tables_schema_id = crate::value::string_member(&tables_schema, "$id")
            .cloned()
            .ok_or_else(|| {
                EngineError::new(
                    "CODEGEN_RESOURCE_INVALID",
                    Utf16::default(),
                    "Tables schema requires an $id",
                )
            })?;
        ctx.charge_work(schema_resources.entries.len(), Utf16::default())?;
        let mut schema_present = false;
        for (id, _) in &schema_resources.entries {
            ctx.charge_work(id.len(), Utf16::default())?;
            schema_present |= id == &tables_schema_id;
        }
        if !schema_present {
            let tables_schema_copy = umf_core::copy_json(&tables_schema, ctx)?;
            schema_resources
                .entries
                .push((tables_schema_id, tables_schema_copy));
        }
        let operation_source_text =
            include_str!("../../../spec/extensions/tables/operation.schema.json");
        ctx.charge_work(
            operation_source_text.encode_utf16().count(),
            Utf16::default(),
        )?;
        let operation_source = Utf16::from(operation_source_text);
        let operation_schema = umf_core::serialization::read_json_value(
            operation_source.units(),
            umf_core::serialization::Format::Json,
            ctx,
        )?;
        let operation_compiled =
            CompiledSchema::compile(&operation_schema, &schema_resources, ctx)?;
        let binding_schema = member(&binding_package, "schema").ok_or_else(invalid_package)?;
        let stable_binding_schema =
            member(&stable_binding_package, "schema").ok_or_else(invalid_package)?;
        let binding_compiled = CompiledSchema::compile(binding_schema, &schema_resources, ctx)?;
        let stable_binding_compiled =
            CompiledSchema::compile(stable_binding_schema, &schema_resources, ctx)?;
        let tables_compiled = CompiledSchema::compile(&tables_schema, &schema_resources, ctx)?;
        let actions_compiled = CompiledSchema::compile(&actions_schema, &schema_resources, ctx)?;
        let literal_definition = member(&actions_schema, "$defs")
            .and_then(|defs| member(defs, "literal"))
            .ok_or_else(invalid_package)?;
        let literal_definition = umf_core::copy_json(literal_definition, ctx)?;
        ctx.charge_work(64, Utf16::default())?;
        let literal_schema = Value::Object(vec![
            (
                Utf16::from("$defs"),
                Value::Object(vec![(Utf16::from("literal"), literal_definition)]),
            ),
            (
                Utf16::from("$ref"),
                Value::String(Utf16::from("#/$defs/literal")),
            ),
        ]);
        let actions_literal_compiled =
            CompiledSchema::compile(&literal_schema, &schema_resources, ctx)?;
        let action_definitions = umf_core::copy_json(
            member(&actions_schema, "$defs").ok_or_else(invalid_package)?,
            ctx,
        )?;
        ctx.charge_work(64, Utf16::default())?;
        let action_schema = Value::Object(vec![
            (Utf16::from("$defs"), action_definitions),
            (
                Utf16::from("$ref"),
                Value::String(Utf16::from("#/$defs/action")),
            ),
        ]);
        let actions_action_compiled =
            CompiledSchema::compile(&action_schema, &schema_resources, ctx)?;
        let tables_registry = package_registry(
            &engine,
            &schema_resources,
            &tables_package,
            &tables_schema,
            1,
            ctx,
        )?;
        let actions_registry = package_registry(
            &engine,
            &schema_resources,
            &actions_package,
            &actions_schema,
            2,
            ctx,
        )?;
        let mut binding_registry = Registry::new();
        register_package(
            &mut binding_registry,
            &engine,
            &schema_resources,
            &binding_package,
            binding_schema,
            3,
            ctx,
        )?;
        register_package(
            &mut binding_registry,
            &engine,
            &schema_resources,
            &stable_binding_package,
            stable_binding_schema,
            4,
            ctx,
        )?;
        Ok(Self {
            engine,
            binding_registry,
            binding_package,
            binding_compiled,
            stable_binding_package,
            stable_binding_compiled,
            tables_registry,
            actions_registry,
            tables_package,
            tables_schema,
            tables_compiled,
            actions_package,
            actions_schema,
            actions_compiled,
            actions_literal_compiled,
            actions_action_compiled,
            operation_schema,
            operation_compiled,
            schema_resources,
        })
    }

    pub(crate) fn binding_registry(&self) -> &Registry {
        &self.binding_registry
    }
    pub(crate) fn binding_package(&self) -> &Value {
        &self.binding_package
    }
    pub(crate) fn binding_compiled(&self) -> &CompiledSchema {
        &self.binding_compiled
    }
    pub(crate) fn stable_binding_package(&self) -> &Value {
        &self.stable_binding_package
    }
    pub(crate) fn stable_binding_compiled(&self) -> &CompiledSchema {
        &self.stable_binding_compiled
    }

    pub fn engine(&self) -> &Engine {
        &self.engine
    }
    pub fn tables_registry(&self) -> &Registry {
        &self.tables_registry
    }
    pub fn actions_registry(&self) -> &Registry {
        &self.actions_registry
    }
    pub fn tables_package(&self) -> &Value {
        &self.tables_package
    }
    pub fn tables_schema(&self) -> &Value {
        &self.tables_schema
    }
    pub fn tables_compiled(&self) -> &CompiledSchema {
        &self.tables_compiled
    }
    pub fn actions_package(&self) -> &Value {
        &self.actions_package
    }
    pub fn actions_schema(&self) -> &Value {
        &self.actions_schema
    }
    pub(crate) fn actions_action_compiled(&self) -> &CompiledSchema {
        &self.actions_action_compiled
    }
    pub(crate) fn actions_literal_compiled(&self) -> &CompiledSchema {
        &self.actions_literal_compiled
    }
    pub fn actions_compiled(&self) -> &CompiledSchema {
        &self.actions_compiled
    }
    pub fn operation_schema(&self) -> &Value {
        &self.operation_schema
    }
    pub fn operation_compiled(&self) -> &CompiledSchema {
        &self.operation_compiled
    }
    pub fn schema_resources(&self) -> &SchemaResources {
        &self.schema_resources
    }
}

fn package_registry(
    engine: &Engine,
    schema_resources: &SchemaResources,
    package: &Value,
    schema: &Value,
    token: u64,
    ctx: &mut Context<'_>,
) -> Result<Registry, EngineError> {
    let mut registry = Registry::new();
    register_package(
        &mut registry,
        engine,
        schema_resources,
        package,
        schema,
        token,
        ctx,
    )?;
    Ok(registry)
}

fn invalid_package() -> EngineError {
    EngineError::new(
        "CODEGEN_RESOURCE_INVALID",
        Utf16::default(),
        "Trusted package manifest and registered schema must match",
    )
}

fn register_package(
    registry: &mut Registry,
    engine: &Engine,
    schema_resources: &SchemaResources,
    package: &Value,
    schema: &Value,
    token: u64,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let invalid = invalid_package;
    let id = crate::value::string_member(package, "id").ok_or_else(invalid)?;
    let version = crate::value::string_member(package, "version").ok_or_else(invalid)?;
    let package_schema = crate::value::member(package, "schema").ok_or_else(invalid)?;
    let package_schema_snapshot = umf_core::copy_json(package_schema, ctx)?;
    if &package_schema_snapshot != schema {
        return Err(invalid());
    }
    let scopes = array_member(package, "scopes").ok_or_else(invalid)?;
    ctx.charge_work(scopes.len(), Utf16::default())?;
    let mut admitted_scopes = Vec::with_capacity(scopes.len());
    for scope in scopes {
        match scope {
            Value::String(scope) => {
                ctx.charge_work(scope.len(), Utf16::default())?;
                admitted_scopes.push(scope.clone());
            }
            _ => return Err(invalid()),
        }
    }
    registry.register_extension(
        id,
        version,
        &admitted_scopes,
        schema,
        true,
        Some(token),
        engine.package_schema(),
        schema_resources,
        ctx,
    )?;
    Ok(())
}

fn array_member<'a>(value: &'a Value, name: &str) -> Option<&'a [Value]> {
    match member(value, name)? {
        Value::Array(values) => Some(values.as_slice()),
        _ => None,
    }
}

/// Borrowed operation facade. The resource graph is immutable and each call
/// receives its own mutable metering context.
#[derive(Clone, Copy, Debug)]
pub struct CodegenEngine<'a> {
    resources: &'a CodegenResources,
}

impl<'a> CodegenEngine<'a> {
    pub fn new(resources: &'a CodegenResources) -> Self {
        Self { resources }
    }
    pub fn resources(&self) -> &'a CodegenResources {
        self.resources
    }

    /// Parse and validate one source document with the explicitly supplied
    /// core engine, registry, and capability implementation.
    pub fn read_document(
        &self,
        source: &Utf16,
        format: umf_core::serialization::Format,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        match self.read_document_outcome(source, format, ctx)? {
            ReadDocumentOutcome::Valid(value) => Ok(value),
            ReadDocumentOutcome::Invalid(diagnostics) => {
                let message = umf_core::serialization::stringify_compact_metered(
                    &diagnostics_value(&diagnostics, ctx)?,
                    ctx,
                )?;
                Err(EngineError::new(
                    "INVALID_DOCUMENT",
                    Utf16::default(),
                    message,
                ))
            }
        }
    }

    pub(crate) fn read_document_outcome(
        &self,
        source: &Utf16,
        format: umf_core::serialization::Format,
        ctx: &mut Context<'_>,
    ) -> Result<ReadDocumentOutcome, EngineError> {
        admit_document_text(source, ctx)?;
        let mut capabilities = NoCapabilities;
        let value = match umf_core::serialization::read_json_value(source.units(), format, ctx) {
            Ok(value) => value,
            Err(error)
                if !error.is_control_failure()
                    && format == umf_core::serialization::Format::Json
                    && !matches!(error.code.as_str(), "LIMIT" | "NUMBER" | "DUPLICATE_KEY") =>
            {
                return Err(EngineError::new(
                    "SYNTAX",
                    Utf16::default(),
                    "Invalid JSON syntax",
                ));
            }
            Err(error) => return Err(error),
        };
        let mut validation = self.resources.engine.validate_document(
            &value,
            &Registry::new(),
            &mut capabilities,
            ctx,
        )?;
        if validation.valid {
            return Ok(ReadDocumentOutcome::Valid(value));
        }
        for diagnostic in &mut validation.diagnostics {
            project_predecessor_validation_message(diagnostic, ctx)?;
        }
        Ok(ReadDocumentOutcome::Invalid(validation.diagnostics))
    }

    /// Explicit registry path for callers whose operation contract requires
    /// additional registered extension semantics.
    pub fn read_document_with_capabilities(
        &self,
        source: &Utf16,
        format: umf_core::serialization::Format,
        registry: &Registry,
        capabilities: &mut dyn Capabilities,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        admit_document_text(source, ctx)?;
        umf_core::document::read_document(
            source.units(),
            format,
            &self.resources.engine,
            registry,
            capabilities,
            ctx,
        )
    }
}

/// The R2 core formatter preserves its own compatibility surface. The R3
/// compiler presents Ajv pattern messages used by its retained predecessor.
fn project_predecessor_validation_message(
    diagnostic: &mut umf_core::Diagnostic,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if ![
        "STRUCTURE",
        "SEMANTIC_TYPE_STRUCTURE",
        "EXTENSION_STRUCTURE",
    ]
    .iter()
    .any(|code| diagnostic.code == Utf16::from(*code))
    {
        return Ok(());
    }
    const PREFIX: &[u16] = &[
        109, 117, 115, 116, 32, 109, 97, 116, 99, 104, 32, 112, 97, 116, 116, 101, 114, 110, 32, 39,
    ];
    let Some(rest) = diagnostic.message.units().strip_prefix(PREFIX) else {
        return Ok(());
    };
    let Some(pattern) = rest.strip_suffix(&[39]) else {
        return Ok(());
    };
    ctx.charge_work(diagnostic.message.len(), Utf16::default())?;
    let mut message = Vec::with_capacity(diagnostic.message.len());
    message.extend_from_slice(&PREFIX[..PREFIX.len() - 1]);
    message.push(34);
    message.extend_from_slice(pattern);
    message.push(34);
    diagnostic.message = Utf16::new(message);
    Ok(())
}

fn admit_document_text(source: &Utf16, ctx: &Context<'_>) -> Result<(), EngineError> {
    if source.len()
        > ctx
            .limits()
            .max_text_units
            .min(umf_core::Limits::ordinary().max_text_units)
    {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Source text limit exceeded",
        ));
    }
    Ok(())
}

pub(crate) enum ReadDocumentOutcome {
    Valid(Value),
    Invalid(Vec<umf_core::Diagnostic>),
}
pub(crate) fn diagnostics_value(
    diagnostics: &[umf_core::Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(diagnostics.len().saturating_mul(16), Utf16::default())?;
    let mut values = Vec::with_capacity(diagnostics.len());
    for diagnostic in diagnostics {
        ctx.charge_work(
            diagnostic
                .code
                .len()
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len())
                .saturating_add(64),
            diagnostic.path.clone(),
        )?;
        values.push(Value::Object(vec![
            (Utf16::from("code"), Value::String(diagnostic.code.clone())),
            (Utf16::from("path"), Value::String(diagnostic.path.clone())),
            (
                Utf16::from("message"),
                Value::String(diagnostic.message.clone()),
            ),
            (
                Utf16::from("severity"),
                Value::String(Utf16::from(
                    if diagnostic.severity == umf_core::Severity::Error {
                        "error"
                    } else {
                        "warning"
                    },
                )),
            ),
        ]));
    }
    Ok(Value::Array(values))
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod resource_controls {
    use super::*;
    fn load(path: &str) -> Value {
        let text = match path {
            "spec/core/schema.json" => include_str!("../../../spec/core/schema.json"),
            "spec/core/semantic-type-reference.schema.json" => {
                include_str!("../../../spec/core/semantic-type-reference.schema.json")
            }
            "spec/core/extension-package.schema.json" => {
                include_str!("../../../spec/core/extension-package.schema.json")
            }
            "spec/metamodel/generated/core-constraints.json" => {
                include_str!("../../../spec/metamodel/generated/core-constraints.json")
            }
            "spec/metamodel/generated/domain-policy.json" => {
                include_str!("../../../spec/metamodel/generated/domain-policy.json")
            }
            "spec/extensions/tables/package.json" => {
                include_str!("../../../spec/extensions/tables/package.json")
            }
            "spec/extensions/actions/package.json" => {
                include_str!("../../../spec/extensions/actions/package.json")
            }
            "spec/extensions/binding/package.json" => {
                include_str!("../../../spec/extensions/binding/package.json")
            }
            "spec/extensions/binding-stable/package.json" => {
                include_str!("../../../spec/extensions/binding-stable/package.json")
            }
            _ => panic!("Unknown fixed resource fixture"),
        };
        umf_core::serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }
    fn resources() -> CodegenResources {
        resources_with_literal(None)
    }
    fn resources_with_literal(literal: Option<Value>) -> CodegenResources {
        let tables = load("spec/extensions/tables/package.json");
        let mut actions = load("spec/extensions/actions/package.json");
        if let Some(literal) = literal {
            let Value::Object(package) = &mut actions else {
                unreachable!()
            };
            let Value::Object(schema) = &mut package
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("schema"))
                .unwrap()
                .1
            else {
                unreachable!()
            };
            let Value::Object(defs) = &mut schema
                .iter_mut()
                .find(|(key, _)| key == &Utf16::from("$defs"))
                .unwrap()
                .1
            else {
                unreachable!()
            };
            defs.iter_mut()
                .find(|(key, _)| key == &Utf16::from("literal"))
                .unwrap()
                .1 = literal;
        }
        let tables_schema = member(&tables, "schema").unwrap().clone();
        let actions_schema = member(&actions, "schema").unwrap().clone();
        CodegenResources::new(
            ResourceSet::new(
                load("spec/core/schema.json"),
                load("spec/core/semantic-type-reference.schema.json"),
                load("spec/core/extension-package.schema.json"),
                load("spec/metamodel/generated/core-constraints.json"),
                load("spec/metamodel/generated/domain-policy.json"),
            ),
            tables,
            tables_schema,
            actions,
            actions_schema,
            load("spec/extensions/binding/package.json"),
            load("spec/extensions/binding-stable/package.json"),
            &mut Context::catalog(),
        )
        .unwrap()
    }
    #[test]
    fn explicit_binding_packages_share_registry_and_compile_the_supplied_schema() {
        let resources = resources();
        for (package, compiled, version, token) in [
            (
                resources.binding_package(),
                resources.binding_compiled(),
                "0.1.0",
                3,
            ),
            (
                resources.stable_binding_package(),
                resources.stable_binding_compiled(),
                "0.2.0",
                4,
            ),
        ] {
            let registration = resources
                .binding_registry()
                .get(&Utf16::from("umf.binding"), &Utf16::from(version))
                .unwrap();
            assert_eq!(registration.token(), Some(token));
            assert_eq!(compiled.schema_value(), member(package, "schema").unwrap());
            assert_eq!(
                registration.schema().schema_value(),
                compiled.schema_value()
            );
        }
        assert_eq!(resources.binding_registry().entries().len(), 2);
        let literal = member(
            member(resources.actions_schema(), "$defs").unwrap(),
            "literal",
        )
        .unwrap();
        assert_eq!(
            member(
                member(resources.actions_literal_compiled().schema_value(), "$defs").unwrap(),
                "literal"
            )
            .unwrap(),
            literal
        );
    }
    #[test]
    fn compiler_pattern_projection_preserves_raw_utf16_and_core_formatter_scope() {
        let mut message = Utf16::from("must match pattern '").into_units();
        message.extend([0xd800, 39, 34, 92, 39]);
        let mut diagnostic = umf_core::Diagnostic {
            code: Utf16::from("SEMANTIC_TYPE_STRUCTURE"),
            path: Utf16::default(),
            message: Utf16::new(message),
            severity: umf_core::Severity::Error,
            python_source_path: false,
            python_text_origin: None,
        };
        project_predecessor_validation_message(&mut diagnostic, &mut Context::ordinary()).unwrap();
        let mut expected = Utf16::from("must match pattern \"").into_units();
        expected.extend([0xd800, 39, 34, 92, 34]);
        assert_eq!(diagnostic.message, Utf16::new(expected));
    }

    #[test]
    fn source_document_text_retains_ordinary_and_stricter_caller_bounds() {
        let resources = resources();
        let engine = CodegenEngine::new(&resources);
        let source = Utf16::from(" ".repeat(4_000_001));
        let mut aggregate = Context::with_limits(
            umf_core::ResourceProfile::Cooperative,
            umf_core::Limits {
                max_text_units: 32 * 1024 * 1024,
                ..umf_core::Limits::ordinary()
            },
        )
        .unwrap();
        assert_eq!(
            engine
                .read_document(
                    &source,
                    umf_core::serialization::Format::Json,
                    &mut aggregate
                )
                .unwrap_err()
                .code,
            "LIMIT"
        );
        let mut strict = Context::with_limits(
            umf_core::ResourceProfile::Cooperative,
            umf_core::Limits {
                max_text_units: 1,
                ..umf_core::Limits::ordinary()
            },
        )
        .unwrap();
        assert_eq!(
            engine
                .read_document(
                    &Utf16::from("{}"),
                    umf_core::serialization::Format::Json,
                    &mut strict
                )
                .unwrap_err()
                .code,
            "LIMIT"
        );
    }

    #[test]
    fn action_literal_validation_uses_the_explicit_schema_definition() {
        let literal = Value::Object(vec![(Utf16::from("boolean"), Value::Bool(true))]);
        assert!(resources()
            .actions_literal_compiled()
            .validate(&literal, &mut Context::ordinary())
            .unwrap()
            .is_empty());
        let custom = resources_with_literal(Some(Value::Object(vec![(
            Utf16::from("const"),
            Value::Null,
        )])));
        assert!(!custom
            .actions_literal_compiled()
            .validate(&literal, &mut Context::ordinary())
            .unwrap()
            .is_empty());
        assert!(custom
            .actions_literal_compiled()
            .validate(&Value::Null, &mut Context::ordinary())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn diagnostic_serialization_precharges_cloned_text_and_preserves_control_origin() {
        let diagnostics = vec![umf_core::Diagnostic {
            code: Utf16::from("test"),
            path: Utf16::from("/payload"),
            message: Utf16::from("x".repeat(10_000)),
            severity: umf_core::Severity::Error,
            python_source_path: false,
            python_text_origin: None,
        }];
        let mut calls = 0;
        let mut meter = |work: usize| {
            calls += 1;
            if work > 1000 {
                Err(EngineError::new(
                    "NUMBER",
                    Utf16::from("/host"),
                    "stop before copy",
                ))
            } else {
                Ok(())
            }
        };
        let error = diagnostics_value(
            &diagnostics,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(error.code, "NUMBER");
        assert_eq!(error.path, Utf16::from("/host"));
        assert!(error.is_control_failure());
        assert_eq!(calls, 2);
    }
}
