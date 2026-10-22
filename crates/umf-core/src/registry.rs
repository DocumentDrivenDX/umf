// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    error::EngineError,
    python_regex::PythonReVersion,
    python_value::{PythonConsumerValue, PythonSchemaResources},
    schema::{CompiledSchema, SchemaResources},
    value::{copy_json, Utf16, Value},
};
#[derive(Clone, Debug)]
pub struct Registration {
    manifest: Value,
    schema: CompiledSchema,
    token: Option<u64>,
    scopes: Vec<String>,
    semantic: bool,
    id: Utf16,
    version: Utf16,
}
impl Registration {
    pub fn manifest(&self) -> &Value {
        &self.manifest
    }
    pub fn schema(&self) -> &CompiledSchema {
        &self.schema
    }
    pub fn token(&self) -> Option<u64> {
        self.token
    }
    pub fn scopes(&self) -> &[String] {
        &self.scopes
    }
    pub fn semantic(&self) -> bool {
        self.semantic
    }
    pub fn id(&self) -> &Utf16 {
        &self.id
    }
    pub fn version(&self) -> &Utf16 {
        &self.version
    }
}
#[derive(Clone, Debug, Default)]
pub struct Registry {
    entries: Vec<Registration>,
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: &Value) -> Option<Utf16> {
    match v {
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn core_version(package_schema: &CompiledSchema) -> Result<Value, EngineError> {
    let property = get(package_schema.schema_value(), "properties")
        .and_then(|properties| get(properties, "coreVersion"))
        .and_then(|property| get(property, "const"))
        .ok_or_else(|| {
            err(
                "PACKAGE_STRUCTURE",
                "Package schema has no coreVersion constant",
            )
        })?;
    Ok(property.clone())
}
impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Admit the public Extension compatibility shape through Rust's package
    /// schema and extension-schema validation path.
    pub fn register_extension(
        &mut self,
        id: &Utf16,
        version: &Utf16,
        scopes: &[Utf16],
        schema: &Value,
        semantic: bool,
        token: Option<u64>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let identity_copy_work = id
            .len()
            .saturating_add(version.len())
            .saturating_add(scopes.iter().map(Utf16::len).fold(0, usize::saturating_add));
        ctx.charge_work(identity_copy_work, Utf16::default())?;
        ctx.charge_work(scopes.len(), Utf16::default())?;
        let schema = copy_json(schema, ctx)?;
        self.register_extension_owned_inner(
            id.clone(),
            version.clone(),
            scopes.to_vec(),
            schema,
            semantic,
            token,
            None,
            package_schema,
            schema_resources,
            ctx,
        )
    }

    /// Ownership-taking counterpart for bindings that already decoded and
    /// admitted the request fields. The manifest copy is still charged before
    /// allocation by `register_inner`.
    pub fn register_extension_owned(
        &mut self,
        id: Utf16,
        version: Utf16,
        scopes: Vec<Utf16>,
        schema: Value,
        semantic: bool,
        token: Option<u64>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_extension_owned_inner(
            id,
            version,
            scopes,
            schema,
            semantic,
            token,
            None,
            package_schema,
            schema_resources,
            ctx,
        )
    }

    /// Compatibility registration for the predecessor Python `schema_validator`
    /// profile. The schema is admitted with the requested Python `re` version
    /// and its declared JSON Schema dialect; the registry still owns package
    /// identity and manifest validation.
    pub fn register_extension_with_python_profile(
        &mut self,
        id: &Utf16,
        version: &Utf16,
        scopes: &[Utf16],
        schema: &Value,
        semantic: bool,
        token: Option<u64>,
        python_version: PythonReVersion,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let identity_copy_work = id
            .len()
            .saturating_add(version.len())
            .saturating_add(scopes.iter().map(Utf16::len).fold(0, usize::saturating_add));
        ctx.charge_work(identity_copy_work, Utf16::default())?;
        ctx.charge_work(scopes.len(), Utf16::default())?;
        let schema = copy_json(schema, ctx)?;
        self.register_extension_owned_inner(
            id.clone(),
            version.clone(),
            scopes.to_vec(),
            schema,
            semantic,
            token,
            Some(python_version),
            package_schema,
            schema_resources,
            ctx,
        )
    }

    pub fn register_extension_owned_with_python_profile(
        &mut self,
        id: Utf16,
        version: Utf16,
        scopes: Vec<Utf16>,
        schema: Value,
        semantic: bool,
        token: Option<u64>,
        python_version: PythonReVersion,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_extension_owned_inner(
            id,
            version,
            scopes,
            schema,
            semantic,
            token,
            Some(python_version),
            package_schema,
            schema_resources,
            ctx,
        )
    }

    /// Register an extension whose schema arrived as Python built-ins. The
    /// package envelope is validated through the ordinary core schema while
    /// the extension schema is compiled with its original Python text and
    /// numeric source profile.
    pub fn register_extension_python_source(
        &mut self,
        id: Utf16,
        version: Utf16,
        scopes: Vec<Utf16>,
        schema: PythonConsumerValue,
        semantic: bool,
        token: Option<u64>,
        python_version: PythonReVersion,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        python_schema_resources: &PythonSchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(
            id.len()
                .saturating_add(version.len())
                .saturating_add(scopes.iter().map(Utf16::len).fold(0, usize::saturating_add)),
            Utf16::default(),
        )?;
        ctx.charge_work(scopes.len(), Utf16::default())?;
        let projected_schema = schema.project_schema_to_core(ctx)?;
        let validation = if semantic { "semantic" } else { "structural" };
        let manifest = Value::Object(vec![
            (k("id"), Value::String(id)),
            (k("version"), Value::String(version)),
            (k("coreVersion"), core_version(package_schema)?),
            (
                k("description"),
                Value::string_utf8("Registered through Extension compatibility API"),
            ),
            (k("semantics"), Value::string_utf8("host capability")),
            (k("schema"), projected_schema),
            (
                k("scopes"),
                Value::Array(scopes.into_iter().map(Value::String).collect()),
            ),
            (
                k("capabilities"),
                Value::Object(vec![
                    (k("validation"), Value::string_utf8(validation)),
                    (k("directions"), Value::Array(vec![])),
                    (k("evidence"), Value::Array(vec![])),
                ]),
            ),
        ]);
        self.register_inner_with_source(
            &manifest,
            token,
            Some(python_version),
            package_schema,
            schema_resources,
            Some((&schema, python_schema_resources)),
            ctx,
        )
    }

    fn register_extension_owned_inner(
        &mut self,
        id: Utf16,
        version: Utf16,
        scopes: Vec<Utf16>,
        schema: Value,
        semantic: bool,
        token: Option<u64>,
        python_version: Option<PythonReVersion>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let validation = if semantic { "semantic" } else { "structural" };
        let manifest = Value::Object(vec![
            (k("id"), Value::String(id)),
            (k("version"), Value::String(version)),
            (k("coreVersion"), core_version(package_schema)?),
            (
                k("description"),
                Value::string_utf8("Registered through Extension compatibility API"),
            ),
            (k("semantics"), Value::string_utf8("host capability")),
            (k("schema"), schema),
            (
                k("scopes"),
                Value::Array(scopes.into_iter().map(Value::String).collect()),
            ),
            (
                k("capabilities"),
                Value::Object(vec![
                    (k("validation"), Value::string_utf8(validation)),
                    (k("directions"), Value::Array(vec![])),
                    (k("evidence"), Value::Array(vec![])),
                ]),
            ),
        ]);
        self.register_inner(
            &manifest,
            token,
            python_version,
            package_schema,
            schema_resources,
            ctx,
        )
    }

    pub fn register(
        &mut self,
        manifest: &Value,
        token: Option<u64>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_inner(manifest, token, None, package_schema, schema_resources, ctx)
    }

    fn register_inner(
        &mut self,
        manifest: &Value,
        token: Option<u64>,
        python_version: Option<PythonReVersion>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        self.register_inner_with_source(
            manifest,
            token,
            python_version,
            package_schema,
            schema_resources,
            None,
            ctx,
        )
    }

    fn register_inner_with_source(
        &mut self,
        manifest: &Value,
        token: Option<u64>,
        python_version: Option<PythonReVersion>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        python_source: Option<(&PythonConsumerValue, &PythonSchemaResources)>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let owned = copy_json(manifest, ctx)?;
        let errors = package_schema.validate(&owned, ctx)?;
        if !errors.is_empty() {
            return Err(EngineError::new(
                "PACKAGE_STRUCTURE",
                errors[0].instance_path.clone(),
                errors[0].message.clone(),
            ));
        }
        let id = text(
            get(&owned, "id").ok_or_else(|| err("PACKAGE_STRUCTURE", "Package id is required"))?,
        )
        .ok_or_else(|| err("PACKAGE_STRUCTURE", "Package id must be a string"))?;
        let version = text(
            get(&owned, "version")
                .ok_or_else(|| err("PACKAGE_STRUCTURE", "Package version is required"))?,
        )
        .ok_or_else(|| err("PACKAGE_STRUCTURE", "Package version must be a string"))?;
        if self.get(&id, &version).is_some() {
            return Err(err(
                "DUPLICATE_VERSION",
                "Extension version is already registered",
            ));
        }
        let scopes = match get(&owned, "scopes") {
            Some(Value::Array(a)) => a
                .iter()
                .map(|v| {
                    text(v)
                        .and_then(|s| s.to_utf8().ok())
                        .ok_or_else(|| err("PACKAGE_STRUCTURE", "Extension scope must be a string"))
                })
                .collect::<Result<Vec<_>, _>>()?,
            _ => return Err(err("PACKAGE_STRUCTURE", "Extension scopes are required")),
        };
        let cap = get(&owned, "capabilities")
            .ok_or_else(|| err("PACKAGE_STRUCTURE", "Package capabilities are required"))?;
        let semantic = matches!(
            get(cap, "validation")
                .and_then(text)
                .and_then(|s| s.to_utf8().ok())
                .as_deref(),
            Some("semantic")
        );
        let schema = get(&owned, "schema")
            .ok_or_else(|| err("PACKAGE_STRUCTURE", "Package schema is required"))?;
        let compiled = if let (Some(version), Some((source, python_resources))) =
            (python_version, python_source)
        {
            *CompiledSchema::compile_python_source(source, python_resources, false, version, ctx)?
                .compiled
        } else if let Some(version) = python_version {
            CompiledSchema::compile_python_schema(schema, schema_resources, false, version, ctx)?
        } else {
            CompiledSchema::compile(schema, schema_resources, ctx)?
        };
        self.entries.push(Registration {
            manifest: owned,
            schema: compiled,
            token,
            scopes,
            semantic,
            id,
            version,
        });
        Ok(())
    }
    pub fn get(&self, id: &Utf16, version: &Utf16) -> Option<&Registration> {
        self.entries
            .iter()
            .find(|e| &e.id == id && &e.version == version)
    }
    pub fn entries(&self) -> &[Registration] {
        &self.entries
    }
}
