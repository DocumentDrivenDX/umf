// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent source-preserving compiled-schema Clone control.
use umf_core::{Context,PythonConsumerValue as P,PyText};
use umf_core::schema::CompiledSchema;
use umf_core::python_regex::PythonReVersion;
fn main(){
 let pair=P::String(PyText::from_codepoints(vec![0xd800,0xdc00]).unwrap());
 let scalar=P::String(PyText::from_codepoints(vec![0x10000]).unwrap());
 let schema=P::Object(vec![(PyText::from_utf8("enum"),P::Array(vec![pair.clone()]))]);
 let compiled=CompiledSchema::compile_python_source(&schema,&Default::default(),false,PythonReVersion::V3_11,&mut Context::ordinary()).unwrap();
 let cloned=compiled.clone();
 for (name,c) in [("original",compiled),("clone",cloned)]{
  println!("{} pair={} scalar={}",name,c.validate(&pair,&mut Context::ordinary()).unwrap().is_empty(),c.validate(&scalar,&mut Context::ordinary()).unwrap().is_empty());
 }
}
