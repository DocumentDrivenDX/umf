use super::common::*;
use crate::value::{array_items, object_members, string_member};
use umf_core::{EngineError, Value};

pub(super) struct RecordShape {
    pub(super) record_id: String,
    pub(super) record_ref: Value,
    pub(super) key_ref: Value,
    pub(super) key_id: String,
    pub(super) key_field: Value,
    pub(super) members: Vec<Value>,
}

pub(super) fn select_record(document: &Value, module_id: &str) -> Result<RecordShape, EngineError> {
    let modules = array_items(get(&document, "modules").ok_or_else(|| invalid("/source/modules"))?)
        .ok_or_else(|| invalid("/source/modules"))?;
    if modules.len() != 1 {
        return Err(unsupported("/source/modules"));
    }
    let module = module_for(&document, &module_id).ok_or_else(|| integrity("/action/identity"))?;
    exact_object(
        module,
        &["id", "namespace", "elements", "extensions"],
        "/source/modules/0",
    )?;
    let module_extensions =
        get(module, "extensions").ok_or_else(|| unsupported("/source/modules/0/extensions"))?;
    exact_object(
        module_extensions,
        &["umf.actions"],
        "/source/modules/0/extensions",
    )?;
    let action_extension = get(module_extensions, "umf.actions")
        .ok_or_else(|| unsupported("/source/modules/0/extensions/umf.actions"))?;
    exact_object(
        action_extension,
        &["actions"],
        "/source/modules/0/extensions/umf.actions",
    )?;
    let module_actions = get(module, "extensions")
        .and_then(|extensions| get(extensions, "umf.actions"))
        .and_then(|payload| get(payload, "actions"))
        .and_then(array_items)
        .ok_or_else(|| unsupported("/source/modules/0/extensions/umf.actions/actions"))?;
    if module_actions.len() != 1 {
        return Err(unsupported(
            "/source/modules/0/extensions/umf.actions/actions",
        ));
    }
    let elements = array_items(
        get(module, "elements").ok_or_else(|| unsupported("/source/modules/0/elements"))?,
    )
    .ok_or_else(|| unsupported("/source/modules/0/elements"))?;
    if elements.len() != 3 {
        return Err(unsupported("/source/modules/0/elements"));
    }
    let records = elements
        .iter()
        .filter(|element| {
            string_member(element, "kind")
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("record")
        })
        .collect::<Vec<_>>();
    if records.len() != 1 {
        return Err(unsupported("/source/modules/0/elements"));
    }
    let record = records[0];
    exact_object(
        record,
        &["id", "kind", "members", "keys", "extensions"],
        "/source/record",
    )?;
    if get(record, "extensions")
        .and_then(object_members)
        .is_none_or(|members| !members.is_empty())
    {
        return Err(unsupported("/source/record/extensions"));
    }
    let record_id = bounded_identifier(
        get(record, "id").ok_or_else(|| invalid("/source/record/id"))?,
        "/source/record/id",
    )?;
    let record_ref = obj(vec![
        ("module", strval(&module_id)),
        ("element", strval(&record_id)),
    ]);
    let keys = array_items(get(record, "keys").ok_or_else(|| unsupported("/source/record/keys"))?)
        .ok_or_else(|| unsupported("/source/record/keys"))?;
    if keys.len() != 1 {
        return Err(unsupported("/source/record/keys"));
    }
    let key = &keys[0];
    exact_object(
        key,
        &["id", "name", "primary", "fields"],
        "/source/record/keys/0",
    )?;
    if get(key, "primary") != Some(&Value::Bool(true)) {
        return Err(unsupported("/source/record/keys/0/primary"));
    }
    let key_id = bounded_identifier(
        get(key, "id").ok_or_else(|| unsupported("/source/record/key/id"))?,
        "/source/record/key/id",
    )?;
    let key_fields =
        array_items(get(key, "fields").ok_or_else(|| unsupported("/source/record/key/fields"))?)
            .ok_or_else(|| unsupported("/source/record/key/fields"))?;
    if key_fields.len() != 1 {
        return Err(unsupported("/source/record/key/fields"));
    }
    let key_field = key_fields[0].clone();
    let (key_module, _) = field_identity(&key_field)?;
    if key_module != module_id {
        return Err(unsupported("/source/record/keys/0/fields/0"));
    }
    let key_ref = obj(vec![
        ("module", strval(&module_id)),
        ("element", strval(&record_id)),
        ("key", strval(&key_id)),
    ]);
    let members =
        array_items(get(record, "members").ok_or_else(|| unsupported("/source/record/members"))?)
            .ok_or_else(|| unsupported("/source/record/members"))?;
    if members.len() != 2 {
        return Err(unsupported("/source/record/members"));
    }
    if !members.iter().any(|member| same_ref(member, &key_field)) {
        return Err(unsupported("/source/record/key/fields"));
    }
    for (index, member) in members.iter().enumerate() {
        let (member_module, _) = field_identity(member)?;
        if member_module != module_id {
            return Err(unsupported(&format!("/source/record/members/{index}")));
        }
        require_supported_string_field(
            document,
            member,
            &format!("/source/record/members/{index}"),
        )?;
    }
    Ok(RecordShape {
        record_id,
        record_ref,
        key_ref,
        key_id,
        key_field,
        members: members.to_vec(),
    })
}
