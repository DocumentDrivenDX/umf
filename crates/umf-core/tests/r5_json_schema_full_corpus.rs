#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-bound Rust evaluator capture for the pinned JSON Schema upstream suite.
//! Run through scripts/rust-migration/r5/json-schema/upstream-oracle.ts.
use std::{collections::BTreeMap, fs, path::PathBuf};
use umf_core::{
    json_schema_adapter::{self},
    json_schema_inspect,
    native_json::NativeJsonTree,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    Context, Utf16, Value,
};

fn from_json(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Number(n.as_f64().expect("JSON number as f64")),
        serde_json::Value::String(s) => Value::string_utf8(s),
        serde_json::Value::Array(a) => Value::Array(a.iter().map(from_json).collect()),
        serde_json::Value::Object(o) => Value::Object(o.iter().map(|(k,v)| (Utf16::from(k.as_str()), from_json(v))).collect()),
    }
}

fn references(v: &serde_json::Value, base: &str, out: &mut BTreeMap<String, String>, remotes: &PathBuf) {
    match v {
        serde_json::Value::Object(o) => {
            let mut uri = base.to_owned();
            if let Some(id) = o.get("$id").and_then(|x| x.as_str()) {
                if let Ok(joined) = url::Url::parse(base).and_then(|u| u.join(id)) { uri = joined.to_string(); }
            }
            for key in ["$ref", "$dynamicRef", "$schema"] {
                if let Some(reference) = o.get(key).and_then(|x| x.as_str()) {
                    if let Ok(target) = url::Url::parse(&uri).and_then(|u| u.join(reference)) {
                        let mut target = target; target.set_fragment(None);
                        let full = target.to_string();
                        if let Some(path) = full.strip_prefix("http://localhost:1234/") {
                            let file = remotes.join(path);
                            if file.is_file() && !out.contains_key(&full) {
                                if let Ok(source) = fs::read_to_string(&file) {
                                    out.insert(full.clone(), source.clone());
                                    if let Ok(parsed) = serde_json::from_str(&source) { references(&parsed, &full, out, remotes); }
                                }
                            }
                        }
                    }
                }
            }
            for child in o.values() { references(child, &uri, out, remotes); }
        }
        serde_json::Value::Array(a) => for child in a { references(child, base, out, remotes); },
        _ => {}
    }
}

/// Explicitly preload the pinned Draft 2020-12 metaschema closure for this
/// corpus harness. `CompiledSchema` itself does not install implicit remote
/// resources; ordinary callers must supply their complete resource set.
fn pinned_2020_metaschema_resources() -> BTreeMap<String, String> {
    let source: serde_json::Value = serde_json::from_str(include_str!("../src/schema_metas.json")).unwrap();
    let root = source["metaschemas"]["Draft202012Validator"].clone();
    let mut resources = BTreeMap::from([(
        "https://json-schema.org/draft/2020-12/schema".to_owned(),
        serde_json::to_string(&root).unwrap(),
    )]);
    for item in source["resources"].as_array().unwrap() {
        let Some(id) = item["id"].as_str() else { continue };
        if id.starts_with("https://json-schema.org/draft/2020-12/meta/") {
            resources.insert(id.to_owned(), serde_json::to_string(&item["schema"]).unwrap());
        }
    }
    resources
}

fn schema_json_id(schema: &serde_json::Value) -> Option<String> {
    schema.get("$id").and_then(|value| value.as_str()).map(str::to_owned)
}

#[test]
fn capture_pinned_upstream_rust_and_native_adapter_results() {
    let out = std::env::var("UMF_R5_JSON_SCHEMA_REPORT").expect("wrapper must set report path");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/json-schema/upstream");
    let remotes = root.join("remotes");
    let draft = root.join("draft2020-12");
    let mut files: Vec<_> = fs::read_dir(&draft).unwrap().map(|e| e.unwrap().path()).filter(|p| p.extension().is_some_and(|e| e == "json")).collect();
    files.sort();
    assert_eq!(files.len(), 46, "pinned corpus root-file count changed");
    let mut records = Vec::new();
    let mut case_count = 0; let mut vector_count = 0;
    for file in files {
        let name = file.file_name().unwrap().to_string_lossy().to_string();
        let source = fs::read_to_string(&file).unwrap();
        let cases: serde_json::Value = serde_json::from_str(&source).unwrap();
        let source_tree = NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), &mut Context::ordinary()).unwrap();
        for (index, case) in cases.as_array().unwrap().iter().enumerate() {
            case_count += 1;
            let base = format!("https://umf.invalid/upstream/{name}/{index}");
            let mut deps = BTreeMap::new(); references(&case["schema"], &base, &mut deps, &remotes);
            let mut compile_deps = deps.clone();
            let root_id = schema_json_id(&case["schema"]);
            let mut trusted_metaschema_count = 0usize;
            for (uri, source) in pinned_2020_metaschema_resources() {
                // The root schema already owns its own identifier as the primary resource.
                if root_id.as_deref() == Some(uri.as_str()) {
                    continue;
                }
                if let Some(previous) = compile_deps.get(&uri) {
                    assert_eq!(
                        serde_json::from_str::<serde_json::Value>(previous).unwrap(),
                        serde_json::from_str::<serde_json::Value>(&source).unwrap(),
                        "resource conflicts with pinned metaschema {uri}"
                    );
                } else {
                    compile_deps.insert(uri, source);
                    trusted_metaschema_count += 1;
                }
            }
            let schema_json = &case["schema"];
            let case_tree = source_tree.subtree_clone(&Utf16::from(format!("/{index}")), &mut Context::ordinary()).unwrap();
            let schema_tree = case_tree.subtree_clone(&Utf16::from("/schema"), &mut Context::ordinary()).unwrap();
            let schema_text = schema_tree.render_compact(&mut Context::ordinary()).unwrap().to_utf8().unwrap();
            let schema = from_json(schema_json);
            let resources = SchemaResources { entries: compile_deps.iter().filter_map(|(uri, text)| serde_json::from_str::<serde_json::Value>(text).ok().map(|v| (Utf16::from(uri.as_str()), from_json(&v)))).collect() };
            let compiled = CompiledSchema::compile_consumer(&schema, &resources, false, &mut Context::ordinary());

            let adapter_result = (|| -> Result<serde_json::Value, String> {
                let tree = NativeJsonTree::parse_json(&schema_text.encode_utf16().collect::<Vec<_>>(), &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let resource_trees = deps.iter().map(|(uri, text)| NativeJsonTree::parse_json(&text.encode_utf16().collect::<Vec<_>>(), &mut Context::ordinary()).map(|tree| (Utf16::from(uri.as_str()), tree)).map_err(|e| e.code.clone())).collect::<Result<Vec<_>,_>>()?;
                let original_root = tree.render_compact(&mut Context::ordinary()).map_err(|e| e.code.clone())?.to_utf8().map_err(|_| "UTF8".to_owned())?;
                let original_resources = resource_trees.iter().map(|(uri, tree)| tree.render_compact(&mut Context::ordinary()).map(|text| (uri.to_utf8().unwrap(), text.to_utf8().unwrap())).map_err(|e| e.code.clone())).collect::<Result<BTreeMap<_,_>,_>>()?;
                let root_tagged = tree.render_tagged(&mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let root_value = serialization::read_json_value(root_tagged.units(), Format::Json, &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let resource_values = resource_trees.into_iter().map(|(uri, tree)| {
                    let tagged = tree.render_tagged(&mut Context::ordinary()).map_err(|e| e.code.clone())?;
                    let value = serialization::read_json_value(tagged.units(), Format::Json, &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                    Ok((uri, value))
                }).collect::<Result<Vec<_>,String>>()?;
                let payload_input = Value::Object(vec![
                    (Utf16::from("dialect"), Value::string_utf8(json_schema_adapter::DIALECT_2020_12)),
                    (Utf16::from("baseUri"), Value::string_utf8(&base)),
                    (Utf16::from("root"), root_value),
                    (Utf16::from("resources"), Value::Object(resource_values)),
                ]);
                let payload = json_schema_adapter::admit_payload(&payload_input, &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let exported = json_schema_adapter::export_root(&payload, &mut Context::ordinary()).map_err(|e| e.code.clone())?.to_utf8().map_err(|_| "UTF8".to_owned())?;
                let exported_resources = json_schema_adapter::export_resources(&payload, &mut Context::ordinary()).map_err(|e| e.code.clone())?.into_iter().map(|(uri, text)| (uri.to_utf8().unwrap(), text.to_utf8().unwrap())).collect::<BTreeMap<_,_>>();
                let root_copy = json_schema_adapter::get_node(&payload, &Utf16::default(), &mut Context::ordinary()).map_err(|e| e.code.clone())?.render_compact(&mut Context::ordinary()).map_err(|e| e.code.clone())?.to_utf8().map_err(|_| "UTF8".to_owned())?;
                let positions = json_schema_adapter::walk(&payload, &mut Context::ordinary()).map_err(|e| e.code.clone())?.len();
                let inspection = json_schema_inspect::inspect_payload(&payload, &Utf16::from("/schema"), &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let exported_tree = NativeJsonTree::parse_json(exported.trim_end().encode_utf16().collect::<Vec<_>>().as_slice(), &mut Context::ordinary()).map_err(|e| e.code.clone())?;
                let reexported = exported_tree.render_compact(&mut Context::ordinary()).map_err(|e| e.code.clone())?.to_utf8().map_err(|_| "UTF8".to_owned())?;
                let resources_exact = exported_resources.iter().map(|(uri, text)| (uri.clone(), text.trim_end().to_owned())).collect::<BTreeMap<_,_>>() == original_resources;
                Ok(serde_json::json!({"originalRoot":original_root,"originalResources":original_resources,"exportedRoot":exported,"exportedResources":exported_resources,"rootExact":exported.trim_end()==original_root,"resourcesExact":resources_exact,"getRoot":root_copy,"exportStable":reexported==exported.trim_end(),"walkSchemaPositions":positions,"inspectionCodes":inspection.iter().map(|d| d.code.to_utf8().unwrap_or_default()).collect::<Vec<_>>() }))
            })();
            let mut vectors = Vec::new();
            for (vector_index, test) in case["tests"].as_array().unwrap().iter().enumerate() {
                vector_count += 1;
                let expected = test["valid"].as_bool().unwrap();
                let actual = compiled.as_ref().ok().map(|c| c.validate(&from_json(&test["data"]), &mut Context::ordinary()).map(|e| e.is_empty()));
                let result = actual.map(|r| r.map_err(|e| e.code.clone()));
                vectors.push(serde_json::json!({"index":vector_index,"description":test["description"],"expected":expected,"rust":result}));
            }
            records.push(serde_json::json!({"file":name,"index":index,"description":case["description"],"vectorCount":vectors.len(),"dependencyCount":deps.len(),"trustedMetaschemaResourceCount":trusted_metaschema_count,"compileError":compiled.as_ref().err().map(|e| e.code.clone()),"vectors":vectors,"adapter":adapter_result}));
        }
    }
    assert_eq!((case_count, vector_count), (384, 1301), "pinned corpus case/vector counts changed");
    let report = serde_json::json!({"sourceRevision":"ab079cc2bace029fdbb483be28a6ade526bcfbc2","dialect":"2020-12","rust":"umf-core CompiledSchema::compile_consumer + validate; format not separately asserted","adapter":"umf-core json_schema_adapter export_root/walk and json_schema_inspect inspect_payload","files":46,"cases":case_count,"vectors":vector_count,"records":records});
    fs::write(out, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
}
