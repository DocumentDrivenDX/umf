// docs/helix/05-deploy/microsite/action-compiler.ts
var sql = document.querySelector("#sql");
var status = document.querySelector("#status");
var output = document.querySelector("#plan");
var run = document.querySelector("#compile");
try {
  let compile = function() {
    try {
      const response = JSON.parse(compiler.compile_json(JSON.stringify({ ...data.request, sql: sql.value })));
      status.textContent = response.status === "compiled" ? "Portable action plan compiled" : "Statement refused";
      output.textContent = response.status === "compiled" ? JSON.stringify(JSON.parse(response.plan.utf8), null, 2) : JSON.stringify(response.diagnostics, null, 2);
    } catch (error) {
      status.textContent = "Compilation unavailable";
      output.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  const data = await fetch("./action-compiler/model.json").then((r) => {
    if (!r.ok)
      throw Error("Model unavailable");
    return r.json();
  });
  const module = await import("./action-compiler/weft_wasm.js");
  await module.default();
  const compiler = new module.MutationCompiler(JSON.stringify(data.configuration));
  sql.value = data.request.sql;
  document.querySelector("#samples").textContent = JSON.stringify(data.samples, null, 2);
  run.disabled = false;
  run.addEventListener("click", compile);
  compile();
} catch (error) {
  status.textContent = "Compiler unavailable";
  output.textContent = error instanceof Error ? error.message : String(error);
}
var openStore = document.querySelector("#store-open");
var registerStore = document.querySelector("#store-register");
var closeStore = document.querySelector("#store-close");
var storeStatus = document.querySelector("#store-status");
var catalogOutput = document.querySelector("#catalog");
var worker;
var sequence = 0;
var waiting;
function requestStore(command) {
  if (waiting)
    throw Error("Store request already pending");
  if (!worker) {
    worker = new Worker(new URL("./truss-catalog-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      if (waiting && event.data.id === waiting.id) {
        const current = waiting;
        waiting = undefined;
        event.data.error ? current.reject(new Error(event.data.error)) : current.resolve(event.data.result);
      }
    };
    worker.onerror = (event) => {
      const current = waiting;
      waiting = undefined;
      current?.reject(new Error(event.message));
      worker?.terminate();
      worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    waiting = { id: ++sequence, resolve, reject };
    worker.postMessage({ id: sequence, command });
  });
}
async function localOperation(command) {
  openStore.disabled = registerStore.disabled = closeStore.disabled = true;
  storeStatus.textContent = "Working…";
  try {
    const result = await requestStore(command);
    catalogOutput.textContent = JSON.stringify(result, null, 2);
    if (result.outcome === "unavailable") {
      storeStatus.textContent = "Store is in use in another tab";
      worker?.terminate();
      worker = undefined;
      openStore.disabled = false;
    } else if (result.outcome === "closed") {
      storeStatus.textContent = "Store closed";
      worker?.terminate();
      worker = undefined;
      openStore.disabled = false;
    } else {
      storeStatus.textContent = result.outcome === "available" ? "Local Truss store opened" : result.outcome === "refused" ? "Catalog registration refused" : "Products catalog " + result.outcome;
      registerStore.disabled = closeStore.disabled = false;
    }
  } catch (error) {
    storeStatus.textContent = "Local store unavailable";
    catalogOutput.textContent = error instanceof Error ? error.message : String(error);
    worker?.terminate();
    worker = undefined;
    openStore.disabled = false;
  }
}
openStore.addEventListener("click", () => void localOperation("open"));
registerStore.addEventListener("click", () => void localOperation("register"));
closeStore.addEventListener("click", () => void localOperation("close"));
