// SPDX-License-Identifier: MIT OR Apache-2.0
//! Owner integration controls. Written only; hosted execution is separately gated.
use super::*;
fn json(source:&str)->Value {
    crate::serialization::read_json_value(&source.encode_utf16().collect::<Vec<_>>(),crate::serialization::Format::Json,&mut Context::catalog()).unwrap()
}
fn compile(source:&Value,resources:&SchemaResources)->CompiledSchema {
    Context::catalog().with_codegen_construction(|ctx|CompiledSchema::compile(source,resources,ctx)).unwrap()
}
#[test]
fn retained_role_ordinal_preserves_original_order_and_deduplication_fallback() {
    let source=json(r#"{"$id":"https://location.test/root","type":"object","properties":{"z":{"type":"string"},"a":{"type":"integer"}},"required":["z","a"]}"#);
    let other=json(r#"{"$id":"https://location.test/other","type":"boolean"}"#);
    let resources=SchemaResources{entries:vec![(Utf16::from("https://location.test/other"),other),(Utf16::from("https://location.test/root"),source.clone())]};
    let owner=compile(&source,&resources);
    assert!(matches!(&owner.schema,SchemaRoot::Catalogue(_,1)),"actual retained ordinal must select the admitted catalogue member");
    assert_eq!(&*owner.schema,&source);
    let original=CompiledSchema::compile(&source,&resources,&mut Context::catalog()).unwrap();
    for data in [json("{}"),json(r#"{"z":4,"a":"bad"}"#),json(r#"{"z":"ok","a":2}"#)] {
        assert_eq!(owner.validate(&data,&mut Context::catalog()).unwrap(),original.validate(&data,&mut Context::catalog()).unwrap());
    }
    // Dedup may change physical ordinals or discard a differently ordered
    // equivalent source. A source-row ordinal must never select its neighbour.
    let duplicate=SchemaResources{entries:vec![(Utf16::from("https://location.test/root"),source.clone()),(Utf16::from("https://location.test/root"),source.clone())]};
    let owner=compile(&source,&duplicate);
    assert!(!matches!(&owner.schema,SchemaRoot::Catalogue(_,_)));
    assert_eq!(&*owner.schema,&source);
    assert_eq!(owner.resources.entries.len(),1);
}
#[test]
fn actual_evaluator_consumes_root_and_array_child_coordinates_and_reuses_complete_metadata() {
    let source=json(r#"{"type":"array","items":{"type":"integer"}}"#);
    let owner=compile(&source,&SchemaResources::default());
    let plans=owner.owner_plans.as_ref().unwrap();
    assert!(plans.nodes.lock().unwrap().is_empty());
    let data=json(r#"["bad",false]"#);
    let expected=owner.clone().validate(&data,&mut Context::catalog()).unwrap();
    let actual=owner.validate(&data,&mut Context::catalog()).unwrap();
    assert_eq!(actual,expected);
    assert_eq!(actual.iter().map(|x|x.instance_path.clone()).collect::<Vec<_>>(),vec![Utf16::from("/0"),Utf16::from("/1")]);
    let saved:Vec<_>=plans.nodes.lock().unwrap().iter().map(|(key,plan)|(key.clone(),Arc::clone(plan))).collect();
    assert_eq!(saved.len(),2,"both actual source object nodes require cursor-backed plans");
    for(_,plan)in &saved {assert!(matches!(plan.locator.get(&owner,&mut Context::catalog()).unwrap(),Value::Object(_)));}
    assert_eq!(owner.validate(&data,&mut Context::catalog()).unwrap(),expected);
    let cache=plans.nodes.lock().unwrap();
    for(key,plan)in saved {assert!(Arc::ptr_eq(&plan,cache.get(&key).unwrap()));}
}
#[test]
fn selected_and_current_cursor_scopes_restore_by_move_on_error_and_unwind() {
    let owner=compile(&json(r#"{"default":{"opaque":[1,2]},"type":"object"}"#),&SchemaResources::default());
    let table=owner.owner_locations.as_ref().unwrap();
    let mut ctx=Context::catalog();
    let root=table.root(&owner,0,&mut ctx).unwrap().unwrap();
    let child=table.child(&owner,&root,0,&mut ctx).unwrap().unwrap();
    let mut state=Evaluated::default();state.schema_cursor=Some(root.clone());state.selected_cursor=Some(child.clone());
    for panic in [false,true] {
        let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let mut scope=EvaluationScope::enter(&mut state,&mut ctx).unwrap();
            scope.state.schema_cursor=Some(child.clone());scope.state.selected_cursor=None;
            if panic {panic!("restore source cursor");}
            Err::<(),_>(EngineError::new("OWNER_STOP",Utf16::from("/original"),"stop"))
        }));
        assert!(std::ptr::eq(state.schema_cursor.as_ref().unwrap().get(&owner,&mut ctx).unwrap(),&*owner.schema));
        assert_eq!(state.selected_cursor.as_ref().unwrap().get(&owner,&mut ctx).unwrap(),child.get(&owner,&mut ctx).unwrap());
    }
}
