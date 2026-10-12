//! Current owner compiler observation only; no installation or authorization.
use std::io::{Read,Write};
use std::sync::{Arc,atomic::{AtomicBool,Ordering}};
use serde_json::{Value,json};
use weft_core::{compile::Compiler,error::Diagnostic,security_backend::{SecurityBackend,SecurityBackendContext,SecurityRegistry},security_lowering::SecurityLowering};
struct Spy{manifest:String,lower:Arc<AtomicBool>}
impl SecurityBackend for Spy{
 fn manifest_json(&self)->&str{&self.manifest}
 fn lower(&self,_:&SecurityBackendContext<'_>)->weft_core::error::Result<SecurityLowering>{self.lower.store(true,Ordering::SeqCst);Err(Diagnostic::new("WFT-WITNESS-LOWER","capability","Observed unexpected lowering"))}
}
fn main(){
 let mut bytes=Vec::new();std::io::stdin().take(16_777_217).read_to_end(&mut bytes).unwrap();assert!(bytes.len()<=16_777_216);
 let input:Value=serde_json::from_slice(&bytes).unwrap();let raw=input["requestJson"].as_str().unwrap();let mode=input["mode"].as_str().unwrap();
 let mut ordinary=false;let mut security=false;let lower=Arc::new(AtomicBool::new(false));
 let response=match mode{
  "ordinary"=>Compiler::default().compile_json_with_factory(raw,&mut |_,_,_|{ordinary=true;Err(Diagnostic::new("WFT-WITNESS-ORDINARY","capability","Observed ordinary factory"))}),
  "security-empty"|"security-registered"=>Compiler::default().compile_json_with_security_factory(raw,&mut |ctx|{
   security=true;let mut registry=SecurityRegistry::default();if mode=="security-registered"{
    let manifest=json!({"interfaceVersion":"weft-security-backend/0.1.0","backendId":ctx.backend_id(),"backendVersion":ctx.backend_version(),"bindingProfile":"current-witness-unqualified","sourceProfiles":[{"dialect":"weft-sql/0.2.0","applicationIr":"weft-ir/0.2.0","policy":"0.1.0","ontology":"0.1.0","securityIr":"weft.security.logical-ir/0.1.0"}],"targetProfiles":[{"id":ctx.target_profile(),"engine":"fixture-only","engineVersion":"unqualified","sessionSettings":{},"storageLayoutRevision":"fixture","publicationRevision":"unqualified"}],"capabilities":[{"id":"declaration-only","targetProfiles":[ctx.target_profile()],"languageProfiles":[{"dialectProfile":"weft-sql/0.2.0","irVersion":"weft-ir/0.2.0"}],"logicalDomain":{"fixture":true},"resultDomain":{"fixture":true},"constraints":[],"obligations":[],"status":"candidate","evidence":[]}],"evidence":[]}).to_string();
    registry.register(Spy{manifest,lower:lower.clone()})?;
   }Ok(registry)
  }),_=>panic!("Unknown witness mode")
 };
 let response:Value=serde_json::from_str(&response).unwrap();let result=json!({"ordinaryFactoryInvoked":ordinary,"securityFactoryInvoked":security,"lowerInvoked":lower.load(Ordering::SeqCst),"response":response});writeln!(std::io::stdout(),"{result}").unwrap();
}
