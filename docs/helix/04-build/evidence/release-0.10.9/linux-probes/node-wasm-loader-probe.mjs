// Explicit WASM default file-URL loader probe (the Mac Node probe that failed); runs unmodified semantics, reports actual result.
import {initializeWasm} from '@umf/core/runtime/wasm';
try { const e=await initializeWasm(); console.log(JSON.stringify({status:'passed',probe:'node-wasm-default-file-url-loader',engine:typeof e})); }
catch(err){ console.log(JSON.stringify({status:'failed',probe:'node-wasm-default-file-url-loader',error:String(err&&err.message||err).slice(0,300)})); process.exitCode=1; }
