// Go's compatibility globals are confined to this worker, not the application.
importScripts('./wasm_exec.js');
const go = new Go();
const ready = WebAssembly.instantiateStreaming(fetch('./compiler.wasm'), go.importObject).then(({instance}) => {
  go.run(instance).catch(error => { throw error; });
  if (typeof globalThis.umfCompileProtobuf !== 'function') throw new Error('Compiler failed to initialize');
});
onmessage = async ({data}) => {
  try {
    await ready;
    postMessage({id:data.id, result:JSON.parse(globalThis.umfCompileProtobuf(JSON.stringify(data.request)))});
  } catch(error) { postMessage({id:data.id, result:{error:String(error)}}); }
};
