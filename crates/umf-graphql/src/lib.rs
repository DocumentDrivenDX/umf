//! Native GraphQL SDL adapter over UMF's core Value, Engine, Registry and
//! Context APIs.
pub use umf_core::{context, engine, error, registry, serialization, value};
pub use umf_core::{Context, Engine, Registry, Utf16, Value};
pub mod apollo_mapper;
pub mod core_value_bridge;
pub mod engine_registry;
pub mod graphql17_overlay;
pub mod graphql_adapter;

#[cfg(test)]
mod tests {
    use super::graphql_adapter;
    use serde_json::Value;

    #[test]
    fn schema_import_export_keeps_original_sdl() {
        let source = "type Query { viewer: String! }\n";
        let doc = graphql_adapter::import(source, "shop", Some("schema")).unwrap();
        assert_eq!(graphql_adapter::export(&doc).unwrap(), source);
    }

    #[test]
    fn fragment_import_remains_syntax_only() {
        let source = "extend type Query { next: Product }\n";
        let doc = graphql_adapter::import(source, "fragment", Some("fragment")).unwrap();
        let report = graphql_adapter::inspect(&doc);
        assert!(report.iter().any(|d| d.code == "GRAPHQL_FRAGMENT"));
        assert_eq!(graphql_adapter::export(&doc).unwrap(), source);
    }

    #[test]
    fn graphql_17_directive_extension_survives_overlay() {
        let source = "directive @trace on FIELD_DEFINITION\nextend directive @trace @other\ntype Query { id: ID }\n";
        let doc = graphql_adapter::import(source, "directive-extension", Some("fragment")).unwrap();
        let ast = doc
            .pointer("/modules/0/elements/0/extensions/umf.graphql/ast")
            .unwrap();
        assert!(ast["definitions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["kind"] == "DirectiveExtension"));
        assert_eq!(graphql_adapter::export(&doc).unwrap(), source);
    }

    #[test]
    fn oneof_rejects_non_nullable_fields_and_defaults() {
        let source = "input Choice @oneOf { a: String! b: String = \"x\" } type Query { choose(c: Choice): String }";
        let result = graphql_adapter::import(source, "oneof", Some("schema"));
        assert!(result.is_err());
    }

    #[test]
    fn edited_ast_prints_and_reparses_before_commit() {
        let source = "type Query { old: String }";
        let doc = graphql_adapter::import(source, "edit", Some("schema")).unwrap();
        let edited = graphql_adapter::edit(&doc, |ast| {
            let field = ast
                .pointer_mut("/definitions/0/fields/0/name/value")
                .unwrap();
            *field = Value::String("new".into());
            Ok(())
        })
        .unwrap();
        assert_eq!(
            graphql_adapter::export(&edited).unwrap(),
            "type Query {\n  new: String\n}\n"
        );
    }
}

#[cfg(test)]
mod native_runtime_tests {
    use super::{
        context::Context,
        engine_registry::{self, GraphqlResources},
        value::{Utf16, Value},
    };
    fn member_mut<'a>(v: &'a mut Value, k: &str) -> Option<&'a mut Value> {
        if let Value::Object(m) = v {
            m.iter_mut()
                .find(|(x, _)| x == &Utf16::from(k))
                .map(|(_, v)| v)
        } else {
            None
        }
    }
    #[test]
    fn real_engine_registry_import_ast_export_and_atomic_edit() {
        let mut ctx = Context::ordinary();
        let mut resources = GraphqlResources::new(&mut ctx).unwrap();
        let doc = engine_registry::import_sdl(
            &mut resources,
            "type Query { old: String }",
            "runtime",
            None,
            &mut ctx,
        )
        .unwrap();
        let ast = engine_registry::get_graphql_ast(&mut resources, &doc, &mut ctx).unwrap();
        assert!(matches!(ast, Value::Object(_)));
        assert_eq!(
            engine_registry::export_sdl(&mut resources, &doc, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            "type Query { old: String }"
        );
        let edited = engine_registry::edit_ast(
            &mut resources,
            &doc,
            |ast| {
                let defs = member_mut(ast, "definitions").ok_or("definitions")?;
                let Value::Array(defs) = defs else {
                    return Err("definitions array".into());
                };
                let field = member_mut(&mut defs[0], "fields").ok_or("fields")?;
                let Value::Array(fields) = field else {
                    return Err("fields array".into());
                };
                let name = member_mut(&mut fields[0], "name").ok_or("name")?;
                let value = member_mut(name, "value").ok_or("value")?;
                *value = Value::string_utf8("new");
                Ok(())
            },
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            engine_registry::export_sdl(&mut resources, &edited, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            "type Query {\n  new: String\n}\n"
        );
        let bundle =
            engine_registry::export_graphql_bundle(&mut resources, &edited, &mut ctx).unwrap();
        assert!(bundle.diagnostics.iter().any(|d| d
            .code
            .to_utf8()
            .map(|s| s == "SOURCE_ARTIFACT_REQUIRED")
            .unwrap_or(false)));
    }
    #[test]
    fn fragment_and_graphql17_extension_are_native_runtime_paths() {
        let mut ctx = Context::ordinary();
        let mut r = GraphqlResources::new(&mut ctx).unwrap();
        let fragment = engine_registry::import_sdl(
            &mut r,
            "extend type Query { next: Product }",
            "fragment",
            Some("fragment"),
            &mut ctx,
        )
        .unwrap();
        let report = engine_registry::validate_document(&mut r, &fragment, &mut ctx).unwrap();
        assert!(report.diagnostics.iter().any(|d| d
            .code
            .to_utf8()
            .map(|s| s == "GRAPHQL_FRAGMENT")
            .unwrap_or(false)));
        let source = "directive @flag on FIELD_DEFINITION\ntype Query { x: String @flag }";
        let parsed = crate::graphql17_overlay::parse_with_overlay(source, 1000)
            .unwrap()
            .0;
        assert_eq!(
            parsed["definitions"][1]["fields"][0]["directives"][0]["name"]["value"],
            "flag"
        );
    }
    #[test]
    fn edit_rejects_fragment_before_callback() {
        let mut ctx = Context::ordinary();
        let mut r = GraphqlResources::new(&mut ctx).unwrap();
        let doc = engine_registry::import_sdl(
            &mut r,
            "extend type Query { next: Product }",
            "fragment",
            Some("fragment"),
            &mut ctx,
        )
        .unwrap();
        let mut called = false;
        let result = engine_registry::edit_ast(
            &mut r,
            &doc,
            |_| {
                called = true;
                Ok(())
            },
            &mut ctx,
        );
        assert!(result.is_err());
        assert!(!called);
    }
    #[test]
    fn oneof_native_runtime_rejects_nullable_and_default_rules() {
        let mut ctx = Context::ordinary();
        let mut r = GraphqlResources::new(&mut ctx).unwrap();
        let e = engine_registry::import_sdl(
            &mut r,
            "input Choice @oneOf { a: String! } type Query { choose(c: Choice): String }",
            "bad-oneof",
            None,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(e.code, "GRAPHQL_IMPORT");
    }
}
