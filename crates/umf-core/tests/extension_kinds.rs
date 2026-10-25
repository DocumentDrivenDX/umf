// SPDX-License-Identifier: MIT OR Apache-2.0
use serde_json::{json, Value as Json};
use umf_core::{
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, SemanticContext,
    Utf16, Value,
};
fn value(v: Json) -> Value {
    umf_core::serialization::read_json_value(
        &v.to_string().encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}
fn json_value(v: &Value) -> Json {
    let text = umf_core::serialization::write_json_value(
        v,
        umf_core::serialization::Format::Json,
        &mut Context::catalog(),
    )
    .unwrap();
    serde_json::from_str(&String::from_utf16(text.units()).unwrap()).unwrap()
}
fn engine() -> Engine {
    let read = |s: &str| value(serde_json::from_str(s).unwrap());
    Engine::new(
        ResourceSet::new(
            read(include_str!("../../../spec/core/schema.json")),
            read(include_str!(
                "../../../spec/core/semantic-type-reference.schema.json"
            )),
            read(include_str!(
                "../../../spec/core/extension-package.schema.json"
            )),
            read(include_str!(
                "../../../spec/metamodel/generated/core-constraints.json"
            )),
            read(include_str!(
                "../../../spec/metamodel/generated/domain-policy.json"
            )),
        ),
        &mut Context::catalog(),
    )
    .unwrap()
}
fn package(id: &str, version: &str) -> Json {
    json!({"id":id,"version":version,"coreVersion":"0.10.0","description":"Synthetic kind qualification","semantics":"Synthetic only","schema":true,"scopes":["document","element"],"capabilities":{"validation":"semantic","directions":[],"evidence":[]},"kindCatalog":{"profile":"1.0.0","definitions":{"dashboard":{"title":"Dashboard","description":"Synthetic composition","scopes":["document"]},"dataset":{"title":"Dataset","description":"Synthetic dataset binding","scopes":["element"]}}}})
}
fn register(e: &Engine, r: &mut Registry, p: Json) -> Result<(), EngineError> {
    r.register_kind_package(
        &value(p),
        Some(1),
        e.package_schema(),
        &e.schema_resources_with_context(&mut Context::catalog())?,
        &mut Context::catalog(),
    )
}
fn document() -> Json {
    json!({"umf":"0.10.0","id":"test","vocabularies":{"example":{"version":"1.0.0"}},"extensions":{"example":{"kind":"dashboard"}},"modules":[]})
}
#[derive(Default)]
struct Callbacks(usize);
impl Capabilities for Callbacks {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        self.0 += 1;
        Ok(vec![])
    }
}

#[test]
fn catalogs_are_exact_sorted_copied_and_atomic() {
    let e = engine();
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, package("z", "1.0.0")).unwrap();
    register(&e, &mut r, package("a", "2.0.0")).unwrap();
    register(&e, &mut r, package("a", "1.0.0")).unwrap();
    let listing = json_value(&r.list_kinds(&mut Context::ordinary()).unwrap());
    assert_eq!(listing["complete"], true);
    assert_eq!(
        listing["definitions"][0]["reference"],
        json!({"extension":"a","version":"1.0.0","kind":"dashboard"})
    );
    assert_eq!(listing["definitions"].as_array().unwrap().len(), 6);
    let lookup = value(json!({"extension":"a","version":"1.0.0","kind":"dataset"}));
    let mut copy = r
        .get_kind(&lookup, &mut Context::ordinary())
        .unwrap()
        .unwrap();
    if let Value::Object(fields) = &mut copy {
        fields.clear();
    }
    assert!(!json_value(
        &r.get_kind(&lookup, &mut Context::ordinary())
            .unwrap()
            .unwrap()
    )
    .as_object()
    .unwrap()
    .is_empty());
    assert_eq!(
        r.get_kind(
            &value(json!({"extension":"a","version":"9.0.0","kind":"dataset"})),
            &mut Context::ordinary()
        )
        .unwrap(),
        None
    );
    assert_eq!(
        r.get_kind(
            &value(json!({"extension":"a","version":"1.0.0","kind":"dataset","guess":true})),
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "EXTENSION_KIND_QUERY"
    );
    let mut bad = package("bad", "1.0.0");
    bad["kindCatalog"]["definitions"]["dataset"]["scopes"] = json!(["document"]);
    assert_eq!(
        register(&e, &mut r, bad).unwrap_err().code,
        "PACKAGE_KIND_CATALOG"
    );
    assert!(r.get(&Utf16::from("bad"), &Utf16::from("1.0.0")).is_none());
    assert_eq!(
        register(&e, &mut r, package("a", "1.0.0"))
            .unwrap_err()
            .code,
        "DUPLICATE_VERSION"
    );
}

#[test]
fn empty_kind_queries_require_the_shared_runtime() {
    let registry = Registry::new();
    assert_eq!(
        registry
            .list_kinds(&mut Context::ordinary())
            .unwrap_err()
            .code,
        "EXTENSION_KIND_RUNTIME_REQUIRED"
    );
    let reference = value(json!({"extension":"example","version":"1.0.0","kind":"dashboard"}));
    assert_eq!(
        registry
            .get_kind(&reference, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "EXTENSION_KIND_RUNTIME_REQUIRED"
    );
    let engine = engine();
    let registry = engine.registry(&mut Context::catalog()).unwrap();
    let listing = json_value(&registry.list_kinds(&mut Context::ordinary()).unwrap());
    assert_eq!(listing["definitions"], json!([]));
    assert_eq!(listing["packages"], json!([]));
    assert_eq!(listing["complete"], true);
    assert_eq!(
        registry
            .get_kind(&reference, &mut Context::ordinary())
            .unwrap(),
        None
    );
}

#[test]
fn ordinary_validation_checks_tags_and_scope_before_callbacks() {
    let e = engine();
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, package("example", "1.0.0")).unwrap();
    let mut caps = Callbacks::default();
    assert!(
        e.validate_document(&value(document()), &r, &mut caps, &mut Context::ordinary())
            .unwrap()
            .complete
    );
    assert_eq!(caps.0, 1);
    for (payload, code) in [
        (json!({}), "EXTENSION_KIND_REQUIRED"),
        (json!({"kind":null}), "EXTENSION_KIND_REQUIRED"),
        (json!({"kind":"future"}), "EXTENSION_KIND_UNKNOWN"),
        (json!({"kind":"dataset"}), "EXTENSION_KIND_SCOPE"),
    ] {
        let mut d = document();
        d["extensions"]["example"] = payload;
        let v = e
            .validate_document(&value(d), &r, &mut caps, &mut Context::ordinary())
            .unwrap();
        assert!(!v.valid);
        assert!(v.diagnostics.iter().any(|d| d.code == Utf16::from(code)));
    }
    assert_eq!(caps.0, 1);
}

#[test]
fn discovery_retains_exact_identity_scope_paths_and_missing_coverage() {
    let e = engine();
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, package("example", "1.0.0")).unwrap();
    let mut d = document();
    d["modules"] = json!([{"id":"m","namespace":"","elements":[{"id":"r","kind":"record","extensions":{"example":{"kind":"dataset"}}}]}]);
    let source = value(d.clone());
    let result = json_value(
        &e.inspect_extension_kinds(
            &source,
            &r,
            &mut Callbacks::default(),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(result["source"], d);
    assert_eq!(result["complete"], true);
    assert_eq!(result["entries"].as_array().unwrap().len(), 2);
    assert_eq!(
        result["entries"][1]["owner"],
        json!({"scope":"element","module":"m","element":"r"})
    );
    assert_eq!(
        result["entries"][1]["payloadPath"],
        "/modules/0/elements/0/extensions/example"
    );
    let result = json_value(
        &e.inspect_extension_kinds(
            &source,
            &Registry::new(),
            &mut Callbacks::default(),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(result["complete"], false);
    assert_eq!(result["entries"], json!([]));
    assert_eq!(result["coverage"][0]["status"], "unavailable");
    d["umf"] = json!("0.9.0");
    let result = json_value(
        &e.inspect_extension_kinds(
            &value(d),
            &r,
            &mut Callbacks::default(),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(result["entries"], json!([]));
    assert_eq!(result["coverage"], json!([]));
    assert_eq!(result["sourceValidation"]["valid"], false);
    assert_eq!(result["complete"], false);
}

#[test]
fn legacy_and_future_catalogs_never_gain_guessed_meaning() {
    let e = engine();
    for (change, status) in [
        ("legacy", "absent-catalog"),
        ("future", "unsupported-catalog"),
        ("qualifier", "unsupported-catalog"),
        ("absent", "absent-catalog"),
    ] {
        let mut p = package("example", "1.0.0");
        match change {
            "legacy" => p["coreVersion"] = json!("0.10.0"),
            "future" => p["kindCatalog"]["profile"] = json!("9.0.0"),
            "qualifier" => p["kindCatalog"]["futureRule"] = json!({}),
            _ => {
                p.as_object_mut().unwrap().remove("kindCatalog");
            }
        }
        let mut r = e.registry(&mut Context::catalog()).unwrap();
        if change == "legacy" {
            r.register(
                &value(p),
                Some(1),
                e.package_schema(),
                &e.schema_resources_with_context(&mut Context::catalog())
                    .unwrap(),
                &mut Context::catalog(),
            )
            .unwrap();
        } else {
            register(&e, &mut r, p).unwrap();
        }
        let result = json_value(
            &e.inspect_extension_kinds(
                &value(document()),
                &r,
                &mut Callbacks::default(),
                &mut Context::ordinary(),
            )
            .unwrap(),
        );
        assert_eq!(result["coverage"][0]["status"], status);
        assert_eq!(result["entries"], json!([]));
        assert_eq!(result["sourceValidation"]["valid"], true);
        assert_eq!(result["complete"], false);
    }
}

#[test]
fn hostile_kind_keys_and_invalid_payloads_do_not_hide_classification() {
    let e = engine();
    let mut p = package("example", "1.0.0");
    p["kindCatalog"]["definitions"]["__proto__"] =
        json!({"title":"Ordinary key","description":"No prototype meaning","scopes":["document"]});
    p["schema"] = json!({"type":"object","required":["requiredProperty"]});
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, p).unwrap();
    let mut d = document();
    d["extensions"]["example"]["kind"] = json!("__proto__");
    let result = json_value(
        &e.inspect_extension_kinds(
            &value(d),
            &r,
            &mut Callbacks::default(),
            &mut Context::ordinary(),
        )
        .unwrap(),
    );
    assert_eq!(result["entries"][0]["reference"]["kind"], "__proto__");
    assert_eq!(result["coverage"][0]["status"], "invalid");
    assert_eq!(result["sourceValidation"]["valid"], false);
}

#[test]
fn kind_named_field_never_grants_core_field_eligibility() {
    let e = engine();
    let mut p = package("example", "1.0.0");
    p["kindCatalog"]["definitions"]["field"] =
        json!({"title":"Extension field","description":"Not a core Field","scopes":["element"]});
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, p).unwrap();
    let mut d = document();
    d["modules"] = json!([{"id":"m","namespace":"","elements":[{"id":"f","default":{"value":{"string":"x"},"on":"missing"},"extensions":{"example":{"kind":"field"}}}]}]);
    assert!(
        !e.validate_document(
            &value(d),
            &r,
            &mut Callbacks::default(),
            &mut Context::ordinary()
        )
        .unwrap()
        .valid
    );
}

#[test]
fn bounded_output_failure_never_mutates_registry_or_returns_a_partial_listing() {
    let e = engine();
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    register(&e, &mut r, package("example", "1.0.0")).unwrap();
    let mut work = 0usize;
    let mut meter = |amount: usize| {
        work += amount;
        if work > 25 {
            Err(EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "test work ceiling",
            ))
        } else {
            Ok(())
        }
    };
    assert_eq!(
        r.list_kinds(&mut Context::ordinary().with_meter(&mut meter))
            .unwrap_err()
            .code,
        "RESOURCE_LIMIT"
    );
    let listing = json_value(&r.list_kinds(&mut Context::ordinary()).unwrap());
    assert_eq!(listing["definitions"].as_array().unwrap().len(), 2);
}

#[test]
fn existing_catalog_shaped_metadata_requires_explicit_activation() {
    let e = engine();
    let mut r = e.registry(&mut Context::catalog()).unwrap();
    let mut p = package("example", "1.0.0");
    p["kindCatalog"] = json!({"profile":"1.0.0","definitions":false,"unknown":{}});
    let original = value(p);
    r.register(
        &original,
        Some(1),
        e.package_schema(),
        &e.schema_resources_with_context(&mut Context::catalog())
            .unwrap(),
        &mut Context::catalog(),
    )
    .unwrap();
    assert_eq!(
        r.get(&Utf16::from("example"), &Utf16::from("1.0.0"))
            .unwrap()
            .manifest(),
        &original
    );
    assert_eq!(
        json_value(&r.list_kinds(&mut Context::ordinary()).unwrap())["packages"][0]["catalog"],
        "absent"
    );
    assert!(
        e.validate_document(
            &value(document()),
            &r,
            &mut Callbacks::default(),
            &mut Context::ordinary()
        )
        .unwrap()
        .valid
    );
}
