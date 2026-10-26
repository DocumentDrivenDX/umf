// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{
    context::Context,
    error::EngineError,
    python_regex::PythonReVersion,
    python_value::{PythonConsumerValue, PythonSchemaResources},
    schema::{CompiledSchema, SchemaResources},
    value::{Utf16, Value, copy_json},
};
#[derive(Clone, Debug)]
pub struct Registration {
    catalog: crate::kinds::Catalog,
    manifest: Value,
    schema: CompiledSchema,
    token: Option<u64>,
    scopes: Vec<String>,
    semantic: bool,
    id: Utf16,
    version: Utf16,
}
impl Registration {
    pub(crate) fn catalog(&self) -> &crate::kinds::Catalog {
        &self.catalog
    }
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
    kind_policy: Option<Value>,
}

/// A registration discovered by an invocation-local provider. Host handles
/// remain opaque and are inspected only by the private staged Selection path.
#[derive(Clone, Copy, Debug)]
pub(crate) enum RegistrationLookup<'a> {
    Borrowed(&'a Registration),
    HostHandle(u64),
}

/// Result of the bounded host-owned registration structure stage used only by
/// the private Selection host route. Semantic callback execution remains a
/// separate, explicit boundary.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum HostRegistrationStage {
    OutOfScope,
    NoDiagnostics,
    StructureErrors(Vec<crate::host_json::HostStructureErrorEntry>),
    Unchecked,
    Unsupported,
}

/// Demand-driven registration access used by the shared interpreter. Calls
/// occur at the original `registered` and extension-payload evaluation sites.
pub(crate) trait RegistrationProvider {
    fn lookup<'a>(
        &'a self,
        id: &Utf16,
        version: &Utf16,
        _ctx: &mut Context<'_>,
    ) -> Result<Option<RegistrationLookup<'a>>, EngineError>;

    fn host_registration_stage(
        &self,
        _handle: u64,
        _payload: &Value,
        _scope: &Utf16,
        _path: &Utf16,
        _ctx: &mut Context<'_>,
    ) -> Result<HostRegistrationStage, EngineError> {
        Err(EngineError::new(
            "HOST_JSON_UNSUPPORTED",
            Utf16::default(),
            "Caller-owned Selection registration requires a host-aware provider",
        ))
    }
}

pub(crate) struct StaticRegistrationProvider<'a>(pub(crate) &'a Registry);

impl RegistrationProvider for StaticRegistrationProvider<'_> {
    fn lookup<'a>(
        &'a self,
        id: &Utf16,
        version: &Utf16,
        _ctx: &mut Context<'_>,
    ) -> Result<Option<RegistrationLookup<'a>>, EngineError> {
        Ok(self.0.get(id, version).map(RegistrationLookup::Borrowed))
    }
}

// Internal tests and existing interpreter call sites can use the registry
// directly; production public entry points still construct the explicit
// adapter above to make the static binding boundary visible.
impl RegistrationProvider for Registry {
    fn lookup<'a>(
        &'a self,
        id: &Utf16,
        version: &Utf16,
        _ctx: &mut Context<'_>,
    ) -> Result<Option<RegistrationLookup<'a>>, EngineError> {
        Ok(self.get(id, version).map(RegistrationLookup::Borrowed))
    }
}

fn opaque_lookup_error() -> EngineError {
    EngineError::new(
        "REGISTRY_PROVIDER_HANDLE",
        Utf16::default(),
        "Opaque host registration handles require a host-aware selection provider",
    )
}

pub(crate) fn require_borrowed<'a>(
    lookup: Option<RegistrationLookup<'a>>,
) -> Result<Option<&'a Registration>, EngineError> {
    match lookup {
        None => Ok(None),
        Some(RegistrationLookup::Borrowed(entry)) => Ok(Some(entry)),
        Some(RegistrationLookup::HostHandle(_)) => Err(opaque_lookup_error()),
    }
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
fn core_version(
    package_schema: &CompiledSchema,
    kind_policy: Option<&Value>,
) -> Result<Value, EngineError> {
    if let Some(value) = kind_policy
        .and_then(|p| get(p, "kindCatalogPolicy"))
        .and_then(|p| get(p, "activeCoreVersion"))
    {
        return Ok(value.clone());
    }
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
    pub(crate) fn with_kind_policy(
        policy: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        Ok(Self {
            entries: Vec::new(),
            kind_policy: Some(copy_json(policy, ctx)?),
        })
    }
    pub(crate) fn kind_policy(&self) -> &Value {
        self.kind_policy.as_ref().unwrap_or(&Value::Null)
    }
    pub(crate) fn require_kind_runtime(&self) -> Result<(), EngineError> {
        if self
            .kind_policy
            .as_ref()
            .and_then(|policy| get(policy, "kindCatalogPolicy"))
            .is_none()
        {
            return Err(err(
                "EXTENSION_KIND_RUNTIME_REQUIRED",
                "Initialize the registry through the shared engine",
            ));
        }
        Ok(())
    }
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
            (
                k("coreVersion"),
                core_version(package_schema, self.kind_policy.as_ref())?,
            ),
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
            false,
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
            (
                k("coreVersion"),
                core_version(package_schema, self.kind_policy.as_ref())?,
            ),
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

    pub fn register_kind_package(
        &mut self,
        manifest: &Value,
        token: Option<u64>,
        package_schema: &CompiledSchema,
        schema_resources: &SchemaResources,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let admitted = copy_json(manifest, ctx)?;
        let manifest = &admitted;
        let policy = self
            .kind_policy
            .as_ref()
            .and_then(|p| get(p, "kindCatalogPolicy"))
            .ok_or_else(|| {
                err(
                    "EXTENSION_KIND_RUNTIME_REQUIRED",
                    "Initialize the registry through the shared engine",
                )
            })?;
        if let Some(catalog) = get(manifest, "kindCatalog") {
            let target = get(policy, "schemaReference")
                .ok_or_else(|| err("PACKAGE_KIND_CATALOG", "Missing catalog schema policy"))?;
            let definitions = get(package_schema.schema_value(), "$defs")
                .ok_or_else(|| err("PACKAGE_KIND_CATALOG", "Missing catalog schema definitions"))?;
            let schema = Value::Object(vec![
                (k("$ref"), copy_json(target, ctx)?),
                (k("$defs"), copy_json(definitions, ctx)?),
            ]);
            let errors =
                CompiledSchema::compile(&schema, schema_resources, ctx)?.validate(catalog, ctx)?;
            if !errors.is_empty() {
                return Err(err(
                    "PACKAGE_KIND_CATALOG",
                    "Catalog does not match its authored schema",
                ));
            }
        }
        self.register_inner_with_source(
            manifest,
            token,
            None,
            package_schema,
            schema_resources,
            None,
            true,
            ctx,
        )
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
            false,
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
        activate_kinds: bool,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let owned = copy_json(manifest, ctx)?;
        let catalog = if activate_kinds {
            crate::kinds::Catalog::admit(
                &owned,
                self.kind_policy
                    .as_ref()
                    .and_then(|p| get(p, "kindCatalogPolicy"))
                    .unwrap_or(&Value::Null),
                ctx,
            )?
        } else {
            crate::kinds::Catalog::default()
        };
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
            catalog,
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
