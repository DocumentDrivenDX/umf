// SPDX-License-Identifier: MIT OR Apache-2.0
//! Current G10 initial-create inventory migration, derived from verified source.
//! This module intentionally handles the original initial-create branch only.

mod command_refs;
mod g02;

use std::collections::{BTreeMap, BTreeSet};

use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, EngineError, Utf16, Value};

use crate::canonical::{canonical_json_admitted, canonical_sha256_admitted};
use crate::grant_columns::mutable_table_grant_columns;
use crate::resources::CodegenEngine;
use crate::value::{admit_json, array_items, member, object_members, string_member};

const COLLECTIONS: [&str; 9] = [
    "tables",
    "columns",
    "keys",
    "checks",
    "foreignKeys",
    "indexes",
    "policies",
    "grants",
    "comments",
];
const ZERO_DIGEST: &str = "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b";

fn s(value: &str) -> Value {
    Value::String(Utf16::from(value))
}
fn o(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn a(values: Vec<Value>) -> Value {
    Value::Array(values)
}
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    member(value, key)
}
fn exact_fields(value: &Value, names: &[&str]) -> bool {
    let Some(fields) = object_members(value) else {
        return false;
    };
    fields.len() == names.len() && names.iter().all(|name| get(value, name).is_some())
}
fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(v) => v.to_utf8().ok(),
        _ => None,
    }
}
fn val<'a>(value: &'a Value, key: &str, path: &str) -> Result<&'a Value, EngineError> {
    get(value, key).ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "Required source member is missing",
        )
    })
}
fn items<'a>(value: &'a Value, path: &str) -> Result<&'a [Value], EngineError> {
    array_items(value).ok_or_else(|| err("TABLE_INVENTORY_UNSUPPORTED", path, "Expected an array"))
}
fn member_text(value: &Value, key: &str, path: &str) -> Result<String, EngineError> {
    string_member(value, key)
        .and_then(|v| v.to_utf8().ok())
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                path,
                "Expected a UTF-8 string",
            )
        })
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn is_control(error: &EngineError) -> bool {
    error.is_control_failure()
}
fn diagnostic(error: &EngineError) -> Value {
    o(vec![("code",s(&error.code)),("path",Value::String(error.path.clone())),
        ("message",s("The table inventory request could not be compiled under the supported source profile.")),
        ("severity",s("error"))])
}
fn blocked(error: &EngineError) -> Value {
    o(vec![
        ("status", s("blocked")),
        ("diagnostics", a(vec![diagnostic(error)])),
    ])
}
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 15) as usize] as char);
    }
    out
}
fn hash(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    Ok(hex(&canonical_sha256_admitted(value, ctx)?))
}
fn same(left: &Value, right: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical_json_admitted(left, ctx)? == canonical_json_admitted(right, ctx)?)
}
fn pointer(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}
fn eq_text(value: Option<&Value>, expected: &str) -> bool {
    value.and_then(text).is_some_and(|found| found == expected)
}
fn ref_equal(left: &Value, right: &Value) -> bool {
    get(left, "module") == get(right, "module") && get(left, "element") == get(right, "element")
}
fn identity(kind: &str, table: Option<&str>, subject: Value) -> Value {
    o(vec![
        ("kind", s(kind)),
        ("table", table.map(s).unwrap_or(Value::Null)),
        ("subject", subject),
    ])
}
fn row(identity: Value, meaning: Value, extra: Vec<(&str, Value)>) -> Value {
    let mut fields = vec![
        ("identity", identity),
        ("meaning", meaning),
        ("state", s("present")),
    ];
    fields.extend(extra);
    o(fields)
}
fn edge(from: &str, to: &str, reason: &str, path: &str) -> Value {
    o(vec![
        ("from", s(from)),
        ("to", s(to)),
        ("reason", s(reason)),
        ("sourcePath", s(path)),
        ("state", s("present")),
    ])
}
fn push_row(
    catalog: &mut BTreeMap<String, Vec<Value>>,
    sources: &mut BTreeMap<String, String>,
    collection: &str,
    id: Value,
    meaning: Value,
    path: &str,
    extra: Vec<(&str, Value)>,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let key = hash(&id, ctx)?;
    if sources.insert(key.clone(), path.to_owned()).is_some() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "Duplicate source-derived catalog identity",
        ));
    }
    catalog
        .get_mut(collection)
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                path,
                "Unknown catalog collection",
            )
        })?
        .push(row(id, meaning, extra));
    Ok(key)
}
fn expected_row<'a>(
    bundle: &'a Value,
    collection: &str,
    table: &str,
    field: Option<&Value>,
    id: Option<&str>,
) -> Result<&'a Value, EngineError> {
    let path = format!("/next/expectedCatalog/{collection}");
    let catalog = val(bundle, "expectedCatalog", "/next/expectedCatalog")?;
    let rows = items(val(catalog, collection, &path)?, &path)?;
    let mut found = None;
    for candidate in rows {
        if !eq_text(get(candidate, "table"), table) {
            continue;
        }
        if field.is_some_and(|field| {
            !get(candidate, "field").is_some_and(|selected| ref_equal(selected, field))
        }) {
            continue;
        }
        if id.is_some_and(|id| !eq_text(get(candidate, "id"), id)) {
            continue;
        }
        if found.replace(candidate).is_some() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Ambiguous renderer catalog row",
            ));
        }
    }
    found.ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            &path,
            "Renderer catalog row is missing",
        )
    })
}
fn empty_catalog() -> Value {
    o(COLLECTIONS
        .iter()
        .map(|key| (*key, a(Vec::new())))
        .collect())
}
fn find_element<'a>(
    source: &'a Value,
    reference: &Value,
) -> Result<(&'a Value, String), EngineError> {
    let module = member_text(reference, "module", "/source/reference/module")?;
    let element = member_text(reference, "element", "/source/reference/element")?;
    for (module_index, candidate) in items(
        val(source, "modules", "/source/modules")?,
        "/source/modules",
    )?
    .iter()
    .enumerate()
    {
        if !eq_text(get(candidate, "id"), &module) {
            continue;
        }
        for (element_index, definition) in items(
            val(candidate, "elements", "/source/modules/elements")?,
            "/source/modules/elements",
        )?
        .iter()
        .enumerate()
        {
            if eq_text(get(definition, "id"), &element) {
                return Ok((
                    definition,
                    format!("/modules/{module_index}/elements/{element_index}"),
                ));
            }
        }
    }
    Err(err(
        "TABLE_INVENTORY_UNSUPPORTED",
        "/source",
        "Source reference is unresolved",
    ))
}
fn source_at<'a>(source: &'a Value, pointer: &str) -> Option<&'a Value> {
    if pointer.is_empty() {
        return Some(source);
    }
    let mut value = source;
    for part in pointer.strip_prefix('/')?.split('/') {
        let key = part.replace("~1", "/").replace("~0", "~");
        value = if let Value::Array(values) = value {
            values.get(key.parse::<usize>().ok()?)?
        } else {
            get(value, &key)?
        };
    }
    Some(value)
}
fn source_paths(
    source: &Value,
    path: String,
    output: &mut Vec<String>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        path.encode_utf16().count().saturating_add(1),
        Utf16::from(path.as_str()),
    )?;
    output.push(path.clone());
    match source {
        Value::Array(values) => {
            for (index, value) in values.iter().enumerate() {
                source_paths(value, format!("{path}/{index}"), output, ctx)?;
            }
        }
        Value::Object(fields) => {
            for (key, value) in fields {
                let name = key.to_utf8().map_err(|_| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Source member cannot be represented as a JSON pointer",
                    )
                })?;
                source_paths(value, format!("{path}/{}", pointer(&name)), output, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[derive(Clone)]
struct Projection {
    catalog: Value,
    dependencies: Vec<Value>,
    operations: Vec<Value>,
    renderer_operations: Vec<Value>,
    seed_states: Vec<Value>,
    source_paths: BTreeMap<String, String>,
    tables: Vec<Value>,
    reviews: Vec<Value>,
    inventory_tables: Vec<Value>,
}

impl CodegenEngine<'_> {
    pub fn compile_table_inventory_migration(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if get(request, "previous") == Some(&Value::Null) {
            return self.compile_table_inventory_initial(request, ctx);
        }
        let admitted = admit_json(request, ctx)?;
        match g02::compile_retained_g02(self, &admitted, ctx) {
            Ok(plan) => Ok(o(vec![
                ("status", s("compiled")),
                ("plan", plan),
                ("diagnostics", a(vec![])),
            ])),
            Err(error) if is_control(&error) => Err(error),
            Err(error) => Ok(blocked(&error)),
        }
    }

    pub fn discover_table_inventory_migration_changes(
        &self,
        previous: &Value,
        next: &Value,
        selector: &Value,
        history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if previous == &Value::Null {
            self.discover_table_inventory_initial(previous, next, selector, history, ctx)
        } else if get(selector, "tableIntents")
            .and_then(array_items)
            .is_some_and(|intents| {
                intents
                    .iter()
                    .any(|intent| eq_text(get(intent, "kind"), "create"))
            })
        {
            g02::discover_mixed_create_fill(self, previous, next, selector, history, ctx)
        } else {
            self.discover_table_inventory_removal(previous, next, selector, history, ctx)
        }
    }

    pub fn verify_table_inventory_migration(
        &self,
        plan: &Value,
        history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let plan = admit_json(plan, ctx)?;
        let history = admit_json(history, ctx)?;
        let request = o(vec![
            ("id", clone_member(&plan, "id", "/id")?),
            (
                "predecessor",
                clone_member(&plan, "predecessor", "/predecessor")?,
            ),
            ("previous", clone_member(&plan, "previous", "/previous")?),
            ("next", clone_member(&plan, "next", "/next")?),
            ("options", clone_member(&plan, "options", "/options")?),
            ("history", history),
        ]);
        let rebuilt = self.compile_table_inventory_migration(&request, ctx)?;
        let rebuilt_plan = get(&rebuilt, "plan").ok_or_else(|| {
            err(
                "TABLE_INVENTORY_PLAN",
                "/",
                "Inventory plan differs from source recompilation",
            )
        })?;
        if !same(rebuilt_plan, &plan, ctx)? {
            return Err(err(
                "TABLE_INVENTORY_PLAN",
                "/",
                "Inventory plan differs from source recompilation",
            ));
        }
        Ok(plan)
    }

    pub fn serialize_table_inventory_migration(
        &self,
        plan: &Value,
        history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let verified = self.verify_table_inventory_migration(plan, history, ctx)?;
        Ok(s(&canonical_text(&verified, ctx)?))
    }

    pub fn irreversible_table_purge_disclosure(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let candidate = admit_json(input, ctx)?;
        let path = member_text(&candidate, "path", "/review/path")?;
        let prefix = "/options/tableIntents/";
        let suffix = "/disposition";
        let index = path
            .strip_prefix(prefix)
            .and_then(|tail| tail.strip_suffix(suffix));
        if !exact_fields(
            &candidate,
            &[
                "id",
                "kind",
                "path",
                "oldDigest",
                "newDigest",
                "oldValue",
                "newValue",
                "oldPath",
                "newPath",
            ],
        ) || !eq_text(get(&candidate, "kind"), "table-removal-effects")
            || !index.is_some_and(|digits| {
                !digits.is_empty() && digits.bytes().all(|digit| digit.is_ascii_digit())
            })
            || get(&candidate, "newPath") != Some(&Value::Null)
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Purge disclosure candidate is invalid",
            ));
        }
        let old = val(&candidate, "oldValue", &path)?;
        let next = val(&candidate, "newValue", &path)?;
        let effects = a(vec![
            s("ordinary-access-retired"),
            s("stored-rows-irreversibly-purged"),
            s("physical-binding-removed"),
        ]);
        let table = member_text(old, "table", &path)?;
        if !exact_fields(
            old,
            &[
                "profile",
                "side",
                "source",
                "configuration",
                "table",
                "record",
                "meaning",
                "intent",
                "effects",
            ],
        ) || !exact_fields(
            next,
            &[
                "profile",
                "side",
                "source",
                "configuration",
                "table",
                "record",
                "meaning",
                "intent",
                "effects",
            ],
        ) || !eq_text(get(old, "profile"), "umf.table-inventory-review/0.1")
            || !eq_text(get(old, "side"), "previous")
            || !eq_text(get(next, "profile"), "umf.table-inventory-review/0.1")
            || !eq_text(get(next, "side"), "next")
            || !eq_text(get(next, "table"), &table)
            || get(old, "meaning") == Some(&Value::Null)
            || get(next, "meaning") != Some(&Value::Null)
            || !same(val(old, "effects", &path)?, &effects, ctx)?
            || !same(val(next, "effects", &path)?, &effects, ctx)?
            || !eq_text(get(val(old, "intent", &path)?, "kind"), "remove")
            || !eq_text(get(val(next, "intent", &path)?, "kind"), "remove")
            || !eq_text(get(val(old, "intent", &path)?, "table"), &table)
            || !eq_text(get(val(next, "intent", &path)?, "table"), &table)
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Purge meaning is not source-bound",
            ));
        }
        let old_digest = hash(old, ctx)?;
        let new_digest = hash(next, ctx)?;
        let identity = a(vec![
            s("table-removal-effects"),
            s(&path),
            s(&old_digest),
            s(&new_digest),
        ]);
        let expected_id = format!("review-{}", &hash(&identity, ctx)?[..24]);
        if !eq_text(get(&candidate, "oldDigest"), &old_digest)
            || !eq_text(get(&candidate, "newDigest"), &new_digest)
            || !eq_text(get(&candidate, "id"), &expected_id)
            || !matches!(get(&candidate, "oldPath"), Some(Value::String(_)))
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &path,
                "Purge review digest or source path is invalid",
            ));
        }
        Ok(o(vec![
            ("code", s("IRREVERSIBLE_TABLE_PURGE")),
            ("path", s(&path)),
            ("markerId", s(&expected_id)),
            ("message", s(&format!("Irreversible purge of all stored rows and columns for table {table}. Metadata history is not a data backup; this profile performs immediate physical deletion."))),
        ]))
    }

    /// Discover the current irreversible-purge review without lowering a removal plan.
    /// The installed predecessor is recompiled before its source is used.
    pub fn discover_table_inventory_removal(
        &self,
        previous: &Value,
        next: &Value,
        selector: &Value,
        history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let previous = self.verify_table_deployment(&admit_json(previous, ctx)?, ctx)?;
        let next = self.verify_table_deployment(&admit_json(next, ctx)?, ctx)?;
        let selector = admit_json(selector, ctx)?;
        let history = admit_json(history, ctx)?;
        if !exact_fields(
            &selector,
            &[
                "version",
                "tableIntents",
                "conversions",
                "retiredSeedSets",
                "retirements",
                "restorations",
                "archiveSources",
            ],
        ) || !eq_text(
            get(&selector, "version"),
            "umf.table-inventory-discovery/0.1",
        ) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/selector",
                "Removal selector is not closed",
            ));
        }
        for key in [
            "conversions",
            "retiredSeedSets",
            "retirements",
            "restorations",
            "archiveSources",
        ] {
            let path = format!("/selector/{key}");
            if !items(val(&selector, key, &path)?, &path)?.is_empty() {
                return Err(err(
                    "TABLE_MIGRATION_REVIEW",
                    &path,
                    "Selected source profile includes an unsupported effect",
                ));
            }
        }
        if !exact_fields(&history, &["profile", "plans", "executions"])
            || !eq_text(
                get(&history, "profile"),
                "umf.table-inventory-source-history/0.1",
            )
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/history",
                "Original history envelope is invalid",
            ));
        }
        let plans = items(val(&history, "plans", "/history/plans")?, "/history/plans")?;
        let executions = items(
            val(&history, "executions", "/history/executions")?,
            "/history/executions",
        )?;
        if plans.len() != 1 || executions.len() != 1 {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/history",
                "Removal requires one verified installed initial plan",
            ));
        }
        let empty_history = o(vec![
            ("profile", s("umf.table-inventory-source-history/0.1")),
            ("plans", a(vec![])),
            ("executions", a(vec![])),
        ]);
        let installed = self.verify_table_inventory_initial(&plans[0], &empty_history, ctx)?;
        if !same(
            val(&installed, "next", "/history/plans/0/next")?,
            &previous,
            ctx,
        )? {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/history",
                "Installed plan does not bind the previous source bundle",
            ));
        }
        let receipt = &executions[0];
        if !exact_fields(receipt, &["planDigest", "entryDigest", "seedOutcomes"])
            || get(receipt, "planDigest") != get(&installed, "digest")
            || !items(
                val(
                    receipt,
                    "seedOutcomes",
                    "/history/executions/0/seedOutcomes",
                )?,
                "/history/executions/0/seedOutcomes",
            )?
            .is_empty()
            || !member_text(receipt, "entryDigest", "/history/executions/0/entryDigest")?
                .as_bytes()
                .iter()
                .all(|byte| byte.is_ascii_hexdigit())
            || member_text(receipt, "entryDigest", "/history/executions/0/entryDigest")?.len() != 64
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/history/executions/0",
                "Installed execution receipt is invalid",
            ));
        }
        for (bundle, path) in [(&previous, "/previous"), (&next, "/next")] {
            if !eq_text(get(val(bundle, "source", path)?, "format"), "json") {
                return Err(err(
                    "TABLE_MIGRATION_REVIEW",
                    path,
                    "Removal discovery requires exact JSON source",
                ));
            }
        }
        let old_text = string_member(val(&previous, "source", "/previous/source")?, "utf8")
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/previous/source/utf8",
                    "Previous source text is absent",
                )
            })?;
        let next_text =
            string_member(val(&next, "source", "/next/source")?, "utf8").ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/next/source/utf8",
                    "Next source text is absent",
                )
            })?;
        let old_doc = read_json_value(old_text.units(), Format::Json, ctx)?;
        let next_doc = read_json_value(next_text.units(), Format::Json, ctx)?;
        let before = project_initial(&old_doc, &previous, ctx)?;
        let after = project_initial(&next_doc, &next, ctx)?;
        Ok(a(removal_candidates(
            &before, &after, &previous, &next, &selector, ctx,
        )?))
    }

    pub fn compile_table_inventory_initial(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let request = admit_json(input, ctx)?;
        match compile_initial(self, &request, ctx) {
            Ok(plan) => Ok(o(vec![
                ("status", s("compiled")),
                ("plan", plan),
                ("diagnostics", a(vec![])),
            ])),
            Err(error) if is_control(&error) => Err(error),
            Err(error) => Ok(blocked(&error)),
        }
    }
}

fn compile_initial(
    _engine: &CodegenEngine<'_>,
    _request: &Value,
    _ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let request = _request;
    let ctx = _ctx;
    let engine = _engine;
    let expected = [
        "id",
        "predecessor",
        "previous",
        "next",
        "options",
        "history",
    ];
    let fields = object_members(request).ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Request must be an object",
        )
    })?;
    if fields.len() != expected.len() || expected.iter().any(|key| get(request, key).is_none()) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Request envelope is not closed",
        ));
    }
    let id = member_text(request, "id", "/id")?;
    if id.is_empty() || id.as_bytes().len() > 128 || id.contains('\0') {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/id",
            "Migration identity is invalid",
        ));
    }
    if get(request, "predecessor") != Some(&Value::Null)
        || get(request, "previous") != Some(&Value::Null)
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/previous",
            "Only the initial-create source branch is admitted",
        ));
    }
    let history = val(request, "history", "/history")?;
    if !exact_fields(history, &["profile", "plans", "executions"]) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history",
            "History envelope is not closed",
        ));
    }
    if !eq_text(
        get(history, "profile"),
        "umf.table-inventory-source-history/0.1",
    ) || !items(val(history, "plans", "/history/plans")?, "/history/plans")?.is_empty()
        || !items(
            val(history, "executions", "/history/executions")?,
            "/history/executions",
        )?
        .is_empty()
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/history",
            "Initial-create history must be empty",
        ));
    }
    let next = engine.verify_table_deployment(val(request, "next", "/next")?, ctx)?;
    let source = val(&next, "source", "/next/source")?;
    if !eq_text(get(source, "format"), "json") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source/format",
            "Initial inventory requires exact JSON source",
        ));
    }
    let source_text = string_member(source, "utf8").ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source/utf8",
            "Source text is missing",
        )
    })?;
    let document = read_json_value(source_text.units(), Format::Json, ctx)?;
    let projection = project_initial(&document, &next, ctx)?;
    let options = val(request, "options", "/options")?;
    if !exact_fields(
        options,
        &[
            "version",
            "tableIntents",
            "backfills",
            "defaultChanges",
            "conversions",
            "concurrentIndexes",
            "validations",
            "reviewedChanges",
            "seedSets",
            "retiredSeedSets",
            "retirements",
            "restorations",
            "archiveSources",
        ],
    ) || !eq_text(
        get(options, "version"),
        "umf.table-inventory-migration-options/0.1",
    ) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options",
            "Initial-create options are not closed",
        ));
    }
    for key in [
        "backfills",
        "defaultChanges",
        "conversions",
        "concurrentIndexes",
        "validations",
        "retiredSeedSets",
        "retirements",
        "restorations",
        "archiveSources",
    ] {
        let path = format!("/options/{key}");
        if !items(val(options, key, &path)?, &path)?.is_empty() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Selected composition requires unavailable typed lowering",
            ));
        }
    }
    let candidates = initial_candidates(&projection, &next, options, ctx)?;
    let claimed = val(options, "reviewedChanges", "/options/reviewedChanges")?;
    let markers = a(candidates
        .iter()
        .map(|candidate| {
            o(["id", "kind", "path", "oldDigest", "newDigest"]
                .into_iter()
                .map(|key| (key, get(candidate, key).expect("candidate marker").clone()))
                .collect())
        })
        .collect());
    if !same(&markers, claimed, ctx)? {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/options/reviewedChanges",
            "Reviewed markers do not equal source-derived candidates",
        ));
    }
    schedule_initial(request, &next, &projection, &candidates, ctx)
}

fn project_initial(
    document: &Value,
    bundle: &Value,
    ctx: &mut Context<'_>,
) -> Result<Projection, EngineError> {
    let module_id = member_text(bundle, "module", "/next/module")?;
    let mut bound = None;
    for (index, module) in items(
        val(document, "modules", "/next/source/modules")?,
        "/next/source/modules",
    )?
    .iter()
    .enumerate()
    {
        if eq_text(get(module, "id"), &module_id) {
            if bound.is_some() {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/next/source/modules",
                    "Duplicate module",
                ));
            }
            bound = Some((index, module));
        }
    }
    let (module_index, module) = bound.ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source/modules",
            "Source module is missing",
        )
    })?;
    let payload = val(
        val(module, "extensions", "/next/source/modules/extensions")?,
        "umf.tables",
        "/next/source/modules/extensions/umf.tables",
    )?;
    if !eq_text(get(payload, "profile"), "postgresql18/0.1") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source",
            "Table source profile is unsupported",
        ));
    }
    let declarations = items(
        val(payload, "tables", "/next/source/tables")?,
        "/next/source/tables",
    )?;
    if declarations.len() > 128 {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source/tables",
            "Table count is unsupported",
        ));
    }
    let source_seed_sets = items(
        val(payload, "seedSets", "/next/source/seedSets")?,
        "/next/source/seedSets",
    )?;
    let source_commands = items(
        val(payload, "commands", "/next/source/commands")?,
        "/next/source/commands",
    )?;
    let extension_path = format!("/modules/{module_index}/extensions/umf.tables");
    let rendered_steps = items(val(bundle, "steps", "/next/steps")?, "/next/steps")?;
    if declarations.is_empty() {
        if !source_commands.is_empty() || !source_seed_sets.is_empty() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/source",
                "Empty source cannot bind commands or seeds",
            ));
        }
        if rendered_steps.len() != 1
            || !eq_text(get(&rendered_steps[0], "sourcePath"), &extension_path)
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/steps",
                "Empty source must retain only its verified schema grant",
            ));
        }
        return Ok(Projection {
            catalog: empty_catalog(),
            dependencies: vec![],
            operations: vec![],
            renderer_operations: vec![],
            seed_states: vec![],
            source_paths: BTreeMap::new(),
            tables: vec![],
            reviews: vec![],
            inventory_tables: vec![],
        });
    }
    let schema_steps = rendered_steps
        .iter()
        .filter(|step| eq_text(get(step, "sourcePath"), &extension_path))
        .collect::<Vec<_>>();
    if schema_steps.len() != 1 {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Initial source requires one verified schema grant",
        ));
    }
    let mut parts = Vec::new();
    let mut selected_step_ids = BTreeSet::new();
    for (index, declaration) in declarations.iter().enumerate() {
        let table_path = format!("{extension_path}/tables/{index}");
        let mut steps = Vec::new();
        for step in rendered_steps {
            let path = member_text(step, "sourcePath", "/next/steps/sourcePath")?;
            if path == table_path || path.starts_with(&format!("{table_path}/")) {
                let id = member_text(step, "id", "/next/steps/id")?;
                if !selected_step_ids.insert(id) {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        "/next/steps",
                        "Duplicate renderer step",
                    ));
                }
                steps.push(step.clone());
            }
        }
        steps.push(schema_steps[0].clone());
        let mut table_bundle = bundle.clone();
        replace(&mut table_bundle, "steps", a(steps))?;
        parts.push(project_one_initial(
            document,
            &table_bundle,
            declaration.clone(),
            index,
            &extension_path,
            source_commands,
            source_seed_sets,
            ctx,
        )?);
    }
    if selected_step_ids.len() + 1 != rendered_steps.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "A verified renderer step has no source table",
        ));
    }
    let mut catalog = BTreeMap::<String, Vec<Value>>::new();
    for collection in COLLECTIONS {
        catalog.insert(collection.to_owned(), Vec::new());
    }
    let mut dependencies = Vec::new();
    let mut source_paths = BTreeMap::new();
    let mut operations = BTreeMap::<String, Value>::new();
    let mut schema_grant_operations = Vec::new();
    let mut global_grants = Vec::new();
    let mut global_grant_count = 0usize;
    let mut tables = Vec::new();
    let mut reviews = Vec::new();
    let mut inventory_tables = Vec::new();
    for part in parts {
        for collection in COLLECTIONS {
            for row in catalog_rows(&part.catalog, collection)? {
                if collection == "grants"
                    && get(row, "identity").and_then(|identity| get(identity, "table"))
                        == Some(&Value::Null)
                {
                    let position = global_grant_count % 2;
                    if global_grants.len() <= position {
                        global_grants.push(row.clone());
                    } else if global_grants[position] != *row {
                        return Err(err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            "/next/source",
                            "Conflicting schema grant meaning",
                        ));
                    }
                    global_grant_count += 1;
                    continue;
                }
                catalog.get_mut(collection).unwrap().push(row.clone());
            }
        }
        dependencies.extend(part.dependencies);
        for (key, path) in part.source_paths {
            if let Some(prior) = source_paths.insert(key.clone(), path.clone()) {
                if prior != path {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Conflicting source identity",
                    ));
                }
            }
        }
        for operation in part.renderer_operations {
            let step = val(&operation, "step", "/next/steps")?;
            let id = member_text(step, "id", "/next/steps/id")?;
            if eq_text(get(&operation, "operation"), "grant-schema-usage") {
                schema_grant_operations.push(operation);
            } else if operations.insert(id, operation).is_some() {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/next/steps",
                    "Duplicate renderer operation",
                ));
            }
        }
        tables.extend(part.tables);
        reviews.extend(part.reviews);
        inventory_tables.extend(part.inventory_tables);
    }
    if schema_grant_operations.len() != declarations.len()
        || global_grants.len() != 2
        || global_grant_count != declarations.len() * 2
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Schema grant projection is incomplete",
        ));
    }
    for operation in &schema_grant_operations[1..] {
        if operation != &schema_grant_operations[0] {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/steps",
                "Conflicting schema grant operation",
            ));
        }
    }
    catalog.get_mut("grants").unwrap().extend(global_grants);
    let mut ordered_operations = Vec::new();
    for step in rendered_steps {
        let id = member_text(step, "id", "/next/steps/id")?;
        let operation = if eq_text(get(step, "sourcePath"), &extension_path) {
            schema_grant_operations[0].clone()
        } else {
            operations.remove(&id).ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/next/steps",
                    "Renderer source binding is absent",
                )
            })?
        };
        ordered_operations.push(operation);
    }
    if !operations.is_empty() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Renderer source binding is duplicated",
        ));
    }
    let mut projected_operations = Vec::new();
    let mut operation_dependencies = Vec::new();
    let mut command_ids = BTreeSet::new();
    for (index, command) in source_commands.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/next/source/commands"))?;
        let path = format!("{extension_path}/commands/{index}");
        let id = member_text(command, "id", &path)?;
        if id.is_empty() || !command_ids.insert(id.clone()) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Duplicate or empty command identity",
            ));
        }
        let refs = command_refs::command_references(command, &path, declarations, ctx)?;
        let command_identity = identity("operation", None, s(&id));
        let command_key = hash(&command_identity, ctx)?;
        if source_paths
            .insert(command_key.clone(), path.clone())
            .is_some()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Duplicate source-derived command identity",
            ));
        }
        for table_id in &refs.tables {
            let declared = declarations
                .iter()
                .find(|table| eq_text(get(table, "id"), table_id))
                .ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Command table is unbound",
                    )
                })?;
            let target = hash(
                &identity(
                    "table",
                    Some(table_id),
                    val(declared, "record", &path)?.clone(),
                ),
                ctx,
            )?;
            if !source_paths.contains_key(&target) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Command table has no catalog subject",
                ));
            }
            operation_dependencies.push(edge(
                &command_key,
                &target,
                "operation-requires-table",
                &path,
            ));
        }
        for binding in &refs.fields {
            let table = declarations
                .iter()
                .find(|table| eq_text(get(table, "id"), &binding.table))
                .ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Command Field table is unbound",
                    )
                })?;
            let columns = items(val(table, "columns", &path)?, &path)?;
            ctx.charge_work(columns.len(), Utf16::from(path.as_str()))?;
            if !columns.iter().any(|column| {
                get(column, "field").is_some_and(|field| ref_equal(field, &binding.field))
            }) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Command Field is not bound to its exact source table",
                ));
            }
            let target = hash(
                &identity("column", Some(&binding.table), binding.field.clone()),
                ctx,
            )?;
            if !source_paths.contains_key(&target) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Command Field has no catalog subject",
                ));
            }
            operation_dependencies.push(edge(
                &command_key,
                &target,
                "operation-requires-field",
                &path,
            ));
        }
        for binding in &refs.keys {
            let table = declarations
                .iter()
                .find(|table| eq_text(get(table, "id"), &binding.table))
                .ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Command Key table is unbound",
                    )
                })?;
            let (record, _) = find_element(document, val(table, "record", &path)?)?;
            let keys = items(val(record, "keys", &path)?, &path)?;
            if !keys.iter().any(|key| eq_text(get(key, "id"), &binding.key)) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Command Key is not bound to its Record",
                ));
            }
            let target = hash(&identity("key", Some(&binding.table), s(&binding.key)), ctx)?;
            if !source_paths.contains_key(&target) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Command Key has no catalog subject",
                ));
            }
            operation_dependencies.push(edge(&command_key, &target, binding.reason, &path));
        }
        let parameter_domains =
            command_parameter_domains(command, document, declarations, &path, ctx)?;
        projected_operations.push(row(
            command_identity,
            o(vec![
                ("operation", command.clone()),
                ("logicalParameterDomains", a(parameter_domains)),
            ]),
            vec![],
        ));
    }
    let mut seed_operations = Vec::new();
    let mut seed_dependencies = Vec::new();
    let mut seed_states = Vec::new();
    let mut seed_ids = BTreeSet::new();
    for (index, seed) in source_seed_sets.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/next/source/seedSets"))?;
        let path = format!("{extension_path}/seedSets/{index}");
        let id = member_text(seed, "id", &path)?;
        if id.is_empty() || !seed_ids.insert(id.clone()) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Duplicate or empty seed identity",
            ));
        }
        let seed_identity = identity("seed-set", None, s(&id));
        let source_key = hash(&seed_identity, ctx)?;
        if source_paths
            .insert(source_key.clone(), path.clone())
            .is_some()
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Duplicate source-derived seed identity",
            ));
        }
        let definition_digest = hash(seed, ctx)?;
        seed_operations.push(row(seed_identity, seed.clone(), vec![]));
        seed_states.push(o(vec![
            ("id", s(&id)),
            ("definitionDigest", s(&definition_digest)),
            ("sourcePath", s(&path)),
            ("state", s("not-run")),
        ]));
        for seed_row in items(
            val(seed, "rows", &format!("{path}/rows"))?,
            &format!("{path}/rows"),
        )? {
            let table_id = member_text(seed_row, "table", &format!("{path}/rows/table"))?;
            let table = tables
                .iter()
                .find(|table| eq_text(get(table, "id"), &table_id))
                .ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Seed row table is unbound",
                    )
                })?;
            let target = hash(
                &identity(
                    "table",
                    Some(&table_id),
                    val(table, "record", &path)?.clone(),
                ),
                ctx,
            )?;
            if !source_paths.contains_key(&target) {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Seed row table has no catalog subject",
                ));
            }
            seed_dependencies.push(edge(&source_key, &target, "seed-set-requires-table", &path));
        }
    }
    projected_operations.extend(seed_operations);
    // The table catalog is projected by category; source operations and seed
    // rows then retain their declaration order, including mixed reference kinds.
    let mut ordered_dependencies = Vec::new();
    for dependency in &dependencies {
        if eq_text(get(dependency, "reason"), "typed-field-reference") {
            ordered_dependencies.push(dependency.clone());
        }
    }
    // The catalog projector emits ownership edges by collection, then by the
    // declared source order within that collection.  This matters when one
    // operation joins two tables into a single review closure.
    let mut owned_count = 0usize;
    for collection in [
        "columns",
        "keys",
        "checks",
        "foreignKeys",
        "indexes",
        "policies",
        "grants",
        "comments",
    ] {
        for subject in catalog.get(collection).expect("catalog collection") {
            let id = val(subject, "identity", "/catalog/identity")?;
            if get(id, "table") == Some(&Value::Null) {
                continue;
            }
            let subject_key = hash(id, ctx)?;
            let edge = dependencies
                .iter()
                .find(|dependency| {
                    eq_text(get(dependency, "reason"), "owned-by-table")
                        && eq_text(get(dependency, "from"), &subject_key)
                })
                .ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        "/catalog",
                        "Catalog subject lacks table ownership",
                    )
                })?;
            ordered_dependencies.push(edge.clone());
            owned_count += 1;
        }
    }
    if owned_count
        != dependencies
            .iter()
            .filter(|edge| eq_text(get(edge, "reason"), "owned-by-table"))
            .count()
    {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/catalog",
            "Table ownership is duplicated",
        ));
    }
    for reason in ["grant-requires-column", "key-requires-column"] {
        for dependency in &dependencies {
            if eq_text(get(dependency, "reason"), reason) {
                ordered_dependencies.push(dependency.clone());
            }
        }
    }
    if ordered_dependencies.len() != dependencies.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source",
            "An unsupported table dependency was projected",
        ));
    }
    ordered_dependencies.extend(operation_dependencies);
    ordered_dependencies.extend(seed_dependencies);
    rebuild_initial_reviews(
        document,
        &extension_path,
        declarations,
        source_seed_sets,
        &catalog,
        &ordered_dependencies,
        &projected_operations,
        &source_paths,
        &mut reviews,
        &mut inventory_tables,
        ctx,
    )?;
    Ok(Projection {
        catalog: o(COLLECTIONS
            .iter()
            .map(|collection| (*collection, a(catalog.remove(*collection).unwrap())))
            .collect()),
        dependencies: ordered_dependencies,
        operations: projected_operations,
        renderer_operations: ordered_operations,
        seed_states,
        source_paths,
        tables,
        reviews,
        inventory_tables,
    })
}

fn rebuild_initial_reviews(
    document: &Value,
    extension_path: &str,
    declarations: &[Value],
    source_seed_sets: &[Value],
    catalog: &BTreeMap<String, Vec<Value>>,
    dependencies: &[Value],
    operations: &[Value],
    source_subject_paths: &BTreeMap<String, String>,
    reviews: &mut [Value],
    inventory_tables: &mut [Value],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if declarations.len() != reviews.len() || declarations.len() != inventory_tables.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/source",
            "Table review count differs from source",
        ));
    }
    let mut all_source_paths = Vec::new();
    source_paths(document, String::new(), &mut all_source_paths, ctx)?;
    let extension_parent = extension_path
        .strip_suffix("/extensions/umf.tables")
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                extension_path,
                "Invalid table extension source path",
            )
        })?;
    let other_extensions = format!("{extension_parent}/extensions");
    for (index, declaration) in declarations.iter().enumerate() {
        let table_id = member_text(declaration, "id", extension_path)?;
        let table_path = format!("{extension_path}/tables/{index}");
        let table_root = hash(
            &identity(
                "table",
                Some(&table_id),
                val(declaration, "record", &table_path)?.clone(),
            ),
            ctx,
        )?;
        let mut included = BTreeSet::from([table_root]);
        loop {
            let before = included.len();
            for dependency in dependencies {
                ctx.charge_work(1, Utf16::from(table_path.as_str()))?;
                let from = member_text(dependency, "from", "/dependencies/from")?;
                let to = member_text(dependency, "to", "/dependencies/to")?;
                if included.contains(&from) {
                    included.insert(to.clone());
                }
                if included.contains(&to) {
                    included.insert(from);
                }
            }
            if included.len() == before {
                break;
            }
        }
        let old_meaning = val(&reviews[index], "meaning", "/reviews/meaning")?;
        let physical = val(
            old_meaning,
            "physicalTable",
            "/reviews/meaning/physicalTable",
        )?
        .clone();
        let record = val(
            old_meaning,
            "recordDefinition",
            "/reviews/meaning/recordDefinition",
        )?
        .clone();
        let fields = val(
            old_meaning,
            "fieldDefinitions",
            "/reviews/meaning/fieldDefinitions",
        )?
        .clone();
        let mut meaning_catalog = Vec::new();
        for collection in COLLECTIONS {
            let mut selected = Vec::new();
            for subject in catalog.get(collection).expect("catalog collection") {
                let id = val(subject, "identity", "/catalog/identity")?;
                let global_grant = collection == "grants" && get(id, "table") == Some(&Value::Null);
                if global_grant || included.contains(&hash(id, ctx)?) {
                    selected.push(subject.clone());
                }
            }
            meaning_catalog.push((collection, a(selected)));
        }
        let selected_edges = dependencies
            .iter()
            .filter(|edge| {
                get(edge, "from")
                    .and_then(text)
                    .is_some_and(|from| included.contains(&from))
                    && get(edge, "to")
                        .and_then(text)
                        .is_some_and(|to| included.contains(&to))
            })
            .cloned()
            .collect::<Vec<_>>();
        let mut selected_paths = BTreeSet::from([table_path]);
        selected_paths.insert(member_text(
            &record,
            "path",
            "/reviews/recordDefinition/path",
        )?);
        if source_at(document, "/vocabularies/umf.tables").is_some() {
            selected_paths.insert("/vocabularies/umf.tables".to_owned());
        }
        if let Some(Value::Object(entries)) = source_at(document, &other_extensions) {
            for (key, _) in entries {
                let name = key.to_utf8().map_err(|_| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &other_extensions,
                        "Opaque extension name cannot form a source path",
                    )
                })?;
                if name != "umf.tables" {
                    selected_paths.insert(format!("{other_extensions}/{}", pointer(&name)));
                    selected_paths.insert(format!("/vocabularies/{}", pointer(&name)));
                }
            }
        }
        for field in items(&fields, "/reviews/fieldDefinitions")? {
            selected_paths.insert(member_text(
                field,
                "path",
                "/reviews/fieldDefinitions/path",
            )?);
        }
        for key in &included {
            if let Some(path) = source_subject_paths.get(key) {
                selected_paths.insert(path.clone());
            }
        }
        let mut selected_operation_ids = Vec::new();
        for operation in operations {
            let id = val(operation, "identity", "/operations/identity")?;
            if !included.contains(&hash(id, ctx)?) || !eq_text(get(id, "kind"), "operation") {
                continue;
            }
            selected_operation_ids.push(val(id, "subject", "/operations/subject")?.clone());
            let domains = items(
                val(
                    val(operation, "meaning", "/operations/meaning")?,
                    "logicalParameterDomains",
                    "/operations/logicalParameterDomains",
                )?,
                "/operations/logicalParameterDomains",
            )?;
            for domain in domains {
                selected_paths.insert(member_text(
                    domain,
                    "definitionPath",
                    "/operations/logicalParameterDomains/definitionPath",
                )?);
            }
        }
        for edge in &selected_edges {
            selected_paths.insert(member_text(edge, "sourcePath", "/dependencies/sourcePath")?);
        }
        let mut closure = Vec::new();
        for path in &all_source_paths {
            if !selected_paths.contains(path) {
                continue;
            }
            if let Some(value) = source_at(document, path) {
                closure.push(o(vec![
                    ("path", s(if path.is_empty() { "/" } else { path })),
                    ("value", value.clone()),
                ]));
            }
        }
        let mut seed_definitions = Vec::new();
        for (seed_index, seed) in source_seed_sets.iter().enumerate() {
            let seed_id = member_text(seed, "id", "/next/source/seedSets/id")?;
            let identity = identity("seed-set", None, s(&seed_id));
            if !included.contains(&hash(&identity, ctx)?) {
                continue;
            }
            let path = format!("{extension_path}/seedSets/{seed_index}");
            seed_definitions.push(o(vec![
                ("id", s(&seed_id)),
                ("definitionDigest", s(&hash(seed, ctx)?)),
                ("sourcePath", s(&path)),
                ("definition", seed.clone()),
            ]));
        }
        let meaning = o(vec![
            ("physicalTable", physical),
            ("recordDefinition", record),
            ("fieldDefinitions", fields),
            ("sourceClosure", a(closure)),
            ("catalog", o(meaning_catalog)),
            ("dependencies", a(selected_edges)),
            ("operationIds", a(selected_operation_ids)),
            ("seedDefinitions", a(seed_definitions)),
        ]);
        replace(&mut reviews[index], "meaning", meaning.clone())?;
        replace(
            &mut inventory_tables[index],
            "meaningDigest",
            s(&hash(&meaning, ctx)?),
        )?;
    }
    Ok(())
}

fn renderer_operations(
    document: &Value,
    bundle: &Value,
    table: &Value,
    table_path: &str,
    extension_path: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let table_id = member_text(table, "id", table_path)?;
    let record = val(table, "record", table_path)?.clone();
    let config = val(bundle, "configuration", "/next/configuration")?;
    let schema = member_text(config, "schema", "/next/configuration/schema")?;
    let policy = val(table, "policy", &format!("{table_path}/policy"))?;
    let mut expected = vec![
        (
            "create-table",
            "table",
            table_path.to_owned(),
            o(vec![
                ("kind", s("table")),
                ("table", s(&table_id)),
                ("record", record.clone()),
            ]),
        ),
        (
            "enable-rls",
            "table",
            table_path.to_owned(),
            o(vec![
                ("kind", s("tableState")),
                ("table", s(&table_id)),
                ("record", record.clone()),
            ]),
        ),
        (
            "force-rls",
            "table",
            table_path.to_owned(),
            o(vec![
                ("kind", s("tableState")),
                ("table", s(&table_id)),
                ("record", record.clone()),
            ]),
        ),
        (
            "revoke-public",
            "grant",
            table_path.to_owned(),
            o(vec![
                ("kind", s("publicGrant")),
                ("table", s(&table_id)),
                ("privilege", s("all")),
            ]),
        ),
    ];
    for audience in ["person", "batch"] {
        let role = member_text(
            config,
            if audience == "person" {
                "personRole"
            } else {
                "batchRole"
            },
            "/next/configuration",
        )?;
        let rules = val(policy, audience, &format!("{table_path}/policy/{audience}"))?;
        for command in ["select", "insert", "update", "delete"] {
            let path = format!("{table_path}/policy/{audience}/{command}");
            let rule = val(rules, command, &path)?;
            expected.push((
                "create-policy",
                "policy",
                path.clone(),
                o(vec![
                    ("kind", s("policy")),
                    ("table", s(&table_id)),
                    ("audience", s(audience)),
                    ("command", s(command)),
                ]),
            ));
            if !eq_text(get(rule, "kind"), "deny") {
                let columns = if command == "update" {
                    let record_module = member_text(&record, "module", table_path)?;
                    let (record_definition, _) = find_element(document, &record)?;
                    let names = mutable_table_grant_columns(
                        table,
                        &record_module,
                        record_definition,
                        &path,
                        ctx,
                    )
                    .map_err(|error| {
                        if error.is_control_failure() {
                            error
                        } else {
                            err(
                                "TABLE_INVENTORY_UNSUPPORTED",
                                &path,
                                "Invalid mutable UPDATE grant columns",
                            )
                        }
                    })?;
                    if names.is_empty() {
                        return Err(err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            &path,
                            "UPDATE has no mutable ordinary columns",
                        ));
                    }
                    a(names.iter().map(|name| s(name)).collect())
                } else {
                    Value::Null
                };
                expected.push((
                    "grant-table",
                    "grant",
                    path.clone(),
                    o(vec![
                        ("kind", s("tableGrant")),
                        ("table", s(&table_id)),
                        ("role", s(&role)),
                        ("privilege", s(command)),
                        ("columns", columns),
                    ]),
                ));
            }
        }
    }
    expected.push((
        "grant-schema-usage",
        "grant",
        extension_path.to_owned(),
        o(vec![
            ("kind", s("schema-grant")),
            ("schema", s(&schema)),
            ("audiences", a(vec![s("person"), s("batch")])),
            ("privilege", s("USAGE")),
        ]),
    ));
    let steps = items(val(bundle, "steps", "/next/steps")?, "/next/steps")?;
    if steps.len() != expected.len() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Verified renderer operation count differs from source",
        ));
    }
    let mut operations = Vec::new();
    ctx.charge_work(steps.len(), Utf16::from("/next/steps"))?;
    for (step, (operation, kind, path, subject)) in steps.iter().zip(expected) {
        if !eq_text(get(step, "kind"), kind)
            || !eq_text(get(step, "sourcePath"), &path)
            || !eq_text(get(step, "transaction"), "required")
        {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                "/next/steps",
                "Verified renderer operation does not bind the source",
            ));
        }
        operations.push(o(vec![
            ("operation", s(operation)),
            ("kind", s(kind)),
            ("sourcePath", s(&path)),
            ("subject", subject),
            ("step", step.clone()),
        ]));
    }
    Ok(operations)
}

fn command_parameter_domains(
    command: &Value,
    document: &Value,
    tables: &[Value],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let parameters = items(
        val(command, "parameters", &format!("{path}/parameters"))?,
        &format!("{path}/parameters"),
    )?;
    if eq_text(get(command, "version"), "umf.table-operation/0.2") && !parameters.is_empty() {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            &format!("{path}/parameters"),
            "Typed row-expression operation has no logical parameters",
        ));
    }
    let mut domains = Vec::new();
    for (index, parameter) in parameters.iter().enumerate() {
        let parameter_path = format!("{path}/parameters/{index}");
        ctx.charge_work(1, Utf16::from(parameter_path.as_str()))?;
        let id = member_text(parameter, "id", &format!("{parameter_path}/id"))?;
        let field = val(parameter, "field", &format!("{parameter_path}/field"))?;
        let (definition, definition_path) = find_element(document, field)?;
        if !eq_text(get(definition, "kind"), "field") {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("{parameter_path}/field"),
                "Logical parameter must bind a Field definition",
            ));
        }
        let mut bound = false;
        for table in tables {
            let columns = items(val(table, "columns", path)?, path)?;
            ctx.charge_work(columns.len(), Utf16::from(parameter_path.as_str()))?;
            if columns.iter().any(|column| {
                get(column, "field").is_some_and(|candidate| ref_equal(candidate, field))
            }) {
                bound = true;
            }
        }
        if !bound {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("{parameter_path}/field"),
                "Logical parameter Field is not bound to a source table",
            ));
        }
        domains.push(o(vec![
            ("parameterId", s(&id)),
            ("parameterPath", s(&format!("/parameters/{index}/field"))),
            ("field", field.clone()),
            ("definitionPath", s(&definition_path)),
            ("definition", definition.clone()),
        ]));
    }
    Ok(domains)
}

fn project_one_initial(
    document: &Value,
    bundle: &Value,
    table: Value,
    table_index: usize,
    extension_path: &str,
    source_commands: &[Value],
    source_seed_sets: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Projection, EngineError> {
    let table_id = member_text(&table, "id", "/next/source/tables/id")?;
    let table_path = format!("{extension_path}/tables/{table_index}");
    let record_ref = val(&table, "record", &format!("{table_path}/record"))?.clone();
    let (record, record_path) = find_element(document, &record_ref)?;
    let configuration = val(bundle, "configuration", "/next/configuration")?;
    let schema = member_text(configuration, "schema", "/next/configuration/schema")?;
    let columns = items(
        val(&table, "columns", &format!("{table_path}/columns"))?,
        &format!("{table_path}/columns"),
    )?;
    let keys = items(
        val(record, "keys", &format!("{record_path}/keys"))?,
        &format!("{record_path}/keys"),
    )?;
    for section in ["checks", "foreignKeys", "indexes"] {
        if !items(val(&table, section, &table_path)?, &table_path)?.is_empty() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &table_path,
                "Typed constraint/index graph is not yet implemented",
            ));
        }
    }
    let mut catalog: BTreeMap<String, Vec<Value>> = COLLECTIONS
        .iter()
        .map(|key| ((*key).to_owned(), Vec::new()))
        .collect();
    let mut sources = BTreeMap::<String, String>::new();
    let mut dependencies = Vec::new();
    let mut column_ids = BTreeMap::<String, String>::new();
    let mut column_native_ids = BTreeMap::<String, String>::new();
    let table_identity = identity("table", Some(&table_id), record_ref.clone());
    let table_key = push_row(
        &mut catalog,
        &mut sources,
        "tables",
        table_identity,
        o(vec![
            ("declaration", table.clone()),
            ("record", record.clone()),
            ("schema", s(&schema)),
            ("name", val(&table, "name", &table_path)?.clone()),
            (
                "rls",
                o(vec![
                    ("enabled", Value::Bool(true)),
                    ("forced", Value::Bool(true)),
                ]),
            ),
        ]),
        &table_path,
        vec![],
        ctx,
    )?;
    let mut field_definitions = Vec::new();
    for (index, column) in columns.iter().enumerate() {
        let column_path = format!("{table_path}/columns/{index}");
        let field = val(column, "field", &column_path)?;
        let (definition, field_path) = find_element(document, field)?;
        let expectation = expected_row(bundle, "columns", &table_id, Some(field), None)?.clone();
        let id = identity("column", Some(&table_id), field.clone());
        let key = push_row(
            &mut catalog,
            &mut sources,
            "columns",
            id,
            o(vec![
                ("column", column.clone()),
                ("field", definition.clone()),
                ("expectation", expectation),
            ]),
            &column_path,
            vec![],
            ctx,
        )?;
        let name = member_text(field, "element", &column_path)?;
        let native_name = member_text(column, "name", &column_path)?;
        if column_native_ids.insert(native_name, key.clone()).is_some() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &column_path,
                "Duplicate native column name",
            ));
        }
        if column_ids.insert(name, key).is_some() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &column_path,
                "Duplicate field binding",
            ));
        }
        field_definitions.push(o(vec![
            ("path", s(&field_path)),
            ("value", definition.clone()),
        ]));
    }
    let mut key_ids = BTreeMap::<String, String>::new();
    for (index, key) in keys.iter().enumerate() {
        let path = format!("{record_path}/keys/{index}");
        let name = member_text(key, "id", &path)?;
        let expectation = expected_row(bundle, "keys", &table_id, None, Some(&name))?.clone();
        let id = identity("key", Some(&table_id), s(&name));
        let digest = push_row(
            &mut catalog,
            &mut sources,
            "keys",
            id,
            o(vec![
                ("declaration", key.clone()),
                ("expectation", expectation),
            ]),
            &path,
            vec![],
            ctx,
        )?;
        if key_ids.insert(name, digest).is_some() {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &path,
                "Duplicate record key",
            ));
        }
    }
    let policy = val(&table, "policy", &format!("{table_path}/policy"))?;
    if !eq_text(get(policy, "mode"), "native-rls") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            &table_path,
            "Unsupported policy mode",
        ));
    }
    let mut grants = Vec::new();
    let public_path = table_path.clone();
    grants.push(o(vec![
        ("table", s(&table_id)),
        ("role", s("PUBLIC")),
        ("privilege", s("all")),
        ("columns", Value::Null),
        ("grantOption", Value::Bool(false)),
        ("sourcePath", s(&public_path)),
        ("state", s("present")),
        ("effect", s("revoke-all")),
    ]));
    for audience in ["person", "batch"] {
        let role = member_text(
            configuration,
            if audience == "person" {
                "personRole"
            } else {
                "batchRole"
            },
            "/next/configuration",
        )?;
        let rules = val(policy, audience, &format!("{table_path}/policy/{audience}"))?;
        for command in ["select", "insert", "update", "delete"] {
            let path = format!("{table_path}/policy/{audience}/{command}");
            let rule = val(rules, command, &path)?;
            let kind = member_text(rule, "kind", &path)?;
            let mut fields = Vec::new();
            match kind.as_str() {
                "allow" | "deny" => {}
                "owner" => {
                    let field = val(rule, "field", &path)?;
                    let name = member_text(field, "element", &path)?;
                    let column_key = column_ids.get(&name).ok_or_else(|| {
                        err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            &path,
                            "Policy Field has no table column",
                        )
                    })?;
                    fields.push(o(vec![("table", s(&table_id)), ("field", field.clone())]));
                    let policy_id = hash(
                        &identity("policy", Some(&table_id), a(vec![s(audience), s(command)])),
                        ctx,
                    )?;
                    dependencies.push(edge(&policy_id, column_key, "typed-field-reference", &path));
                }
                _ => {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Policy dependency kind is not implemented",
                    ))
                }
            }
            push_row(
                &mut catalog,
                &mut sources,
                "policies",
                identity("policy", Some(&table_id), a(vec![s(audience), s(command)])),
                o(vec![
                    ("audience", s(audience)),
                    ("command", s(command)),
                    ("rule", rule.clone()),
                    ("fieldRefs", a(fields)),
                    ("relatedTables", a(vec![])),
                    ("sourcePath", s(&path)),
                ]),
                &path,
                vec![],
                ctx,
            )?;
            if kind != "deny" {
                let update_columns = if command == "update" {
                    let record_module = member_text(&record_ref, "module", &table_path)?;
                    let names = mutable_table_grant_columns(
                        &table,
                        &record_module,
                        record,
                        &path,
                        ctx,
                    )
                    .map_err(|error| {
                        if error.is_control_failure() {
                            error
                        } else {
                            err(
                                "TABLE_INVENTORY_UNSUPPORTED",
                                &path,
                                "Invalid mutable UPDATE grant columns",
                            )
                        }
                    })?;
                    if names.is_empty() {
                        return Err(err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            &path,
                            "UPDATE has no mutable ordinary columns",
                        ));
                    }
                    a(names.iter().map(|name| s(name)).collect())
                } else {
                    Value::Null
                };
                grants.push(o(vec![
                    ("table", s(&table_id)),
                    ("role", s(&role)),
                    ("privilege", s(command)),
                    ("columns", update_columns),
                    ("grantOption", Value::Bool(false)),
                    ("sourcePath", s(&path)),
                    ("state", s("present")),
                    ("effect", s("grant")),
                    ("rule", rule.clone()),
                ]));
            }
        }
    }
    for audience in ["person", "batch"] {
        let role = member_text(
            configuration,
            if audience == "person" {
                "personRole"
            } else {
                "batchRole"
            },
            "/next/configuration",
        )?;
        grants.push(o(vec![
            ("table", Value::Null),
            ("role", s(&role)),
            ("privilege", s("usage")),
            ("columns", Value::Null),
            ("grantOption", Value::Bool(false)),
            ("sourcePath", s(extension_path)),
            ("state", s("present")),
            ("effect", s("grant-schema-usage")),
        ]));
    }
    let mut grant_edges = Vec::new();
    for grant in grants {
        let role = val(&grant, "role", "/catalog/grants")?.clone();
        let privilege = val(&grant, "privilege", "/catalog/grants")?.clone();
        let columns = val(&grant, "columns", "/catalog/grants")?.clone();
        let grant_table = get(&grant, "table").and_then(text);
        let path = member_text(&grant, "sourcePath", "/catalog/grants/sourcePath")?;
        let grant_id = identity(
            "grant",
            grant_table.as_deref(),
            a(vec![role, privilege, columns.clone()]),
        );
        let grant_key = push_row(
            &mut catalog,
            &mut sources,
            "grants",
            grant_id,
            grant,
            &path,
            vec![],
            ctx,
        )?;
        if let Value::Array(names) = columns {
            for name in names {
                let native = text(&name).ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Column grant name is invalid",
                    )
                })?;
                let target = column_native_ids.get(&native).ok_or_else(|| {
                    err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &path,
                        "Column grant is unbound",
                    )
                })?;
                grant_edges.push(edge(&grant_key, target, "grant-requires-column", &path));
            }
        }
    }
    for collection in ["columns", "keys", "policies", "grants"] {
        for subject in catalog.get(collection).expect("catalog collection") {
            if get(val(subject, "identity", "/catalog")?, "table") != Some(&s(&table_id)) {
                continue;
            }
            let id = hash(val(subject, "identity", "/catalog")?, ctx)?;
            let path = sources.get(&id).ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/catalog",
                    "Subject path missing",
                )
            })?;
            dependencies.push(edge(&id, &table_key, "owned-by-table", path));
        }
    }
    dependencies.extend(grant_edges);
    for key in keys {
        let id = member_text(key, "id", &record_path)?;
        let from = key_ids.get(&id).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &record_path,
                "Key subject missing",
            )
        })?;
        for field in items(val(key, "fields", &record_path)?, &record_path)? {
            let name = member_text(field, "element", &record_path)?;
            let to = column_ids.get(&name).ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &record_path,
                    "Key field has no table column",
                )
            })?;
            dependencies.push(edge(
                from,
                to,
                "key-requires-column",
                &format!("{table_path}/record"),
            ));
        }
    }
    let operation_ids = Vec::new();
    let command_paths: Vec<String> = Vec::new();
    let selected_parameter_paths: Vec<String> = Vec::new();
    let seed_definitions: Vec<Value> = Vec::new();
    let seed_paths: Vec<String> = Vec::new();
    let catalog = o(COLLECTIONS
        .iter()
        .map(|key| (*key, a(catalog.remove(*key).expect("catalog collection"))))
        .collect());
    let mut all_paths = Vec::new();
    source_paths(document, String::new(), &mut all_paths, ctx)?;
    let mut selected = BTreeSet::new();
    selected.insert("/vocabularies/umf.tables".to_owned());
    selected.insert(table_path.clone());
    selected.insert(record_path.clone());
    selected.insert(format!("{table_path}/record"));
    selected.extend(seed_paths);
    selected.extend(command_paths);
    selected.extend(selected_parameter_paths);
    let parent = extension_path
        .strip_suffix("/extensions/umf.tables")
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                extension_path,
                "Source extension path is invalid",
            )
        })?;
    let other_extensions = format!("{parent}/extensions");
    if let Some(Value::Object(entries)) = source_at(document, &other_extensions) {
        for (name, _) in entries {
            let key = name.to_utf8().map_err(|_| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &other_extensions,
                    "Opaque extension name cannot form a source path",
                )
            })?;
            if key != "umf.tables" {
                selected.insert(format!("{other_extensions}/{}", pointer(&key)));
                selected.insert(format!("/vocabularies/{}", pointer(&key)));
            }
        }
    }
    for definition in &field_definitions {
        selected.insert(member_text(definition, "path", "/fieldDefinitions")?);
    }
    for path in sources.values() {
        // Schema grants are retained in the catalog but do not form a table-owned
        // source closure edge. Their containing extension is not copied wholesale.
        if path != extension_path {
            selected.insert(path.clone());
        }
    }
    for dep in &dependencies {
        selected.insert(member_text(dep, "sourcePath", "/dependencies")?);
    }
    let closure = all_paths
        .into_iter()
        .filter(|path| selected.contains(path))
        .filter_map(|path| {
            source_at(document, &path).map(|value| {
                o(vec![
                    ("path", s(if path.is_empty() { "/" } else { &path })),
                    ("value", value.clone()),
                ])
            })
        })
        .collect::<Vec<_>>();
    let meaning = o(vec![
        (
            "physicalTable",
            o(vec![("path", s(&table_path)), ("value", table.clone())]),
        ),
        (
            "recordDefinition",
            o(vec![("path", s(&record_path)), ("value", record.clone())]),
        ),
        ("fieldDefinitions", a(field_definitions)),
        ("sourceClosure", a(closure)),
        ("catalog", catalog.clone()),
        ("dependencies", a(dependencies.clone())),
        ("operationIds", a(operation_ids)),
        ("seedDefinitions", a(seed_definitions)),
    ]);
    let review = o(vec![
        ("profile", s("umf.table-inventory-review/0.1")),
        ("side", s("next")),
        (
            "source",
            o(vec![
                ("format", s("json")),
                (
                    "sha256",
                    val(bundle, "sourceDigest", "/next/sourceDigest")?.clone(),
                ),
            ]),
        ),
        ("configuration", configuration.clone()),
        ("table", s(&table_id)),
        ("record", record_ref.clone()),
        ("meaning", meaning.clone()),
        ("intent", Value::Null),
        ("effects", a(vec![])),
    ]);
    let inventory_table = o(vec![
        ("table", s(&table_id)),
        ("record", record_ref),
        ("schema", s(&schema)),
        ("name", val(&table, "name", &table_path)?.clone()),
        ("meaningDigest", s(&hash(&meaning, ctx)?)),
    ]);
    let renderer_operations =
        renderer_operations(document, bundle, &table, &table_path, extension_path, ctx)?;
    Ok(Projection {
        catalog,
        dependencies,
        operations: vec![],
        renderer_operations,
        seed_states: vec![],
        source_paths: sources,
        tables: vec![table],
        reviews: vec![review],
        inventory_tables: vec![inventory_table],
    })
}
fn initial_candidates(
    _projection: &Projection,
    _bundle: &Value,
    _options: &Value,
    _ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let projection = _projection;
    let options = _options;
    let ctx = _ctx;
    let intents = items(
        val(options, "tableIntents", "/options/tableIntents")?,
        "/options/tableIntents",
    )?;
    if intents.len() != projection.tables.len() {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/options/tableIntents",
            "Initial source requires one exact create intent per table",
        ));
    }
    let mut candidates = Vec::new();
    let mut selected = BTreeSet::new();
    for (intent_index, intent) in intents.iter().enumerate() {
        let intent_path = format!("/options/tableIntents/{intent_index}");
        if !exact_fields(intent, &["kind", "table", "record"])
            || !eq_text(get(intent, "kind"), "create")
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &intent_path,
                "Create intent is not closed",
            ));
        }
        let table = member_text(intent, "table", &intent_path)?;
        let table_index = projection
            .tables
            .iter()
            .position(|declaration| eq_text(get(declaration, "id"), &table))
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    &intent_path,
                    "Create intent has no verified source table",
                )
            })?;
        if !selected.insert(table_index) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &intent_path,
                "Source table is selected twice",
            ));
        }
        let record = val(&projection.tables[table_index], "record", &intent_path)?;
        if !get(intent, "record").is_some_and(|value| ref_equal(value, record)) {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &intent_path,
                "Create intent does not bind the verified source table",
            ));
        }
        let path = projection
            .source_paths
            .get(&hash(
                &identity("table", Some(&table), record.clone()),
                ctx,
            )?)
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/next/source",
                    "Verified table source path is absent",
                )
            })?
            .clone();
        let mut review = projection.reviews[table_index].clone();
        let Value::Object(fields) = &mut review else {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/review",
                "Invalid source review",
            ));
        };
        fields.retain(|(key, _)| key != &Utf16::from("intent") && key != &Utf16::from("effects"));
        fields.push((
            Utf16::from("intent"),
            o(vec![
                ("kind", s("create")),
                ("table", s(&table)),
                ("record", record.clone()),
            ]),
        ));
        fields.push((Utf16::from("effects"), a(vec![s("new-physical-binding")])));
        let new_digest = hash(&review, ctx)?;
        let seed = a(vec![
            s("create-table"),
            s(&path),
            s(ZERO_DIGEST),
            s(&new_digest),
        ]);
        let identifier = format!("review-{}", &hash(&seed, ctx)?[..24]);
        candidates.push(o(vec![
            ("id", s(&identifier)),
            ("kind", s("create-table")),
            ("path", s(&path)),
            ("oldDigest", s(ZERO_DIGEST)),
            ("newDigest", s(&new_digest)),
            ("oldValue", Value::Null),
            ("newValue", review),
            ("oldPath", Value::Null),
            ("newPath", s(&path)),
        ]));
    }
    Ok(candidates)
}

fn source_review_candidate(
    kind: &str,
    path: &str,
    old_value: Value,
    new_value: Value,
    old_path: Value,
    new_path: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let old_digest = hash(&old_value, ctx)?;
    let new_digest = hash(&new_value, ctx)?;
    let identity = a(vec![s(kind), s(path), s(&old_digest), s(&new_digest)]);
    let id = format!("review-{}", &hash(&identity, ctx)?[..24]);
    Ok(o(vec![
        ("id", s(&id)),
        ("kind", s(kind)),
        ("path", s(path)),
        ("oldDigest", s(&old_digest)),
        ("newDigest", s(&new_digest)),
        ("oldValue", old_value),
        ("newValue", new_value),
        ("oldPath", old_path),
        ("newPath", new_path),
    ]))
}

fn remove_review_side(
    original: &Value,
    side: &str,
    intent: &Value,
    effects: &[Value],
) -> Result<Value, EngineError> {
    let mut review = original.clone();
    replace(&mut review, "side", s(side))?;
    replace(&mut review, "intent", intent.clone())?;
    replace(&mut review, "effects", a(effects.to_vec()))?;
    Ok(review)
}

fn removal_candidates(
    before: &Projection,
    after: &Projection,
    previous: &Value,
    next: &Value,
    selector: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let intents = items(
        val(selector, "tableIntents", "/selector/tableIntents")?,
        "/selector/tableIntents",
    )?;
    if intents.is_empty()
        || intents.len() > 256
        || before.inventory_tables.len() != after.inventory_tables.len() + intents.len()
    {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/selector/tableIntents",
            "Source changes must remove exactly the selected tables",
        ));
    }
    let mut selected = BTreeSet::new();
    let mut candidates = Vec::new();
    for (intent_index, supplied) in intents.iter().enumerate() {
        let intent_path = format!("/selector/tableIntents/{intent_index}");
        let record_path = format!("{intent_path}/record");
        let disposition_path = format!("{intent_path}/disposition");
        ctx.charge_work(1, Utf16::from(intent_path.as_str()))?;
        if !exact_fields(supplied, &["kind", "table", "record", "disposition"])
            || !eq_text(get(supplied, "kind"), "remove")
            || !exact_fields(
                val(supplied, "record", &record_path)?,
                &["module", "element"],
            )
            || !exact_fields(val(supplied, "disposition", &disposition_path)?, &["mode"])
            || !eq_text(
                get(val(supplied, "disposition", &disposition_path)?, "mode"),
                "irreversible-purge",
            )
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &intent_path,
                "Removal intent must bind an irreversible purge",
            ));
        }
        let table = member_text(supplied, "table", &format!("{intent_path}/table"))?;
        let record = val(supplied, "record", &record_path)?;
        let index = before
            .inventory_tables
            .iter()
            .position(|old| eq_text(get(old, "table"), &table))
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    &intent_path,
                    "Selected table is absent from previous source",
                )
            })?;
        if !selected.insert(index)
            || !ref_equal(
                val(
                    &before.inventory_tables[index],
                    "record",
                    "/previous/tables/record",
                )?,
                record,
            )
            || after
                .inventory_tables
                .iter()
                .any(|fresh| eq_text(get(fresh, "table"), &table))
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                &intent_path,
                "Removal intent does not bind one previous-only table",
            ));
        }
        let old_path = before
            .source_paths
            .get(&hash(
                &identity("table", Some(&table), record.clone()),
                ctx,
            )?)
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/previous/source",
                    "Previous table declaration path is absent",
                )
            })?
            .clone();
        let intent = o(vec![
            ("kind", s("remove")),
            ("table", s(&table)),
            ("record", record.clone()),
            ("disposition", o(vec![("mode", s("irreversible-purge"))])),
        ]);
        let effects = vec![
            s("ordinary-access-retired"),
            s("stored-rows-irreversibly-purged"),
            s("physical-binding-removed"),
        ];
        let old_review = remove_review_side(&before.reviews[index], "previous", &intent, &effects)?;
        let new_review = o(vec![
            ("profile", s("umf.table-inventory-review/0.1")),
            ("side", s("next")),
            (
                "source",
                o(vec![
                    ("format", s("json")),
                    (
                        "sha256",
                        clone_member(next, "sourceDigest", "/next/sourceDigest")?,
                    ),
                ]),
            ),
            (
                "configuration",
                clone_member(next, "configuration", "/next/configuration")?,
            ),
            ("table", s(&table)),
            ("record", record.clone()),
            ("meaning", Value::Null),
            ("intent", intent),
            ("effects", a(effects)),
        ]);
        candidates.push(source_review_candidate(
            "remove-table",
            &old_path,
            old_review.clone(),
            new_review.clone(),
            s(&old_path),
            Value::Null,
            ctx,
        )?);
        candidates.push(source_review_candidate(
            "table-removal-effects",
            &format!("/options/tableIntents/{intent_index}/disposition"),
            old_review,
            new_review,
            s(&old_path),
            Value::Null,
            ctx,
        )?);
    }
    if after.inventory_tables.iter().any(|row| {
        !before
            .inventory_tables
            .iter()
            .any(|prior| get(prior, "table") == get(row, "table"))
    }) {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/next",
            "Unselected table was created",
        ));
    }
    if !same(
        val(previous, "configuration", "/previous/configuration")?,
        val(next, "configuration", "/next/configuration")?,
        ctx,
    )? {
        return Err(err(
            "TABLE_MIGRATION_REVIEW",
            "/next/configuration",
            "Removal changed deployment configuration",
        ));
    }
    for (index, old) in before.inventory_tables.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/previous/tables"))?;
        if selected.contains(&index) {
            continue;
        }
        let old_id = member_text(old, "table", "/previous/tables")?;
        let fresh = after
            .inventory_tables
            .iter()
            .find(|row| eq_text(get(row, "table"), &old_id))
            .ok_or_else(|| {
                err(
                    "TABLE_MIGRATION_REVIEW",
                    "/selector/tableIntents",
                    "Unselected table was removed",
                )
            })?;
        if !same(old, fresh, ctx)? {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/next",
                "Retained table meaning changed",
            ));
        }
    }
    Ok(candidates)
}
fn clone_member(value: &Value, key: &str, path: &str) -> Result<Value, EngineError> {
    Ok(val(value, key, path)?.clone())
}
fn replace(value: &mut Value, key: &str, next: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Expected an object",
        ));
    };
    let Some((_, slot)) = fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
    else {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Expected object member",
        ));
    };
    *slot = next;
    Ok(())
}
fn canonical_text(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    String::from_utf8(canonical_json_admitted(value, ctx)?).map_err(|_| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/",
            "Canonical text must be UTF-8",
        )
    })
}
fn catalog_rows<'a>(catalog: &'a Value, section: &str) -> Result<&'a [Value], EngineError> {
    items(
        val(catalog, section, &format!("/catalog/{section}"))?,
        &format!("/catalog/{section}"),
    )
}
fn catalog_match<'a>(
    catalog: &'a Value,
    section: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<&'a Value, EngineError> {
    let mut found = None;
    for row in catalog_rows(catalog, section)? {
        ctx.charge_work(1, Utf16::from(path))?;
        if eq_text(get(val(row, "meaning", "/catalog")?, "sourcePath"), path) {
            if found.replace(row).is_some() {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    path,
                    "Ambiguous source-bound catalog row",
                ));
            }
        }
    }
    found.ok_or_else(|| {
        err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "Catalog row does not bind renderer operation",
        )
    })
}
fn metadata_subject() -> Value {
    o(vec![
        ("kind", s("metadata")),
        ("profile", s("umf.table-inventory-metadata/0.1")),
    ])
}
fn prefix_frame(
    index: usize,
    completed: &[Value],
    catalog: Value,
    table_states: Value,
    seed_states: Value,
    state: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut frame = o(vec![
        ("profile", s("umf.table-inventory-prefix/0.1")),
        ("index", Value::Number(index as f64)),
        ("completedSteps", a(completed.to_vec())),
        ("tableStates", table_states),
        ("catalog", catalog),
        (
            "metadata",
            o(vec![
                ("profile", s("umf.table-inventory-metadata/0.1")),
                ("state", s(state)),
            ]),
        ),
        ("seedStates", seed_states),
    ]);
    let digest = hash(&frame, ctx)?;
    let Value::Object(fields) = &mut frame else {
        unreachable!()
    };
    fields.push((Utf16::from("digest"), s(&digest)));
    Ok(frame)
}
fn table_state(
    catalog: &Value,
    table: &str,
    record: &Value,
    creation_step: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut local_fields = Vec::new();
    for section in COLLECTIONS {
        let rows = catalog_rows(catalog, section)?
            .iter()
            .filter(|row| {
                get(row, "identity")
                    .and_then(|id| get(id, "table"))
                    .is_some_and(|v| eq_text(Some(v), table))
            })
            .cloned()
            .collect();
        local_fields.push((section, a(rows)));
    }
    let local = o(local_fields);
    let definition = o(vec![
        ("profile", s("umf.table-inventory-table-definition/0.1")),
        ("table", s(table)),
        ("record", record.clone()),
        ("catalog", local),
    ]);
    Ok(o(vec![
        ("table", s(table)),
        ("record", record.clone()),
        ("state", s("present")),
        ("definitionDigest", s(&hash(&definition, ctx)?)),
        ("creationStep", s(creation_step)),
        ("removalStep", Value::Null),
    ]))
}
fn step_number(index: usize) -> String {
    format!("step-{index:05}")
}
fn phase_number(index: usize) -> String {
    format!("phase-{index:05}")
}
fn phase(index: usize, kind: &str, ids: &[String]) -> Value {
    o(vec![
        ("id", s(&phase_number(index))),
        ("kind", s(kind)),
        ("transaction", s("required")),
        ("steps", a(ids.iter().map(|id| s(id)).collect())),
    ])
}
fn step_value(
    id: &str,
    kind: &str,
    path: &str,
    sql: Value,
    operation: &str,
    subject: Value,
    pre: &str,
    post: &str,
) -> Value {
    o(vec![
        ("id", s(id)),
        ("kind", s(kind)),
        ("sourcePath", s(path)),
        ("transaction", s("required")),
        ("sql", sql),
        ("operation", s(operation)),
        ("inventorySubject", subject),
        (
            "preconditions",
            o(vec![
                ("kind", s("inventory-prefix")),
                ("prefixDigest", s(pre)),
            ]),
        ),
        (
            "expectedOutcome",
            o(vec![
                ("kind", s("inventory-prefix")),
                ("prefixDigest", s(post)),
            ]),
        ),
        (
            "verification",
            s("native-catalog-privileges-and-role-scope"),
        ),
        ("recovery", s("rollback-transaction")),
    ])
}
fn renderer_subject(
    operation: &Value,
    projection: &Projection,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let op = member_text(operation, "operation", "/operations")?;
    let source_path = member_text(operation, "sourcePath", "/operations")?;
    let raw = val(operation, "subject", "/operations/subject")?;
    if op == "grant-schema-usage" {
        return Ok(raw.clone());
    }
    let table = member_text(raw, "table", "/operations/subject/table")?;
    let declaration = projection
        .tables
        .iter()
        .find(|value| eq_text(get(value, "id"), &table))
        .ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &source_path,
                "Renderer operation has no source table",
            )
        })?;
    let record = val(declaration, "record", "/next/source/tables/record")?;
    if matches!(op.as_str(), "create-table" | "enable-rls" | "force-rls") {
        return Ok(o(vec![
            ("kind", s("table")),
            ("table", s(&table)),
            ("record", record.clone()),
        ]));
    }
    let section = if op == "create-policy" {
        "policies"
    } else {
        "grants"
    };
    let selected = if op == "revoke-public" {
        let mut result = None;
        for row in catalog_rows(&projection.catalog, "grants")? {
            ctx.charge_work(1, Utf16::from(source_path.as_str()))?;
            if get(row, "identity").and_then(|id| get(id, "table")) == Some(&s(&table))
                && eq_text(
                    get(val(row, "meaning", "/catalog")?, "effect"),
                    "revoke-all",
                )
            {
                if result.replace(row).is_some() {
                    return Err(err(
                        "TABLE_INVENTORY_UNSUPPORTED",
                        &source_path,
                        "Duplicate PUBLIC grant",
                    ));
                }
            }
        }
        result.ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &source_path,
                "PUBLIC grant row missing",
            )
        })?
    } else {
        catalog_match(&projection.catalog, section, &source_path, ctx)?
    };
    let identity = val(selected, "identity", "/catalog/identity")?;
    let subject = val(identity, "subject", "/catalog/identity/subject")?;
    let kind = member_text(identity, "kind", "/catalog/identity/kind")?;
    let meaning = val(selected, "meaning", "/catalog/meaning")?;
    let dependency_kind = kind.as_str();
    Ok(o(vec![
        ("kind", s("dependency")),
        ("table", s(&table)),
        ("dependencyKind", s(dependency_kind)),
        ("id", s(&canonical_text(subject, ctx)?)),
        ("sourcePath", s(&source_path)),
        ("meaningDigest", s(&hash(meaning, ctx)?)),
    ]))
}
fn schedule_initial(
    request: &Value,
    next: &Value,
    projection: &Projection,
    candidates: &[Value],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let ops = &projection.renderer_operations;
    if ops.len() < 2 || !eq_text(get(ops.last().unwrap(), "operation"), "grant-schema-usage") {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/next/steps",
            "Verified initial renderer operations are incomplete",
        ));
    }
    let options = val(request, "options", "/options")?;
    let selected_seeds = items(
        val(options, "seedSets", "/options/seedSets")?,
        "/options/seedSets",
    )?;
    let source_digest = member_text(next, "sourceDigest", "/next/sourceDigest")?;
    let mut selected_ids = BTreeSet::new();
    for (index, item) in selected_seeds.iter().enumerate() {
        let id = text(item).ok_or_else(|| {
            err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("/options/seedSets/{index}"),
                "Selected seed identity must be text",
            )
        })?;
        if !selected_ids.insert(id) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                &format!("/options/seedSets/{index}"),
                "Duplicate selected seed identity",
            ));
        }
    }
    let mut seed_lineage = Vec::new();
    for source_state in &projection.seed_states {
        let id = member_text(source_state, "id", "/next/seedSets/id")?;
        let definition = member_text(
            source_state,
            "definitionDigest",
            "/next/seedSets/definitionDigest",
        )?;
        seed_lineage.push(o(vec![
            ("id", s(&id)),
            ("definitionDigest", s(&definition)),
            ("originalSourceDigest", s(&source_digest)),
            (
                "disposition",
                s(if selected_ids.contains(&id) {
                    "apply-once"
                } else {
                    "retain-definition"
                }),
            ),
            ("execution", s("not-run")),
        ]));
    }
    if selected_ids.iter().any(|id| {
        !projection
            .seed_states
            .iter()
            .any(|state| eq_text(get(state, "id"), id))
    }) {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            "/options/seedSets",
            "Selected seed is not in the verified next source",
        ));
    }
    let planned_seed_lineage = seed_lineage.clone();
    let seed_count = usize::from(!selected_ids.is_empty());
    let all_ids = (1..=ops.len() + 3 + seed_count)
        .map(step_number)
        .collect::<Vec<_>>();
    let business_ids = all_ids[2..ops.len() + 1].to_vec();
    let seed_id = if seed_count == 1 {
        Some(&all_ids[ops.len() + 1])
    } else {
        None
    };
    let grant_id = &all_ids[ops.len() + 1 + seed_count];
    let mut completed = Vec::<Value>::new();
    let mut prefixes = Vec::new();
    prefixes.push(prefix_frame(
        0,
        &completed,
        empty_catalog(),
        a(vec![]),
        a(seed_lineage.clone()),
        "pristine",
        ctx,
    )?);
    completed.push(s(&all_ids[0]));
    prefixes.push(prefix_frame(
        1,
        &completed,
        empty_catalog(),
        a(vec![]),
        a(seed_lineage.clone()),
        "pending",
        ctx,
    )?);
    completed.push(s(&all_ids[1]));
    prefixes.push(prefix_frame(
        2,
        &completed,
        empty_catalog(),
        a(vec![]),
        a(seed_lineage.clone()),
        "pending",
        ctx,
    )?);
    completed.extend(business_ids.iter().map(|id| s(id)));
    let mut business_catalog = projection.catalog.clone();
    let full_grants = catalog_rows(&projection.catalog, "grants")?;
    replace(
        &mut business_catalog,
        "grants",
        a(full_grants
            .iter()
            .filter(|row| {
                !eq_text(
                    get(row, "meaning").and_then(|meaning| get(meaning, "effect")),
                    "grant-schema-usage",
                )
            })
            .cloned()
            .collect()),
    )?;
    let mut table_states = Vec::new();
    for declaration in &projection.tables {
        let table = member_text(declaration, "id", "/next/source/tables/id")?;
        let record = val(declaration, "record", "/next/source/tables/record")?;
        let creation = ops
            .iter()
            .position(|operation| {
                eq_text(get(operation, "operation"), "create-table")
                    && get(operation, "subject")
                        .is_some_and(|subject| eq_text(get(subject, "table"), &table))
            })
            .ok_or_else(|| {
                err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    "/next/steps",
                    "Verified source table has no create step",
                )
            })?;
        table_states.push(table_state(
            &business_catalog,
            &table,
            record,
            &all_ids[creation + 2],
            ctx,
        )?);
    }
    let states = a(table_states);
    let business_catalog_for_seed = business_catalog.clone();
    prefixes.push(prefix_frame(
        3,
        &completed,
        business_catalog,
        states.clone(),
        a(seed_lineage.clone()),
        "pending",
        ctx,
    )?);
    if let Some(seed_step) = seed_id {
        completed.push(s(seed_step));
        for state in &mut seed_lineage {
            if get(state, "id")
                .and_then(text)
                .is_some_and(|id| selected_ids.contains(&id))
            {
                replace(state, "execution", s("confirmed"))?;
            }
        }
        prefixes.push(prefix_frame(
            4,
            &completed,
            business_catalog_for_seed,
            states.clone(),
            a(seed_lineage.clone()),
            "pending",
            ctx,
        )?);
    }
    completed.push(s(grant_id));
    prefixes.push(prefix_frame(
        4 + seed_count,
        &completed,
        projection.catalog.clone(),
        states.clone(),
        a(seed_lineage.clone()),
        "pending",
        ctx,
    )?);
    completed.push(s(all_ids.last().unwrap()));
    prefixes.push(prefix_frame(
        5 + seed_count,
        &completed,
        projection.catalog.clone(),
        states,
        a(seed_lineage.clone()),
        "published",
        ctx,
    )?);
    let mut phases = vec![
        phase(1, "prepare", &all_ids[0..1]),
        phase(2, "approval", &all_ids[1..2]),
        phase(3, "transaction", &business_ids),
    ];
    if let Some(seed_step) = seed_id {
        phases.push(phase(4, "seed", &[seed_step.clone()]));
    }
    phases.push(phase(4 + seed_count, "transaction", &[grant_id.clone()]));
    phases.push(phase(
        5 + seed_count,
        "publication",
        &all_ids[ops.len() + 2 + seed_count..],
    ));
    let mut steps = Vec::new();
    let digest = |index: usize| member_text(&prefixes[index], "digest", "/prefixes/digest");
    steps.push(step_value(
        &all_ids[0],
        "metadata",
        "/inventory/metadata/prepare",
        s(""),
        "prepare-inventory-metadata",
        metadata_subject(),
        &digest(0)?,
        &digest(1)?,
    ));
    steps.push(step_value(
        &all_ids[1],
        "metadata",
        "/inventory/metadata/approval",
        s(""),
        "record-inventory-approval",
        metadata_subject(),
        &digest(1)?,
        &digest(2)?,
    ));
    for (index, operation) in ops.iter().enumerate() {
        let op = member_text(operation, "operation", "/operations")?;
        let step = val(operation, "step", "/operations/step")?;
        let id = if op == "grant-schema-usage" {
            grant_id
        } else {
            &all_ids[index + 2]
        };
        let path = member_text(operation, "sourcePath", "/operations/sourcePath")?;
        let operation_kind = member_text(operation, "kind", "/operations/kind")?;
        let kind = if op == "grant-schema-usage" {
            "grant"
        } else {
            operation_kind.as_str()
        };
        let subject = renderer_subject(operation, projection, ctx)?;
        let pair = if op == "grant-schema-usage" {
            (3 + seed_count, 4 + seed_count)
        } else {
            (2, 3)
        };
        steps.push(step_value(
            id,
            kind,
            &path,
            clone_member(step, "sql", "/next/steps/sql")?,
            if matches!(
                op.as_str(),
                "create-policy" | "revoke-public" | "grant-table" | "grant-schema-usage"
            ) {
                "dependency-add"
            } else {
                op.as_str()
            },
            subject,
            &digest(pair.0)?,
            &digest(pair.1)?,
        ));
    }
    if let Some(seed_step) = seed_id {
        let mut seed = step_value(
            seed_step,
            "seed",
            "/options/seedSets",
            s(""),
            "apply-seeds",
            o(vec![
                ("kind", s("seed")),
                ("sets", a(selected_seeds.to_vec())),
            ]),
            &digest(3)?,
            &digest(4)?,
        );
        let Value::Object(fields) = &mut seed else {
            unreachable!()
        };
        fields.push((Utf16::from("seedSets"), a(selected_seeds.to_vec())));
        steps.insert(ops.len() + 1, seed);
    }
    steps.push(step_value(
        all_ids.last().unwrap(),
        "metadata",
        "/inventory/metadata/publication",
        s(""),
        "publish-inventory",
        metadata_subject(),
        &digest(4 + seed_count)?,
        &digest(5 + seed_count)?,
    ));
    let mut changes = Vec::new();
    for table_row in &projection.inventory_tables {
        let table = member_text(table_row, "table", "/inventory/nextTables/table")?;
        let record = val(table_row, "record", "/inventory/nextTables/record")?;
        let matching = candidates
            .iter()
            .filter(|candidate| {
                get(candidate, "newValue")
                    .is_some_and(|review| eq_text(get(review, "table"), &table))
            })
            .collect::<Vec<_>>();
        if matching.len() != 1 {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/review",
                "Create review does not uniquely bind source table",
            ));
        }
        changes.push(o(vec![
            ("kind", s("create-table")),
            ("table", s(&table)),
            ("record", record.clone()),
            ("beforePath", Value::Null),
            (
                "afterPath",
                clone_member(matching[0], "path", "/review/path")?,
            ),
            ("beforeMeaningDigest", s(ZERO_DIGEST)),
            (
                "afterMeaningDigest",
                clone_member(
                    table_row,
                    "meaningDigest",
                    "/inventory/nextTables/meaningDigest",
                )?,
            ),
        ]));
    }
    let inventory = o(vec![
        ("profile", s("umf.table-inventory-delta/0.1")),
        ("previousTables", a(vec![])),
        ("nextTables", a(projection.inventory_tables.clone())),
        ("changes", a(changes)),
        ("seedLineage", a(planned_seed_lineage)),
    ]);
    let history = val(request, "history", "/history")?;
    let history_binding = o(vec![
        ("profile", s("umf.table-inventory-source-history/0.1")),
        ("count", Value::Number(0.0)),
        ("digest", s(&hash(history, ctx)?)),
    ]);
    let execution = o(vec![
        ("version", s("umf.table-inventory-execution/0.1")),
        ("progressRelation", s("umf_lifecycle_inventory_progress")),
        ("ownerOnly", Value::Bool(true)),
        (
            "ingressProfile",
            s("umf.table-inventory-generation-ingress/0.1"),
        ),
        ("inventoryProfile", s("umf.table-inventory-prefix/0.1")),
        ("initial", Value::Bool(true)),
        ("conversionProfile", Value::Null),
        ("originalsProfile", Value::Null),
        ("retirementProfile", Value::Null),
        ("retiredStoreProfile", Value::Null),
    ]);
    let approval = o(vec![
        ("version", s("umf.table-migration-approval/0.1")),
        ("relation", s("umf_lifecycle_approvals")),
        ("ownerOnly", Value::Bool(true)),
    ]);
    let mut plan = o(vec![
        ("version", s("umf.table-inventory-migration/0.1")),
        ("canonicalization", s("RFC8785")),
        ("id", clone_member(request, "id", "/id")?),
        ("predecessor", Value::Null),
        ("previous", Value::Null),
        ("next", next.clone()),
        ("fromBundleDigest", Value::Null),
        (
            "toBundleDigest",
            clone_member(next, "bundleDigest", "/next/bundleDigest")?,
        ),
        ("steps", a(steps)),
        (
            "seedExecution",
            if selected_ids.is_empty() {
                s("none")
            } else {
                o(vec![
                    ("version", s("umf.table-seed-execution/0.1")),
                    ("sets", a(selected_seeds.to_vec())),
                ])
            },
        ),
        ("phases", a(phases)),
        ("executionProfile", execution),
        ("approvalProfile", approval),
        ("options", clone_member(request, "options", "/options")?),
        ("review", a(candidates.to_vec())),
        ("requiresApproval", Value::Bool(true)),
        ("nativeQualified", Value::Bool(false)),
        ("inventory", inventory),
        ("prefixes", a(prefixes)),
        ("historyBinding", history_binding),
    ]);
    let plan_digest = hash(&plan, ctx)?;
    let Value::Object(fields) = &mut plan else {
        unreachable!()
    };
    fields.push((Utf16::from("digest"), s(&plan_digest)));
    Ok(plan)
}

impl CodegenEngine<'_> {
    /// Discover source-derived initial-create review without accepting marker claims.
    pub fn discover_table_inventory_initial(
        &self,
        previous: &Value,
        next: &Value,
        selector: &Value,
        history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let previous = admit_json(previous, ctx)?;
        let next = admit_json(next, ctx)?;
        let selector = admit_json(selector, ctx)?;
        let history = admit_json(history, ctx)?;
        if previous != Value::Null
            || !exact_fields(
                &selector,
                &[
                    "version",
                    "tableIntents",
                    "conversions",
                    "retiredSeedSets",
                    "retirements",
                    "restorations",
                    "archiveSources",
                ],
            )
            || !eq_text(
                get(&selector, "version"),
                "umf.table-inventory-discovery/0.1",
            )
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/selector",
                "Only the source-bound initial-create selector is admitted",
            ));
        }
        for key in [
            "conversions",
            "retiredSeedSets",
            "retirements",
            "restorations",
            "archiveSources",
        ] {
            let path = format!("/selector/{key}");
            if !items(val(&selector, key, &path)?, &path)?.is_empty() {
                return Err(err(
                    "TABLE_MIGRATION_REVIEW",
                    &path,
                    "This selection has no initial-create lowering",
                ));
            }
        }
        if !exact_fields(&history, &["profile", "plans", "executions"])
            || !eq_text(
                get(&history, "profile"),
                "umf.table-inventory-source-history/0.1",
            )
            || !items(val(&history, "plans", "/history/plans")?, "/history/plans")?.is_empty()
            || !items(
                val(&history, "executions", "/history/executions")?,
                "/history/executions",
            )?
            .is_empty()
        {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/history",
                "Initial history is not empty",
            ));
        }
        let bundle = self.verify_table_deployment(&next, ctx)?;
        let source = val(&bundle, "source", "/next/source")?;
        if !eq_text(get(source, "format"), "json") {
            return Err(err(
                "TABLE_MIGRATION_REVIEW",
                "/next/source/format",
                "Exact JSON source required",
            ));
        }
        let text = string_member(source, "utf8").ok_or_else(|| {
            err(
                "TABLE_MIGRATION_REVIEW",
                "/next/source/utf8",
                "Source text is missing",
            )
        })?;
        let document = read_json_value(text.units(), Format::Json, ctx)?;
        let projection = project_initial(&document, &bundle, ctx)?;
        let options = o(vec![(
            "tableIntents",
            clone_member(&selector, "tableIntents", "/selector/tableIntents")?,
        )]);
        Ok(a(initial_candidates(&projection, &bundle, &options, ctx)?))
    }

    /// Recompile against the supplied original history, then compare every plan member.
    pub fn verify_table_inventory_initial(
        &self,
        plan: &Value,
        original_history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let plan = admit_json(plan, ctx)?;
        let history = admit_json(original_history, ctx)?;
        let request = o(vec![
            ("id", clone_member(&plan, "id", "/id")?),
            (
                "predecessor",
                clone_member(&plan, "predecessor", "/predecessor")?,
            ),
            ("previous", clone_member(&plan, "previous", "/previous")?),
            ("next", clone_member(&plan, "next", "/next")?),
            ("options", clone_member(&plan, "options", "/options")?),
            ("history", history),
        ]);
        let rebuilt = compile_initial(self, &request, ctx).map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                err(
                    "TABLE_INVENTORY_PLAN",
                    "/",
                    "Inventory plan differs from source recompilation",
                )
            }
        })?;
        if !same(&rebuilt, &plan, ctx)? {
            return Err(err(
                "TABLE_INVENTORY_PLAN",
                "/",
                "Inventory plan differs from source recompilation",
            ));
        }
        Ok(rebuilt)
    }

    pub fn serialize_table_inventory_initial(
        &self,
        plan: &Value,
        original_history: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let verified = self.verify_table_inventory_initial(plan, original_history, ctx)?;
        Ok(s(&canonical_text(&verified, ctx)?))
    }
}

#[cfg(test)]
mod command_reference_tests {
    use super::*;

    #[test]
    fn initial_projection_refuses_a_cross_table_field_not_owned_by_its_target() {
        let fixture = read_json_value(
            include_str!("../tests/fixtures/inventory-cross-table-command-request.json")
                .encode_utf16()
                .collect::<Vec<_>>()
                .as_slice(),
            Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let bundle = val(&fixture, "next", "/next").unwrap();
        let source = val(
            val(bundle, "source", "/next/source").unwrap(),
            "utf8",
            "/next/source/utf8",
        )
        .unwrap();
        let source = text(source).unwrap();
        let selected = "\"matches\":[{\"source\":{\"module\":\"demo\",\"element\":\"id\"},\"target\":{\"module\":\"demo\",\"element\":\"taskId\"}}]";
        assert!(source.contains(selected));
        let changed = source.replace(selected, "\"matches\":[{\"source\":{\"module\":\"demo\",\"element\":\"id\"},\"target\":{\"module\":\"demo\",\"element\":\"owner\"}}]");
        let document = read_json_value(
            changed.encode_utf16().collect::<Vec<_>>().as_slice(),
            Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let error = match project_initial(&document, bundle, &mut Context::ordinary()) {
            Ok(_) => panic!("unbound cross-table Field was admitted"),
            Err(error) => error,
        };
        assert_eq!(error.code, "TABLE_INVENTORY_UNSUPPORTED");
        assert!(error
            .message
            .to_utf8()
            .unwrap()
            .contains("not bound to its exact source table"));
    }
}
