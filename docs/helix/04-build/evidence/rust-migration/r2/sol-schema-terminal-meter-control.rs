// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent operational failure provenance control.
use umf_core::{Context,EngineError,Utf16,PythonConsumerValue as P};
use umf_core::schema::CompiledSchema;
use umf_core::python_regex::PythonReVersion;
use umf_core::PythonSchemaEvaluationMode;
fn main(){
 let compiled=CompiledSchema::compile_python_source(&P::Object(vec![]),&Default::default(),false,PythonReVersion::V3_11,&mut Context::ordinary()).unwrap();
 let mut calls=0;let mut meter=|_:usize|{calls+=1;if calls==2 {Err(EngineError::new("PYTHON_SCHEMA_ARITHMETIC",Utf16::default(),"nan-to-integer"))}else{Ok(())}};
 let mut ctx=Context::ordinary().with_meter(&mut meter);
 match compiled.evaluate(&P::Null,PythonSchemaEvaluationMode::AllErrors,&mut ctx){
  Err(e)=>println!("outer-error {}",e.code),
  Ok(r)=>println!("outer-ok terminal={:?}",r.terminal_error.map(|e|e.code)),
 }
}
