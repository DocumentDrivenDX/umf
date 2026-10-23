// SPDX-License-Identifier: MIT OR Apache-2.0
//! Table deployment compiler and verifier.
//!
//! The operation boundary uses [`umf_core::Value`] so object order and UTF-16
//! code units survive admission. The compiler emits inert reviewable SQL only.

use crate::{
    canonical::{canonical_json_admitted, canonical_sha256_admitted, sha256_source_text},
    resources::{CodegenEngine, ReadDocumentOutcome},
    value::{array_items, member, object_members, string_member},
};
use std::collections::BTreeSet;
use umf_core::{Context, EngineError, Utf16, Value};

#[derive(Debug)]
enum Refusal {
    Semantic {
        code: String,
        path: Utf16,
        message: String,
    },
    Terminal(EngineError),
    Diagnostics(Value),
}
impl Refusal {
    fn unsupported(path: impl PathArgument, message: impl Into<String>) -> Self {
        Self::Semantic {
            code: "TABLE_DEPLOYMENT_UNSUPPORTED".into(),
            path: path.into_path(),
            message: message.into(),
        }
    }
}
trait PathArgument {
    fn into_path(self) -> Utf16;
}
impl PathArgument for Utf16 {
    fn into_path(self) -> Utf16 {
        self
    }
}
impl PathArgument for &Utf16 {
    fn into_path(self) -> Utf16 {
        self.clone()
    }
}
impl PathArgument for &str {
    fn into_path(self) -> Utf16 {
        Utf16::from(self)
    }
}
impl PathArgument for String {
    fn into_path(self) -> Utf16 {
        Utf16::from(self)
    }
}

impl CodegenEngine<'_> {
    /// Compile a source-bound, inert PostgreSQL deployment bundle.
    pub fn compile_table_deployment(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        match self.compile_deployment_inner(input, ctx, false) {
            Ok(bundle) => Ok(object(vec![
                ("status", s("compiled")),
                ("bundle", bundle),
                ("diagnostics", Value::Array(vec![])),
            ])),
            Err(Refusal::Terminal(error)) => Err(error),
            Err(Refusal::Semantic {
                code,
                path,
                message,
            }) if code == "DEPLOYMENT_FAILED" => Err(EngineError::new(code, path, message)),
            Err(refusal) => Ok(blocked(&refusal)),
        }
    }

    /// Recompile the exact embedded source/configuration and compare the full
    /// bundle; a self-consistent digest alone is never authority.
    pub fn verify_table_deployment(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let value = crate::value::admit_json(input, ctx)?;
        let version = string_member(&value, "version")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if !matches!(
            version.as_str(),
            "umf.table-deployment/0.1" | "umf.table-deployment/0.2"
        ) || member(&value, "source").is_none()
        {
            return Err(EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Unknown deployment bundle",
            ));
        }
        let source = member(&value, "source").ok_or_else(|| {
            EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Unknown deployment bundle",
            )
        })?;
        let text = string_member(source, "utf8").ok_or_else(|| {
            EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Deployment bundle source is invalid",
            )
        })?;
        let format = string_member(source, "format")
            .and_then(|s| s.to_utf8().ok())
            .unwrap_or_default();
        let configuration = member(&value, "configuration").ok_or_else(|| {
            EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Deployment bundle configuration is invalid",
            )
        })?;
        let request = object(vec![
            ("text", Value::String(text.clone())),
            ("format", s(format)),
            ("configuration", configuration.clone()),
        ]);
        let compiled = match self.compile_deployment_inner(
            &request,
            ctx,
            version == "umf.table-deployment/0.1",
        ) {
            Ok(bundle) => object(vec![
                ("status", s("compiled")),
                ("bundle", bundle),
                ("diagnostics", Value::Array(vec![])),
            ]),
            Err(Refusal::Terminal(error)) => return Err(error),
            Err(refusal) => blocked(&refusal),
        };
        if string_member(&compiled, "status") != Some(&Utf16::from("compiled")) {
            return Err(EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Deployment differs from exact source recompilation",
            ));
        }
        let bundle = member(&compiled, "bundle").expect("compiled response has bundle");
        if canonical_json_admitted(&value, ctx)? != canonical_json_admitted(bundle, ctx)? {
            return Err(EngineError::new(
                "TABLE_DEPLOYMENT_UNSUPPORTED",
                Utf16::default(),
                "Deployment differs from exact source recompilation",
            ));
        }
        Ok(bundle.clone())
    }

    fn compile_deployment_inner(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
        legacy_comments: bool,
    ) -> Result<Value, Refusal> {
        let input = crate::value::admit_json(input, ctx).map_err(Refusal::from_error)?;
        let text = string_member(&input, "text").ok_or_else(|| Refusal::Semantic {
            code: "DEPLOYMENT_FAILED".into(),
            path: Utf16::default(),
            message: "undefined is not an object (evaluating 'text.length')".into(),
        })?;
        let format_text = match member(&input, "format") {
            None | Some(Value::Null) => "json".to_string(),
            Some(Value::String(x)) => x.to_utf8().map_err(|_| {
                Refusal::input_error(EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Invalid Unicode",
                ))
            })?,
            Some(_) => {
                return Err(Refusal::unsupported(
                    "/source/format",
                    "Unknown source serialization",
                ))
            }
        };
        let format = match format_text.as_str() {
            "json" => umf_core::serialization::Format::Json,
            "yaml" => umf_core::serialization::Format::Yaml,
            _ => {
                return Err(Refusal::unsupported(
                    "/source/format",
                    "Unknown source serialization",
                ))
            }
        };
        if utf8_len_bounded(text, 4_000_000, ctx).map_err(Refusal::input_error)? > 4_000_000 {
            return Err(Refusal::input_error(EngineError::new(
                "INPUT",
                Utf16::default(),
                "Source exceeds deployment byte limit",
            )));
        }
        let source_digest = sha256_source_text(text, ctx).map_err(Refusal::input_error)?;
        let config = member(&input, "configuration").ok_or_else(|| {
            Refusal::unsupported("/configuration", "Expected exact deployment configuration")
        })?;
        let config = parse_configuration(config, ctx)?;
        let document = match self
            .read_document_outcome(text, format, ctx)
            .map_err(Refusal::from_error)?
        {
            ReadDocumentOutcome::Valid(document) => document,
            ReadDocumentOutcome::Invalid(diagnostics) => {
                let message = umf_core::serialization::stringify_compact_metered(
                    &crate::resources::diagnostics_value(&diagnostics, ctx)
                        .map_err(Refusal::from_error)?,
                    ctx,
                )
                .map_err(Refusal::from_error)?
                .to_utf8()
                .map_err(|_| Refusal::unsupported("", "Invalid diagnostic Unicode"))?;
                return Err(Refusal::Semantic {
                    code: "INVALID_DOCUMENT".into(),
                    path: Utf16::default(),
                    message,
                });
            }
        };
        let inspection = self
            .inspect_table_lifecycle(&document, ctx)
            .map_err(Refusal::terminal)?;
        if member(&inspection, "valid") != Some(&Value::Bool(true))
            || member(&inspection, "complete") != Some(&Value::Bool(true))
        {
            return Err(Refusal::Diagnostics(blocked_inspection(&inspection)));
        }
        let module = string_member(&config, "module").ok_or_else(|| {
            Refusal::unsupported("/configuration/module", "Expected exact module identity")
        })?;
        let modules =
            array_items(member(&inspection, "modules").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let selected = modules
            .iter()
            .find(|entry| member(entry, "module") == Some(&Value::String(module.clone())))
            .and_then(|entry| member(entry, "payload"))
            .ok_or_else(|| {
                Refusal::unsupported(
                    "/configuration/module",
                    "Configured module has no table lifecycle declaration",
                )
            })?;
        let module_index = array_items(member(&document, "modules").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .position(|m| string_member(m, "id") == Some(&module))
            .ok_or_else(|| {
                Refusal::unsupported("/configuration/module", "Configured module is missing")
            })?;
        build_deployment_bundle(
            &document,
            selected,
            &config,
            module_index,
            format_text,
            text,
            source_digest,
            legacy_comments,
            ctx,
        )
    }
}

/// Count UTF-8 source bytes without allocating the encoded source. The
/// deployment admission boundary is byte-based even though core strings use
/// UTF-16. Stop as soon as the operation-specific ceiling is exceeded.
fn utf8_len_bounded(
    text: &Utf16,
    ceiling: usize,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    let units = text.units();
    let mut index = 0usize;
    let mut bytes = 0usize;
    let mut next_poll = 0usize;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(1024);
        }
        let unit = units[index];
        let (size, step) = match unit {
            0x0000..=0x007f => (1, 1),
            0x0080..=0x07ff => (2, 1),
            0xd800..=0xdbff => {
                if units
                    .get(index + 1)
                    .is_none_or(|low| !(0xdc00..=0xdfff).contains(low))
                {
                    return Err(EngineError::new(
                        "INPUT",
                        Utf16::default(),
                        "Source contains an unpaired UTF-16 surrogate",
                    ));
                }
                (4, 2)
            }
            0xdc00..=0xdfff => {
                return Err(EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Source contains an unpaired UTF-16 surrogate",
                ));
            }
            _ => (3, 1),
        };
        bytes = bytes.saturating_add(size);
        if bytes > ceiling {
            return Ok(bytes);
        }
        index += step;
    }
    Ok(bytes)
}

impl Refusal {
    fn terminal(error: EngineError) -> Self {
        Self::Terminal(error)
    }
    fn from_error(error: EngineError) -> Self {
        if error.is_control_failure() {
            return Self::Terminal(error);
        }
        Self::Semantic {
            code: error.code,
            path: error.path,
            message: error.message.to_utf8().unwrap_or_default(),
        }
    }
    fn input_error(error: EngineError) -> Self {
        if error.is_control_failure() {
            return Self::Terminal(error);
        }
        if matches!(error.code.as_str(), "INPUT" | "LIMIT") {
            return Self::Semantic {
                code: "TABLE_DEPLOYMENT_INPUT".into(),
                path: Utf16::default(),
                message: "Invalid Unicode or source resource limit".into(),
            };
        }
        Self::from_error(error)
    }
    fn from_inspection(inspection: &Value) -> Self {
        Self::Diagnostics(blocked_inspection(inspection))
    }
    fn blocked_diagnostics(diagnostics: Vec<umf_core::Diagnostic>) -> Self {
        Self::Diagnostics(blocked_diagnostics(diagnostics))
    }
}

fn blocked(refusal: &Refusal) -> Value {
    match refusal {
        Refusal::Semantic {
            code,
            path,
            message,
        } => object(vec![
            ("status", s("blocked")),
            (
                "diagnostics",
                Value::Array(vec![diagnostic(code, path, message)]),
            ),
        ]),
        Refusal::Diagnostics(value) => value.clone(),
        Refusal::Terminal(_) => unreachable!("terminal errors are propagated"),
    }
}
fn blocked_diagnostics(diagnostics: Vec<umf_core::Diagnostic>) -> Value {
    object(vec![
        ("status", s("blocked")),
        (
            "diagnostics",
            Value::Array(
                diagnostics
                    .iter()
                    .map(|d| {
                        object(vec![
                            ("code", Value::String(d.code.clone())),
                            ("path", Value::String(d.path.clone())),
                            ("message", Value::String(d.message.clone())),
                            (
                                "severity",
                                s(if d.severity == umf_core::Severity::Error {
                                    "error"
                                } else {
                                    "warning"
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
    ])
}
fn blocked_inspection(inspection: &Value) -> Value {
    object(vec![
        ("status", s("blocked")),
        (
            "diagnostics",
            member(inspection, "diagnostics")
                .cloned()
                .unwrap_or(Value::Array(vec![])),
        ),
    ])
}
fn diagnostic(code: &str, path: &Utf16, message: &str) -> Value {
    object(vec![
        ("code", s(code)),
        ("path", Value::String(path.clone())),
        ("message", s(message)),
        ("severity", s("error")),
    ])
}
// Native identifier admission follows TextEncoder length semantics. Canonical
// identity hashing later rejects unpaired surrogates without moving that error
// ahead of configuration checks that the predecessor performs first.
fn valid_native_identifier(text: &Utf16, ctx: &mut Context<'_>) -> Result<bool, Refusal> {
    if text.is_empty() || text.len() > 63 || text.units().contains(&0) {
        return Ok(false);
    }
    ctx.charge_work(text.len(), Utf16::default())
        .map_err(Refusal::from_error)?;
    Ok(char::decode_utf16(text.units().iter().copied())
        .map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER).len_utf8())
        .sum::<usize>()
        <= 63)
}
fn parse_configuration(value: &Value, ctx: &mut Context<'_>) -> Result<Value, Refusal> {
    let value = crate::value::admit_json(value, ctx).map_err(Refusal::from_error)?;
    let Some(members) = crate::value::object_members(&value) else {
        return Err(Refusal::unsupported(
            "/configuration",
            "Expected exact deployment configuration",
        ));
    };
    let keys = [
        "module",
        "schema",
        "ownerRole",
        "personRole",
        "batchRole",
        "groupRoles",
    ];
    if members.len() != keys.len() || keys.iter().any(|key| member(&value, key).is_none()) {
        return Err(Refusal::unsupported(
            "/configuration",
            "Unknown or missing deployment configuration member",
        ));
    }
    let module = string_member(&value, "module")
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            Refusal::unsupported("/configuration/module", "Expected exact module identity")
        })?;
    let _ = module;
    for key in ["schema", "ownerRole", "personRole", "batchRole"] {
        let text = string_member(&value, key).ok_or_else(|| {
            Refusal::unsupported(
                format!("/configuration/{key}"),
                "Expected a nonempty PostgreSQL identifier of at most63 UTF-8 bytes",
            )
        })?;
        if !valid_native_identifier(text, ctx)? {
            return Err(Refusal::unsupported(
                format!("/configuration/{key}"),
                "Expected a nonempty PostgreSQL identifier of at most63 UTF-8 bytes",
            ));
        }
    }
    let roles = member(&value, "groupRoles").ok_or_else(|| {
        Refusal::unsupported(
            "/configuration/groupRoles",
            "Expected explicit group-role alias map",
        )
    })?;
    let Some(role_members) = crate::value::object_members(roles) else {
        return Err(Refusal::unsupported(
            "/configuration/groupRoles",
            "Expected explicit group-role alias map",
        ));
    };
    if role_members.len() > 256 {
        return Err(Refusal::unsupported(
            "/configuration/groupRoles",
            "Group-role alias inventory exceeds256",
        ));
    }
    let role_members = crate::value::js_object_members(roles, ctx).map_err(Refusal::from_error)?;
    for (alias, role) in &role_members {
        ctx.charge_work(alias.len().saturating_add(40), Utf16::default())
            .map_err(Refusal::from_error)?;
        if alias.is_empty() {
            return Err(Refusal::unsupported(
                "/configuration/groupRoles",
                "Empty group alias",
            ));
        }
        let mut path = Utf16::from("/configuration/groupRoles/").units().to_vec();
        path.extend_from_slice(alias.units());
        let path = Utf16::new(path);
        let Value::String(role) = role else {
            return Err(Refusal::unsupported(
                path,
                "Expected a nonempty PostgreSQL identifier of at most63 UTF-8 bytes",
            ));
        };
        if !valid_native_identifier(role, ctx)? {
            return Err(Refusal::unsupported(
                path,
                "Expected a nonempty PostgreSQL identifier of at most63 UTF-8 bytes",
            ));
        }
    }
    let schema = string_member(&value, "schema").expect("checked above");
    if schema == &Utf16::from("public")
        || schema
            .to_utf8()
            .ok()
            .is_some_and(|s| s.to_ascii_lowercase().starts_with("pg_"))
        || schema == &Utf16::from("information_schema")
    {
        return Err(Refusal::unsupported(
            "/configuration/schema",
            "A dedicated plugin schema is required",
        ));
    }
    ctx.charge_work(role_members.len().saturating_add(3), Utf16::default())
        .map_err(Refusal::from_error)?;
    let mut roles = Vec::with_capacity(role_members.len() + 3);
    for key in ["ownerRole", "personRole", "batchRole"] {
        roles.push(string_member(&value, key).expect("checked above"));
    }
    for (_, role) in &role_members {
        if let Value::String(role) = role {
            roles.push(role);
        }
    }
    let mut principals = BTreeSet::<Vec<u16>>::new();
    for role in &roles {
        ctx.charge_work(role.len().saturating_add(1), Utf16::default())
            .map_err(Refusal::from_error)?;
        if !principals.insert(role.units().to_vec()) {
            return Err(Refusal::unsupported(
                "/configuration",
                "Install, person, batch and configured group roles must be distinct",
            ));
        }
    }
    for role in roles {
        ctx.charge_work(role.len().saturating_add(1), Utf16::default())
            .map_err(Refusal::from_error)?;
        if is_system_role(role) {
            return Err(Refusal::unsupported(
                "/configuration",
                "System roles are not plugin principals",
            ));
        }
    }
    Ok(value)
}

fn build_deployment_bundle(
    document: &Value,
    payload: &Value,
    configuration: &Value,
    module_index: usize,
    format: String,
    source_text: &Utf16,
    source_digest: [u8; 32],
    legacy_comments: bool,
    ctx: &mut Context<'_>,
) -> Result<Value, Refusal> {
    for key in ["schema", "ownerRole", "personRole", "batchRole"] {
        let text = string_member(configuration, key).expect("checked above");
        reserve_policy(text.len(), &Utf16::default(), ctx)?;
        if text.to_utf8().is_err() {
            return Err(Refusal::input_error(EngineError::new(
                "INPUT",
                Utf16::default(),
                "Invalid Unicode",
            )));
        }
    }
    for (_, role) in
        object_members(member(configuration, "groupRoles").unwrap_or(&Value::Null)).unwrap_or(&[])
    {
        if let Value::String(text) = role {
            reserve_policy(text.len(), &Utf16::default(), ctx)?;
            if text.to_utf8().is_err() {
                return Err(Refusal::input_error(EngineError::new(
                    "INPUT",
                    Utf16::default(),
                    "Invalid Unicode",
                )));
            }
        }
    }
    let module = string_member(configuration, "module")
        .unwrap_or(&Utf16::default())
        .to_utf8()
        .map_err(|_| {
            Refusal::input_error(EngineError::new(
                "INPUT",
                Utf16::default(),
                "Invalid Unicode",
            ))
        })?;
    let schema = string_member(configuration, "schema")
        .unwrap()
        .to_utf8()
        .map_err(|_| Refusal::unsupported("/configuration/schema", "Invalid identifier Unicode"))?;
    let person = string_member(configuration, "personRole")
        .unwrap()
        .to_utf8()
        .map_err(|_| {
            Refusal::unsupported("/configuration/personRole", "Invalid identifier Unicode")
        })?;
    let batch = string_member(configuration, "batchRole")
        .unwrap()
        .to_utf8()
        .map_err(|_| {
            Refusal::unsupported("/configuration/batchRole", "Invalid identifier Unicode")
        })?;
    let modules = array_items(member(document, "modules").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let owner_module = modules
        .get(module_index)
        .ok_or_else(|| Refusal::unsupported("/modules", "Configured module is missing"))?;
    if array_items(member(owner_module, "elements").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .any(|e| {
            string_member(e, "kind") == Some(&Utf16::from("record"))
                && object_members(member(e, "extensions").unwrap_or(&Value::Null))
                    .is_some_and(|items| !items.is_empty())
        })
        || object_members(member(owner_module, "extensions").unwrap_or(&Value::Null))
            .is_some_and(|members| members.iter().any(|(k, _)| k != &Utf16::from("umf.tables")))
    {
        return Err(Refusal::unsupported(
            format!("/modules/{module_index}"),
            "Selected module/Record extensions require a qualified combined profile",
        ));
    }
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let path = Utf16::from(format!("/modules/{module_index}/extensions/umf.tables"));
    let mut steps = Vec::<Value>::new();
    let mut expected_columns = Vec::<Value>::new();
    let mut expected_keys = Vec::<Value>::new();
    let mut expected_checks = Vec::<Value>::new();
    let mut expected_fks = Vec::<Value>::new();
    let mut expected_indexes = Vec::<Value>::new();
    let mut key_names: Vec<(String, String, String, Vec<String>, bool)> = Vec::new();
    let mut relation_names: Vec<String> = tables
        .iter()
        .flat_map(|t| {
            std::iter::once(
                string_member(t, "name")
                    .and_then(|v| v.to_utf8().ok())
                    .unwrap_or_default(),
            )
            .chain(
                array_items(member(t, "indexes").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .filter_map(|i| string_member(i, "name").and_then(|v| v.to_utf8().ok())),
            )
        })
        .collect();
    let mut comments = Vec::<Value>::new();
    for (ti, table) in tables.iter().enumerate() {
        ctx.charge_work(1, path.clone())
            .map_err(Refusal::from_error)?;
        let table_id = u8ext(table, "id")
            .ok_or_else(|| Refusal::unsupported(path.clone(), "Table declaration has no ID"))?;
        let table_name = u8ext(table, "name")
            .ok_or_else(|| Refusal::unsupported(path.clone(), "Table declaration has no name"))?;
        if table_name
            .to_ascii_lowercase()
            .starts_with("umf_lifecycle_")
            || array_items(member(table, "indexes").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .any(|x| {
                    u8ext(x, "name")
                        .is_some_and(|n| n.to_ascii_lowercase().starts_with("umf_lifecycle_"))
                })
        {
            return Err(Refusal::unsupported(
                append_path(&append_path(&path, "tables"), &ti.to_string()),
                "Native lifecycle metadata relation/index names are reserved",
            ));
        }
        let table_path = append_path(&append_path(&path, "tables"), &ti.to_string());
        precharge_tree(table, ctx, &table_path).map_err(Refusal::from_error)?;
        let record = resolve_ref(document, member(table, "record").unwrap_or(&Value::Null))
            .ok_or_else(|| {
                Refusal::unsupported(
                    append_path(&table_path, "record"),
                    "Missing original Record",
                )
            })?;
        let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut col_sql = Vec::<String>::new();
        for (ci, column) in columns.iter().enumerate() {
            let col_path = append_path(&append_path(&table_path, "columns"), &ci.to_string());
            let name = u8ext(column, "name")
                .ok_or_else(|| Refusal::unsupported(&col_path, "Missing column name"))?;
            let field_ref = member(column, "field").unwrap_or(&Value::Null);
            let field = resolve_ref(document, field_ref)
                .ok_or_else(|| Refusal::unsupported(&col_path, "Missing original Field"))?;
            if object_members(member(field, "extensions").unwrap_or(&Value::Null))
                .is_some_and(|items| !items.is_empty())
                || !array_items(member(field, "semanticTypes").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .is_empty()
            {
                return Err(Refusal::unsupported(&col_path,"Selected Field extension/semantic type requires a qualified native interpretation"));
            }
            let native = member(column, "nativeType").unwrap_or(&Value::Null);
            let (type_sql, type_name, type_mod) = native_type(native)
                .map_err(|msg| Refusal::unsupported(append_path(&col_path, "nativeType"), msg))?;
            let kind = u8ext(native, "kind").unwrap_or_default();
            if ["char", "float4", "float8", "timestamp"].contains(&kind.as_str()) {
                return Err(Refusal::unsupported(
                    &col_path,
                    "Native padding/float/time codec is not yet qualified",
                ));
            }
            if kind == "numeric"
                && (number_member(native, "precision")
                    != member(field, "facets").and_then(|f| number_member(f, "precision"))
                    || number_member(native, "scale")
                        != member(field, "facets").and_then(|f| number_member(f, "scale")))
            {
                return Err(Refusal::unsupported(
                    &col_path,
                    "Native numeric capacity must equal the declared logical precision/scale",
                ));
            }
            if kind == "bytea" && string_member(field, "scalarType") != Some(&Utf16::from("binary"))
            {
                return Err(Refusal::unsupported(
                    &col_path,
                    "bits128 bytea requires a separately qualified width constraint",
                ));
            }
            let mut definition = format!("{} {}", quote_ident(&name), type_sql);
            if kind == "text" || kind == "varchar" {
                definition.push_str(" COLLATE pg_catalog.\"C\"");
            }
            let nullable = string_member(field, "nullability") != Some(&Utf16::from("required"));
            if !nullable {
                definition.push_str(" NOT NULL");
            }
            if let Some(generated) = member(column, "generated") {
                definition.push_str(
                    if string_member(generated, "generation") == Some(&Utf16::from("always")) {
                        " GENERATED ALWAYS AS IDENTITY"
                    } else {
                        " GENERATED BY DEFAULT AS IDENTITY"
                    },
                );
            }
            if let Some(default) = member(column, "default") {
                let sql = match u8ext(default, "kind").as_deref() {
                    Some("literal") => {
                        literal_sql(member(default, "value").unwrap_or(&Value::Null), ctx)?
                    }
                    Some("randomUuid") => "pg_catalog.gen_random_uuid()".to_string(),
                    Some("currentTimestamp") => "CURRENT_TIMESTAMP".to_string(),
                    _ => {
                        return Err(Refusal::unsupported(
                            append_path(&col_path, "default"),
                            "Unsupported native default",
                        ))
                    }
                };
                definition.push_str(" DEFAULT ");
                definition.push_str(&sql);
            }
            col_sql.push(definition.clone());
            expected_columns.push(object(vec![
                ("table", s(&table_id)),
                ("name", s(&name)),
                ("field", field_ref.clone()),
                ("sourcePath", Value::String(col_path)),
                ("typeSchema", s("pg_catalog")),
                ("typeName", s(&type_name)),
                ("typeMod", Value::Number(type_mod as f64)),
                ("nullable", Value::Bool(nullable)),
                (
                    "collation",
                    if kind == "text" || kind == "varchar" {
                        s("C")
                    } else {
                        Value::Null
                    },
                ),
                (
                    "identity",
                    s(if let Some(g) = member(column, "generated") {
                        if string_member(g, "generation") == Some(&Utf16::from("always")) {
                            "a"
                        } else {
                            "d"
                        }
                    } else {
                        ""
                    }),
                ),
                ("definitionSql", s(&definition)),
            ]));
        }
        let mut constraint_names: Vec<String> = Vec::new();
        for key in array_items(member(record, "keys").unwrap_or(&Value::Null)).unwrap_or(&[]) {
            let id = u8ext(key, "id").unwrap_or_default();
            let key_hash = hex(&canonical_sha256_admitted(
                &Value::Array(vec![s(&table_id), s(&id)]),
                ctx,
            )
            .map_err(Refusal::from_error)?);
            let name = format!("umf_k_{}", &key_hash[..32]);
            if relation_names.iter().any(|n| n == &name)
                || constraint_names.iter().any(|n| n == &name)
            {
                return Err(Refusal::unsupported(
                    table_path.clone(),
                    "Generated Key name collides with an authored native name",
                ));
            }
            relation_names.push(name.clone());
            constraint_names.push(name.clone());
            let mut names = Vec::<String>::new();
            for field in array_items(member(key, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]) {
                names.push(column_name(table, field).ok_or_else(|| {
                    Refusal::unsupported(&table_path, "Missing exact column mapping")
                })?);
            }
            let definition = format!(
                "CONSTRAINT {} {} ({})",
                quote_ident(&name),
                if member(key, "primary") == Some(&Value::Bool(true)) {
                    "PRIMARY KEY"
                } else {
                    "UNIQUE"
                },
                names
                    .iter()
                    .map(|n| quote_ident(n))
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            col_sql.push(definition.clone());
            key_names.push((
                table_id.clone(),
                id.clone(),
                name.clone(),
                names.clone(),
                member(key, "primary") == Some(&Value::Bool(true)),
            ));
            expected_keys.push(object(vec![
                ("table", s(&table_id)),
                ("id", s(&id)),
                ("name", s(&name)),
                (
                    "primary",
                    Value::Bool(member(key, "primary") == Some(&Value::Bool(true))),
                ),
                ("columns", Value::Array(names.iter().map(s).collect())),
                ("definitionSql", s(&definition)),
            ]));
        }
        for (ci, column) in columns.iter().enumerate() {
            let field = resolve_ref(document, member(column, "field").unwrap_or(&Value::Null))
                .unwrap_or(&Value::Null);
            let predicates = domain_predicates(column, field, ctx)?;
            if !predicates.is_empty() {
                let field_ref = member(column, "field").cloned().unwrap_or(Value::Null);
                let name_hash = hash_value(
                    &Value::Array(vec![s(&table_id), field_ref.clone(), s("finite-domain")]),
                    ctx,
                )
                .map_err(Refusal::from_error)?;
                let name = format!("umf_d_{}", &name_hash[..32]);
                if constraint_names.iter().any(|n| n == &name) {
                    return Err(Refusal::unsupported(
                        &table_path,
                        "Generated domain constraint name collision",
                    ));
                }
                constraint_names.push(name.clone());
                let predicate = predicates.join(" AND ");
                let definition = format!("CONSTRAINT {} CHECK ({predicate})", quote_ident(&name));
                col_sql.push(definition.clone());
                let field_module = u8ext(&field_ref, "module").unwrap_or_default();
                let field_element = u8ext(&field_ref, "element").unwrap_or_default();
                expected_checks.push(object(vec![
                    ("table", s(&table_id)),
                    ("id", s(&format!("domain:{field_module}.{field_element}"))),
                    ("name", s(&name)),
                    ("definitionSql", s(&definition)),
                ]));
            }
            let _ = ci;
        }
        for (ci, check) in array_items(member(table, "checks").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let check_path = append_path(&append_path(&table_path, "checks"), &ci.to_string());
            let id = u8ext(check, "id").unwrap_or_default();
            let name = u8ext(check, "name").unwrap_or_default();
            let expression = expression_sql(
                member(check, "expression").unwrap_or(&Value::Null),
                table,
                ctx,
            )?;
            let definition = format!("CONSTRAINT {} CHECK ({expression})", quote_ident(&name));
            col_sql.push(definition.clone());
            expected_checks.push(object(vec![
                ("table", s(&table_id)),
                ("id", s(&id)),
                ("name", s(&name)),
                ("definitionSql", s(&definition)),
            ]));
            let _ = check_path;
        }
        let relation = format!("{}.{}", quote_ident(&schema), quote_ident(&table_name));
        let create = format!("CREATE TABLE {relation} (\n  {}\n)", col_sql.join(",\n  "));
        add_step(&mut steps, "table", &table_path, &create, ctx)?;
        add_step(
            &mut steps,
            "table",
            &table_path,
            &format!("ALTER TABLE {relation} ENABLE ROW LEVEL SECURITY"),
            ctx,
        )?;
        add_step(
            &mut steps,
            "table",
            &table_path,
            &format!("ALTER TABLE {relation} FORCE ROW LEVEL SECURITY"),
            ctx,
        )?;
        let _ = record;
    }
    // Foreign keys are emitted after all table/key declarations exist.
    for (ti, table) in tables.iter().enumerate() {
        let table_id = u8ext(table, "id").unwrap_or_default();
        let table_name = u8ext(table, "name").unwrap_or_default();
        let relation = format!("{}.{}", quote_ident(&schema), quote_ident(&table_name));
        let table_path = append_path(&append_path(&path, "tables"), &ti.to_string());
        for (fi, fk) in array_items(member(table, "foreignKeys").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let fk_path = append_path(&append_path(&table_path, "foreignKeys"), &fi.to_string());
            let id = u8ext(fk, "id").unwrap_or_default();
            let name = u8ext(fk, "name").unwrap_or_default();
            let target_ref = member(member(fk, "target").unwrap_or(&Value::Null), "record")
                .unwrap_or(&Value::Null);
            let target = table_for_record(payload, target_ref).ok_or_else(|| {
                Refusal::unsupported(
                    append_path(&fk_path, "target"),
                    "External/missing native table dependency",
                )
            })?;
            let target_id = u8ext(target, "id").unwrap_or_default();
            let target_name = u8ext(target, "name").unwrap_or_default();
            let target_key_id =
                u8ext(member(fk, "target").unwrap_or(&Value::Null), "key").unwrap_or_default();
            let key = key_names
                .iter()
                .find(|k| k.0 == target_id && k.1 == target_key_id)
                .ok_or_else(|| {
                    Refusal::unsupported(
                        append_path(&fk_path, "target"),
                        "Foreign Key target has no deployed exact Key",
                    )
                })?;
            let fields = array_items(member(fk, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let mut src = Vec::new();
            for r in fields {
                src.push(quote_ident(&column_name(table, r).ok_or_else(|| {
                    Refusal::unsupported(&fk_path, "Missing exact column mapping")
                })?));
            }
            let on_delete = action_name(fk, "onDelete")?;
            let on_update = action_name(fk, "onUpdate")?;
            let deferrable = match member(fk, "deferrable") {
                Some(Value::Bool(false)) => "NOT DEFERRABLE",
                Some(Value::Bool(true)) => "DEFERRABLE INITIALLY DEFERRED",
                Some(Value::String(x)) if x == &Utf16::from("immediate") => {
                    "DEFERRABLE INITIALLY IMMEDIATE"
                }
                _ => "DEFERRABLE INITIALLY DEFERRED",
            };
            let def = format!(
                "CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {}.{} ({}) ON UPDATE {} ON DELETE {} {}",
                quote_ident(&name),
                src.join(", "),
                quote_ident(&schema),
                quote_ident(&target_name),
                key.3
                    .iter()
                    .map(|n| quote_ident(n))
                    .collect::<Vec<_>>()
                    .join(", "),
                on_update,
                on_delete,
                deferrable
            );
            expected_fks.push(object(vec![
                ("table", s(&table_id)),
                ("id", s(&id)),
                ("name", s(&name)),
                ("targetKey", s(&key.2)),
                ("definitionSql", s(&def)),
            ]));
            add_step(
                &mut steps,
                "foreignKey",
                &fk_path,
                &format!("ALTER TABLE {relation} ADD {def}"),
                ctx,
            )?;
        }
        for (ii, index) in array_items(member(table, "indexes").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let ip = append_path(&append_path(&table_path, "indexes"), &ii.to_string());
            let id = u8ext(index, "id").unwrap_or_default();
            let name = u8ext(index, "name").unwrap_or_default();
            let mut fields = Vec::new();
            for r in array_items(member(index, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]) {
                fields.push(quote_ident(&column_name(table, r).ok_or_else(|| {
                    Refusal::unsupported(&ip, "Missing exact column mapping")
                })?));
            }
            let mut included = Vec::new();
            for r in array_items(member(index, "include").unwrap_or(&Value::Null)).unwrap_or(&[]) {
                included.push(quote_ident(&column_name(table, r).ok_or_else(|| {
                    Refusal::unsupported(&ip, "Missing exact column mapping")
                })?));
            }
            let definition = format!(
                "USING btree ({}){}",
                fields.join(", "),
                if included.is_empty() {
                    String::new()
                } else {
                    format!(" INCLUDE ({})", included.join(", "))
                }
            );
            let unique = member(index, "unique") == Some(&Value::Bool(true));
            expected_indexes.push(object(vec![
                ("table", s(&table_id)),
                ("id", s(&id)),
                ("name", s(&name)),
                ("unique", Value::Bool(unique)),
                ("definitionSql", s(&definition)),
            ]));
            add_step(
                &mut steps,
                "index",
                &ip,
                &format!(
                    "CREATE {}INDEX {} ON {relation} {definition}",
                    if unique { "UNIQUE " } else { "" },
                    quote_ident(&name)
                ),
                ctx,
            )?;
        }
        emit_table_policies(
            document,
            payload,
            configuration,
            table,
            &table_path,
            &relation,
            &mut steps,
            ctx,
        )?;
    }
    let module_elem = modules.get(module_index).unwrap_or(&Value::Null);
    for (ti, table) in tables.iter().enumerate() {
        let table_path = append_path(&append_path(&path, "tables"), &ti.to_string());
        let relation = format!(
            "{}.{}",
            quote_ident(&schema),
            quote_ident(&u8ext(table, "name").unwrap_or_default())
        );
        let record = resolve_ref(document, member(table, "record").unwrap_or(&Value::Null))
            .unwrap_or(&Value::Null);
        if let Some(description) = string_member(record, "description") {
            let text = description
                .to_utf8()
                .map_err(|_| Refusal::unsupported(&table_path, "Invalid comment Unicode"))?;
            comments.push(object(vec![
                ("table", s(u8ext(table, "id").unwrap_or_default())),
                ("text", s(&text)),
            ]));
            add_step(
                &mut steps,
                "comment",
                &append_path(&table_path, "comments"),
                &format!("COMMENT ON TABLE {relation} IS {}", quote_text(&text)?),
                ctx,
            )?;
        }
        for (ci, column) in array_items(member(table, "columns").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let field = resolve_ref(document, member(column, "field").unwrap_or(&Value::Null))
                .unwrap_or(&Value::Null);
            if let Some(description) = string_member(field, "description") {
                let text = description
                    .to_utf8()
                    .map_err(|_| Refusal::unsupported(&table_path, "Invalid comment Unicode"))?;
                let cname = u8ext(column, "name").unwrap_or_default();
                comments.push(object(vec![
                    ("table", s(u8ext(table, "id").unwrap_or_default())),
                    ("column", s(&cname)),
                    ("text", s(&text)),
                ]));
                add_step(
                    &mut steps,
                    "comment",
                    &append_path(&append_path(&table_path, "comments"), &ci.to_string()),
                    &format!(
                        "COMMENT ON COLUMN {relation}.{} IS {}",
                        quote_ident(&cname),
                        quote_text(&text)?
                    ),
                    ctx,
                )?;
            }
        }
    }
    if legacy_comments {
        steps.retain(|step| string_member(step, "kind") != Some(&Utf16::from("comment")));
        comments.clear();
        for (index, step) in steps.iter_mut().enumerate() {
            if let Value::Object(fields) = step {
                if let Some((_, id)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from("id")) {
                    *id = s(&format!("step-{:05}", index + 1));
                }
            }
        }
    }
    add_step(
        &mut steps,
        "grant",
        &path,
        &format!(
            "GRANT USAGE ON SCHEMA {} TO {}, {}",
            quote_ident(&schema),
            quote_ident(&person),
            quote_ident(&batch)
        ),
        ctx,
    )?;
    let canonicalization = s("RFC8785");
    let version = if comments.is_empty() {
        "umf.table-deployment/0.1"
    } else {
        "umf.table-deployment/0.2"
    };
    let config_digest = hash_value(configuration, ctx).map_err(Refusal::from_error)?;
    let expected_catalog = object(vec![
        (
            "tables",
            Value::Array(
                array_items(member(payload, "tables").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .map(|table| crate::value::admit_json(table, ctx).map_err(Refusal::from_error))
                    .collect::<Result<Vec<_>, _>>()?,
            ),
        ),
        ("columns", Value::Array(expected_columns)),
        ("keys", Value::Array(expected_keys)),
        ("checks", Value::Array(expected_checks)),
        ("foreignKeys", Value::Array(expected_fks)),
        ("indexes", Value::Array(expected_indexes)),
    ]);
    let mut body = vec![
        ("version", s(version)),
        ("canonicalization", canonicalization),
        (
            "source",
            object(vec![
                ("format", s(&format)),
                ("utf8", Value::String(source_text.clone())),
            ]),
        ),
        ("sourceDigest", s(hex(&source_digest))),
        ("configuration", configuration.clone()),
        ("configurationDigest", s(config_digest)),
        ("module", s(&module)),
        (
            "profile",
            member(payload, "profile").cloned().unwrap_or(Value::Null),
        ),
        ("steps", Value::Array(steps)),
        ("expectedCatalog", expected_catalog),
        (
            "seedSets",
            member(payload, "seedSets")
                .cloned()
                .unwrap_or(Value::Array(vec![])),
        ),
        ("nativeQualified", Value::Bool(false)),
    ];
    if !comments.is_empty() {
        if let Value::Object(ref mut catalog) = body[9].1 {
            catalog.push((Utf16::from("comments"), Value::Array(comments)));
        }
    }
    let body_value = Value::Object(
        body.into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    );
    let canonical = canonical_json_admitted(&body_value, ctx).map_err(Refusal::from_error)?;
    if canonical.len() > 16_000_000 {
        return Err(Refusal::unsupported("", "Deployment bundle exceeds16MB"));
    }
    let digest = hash_value(&body_value, ctx).map_err(Refusal::from_error)?;
    let mut full = match body_value {
        Value::Object(m) => m,
        _ => unreachable!(),
    };
    full.push((Utf16::from("bundleDigest"), s(digest)));
    let _ = module_elem;
    Ok(Value::Object(full))
}

fn add_step(
    steps: &mut Vec<Value>,
    kind: &str,
    path: &Utf16,
    sql: &str,
    ctx: &mut Context<'_>,
) -> Result<(), Refusal> {
    ctx.charge_work(
        sql.len()
            .saturating_add(path.len())
            .saturating_add(kind.len()),
        path.clone(),
    )
    .map_err(Refusal::from_error)?;
    if steps.len() >= 8192 || sql.len() > 1_000_000 {
        return Err(Refusal::unsupported(
            path,
            "Deployment step/statement bound exceeded",
        ));
    }
    let id = format!("step-{:05}", steps.len() + 1);
    steps.push(object(vec![
        ("id", s(&id)),
        ("kind", s(kind)),
        ("sourcePath", Value::String(path.clone())),
        ("transaction", s("required")),
        ("sql", s(sql)),
    ]));
    Ok(())
}

fn precharge_tree(value: &Value, ctx: &mut Context<'_>, path: &Utf16) -> Result<(), EngineError> {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) => ctx.charge_work(1, path.clone()),
        Value::String(text) => ctx.charge_work(1usize.saturating_add(text.len()), path.clone()),
        Value::Array(items) => {
            ctx.charge_work(1usize.saturating_add(items.len()), path.clone())?;
            for (index, item) in items.iter().enumerate() {
                precharge_tree(item, ctx, &append_path(path, &index.to_string()))?;
            }
            Ok(())
        }
        Value::Object(members) => {
            ctx.charge_work(1usize.saturating_add(members.len()), path.clone())?;
            for (key, item) in members {
                ctx.charge_work(key.len(), path.clone())?;
                precharge_tree(item, ctx, &append_path(path, &pointer_escape(key)))?;
            }
            Ok(())
        }
    }
}
fn pointer_escape(text: &Utf16) -> String {
    text.to_utf8()
        .unwrap_or_default()
        .replace('~', "~0")
        .replace('/', "~1")
}
fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}
fn quote_text(s: &str) -> Result<String, Refusal> {
    if s.contains('\0') {
        return Err(Refusal::unsupported(
            "",
            "PostgreSQL string cannot contain NUL",
        ));
    }
    Ok(format!(
        "E'{}'",
        s.replace('\\', "\\\\").replace('\'', "''")
    ))
}
fn u8ext(value: &Value, key: &str) -> Option<String> {
    string_member(value, key)?.to_utf8().ok()
}
fn column_name(table: &Value, field: &Value) -> Option<String> {
    array_items(member(table, "columns")?)?
        .iter()
        .find(|c| member(c, "field").is_some_and(|r| refs_equal(r, field)))
        .and_then(|c| u8ext(c, "name"))
}
fn hex(bytes: &[u8]) -> String {
    const H: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char);
    }
    s
}
fn hash_value(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    Ok(hex(&canonical_sha256_admitted(value, ctx)?))
}
fn native_type(value: &Value) -> Result<(String, String, i32), String> {
    let kind = u8ext(value, "kind").unwrap_or_default();
    let name = match kind.as_str() {
        "boolean" => "bool",
        "text" => "text",
        "varchar" => "varchar",
        "char" => "bpchar",
        "int2" => "int2",
        "int4" => "int4",
        "int8" => "int8",
        "float4" => "float4",
        "float8" => "float8",
        "numeric" => "numeric",
        "date" => "date",
        "timestamp" => "timestamp",
        "timestamptz" => "timestamptz",
        "uuid" => "uuid",
        "bytea" => "bytea",
        _ => return Err("Unknown native type".into()),
    };
    let tm = match kind.as_str() {
        "varchar" | "char" => number_member(value, "length").unwrap_or(0.0) as i32 + 4,
        "numeric" => {
            ((number_member(value, "precision").unwrap_or(0.0) as i32) << 16)
                + number_member(value, "scale").unwrap_or(0.0) as i32
                + 4
        }
        _ => -1,
    };
    let sql = match kind.as_str() {
        "varchar" | "char" => format!(
            "pg_catalog.{}({})",
            quote_ident(name),
            number_member(value, "length").unwrap_or(0.0) as usize
        ),
        "numeric" => format!(
            "pg_catalog.{}({},{})",
            quote_ident(name),
            number_member(value, "precision").unwrap_or(0.0) as usize,
            number_member(value, "scale").unwrap_or(0.0) as usize
        ),
        _ => format!("pg_catalog.{}", quote_ident(name)),
    };
    Ok((sql, name.to_string(), tm))
}

/// Shared native SQL type mapping for migration compilation. The caller must
/// charge for its authored input before invoking this bounded enum mapper.
pub(crate) fn native_type_sql(value: &Value) -> Result<String, String> {
    native_type(value).map(|(sql, _, _)| sql)
}

fn literal_sql(value: &Value, ctx: &mut Context<'_>) -> Result<String, Refusal> {
    precharge_tree(value, ctx, &Utf16::default()).map_err(Refusal::from_error)?;
    if value == &Value::Null {
        return Ok("NULL".into());
    }
    if let Value::Bool(b) = value {
        return Ok(if *b { "TRUE" } else { "FALSE" }.into());
    }
    if let Some(b) = member(value, "boolean").and_then(|v| match v {
        Value::Bool(b) => Some(*b),
        _ => None,
    }) {
        return Ok(if b { "TRUE" } else { "FALSE" }.into());
    }
    for key in [
        "string",
        "integerToken",
        "decimalToken",
        "uuid",
        "date",
        "timestamp",
        "binaryHex",
        "bits128Hex",
    ] {
        if let Some(text) = string_member(value, key) {
            reserve_policy(
                text.len().saturating_mul(12).saturating_add(128),
                &Utf16::default(),
                ctx,
            )?;
        }
    }
    if let Some(v) = u8ext(value, "string") {
        return Ok(format!(
            "({}::pg_catalog.text COLLATE pg_catalog.\"C\")",
            quote_text(&v)?
        ));
    }
    if let Some(v) = u8ext(value, "integerToken").or_else(|| u8ext(value, "decimalToken")) {
        let normalized = normalize_numeric_token(&v)
            .ok_or_else(|| Refusal::unsupported("", "Exact numeric literal required"))?;
        return Ok(format!("{}::pg_catalog.numeric", quote_text(&normalized)?));
    }
    if let Some(v) = u8ext(value, "uuid") {
        return Ok(format!("{}::pg_catalog.uuid", quote_text(&v)?));
    }
    if let Some(v) = u8ext(value, "date") {
        validate_native_date(&v).map_err(|message| Refusal::unsupported("", message))?;
        return Ok(format!("{}::pg_catalog.date", quote_text(&v)?));
    }
    if let Some(v) = u8ext(value, "timestamp") {
        let normalized = native_instant(&v).map_err(|message| Refusal::unsupported("", message))?;
        return Ok(format!(
            "{}::pg_catalog.timestamptz",
            quote_text(&normalized)?
        ));
    }
    if let Some(v) = u8ext(value, "binaryHex").or_else(|| u8ext(value, "bits128Hex")) {
        return Ok(format!("pg_catalog.decode({},'hex')", quote_text(&v)?));
    }
    Err(Refusal::unsupported(
        "",
        "Literal carrier is not qualified for deployment expressions",
    ))
}

/// Reuse deployment literal admission/emission in migration plans without
/// duplicating the accepted carrier set or SQL escaping. Control failures keep
/// their original origin; semantic failures are projected only at this shared
/// helper boundary for the migration caller.
pub(crate) fn literal_sql_for_migration(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    match literal_sql(value, ctx) {
        Ok(sql) => Ok(sql),
        Err(Refusal::Terminal(error)) => Err(error),
        Err(Refusal::Semantic {
            code,
            path,
            message,
        }) => Err(EngineError::new(code, path, message)),
        Err(Refusal::Diagnostics(_)) => Err(EngineError::new(
            "TABLE_DEPLOYMENT_UNSUPPORTED",
            Utf16::default(),
            "Literal carrier is not qualified for deployment expressions",
        )),
    }
}

fn normalize_numeric_token(token: &str) -> Option<String> {
    let (sign, unsigned) = if let Some(rest) = token.strip_prefix('-') {
        ("-", rest)
    } else if let Some(rest) = token.strip_prefix('+') {
        ("", rest)
    } else {
        ("", token)
    };
    let (mantissa, exponent_text) = unsigned
        .split_once(['e', 'E'])
        .map_or((unsigned, "0"), |(m, e)| (m, e));
    let (integer, fraction) = mantissa
        .split_once('.')
        .map_or((mantissa, ""), |(a, b)| (a, b));
    if integer.is_empty()
        || !integer.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || (integer.len() > 1 && integer.starts_with('0'))
        || token.matches('.').count() > 1
    {
        return None;
    }
    let mut digits = format!("{integer}{fraction}");
    let first = digits
        .bytes()
        .position(|b| b != b'0')
        .unwrap_or(digits.len());
    if first == digits.len() {
        return Some("0".into());
    }
    let exponent: i64 = exponent_text.parse().ok()?;
    digits.drain(..first);
    let trimmed_len = digits.trim_end_matches('0').len();
    let removed = digits.len() - trimmed_len;
    digits.truncate(trimmed_len);
    let normalized_exp = exponent
        .checked_sub(fraction.len() as i64)?
        .checked_add(removed as i64)?;
    if (digits.len() as i64).checked_add(normalized_exp)? > 131_072 || normalized_exp < -16_383 {
        return None;
    }
    Some(if normalized_exp == 0 {
        format!("{sign}{digits}")
    } else {
        format!("{sign}{digits}e{normalized_exp}")
    })
}

pub(crate) fn native_instant(text: &str) -> Result<String, &'static str> {
    if text.len() > 128 {
        return Err("Explicit bounded ISO instant required");
    }
    let (date, tail) = text
        .split_once('T')
        .ok_or("Explicit bounded ISO instant required")?;
    validate_native_date(date)?;
    let zone_at = tail
        .rfind(['Z', '+', '-'])
        .ok_or("Explicit bounded ISO instant required")?;
    let (clock, zone) = (&tail[..zone_at], &tail[zone_at..]);
    if zone != "Z"
        && (zone.len() != 6
            || !matches!(zone.as_bytes()[0], b'+' | b'-')
            || zone.as_bytes()[3] != b':'
            || !zone[1..3].bytes().all(|b| b.is_ascii_digit())
            || !zone[4..].bytes().all(|b| b.is_ascii_digit()))
    {
        return Err("Unknown or invalid instant offset");
    }
    let (hms, fraction) = clock.split_once('.').map_or((clock, ""), |(a, b)| (a, b));
    let parts = hms.split(':').collect::<Vec<_>>();
    if parts.len() != 3
        || parts
            .iter()
            .any(|x| x.len() != 2 || !x.bytes().all(|b| b.is_ascii_digit()))
        || (!fraction.is_empty() && !fraction.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err("Explicit bounded ISO instant required");
    }
    let h: u32 = parts[0]
        .parse()
        .map_err(|_| "Explicit bounded ISO instant required")?;
    let m: u32 = parts[1]
        .parse()
        .map_err(|_| "Explicit bounded ISO instant required")?;
    let s: u32 = parts[2]
        .parse()
        .map_err(|_| "Explicit bounded ISO instant required")?;
    if h > 23
        || m > 59
        || s > 59
        || (fraction.len() > 6 && fraction.as_bytes()[6..].iter().any(|b| *b != b'0'))
    {
        return Err("Instant would round or exceed native clock profile");
    }
    let mut y: u32 = date[..4].parse().map_err(|_| "Finite ISO date required")?;
    let mut month: u32 = date[5..7].parse().map_err(|_| "Finite ISO date required")?;
    let mut day: u32 = date[8..10]
        .parse()
        .map_err(|_| "Finite ISO date required")?;
    let offset = if zone == "Z" {
        0i32
    } else {
        let zh: u32 = zone[1..3]
            .parse()
            .map_err(|_| "Unknown or invalid instant offset")?;
        let zm: u32 = zone[4..6]
            .parse()
            .map_err(|_| "Unknown or invalid instant offset")?;
        if zh > 23 || zm > 59 || zone == "-00:00" {
            return Err("Unknown or invalid instant offset");
        }
        let n = (zh * 3600 + zm * 60) as i32;
        if zone.starts_with('-') {
            -n
        } else {
            n
        }
    };
    let mut seconds = h as i32 * 3600 + m as i32 * 60 + s as i32 - offset;
    if seconds < 0 {
        seconds += 86400;
        day -= 1;
        if day == 0 {
            month -= 1;
            if month == 0 {
                y -= 1;
                month = 12;
            }
            day = days_in_month(y, month);
        }
    } else if seconds >= 86400 {
        seconds -= 86400;
        day += 1;
        if day > days_in_month(y, month) {
            day = 1;
            month += 1;
            if month == 13 {
                y += 1;
                month = 1;
            }
        }
    }
    if !(1..=9999).contains(&y) {
        return Err("UTC instant outside finite native year profile");
    }
    let fraction = format!("{fraction:0<6}");
    Ok(format!(
        "{y:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{fraction}Z",
        seconds / 3600,
        seconds % 3600 / 60,
        seconds % 60
    ))
}
fn days_in_month(y: u32, m: u32) -> u32 {
    match m {
        2 => {
            if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}
pub(crate) fn validate_native_date(value: &str) -> Result<(), &'static str> {
    if value.len() != 10
        || value.as_bytes()[4] != b'-'
        || value.as_bytes()[7] != b'-'
        || !value[..4].bytes().all(|b| b.is_ascii_digit())
        || !value[5..7].bytes().all(|b| b.is_ascii_digit())
        || !value[8..].bytes().all(|b| b.is_ascii_digit())
    {
        return Err("Finite ISO date required");
    }
    let y: u32 = value[..4].parse().map_err(|_| "Finite ISO date required")?;
    let m: u32 = value[5..7]
        .parse()
        .map_err(|_| "Finite ISO date required")?;
    let d: u32 = value[8..].parse().map_err(|_| "Finite ISO date required")?;
    if !(1..=9999).contains(&y) || !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return Err("Gregorian date outside finite native year profile");
    }
    Ok(())
}

fn domain_predicates(
    column: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<String>, Refusal> {
    let path = Utf16::default();
    precharge_tree(field, ctx, &path).map_err(Refusal::from_error)?;
    let name = u8ext(column, "name").unwrap_or_default();
    let quoted = quote_ident(&name);
    let kind =
        u8ext(member(column, "nativeType").unwrap_or(&Value::Null), "kind").unwrap_or_default();
    let scalar = u8ext(field, "scalarType").unwrap_or_default();
    let facets = member(field, "facets").unwrap_or(&Value::Null);
    let mut out = Vec::new();
    if kind == "numeric" {
        out.push(format!("{quoted} NOT IN ('NaN'::pg_catalog.numeric, 'Infinity'::pg_catalog.numeric, '-Infinity'::pg_catalog.numeric)"));
    }
    if kind == "date" {
        out.push(format!("{quoted} >= '0001-01-01'::pg_catalog.date AND {quoted} <= '9999-12-31'::pg_catalog.date"));
    }
    if kind == "timestamptz" {
        out.push(format!("{quoted} >= '0001-01-01T00:00:00Z'::pg_catalog.timestamptz AND {quoted} <= '9999-12-31T23:59:59.999999Z'::pg_catalog.timestamptz"));
    }
    if let Some(members) = object_members(facets) {
        for (key, _) in members {
            let key = key
                .to_utf8()
                .map_err(|_| Refusal::unsupported(&path, "Invalid facet key Unicode"))?;
            if !["precision", "scale", "integerWidth", "range", "length"].contains(&key.as_str()) {
                return Err(Refusal::unsupported(
                    &path,
                    "Logical facet requires a qualified native constraint",
                ));
            }
        }
    }
    if let Some(length) = member(facets, "length") {
        if !["string", "binary"].contains(&scalar.as_str())
            || u8ext(length, "unit").as_deref()
                != Some(if scalar == "string" {
                    "unicode-scalar"
                } else {
                    "byte"
                })
        {
            return Err(Refusal::unsupported(
                &path,
                "Native length unit differs from logical domain",
            ));
        }
        let func = if scalar == "string" {
            "char_length"
        } else {
            "octet_length"
        };
        for (key, op) in [("min", ">="), ("max", "<=")] {
            if let Some(n) = member(length, key).and_then(value_number_text) {
                out.push(format!("pg_catalog.{func}({quoted}) {op} {n}"));
            }
        }
    }
    if let Some(width) = member(facets, "integerWidth") {
        let bits = number_member(width, "bits").unwrap_or(0.0) as u32;
        let signed = member(width, "signed") == Some(&Value::Bool(true));
        if scalar != "integer" || bits == 0 || bits > 64 {
            return Err(Refusal::unsupported(
                &path,
                "Native integer width requires integer storage",
            ));
        }
        let native_bits = match kind.as_str() {
            "int2" => 16,
            "int4" => 32,
            _ => 64,
        };
        if bits < native_bits {
            let (lo, hi) = if signed {
                (-(1_i128 << (bits - 1)), (1_i128 << (bits - 1)) - 1)
            } else {
                (0, (1_i128 << bits) - 1)
            };
            out.push(format!("{quoted} >= {lo} AND {quoted} <= {hi}"));
        } else if !signed {
            out.push(format!("{quoted} >= 0"));
        }
    }
    if let Some(range) = member(facets, "range") {
        if !["integer", "decimal"].contains(&scalar.as_str()) {
            return Err(Refusal::unsupported(
                &path,
                "Native range requires exact numeric storage",
            ));
        }
        for (key, inclusive_key, default, op) in [
            ("min", "minInclusive", true, ">="),
            ("max", "maxInclusive", true, "<="),
        ] {
            if let Some(value) = member(range, key) {
                let literal = literal_sql(value, ctx).map_err(|error| match error {
                    Refusal::Terminal(error) => Refusal::Terminal(error),
                    _ => Refusal::unsupported(
                        &path,
                        "Literal carrier is not qualified for deployment expressions",
                    ),
                })?;
                let inclusive = member(range, inclusive_key) != Some(&Value::Bool(false));
                let op = if inclusive == default {
                    op
                } else if op == ">=" {
                    ">"
                } else {
                    "<"
                };
                out.push(format!("{quoted} {op} {literal}"));
            }
        }
    }
    if let Some(values) = array_items(member(field, "allowedValues").unwrap_or(&Value::Null)) {
        if !values.is_empty() {
            if !["string", "boolean", "integer", "decimal"].contains(&scalar.as_str()) {
                return Err(Refusal::unsupported(
                    &path,
                    "Native enumeration carrier is not qualified",
                ));
            }
            let non_null = values
                .iter()
                .filter(|v| *v != &Value::Null)
                .map(|value| literal_sql(value, ctx))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| match error {
                    Refusal::Terminal(error) => Refusal::Terminal(error),
                    _ => Refusal::unsupported(
                        &path,
                        "Literal carrier is not qualified for deployment expressions",
                    ),
                })?;
            out.push(if non_null.is_empty() {
                format!("{quoted} IS NULL")
            } else {
                format!("{quoted} IN ({})", non_null.join(", "))
            });
        }
    }
    Ok(out)
}

fn value_number_text(value: &Value) -> Option<String> {
    match value {
        Value::Number(n) => Some(if n.fract() == 0.0 {
            format!("{n:.0}")
        } else {
            n.to_string()
        }),
        _ => None,
    }
}

fn expression_sql(expr: &Value, table: &Value, ctx: &mut Context<'_>) -> Result<String, Refusal> {
    precharge_tree(expr, ctx, &Utf16::default()).map_err(Refusal::from_error)?;
    let op = u8ext(expr, "op").unwrap_or_default();
    let mut render = |v: &Value| expression_sql(v, table, ctx);
    match op.as_str() {
        "field" => Ok(quote_ident(
            &column_name(table, member(expr, "field").unwrap_or(&Value::Null))
                .ok_or_else(|| Refusal::unsupported("", "Missing exact column mapping"))?,
        )),
        "literal" => literal_sql(member(expr, "value").unwrap_or(&Value::Null), ctx),
        "and" | "or" => {
            let items = array_items(member(expr, "args").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let xs = items.iter().map(render).collect::<Result<Vec<_>, _>>()?;
            reserve_policy(
                xs.iter()
                    .fold(16usize, |sum, text| {
                        sum.saturating_add(text.len()).saturating_add(5)
                    })
                    .saturating_mul(2),
                &Utf16::default(),
                ctx,
            )?;
            Ok(format!(
                "({})",
                xs.join(if op == "and" { " AND " } else { " OR " })
            ))
        }
        "not" | "isNull" => {
            let arg = render(member(expr, "arg").unwrap_or(&Value::Null))?;
            reserve_policy(arg.len().saturating_add(32), &Utf16::default(), ctx)?;
            Ok(if op == "not" {
                format!("(NOT {arg})")
            } else {
                format!("({arg} IS NULL)")
            })
        }
        "in" => {
            let arg = render(member(expr, "arg").unwrap_or(&Value::Null))?;
            let vals = array_items(member(expr, "values").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .map(|value| literal_sql(value, ctx))
                .collect::<Result<Vec<_>, _>>()?;
            reserve_policy(
                vals.iter()
                    .fold(arg.len().saturating_add(16), |sum, text| {
                        sum.saturating_add(text.len()).saturating_add(2)
                    })
                    .saturating_mul(2),
                &Utf16::default(),
                ctx,
            )?;
            Ok(format!("({arg} IN ({}))", vals.join(", ")))
        }
        "eq" | "ne" | "lt" | "le" | "gt" | "ge" => {
            let symbol = match op.as_str() {
                "eq" => "=",
                "ne" => "<>",
                "lt" => "<",
                "le" => "<=",
                "gt" => ">",
                _ => ">=",
            };
            let left = render(member(expr, "left").unwrap_or(&Value::Null))?;
            let right = render(member(expr, "right").unwrap_or(&Value::Null))?;
            reserve_policy(
                left.len().saturating_add(right.len()).saturating_add(32),
                &Utf16::default(),
                ctx,
            )?;
            Ok(format!("({left} {symbol} {right})"))
        }
        _ => Err(Refusal::unsupported("", "Unknown check expression")),
    }
}
fn action_name(fk: &Value, key: &str) -> Result<&'static str, Refusal> {
    match u8ext(fk, key).as_deref() {
        Some("restrict") => Ok("RESTRICT"),
        Some("noAction") => Ok("NO ACTION"),
        Some("cascade") => Ok("CASCADE"),
        Some("setNull") => Ok("SET NULL"),
        _ => Err(Refusal::unsupported("", "Unknown foreign-key action")),
    }
}
fn append_path(path: &Utf16, component: &str) -> Utf16 {
    Utf16::from(format!(
        "{}/{}",
        path.to_utf8().unwrap_or_default(),
        component
    ))
}
fn number_member(value: &Value, key: &str) -> Option<f64> {
    match member(value, key)? {
        Value::Number(n) => Some(*n),
        _ => None,
    }
}
fn refs_equal(a: &Value, b: &Value) -> bool {
    string_member(a, "module") == string_member(b, "module")
        && string_member(a, "element") == string_member(b, "element")
}
fn resolve_ref<'a>(document: &'a Value, reference: &Value) -> Option<&'a Value> {
    let module = string_member(reference, "module")?;
    let element = string_member(reference, "element")?;
    array_items(member(document, "modules")?)?
        .iter()
        .find(|m| string_member(m, "id") == Some(module))
        .and_then(|m| {
            array_items(member(m, "elements")?)?
                .iter()
                .find(|e| string_member(e, "id") == Some(element))
        })
}
fn table_for_record<'a>(payload: &'a Value, record: &Value) -> Option<&'a Value> {
    array_items(member(payload, "tables")?)?
        .iter()
        .find(|t| member(t, "record").is_some_and(|r| refs_equal(r, record)))
}
fn emit_table_policies(
    document: &Value,
    payload: &Value,
    configuration: &Value,
    table: &Value,
    path: &Utf16,
    relation: &str,
    steps: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), Refusal> {
    let person = u8ext(configuration, "personRole").unwrap_or_default();
    let batch = u8ext(configuration, "batchRole").unwrap_or_default();
    let schema = u8ext(configuration, "schema").unwrap_or_default();
    let group_roles = member(configuration, "groupRoles").unwrap_or(&Value::Null);
    add_step(
        steps,
        "grant",
        path,
        &format!("REVOKE ALL PRIVILEGES ON TABLE {relation} FROM PUBLIC"),
        ctx,
    )?;
    for (audience, role) in [("person", person.as_str()), ("batch", batch.as_str())] {
        let rules = member(member(table, "policy").unwrap_or(&Value::Null), audience)
            .unwrap_or(&Value::Null);
        for command in ["select", "insert", "update", "delete"] {
            let rule = member(rules, command).unwrap_or(&Value::Null);
            let p = append_path(
                &append_path(&append_path(path, "policy"), audience),
                command,
            );
            precharge_tree(rule, ctx, &p).map_err(Refusal::from_error)?;
            let expr = policy_sql(
                rule,
                table,
                document,
                payload,
                &schema,
                group_roles,
                audience,
                &p,
                None,
                0,
                ctx,
            )?;
            reserve_policy(expr.len().saturating_mul(4).saturating_add(2048), &p, ctx)?;
            let clauses = match command {
                "insert" => format!(" WITH CHECK ({expr})"),
                "update" => format!(" USING ({expr}) WITH CHECK ({expr})"),
                _ => format!(" USING ({expr})"),
            };
            add_step(
                steps,
                "policy",
                &p,
                &format!(
                    "CREATE POLICY {} ON {relation} AS PERMISSIVE FOR {} TO {}{clauses}",
                    quote_ident(&format!("umf_{audience}_{command}")),
                    command.to_uppercase(),
                    quote_ident(role)
                ),
                ctx,
            )?;
            if string_member(rule, "kind") != Some(&Utf16::from("deny")) {
                let privilege = if command == "update" {
                    let record =
                        resolve_ref(document, member(table, "record").unwrap_or(&Value::Null))
                            .unwrap_or(&Value::Null);
                    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null))
                        .unwrap_or(&[])
                        .iter()
                        .filter(|c| {
                            member(c, "immutable") != Some(&Value::Bool(true))
                                && member(c, "generated").is_none()
                                && !array_items(member(record, "keys").unwrap_or(&Value::Null))
                                    .unwrap_or(&[])
                                    .iter()
                                    .any(|key| {
                                        array_items(member(key, "fields").unwrap_or(&Value::Null))
                                            .unwrap_or(&[])
                                            .iter()
                                            .any(|field| {
                                                member(c, "field")
                                                    .is_some_and(|r| refs_equal(r, field))
                                            })
                                    })
                        })
                        .filter_map(|c| u8ext(c, "name"))
                        .map(|n| quote_ident(&n))
                        .collect::<Vec<_>>()
                        .join(", ");
                    if columns.is_empty() {
                        return Err(Refusal::unsupported(
                            &p,
                            "UPDATE has no mutable ordinary columns",
                        ));
                    }
                    format!("UPDATE ({})", columns)
                } else {
                    command.to_uppercase()
                };
                add_step(
                    steps,
                    "grant",
                    &p,
                    &format!(
                        "GRANT {privilege} ON TABLE {relation} TO {}",
                        quote_ident(role)
                    ),
                    ctx,
                )?;
            }
        }
        if array_items(member(table, "columns").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .any(|c| member(c, "generated").is_some())
            && string_member(member(rules, "insert").unwrap_or(&Value::Null), "kind")
                != Some(&Utf16::from("deny"))
        {
            return Err(Refusal::unsupported(
                path,
                "Identity sequence privilege qualification is pending",
            ));
        }
    }
    Ok(())
}
fn reserve_policy(amount: usize, path: &Utf16, ctx: &mut Context<'_>) -> Result<(), Refusal> {
    ctx.charge_work(amount.max(1), path.clone())
        .map_err(Refusal::from_error)
}
fn sorted_group_roles<'a>(
    value: &'a Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<(&'a Utf16, &'a Utf16)>, Refusal> {
    let members = object_members(value).unwrap_or(&[]);
    reserve_policy(
        members
            .len()
            .saturating_mul(std::mem::size_of::<(&Utf16, &Utf16)>()),
        path,
        ctx,
    )?;
    let mut result: Vec<(&Utf16, &Utf16)> = Vec::with_capacity(members.len());
    for (alias, role) in members {
        reserve_policy(1, path, ctx)?;
        let Value::String(role) = role else { continue };
        let mut position = result.len();
        while position > 0 {
            let other = result[position - 1].0;
            let mut order = std::cmp::Ordering::Equal;
            for (index, (left, right)) in other.units().iter().zip(alias.units()).enumerate() {
                if index % 1024 == 0 {
                    reserve_policy(1024, path, ctx)?;
                }
                order = left.cmp(right);
                if order != std::cmp::Ordering::Equal {
                    break;
                }
            }
            if order == std::cmp::Ordering::Equal {
                order = other.len().cmp(&alias.len());
            }
            if order != std::cmp::Ordering::Greater {
                break;
            }
            position -= 1;
        }
        result.insert(position, (alias, role));
    }
    Ok(result)
}
fn policy_sql(
    rule: &Value,
    table: &Value,
    document: &Value,
    payload: &Value,
    schema: &str,
    group_roles: &Value,
    audience: &str,
    path: &Utf16,
    alias: Option<&str>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<String, Refusal> {
    reserve_policy(1024, path, ctx)?;
    if depth > 16 {
        return Err(Refusal::unsupported(
            path,
            "Expression/rule depth or module node budget exceeded",
        ));
    }
    reserve_policy(
        array_items(member(table, "columns").unwrap_or(&Value::Null))
            .map_or(0, |items| items.len()),
        path,
        ctx,
    )?;
    let kind = u8ext(rule, "kind").unwrap_or_default();
    match kind.as_str() {
        "deny" => Ok("FALSE".into()),
        "allow" => Ok("TRUE".into()),
        "owner" => {
            let column = column_name(table, member(rule, "field").unwrap_or(&Value::Null))
                .ok_or_else(|| Refusal::unsupported(path, "Missing exact column mapping"))?;
            let prefix = alias
                .map(|a| format!("{}.", quote_ident(a)))
                .unwrap_or_default();
            Ok(format!("({prefix}{} COLLATE pg_catalog.\"C\" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog.\"C\")",quote_ident(&column)))
        }
        "memberOfRole" => {
            let alias = string_member(rule, "role")
                .and_then(|s| s.to_utf8().ok())
                .unwrap_or_default();
            let role = member(group_roles, &alias)
                .and_then(|v| {
                    if let Value::String(s) = v {
                        s.to_utf8().ok()
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    Refusal::unsupported(
                        append_path(path, "role"),
                        "Group alias has no trusted native binding",
                    )
                })?;
            Ok(format!(
                "pg_catalog.pg_has_role(CURRENT_USER, {}, 'MEMBER')",
                quote_text(&role)?
            ))
        }
        "any" | "all" => {
            let mut vals = Vec::new();
            for (i, child) in array_items(member(rule, "rules").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .enumerate()
            {
                vals.push(policy_sql(
                    child,
                    table,
                    document,
                    payload,
                    schema,
                    group_roles,
                    audience,
                    &append_path(&append_path(path, "rules"), &i.to_string()),
                    alias,
                    depth + 1,
                    ctx,
                )?);
            }
            reserve_policy(
                vals.iter()
                    .fold(32usize, |size, text| {
                        size.saturating_add(text.len()).saturating_add(8)
                    })
                    .saturating_mul(2),
                path,
                ctx,
            )?;
            Ok(format!(
                "({})",
                vals.join(if kind == "any" { " OR " } else { " AND " })
            ))
        }
        "memberOf" => {
            let field = column_name(table, member(rule, "field").unwrap_or(&Value::Null))
                .ok_or_else(|| Refusal::unsupported(path, "Missing exact column mapping"))?;
            let prefix = alias
                .map(|a| format!("{}.", quote_ident(a)))
                .unwrap_or_default();
            let aliases = sorted_group_roles(group_roles, path, ctx)?;
            reserve_policy(aliases.len().saturating_mul(256), path, ctx)?;
            let roles = aliases
                .iter()
                .map(|(_, role)| {
                    role.to_utf8()
                        .map_err(|_| Refusal::unsupported(path, "Invalid configured role Unicode"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if roles.is_empty() {
                return Err(Refusal::unsupported(
                    path,
                    "Per-row group membership requires trusted group-role bindings",
                ));
            }
            Ok(format!("(EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS {} WHERE {}.rolname::pg_catalog.text COLLATE pg_catalog.\"C\" = {prefix}{} COLLATE pg_catalog.\"C\" AND {}.rolname::pg_catalog.text IN ({}) AND pg_catalog.pg_has_role(CURRENT_USER, {}.oid, 'MEMBER'))) ",quote_ident("umf_group"),quote_ident("umf_group"),quote_ident(&field),quote_ident("umf_group"),roles.iter().map(|r|quote_text(r)).collect::<Result<Vec<_>,_>>()?.join(", "),quote_ident("umf_group")).trim_end().to_string())
        }
        "related" => {
            let record = member(rule, "record").unwrap_or(&Value::Null);
            reserve_policy(
                array_items(member(payload, "tables").unwrap_or(&Value::Null))
                    .map_or(0, |items| items.len()),
                path,
                ctx,
            )?;
            let target = table_for_record(payload, record).ok_or_else(|| {
                Refusal::unsupported(
                    append_path(path, "record"),
                    "Related rule requires original tables in this plugin module",
                )
            })?;
            let target_select = member(
                member(member(target, "policy").unwrap_or(&Value::Null), audience)
                    .unwrap_or(&Value::Null),
                "select",
            )
            .unwrap_or(&Value::Null);
            if string_member(target_select, "kind") == Some(&Utf16::from("deny")) {
                return Err(Refusal::unsupported(append_path(path,"record"),"Related rule requires an explicit related-table SELECT policy/grant for this audience"));
            }
            let target_alias = format!("umf_j_{depth}");
            let target_name = u8ext(target, "name").unwrap_or_default();
            let target_relation = format!("{}.{}", quote_ident(schema), quote_ident(&target_name));
            let mut pairs = Vec::new();
            for pair in array_items(member(rule, "matches").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                reserve_policy(1024, path, ctx)?;
                let left = column_name(table, member(pair, "source").unwrap_or(&Value::Null))
                    .ok_or_else(|| {
                        Refusal::unsupported(path, "Missing exact source column mapping")
                    })?;
                let right = column_name(target, member(pair, "target").unwrap_or(&Value::Null))
                    .ok_or_else(|| {
                        Refusal::unsupported(path, "Missing exact target column mapping")
                    })?;
                let lhs = alias
                    .map(|a| format!("{}.", quote_ident(a)))
                    .unwrap_or_else(|| {
                        format!(
                            "{}.",
                            format!(
                                "{}.{}",
                                quote_ident(schema),
                                quote_ident(&u8ext(table, "name").unwrap_or_default())
                            )
                        )
                    });
                pairs.push(format!(
                    "{lhs}{} = {}.{}",
                    quote_ident(&left),
                    quote_ident(&target_alias),
                    quote_ident(&right)
                ));
            }
            let nested = policy_sql(
                member(rule, "rule").unwrap_or(&Value::Null),
                target,
                document,
                payload,
                schema,
                group_roles,
                audience,
                &append_path(path, "rule"),
                Some(&target_alias),
                depth + 1,
                ctx,
            )?;
            reserve_policy(
                nested
                    .len()
                    .saturating_add(pairs.iter().map(|item| item.len() + 5).sum::<usize>())
                    .saturating_add(1024)
                    .saturating_mul(2),
                path,
                ctx,
            )?;
            Ok(format!(
                "(EXISTS (SELECT 1 FROM {target_relation} AS {} WHERE {} AND {nested}))",
                quote_ident(&target_alias),
                pairs.join(" AND ")
            ))
        }
        "via" => policy_via_sql(
            rule,
            table,
            document,
            payload,
            schema,
            group_roles,
            audience,
            path,
            alias,
            depth,
            ctx,
        ),
        _ => Err(Refusal::unsupported(path, "Unknown native policy rule")),
    }
}
fn policy_via_sql(
    rule: &Value,
    initial: &Value,
    document: &Value,
    payload: &Value,
    schema: &str,
    group_roles: &Value,
    audience: &str,
    path: &Utf16,
    alias: Option<&str>,
    depth: usize,
    ctx: &mut Context<'_>,
) -> Result<String, Refusal> {
    reserve_policy(1024, path, ctx)?;
    fn walk(
        index: usize,
        current: &Value,
        current_alias: Option<&str>,
        rule: &Value,
        document: &Value,
        payload: &Value,
        schema: &str,
        group_roles: &Value,
        audience: &str,
        path: &Utf16,
        depth: usize,
        ctx: &mut Context<'_>,
    ) -> Result<String, Refusal> {
        reserve_policy(1024, path, ctx)?;
        let chain = array_items(member(rule, "path").unwrap_or(&Value::Null)).unwrap_or(&[]);
        if index >= chain.len() {
            return policy_sql(
                member(rule, "rule").unwrap_or(&Value::Null),
                current,
                document,
                payload,
                schema,
                group_roles,
                audience,
                &append_path(path, "rule"),
                current_alias,
                depth + 1,
                ctx,
            );
        }
        let step = &chain[index];
        let module = string_member(step, "module");
        let relation_id = string_member(step, "id");
        let binding_tables =
            array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut bindings = Vec::<(&Value, &Value)>::new();
        for table in binding_tables {
            reserve_policy(128, path, ctx)?;
            for fk in
                array_items(member(table, "foreignKeys").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                reserve_policy(128, path, ctx)?;
                if member(fk, "relationship").is_some_and(|r| {
                    string_member(r, "module") == module && string_member(r, "id") == relation_id
                }) {
                    bindings.push((table, fk));
                }
            }
        }
        if bindings.len() != 1 {
            return Err(Refusal::unsupported(
                append_path(&append_path(path, "path"), &index.to_string()),
                "Via path lacks one original native FK binding",
            ));
        }
        let (binding_table, fk) = bindings[0];
        let target_record =
            member(member(fk, "target").unwrap_or(&Value::Null), "record").unwrap_or(&Value::Null);
        let target_table = table_for_record(payload, target_record).ok_or_else(|| {
            Refusal::unsupported(path, "External/missing native table dependency")
        })?;
        let forward = string_member(step, "direction") == Some(&Utf16::from("forward"));
        let (next, from) = if forward {
            (target_table, binding_table)
        } else {
            (binding_table, target_table)
        };
        if !refs_equal(
            member(current, "record").unwrap_or(&Value::Null),
            member(from, "record").unwrap_or(&Value::Null),
        ) {
            return Err(Refusal::unsupported(
                append_path(&append_path(path, "path"), &index.to_string()),
                "Via path changed after admission",
            ));
        }
        let next_policy = member(
            member(member(next, "policy").unwrap_or(&Value::Null), audience)
                .unwrap_or(&Value::Null),
            "select",
        )
        .unwrap_or(&Value::Null);
        if string_member(next_policy, "kind") == Some(&Utf16::from("deny")) {
            return Err(Refusal::unsupported(
                append_path(&append_path(path, "path"), &index.to_string()),
                "Via requires an explicit related-table SELECT grant/policy for this audience",
            ));
        }
        let target_key_id =
            u8ext(member(fk, "target").unwrap_or(&Value::Null), "key").unwrap_or_default();
        let target_record_def = resolve_ref(document, target_record)
            .ok_or_else(|| Refusal::unsupported(path, "Missing target Record"))?;
        let key = array_items(member(target_record_def, "keys").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find(|k| u8ext(k, "id").as_deref() == Some(target_key_id.as_str()))
            .ok_or_else(|| Refusal::unsupported(path, "Missing exact target Key"))?;
        let key_fields = array_items(member(key, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let fk_fields = array_items(member(fk, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
        if key_fields.len() != fk_fields.len() {
            return Err(Refusal::unsupported(path, "FK and target Key arity differ"));
        }
        let next_alias = format!("umf_v_{depth}_{index}");
        let left_prefix = current_alias
            .map(|a| format!("{}.", quote_ident(a)))
            .unwrap_or_else(|| {
                format!(
                    "{}.{}.",
                    quote_ident(schema),
                    quote_ident(&u8ext(current, "name").unwrap_or_default())
                )
            });
        let mut joins = Vec::new();
        for (fkfield, keyfield) in fk_fields.iter().zip(key_fields) {
            reserve_policy(1024, path, ctx)?;
            let (from_ref, to_ref) = if forward {
                (fkfield, keyfield)
            } else {
                (keyfield, fkfield)
            };
            let from_name = column_name(current, from_ref)
                .ok_or_else(|| Refusal::unsupported(path, "Missing exact current field mapping"))?;
            let to_name = column_name(next, to_ref)
                .ok_or_else(|| Refusal::unsupported(path, "Missing exact next field mapping"))?;
            joins.push(format!(
                "{}{} = {}.{}",
                left_prefix,
                quote_ident(&from_name),
                quote_ident(&next_alias),
                quote_ident(&to_name)
            ));
        }
        let relation = format!(
            "{}.{}",
            quote_ident(schema),
            quote_ident(&u8ext(next, "name").unwrap_or_default())
        );
        let nested = walk(
            index + 1,
            next,
            Some(&next_alias),
            rule,
            document,
            payload,
            schema,
            group_roles,
            audience,
            path,
            // Via steps share the enclosing policy depth; index identifies
            // each hop, matching the authored-policy alias namespace.
            depth,
            ctx,
        )?;
        reserve_policy(
            nested
                .len()
                .saturating_add(joins.iter().map(|item| item.len() + 5).sum::<usize>())
                .saturating_add(1024)
                .saturating_mul(2),
            path,
            ctx,
        )?;
        Ok(format!(
            "(EXISTS (SELECT 1 FROM {relation} AS {} WHERE {} AND {nested}))",
            quote_ident(&next_alias),
            joins.join(" AND ")
        ))
    }
    walk(
        0,
        initial,
        alias,
        rule,
        document,
        payload,
        schema,
        group_roles,
        audience,
        path,
        depth,
        ctx,
    )
}
fn is_system_role(role: &Utf16) -> bool {
    role == &Utf16::from("public")
        || role
            .to_utf8()
            .ok()
            .is_some_and(|s| s.to_ascii_lowercase().starts_with("pg_"))
}
fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn s(text: impl AsRef<str>) -> Value {
    Value::String(Utf16::from(text.as_ref()))
}

#[cfg(test)]
mod admission_tests {
    use super::{literal_sql_for_migration, native_type_sql, utf8_len_bounded};
    use umf_core::{Context, EngineError, Utf16, Value};

    fn object(items: Vec<(&str, Value)>) -> Value {
        Value::Object(
            items
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value))
                .collect(),
        )
    }

    #[test]
    fn recursive_policy_sql_precharges_derived_growth_and_preserves_control_origin() {
        let reference = object(vec![
            ("module", Value::string_utf8("demo")),
            ("element", Value::string_utf8("owner")),
        ]);
        let table = object(vec![(
            "columns",
            Value::Array(vec![object(vec![
                ("field", reference.clone()),
                ("name", Value::string_utf8("owner")),
            ])]),
        )]);
        let leaf = object(vec![
            ("kind", Value::string_utf8("memberOf")),
            ("field", reference),
        ]);
        let rule = object(vec![
            ("kind", Value::string_utf8("any")),
            ("rules", Value::Array(vec![leaf; 64])),
        ]);
        let groups = Value::Object(
            (0..256)
                .map(|index| {
                    (
                        Utf16::from(format!("alias{index}")),
                        Value::string_utf8(format!("group{index}")),
                    )
                })
                .collect(),
        );
        let mut total = 0usize;
        {
            let mut count = |_| {
                total += 1;
                Ok(())
            };
            let mut ctx = Context::ordinary().with_meter(&mut count);
            let sql = super::policy_sql(
                &rule,
                &table,
                &Value::Null,
                &Value::Null,
                "schema",
                &groups,
                "person",
                &Utf16::default(),
                None,
                0,
                &mut ctx,
            )
            .unwrap();
            assert!(sql.len() > 100_000);
        }
        let mut calls = 0usize;
        let mut stop = |_| {
            calls += 1;
            if calls > total * 3 / 4 {
                Err(EngineError::new(
                    "NUMBER",
                    Utf16::from("/host"),
                    "late policy refusal",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut stop);
        match super::policy_sql(
            &rule,
            &table,
            &Value::Null,
            &Value::Null,
            "schema",
            &groups,
            "person",
            &Utf16::default(),
            None,
            0,
            &mut ctx,
        ) {
            Err(super::Refusal::Terminal(error)) => {
                assert!(error.is_control_failure());
                assert_eq!(error.code, "NUMBER");
                assert_eq!(error.path, Utf16::from("/host"));
            }
            _ => panic!("policy controls must remain terminal"),
        }
    }

    #[test]
    fn deployment_source_limit_counts_utf8_bytes_without_utf16_approximation() {
        let ascii = Utf16::from("a".repeat(4_000_000));
        assert_eq!(
            utf8_len_bounded(&ascii, 4_000_000, &mut Context::ordinary()).unwrap(),
            4_000_000
        );

        // A two-byte scalar crosses the byte ceiling while staying below the
        // same number of UTF-16 code units. The bounded scan stops at the
        // first excess byte rather than converting the whole source.
        let multibyte = Utf16::from(format!("{}é", "a".repeat(3_999_999)));
        assert_eq!(
            utf8_len_bounded(&multibyte, 4_000_000, &mut Context::ordinary()).unwrap(),
            4_000_001
        );
    }

    #[test]
    fn migration_helpers_reuse_exact_deployment_sql_and_preserve_control_origin() {
        let native = object(vec![
            ("kind", Value::string_utf8("numeric")),
            ("precision", Value::Number(18.0)),
            ("scale", Value::Number(4.0)),
        ]);
        assert_eq!(
            native_type_sql(&native).unwrap(),
            "pg_catalog.\"numeric\"(18,4)"
        );
        let literal = object(vec![("integerToken", Value::string_utf8("42"))]);
        assert_eq!(
            literal_sql_for_migration(&literal, &mut Context::ordinary()).unwrap(),
            "E'42'::pg_catalog.numeric"
        );

        let mut meter = |_: usize| {
            Err(EngineError::new(
                "MIGRATION_SQL_STOP",
                Utf16::default(),
                "stop during literal preparation",
            ))
        };
        let mut context = Context::ordinary().with_meter(&mut meter);
        let error = literal_sql_for_migration(&literal, &mut context).unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "MIGRATION_SQL_STOP");
    }
}
