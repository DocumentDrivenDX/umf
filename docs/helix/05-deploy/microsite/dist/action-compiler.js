// docs/helix/05-deploy/microsite/seal-intent.ts
var database = "umf-products-demo-control";
var store = "intents";
var referenceFields = ["profile", "storeId", "incarnation", "requestKey", "attempt", "manifestSha256", "planSha256", "modelSha256"];
function parse(value) {
  if (value === undefined)
    return null;
  if (typeof value !== "string" || value.length > 8 * 1024 * 1024)
    throw Error("Invalid retained seal intent");
  const intent = JSON.parse(value), ref = intent?.reference;
  if (intent?.profile !== "umf.demo.seal-intent/1" || !["pending", "settled"].includes(intent.phase) || !ref || ref.profile !== "truss-browser-seal-reference/0.1" || Object.keys(ref).length !== referenceFields.length || referenceFields.some((key) => typeof ref[key] !== "string" || !ref[key] || ref[key].length > 256))
    throw Error("Retained seal intent requires reconciliation");
  return intent;
}
function encode(value) {
  const text = JSON.stringify(value);
  parse(text);
  return text;
}
function same(a, b) {
  return referenceFields.every((key) => a[key] === b[key]);
}
async function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onerror = () => reject(request.error ?? Error("Intent journal unavailable"));
    request.onblocked = () => reject(Error("Intent journal upgrade blocked"));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transact(mode, operation) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
      let result = null, failure;
      const fail = (error) => {
        failure = error;
        try {
          tx.abort();
        } catch {
          reject(error);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? Error("Intent journal transaction aborted"));
      tx.onerror = () => {
        failure ??= tx.error ?? Error("Intent journal transaction failed");
      };
      if (mode === "readwrite" && tx.durability !== "strict") {
        fail(Error("Strict intent journal durability required"));
        return;
      }
      try {
        operation(tx.objectStore(store), (value) => {
          result = value;
        }, fail);
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    db.close();
  }
}
function readSealIntent() {
  return transact("readonly", (object, result, fail) => {
    const request = object.get("current");
    request.onsuccess = () => {
      try {
        result(parse(request.result));
      } catch (error) {
        fail(error);
      }
    };
  });
}
async function reserveSealIntent(value) {
  const text = encode(value);
  await transact("readwrite", (object, result, fail) => {
    const request = object.get("current");
    request.onsuccess = () => {
      try {
        if (parse(request.result))
          throw Error("Original seal intent already retained; recover it");
        object.add(text, "current");
        result(value);
      } catch (error) {
        fail(error);
      }
    };
  });
}
async function settleSealIntent(value) {
  const text = encode(value);
  await transact("readwrite", (object, result, fail) => {
    const request = object.get("current");
    request.onsuccess = () => {
      try {
        const previous = parse(request.result);
        if (!previous || !same(previous.reference, value.reference))
          throw Error("Original seal intent changed; reconciliation required");
        object.put(text, "current");
        result(value);
      } catch (error) {
        fail(error);
      }
    };
  });
}

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
var previewStore = document.querySelector("#store-preview");
var sealStore = document.querySelector("#store-seal");
var recoverStore = document.querySelector("#store-recover");
var storeStatus = document.querySelector("#store-status");
var catalogOutput = document.querySelector("#catalog");
var intent = null;
var intentError = "Intent journal not yet read";
var preview = null;
async function refreshIntent() {
  try {
    const retained = await readSealIntent();
    if (intent && !retained)
      throw Error("Original intent unexpectedly missing");
    intent = retained;
    intentError = "";
    if (intent)
      preview = null;
  } catch (error) {
    intentError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
var intentChannel = new BroadcastChannel("umf-products-demo-control");
intentChannel.onmessage = () => {
  refreshIntent().catch(() => {}).finally(buttons);
};
var worker;
var sequence = 0;
var available = false;
var prepared = false;
var busy = false;
var waiting;
function buttons() {
  openStore.disabled = busy || available;
  registerStore.disabled = closeStore.disabled = busy || !available;
  previewStore.disabled = busy || !prepared || !!intent || !!intentError;
  sealStore.disabled = busy || !prepared || !preview || !!intent || !!intentError;
  recoverStore.disabled = busy || !prepared || !intent || !!intentError;
}
function requestStore(command, payload) {
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
      detach();
      buttons();
    };
  }
  return new Promise((resolve, reject) => {
    waiting = { id: ++sequence, resolve, reject };
    worker.postMessage({ id: sequence, command, payload });
  });
}
function detach() {
  worker?.terminate();
  worker = undefined;
  available = false;
  prepared = false;
  preview = null;
}
async function localOperation(command) {
  let payload;
  if (busy)
    return;
  busy = true;
  buttons();
  try {
    await refreshIntent();
    if (command === "preview") {
      if (intent || intentError)
        throw Error("Original seal intent must be reconciled");
      payload = { sql: sql.value };
    }
    if (command === "seal") {
      if (!preview || intent || intentError)
        throw Error("Fresh materialization and available intent storage required");
      const reference = { profile: "truss-browser-seal-reference/0.1", storeId: preview.sealContext.storeId, incarnation: preview.sealContext.incarnation, modelSha256: preview.sealContext.modelSha256, requestKey: crypto.randomUUID(), attempt: crypto.randomUUID(), manifestSha256: preview.manifest.sha256, planSha256: preview.plan.sha256 };
      const pending = { profile: "umf.demo.seal-intent/1", reference, input: preview.input, phase: "pending" };
      await reserveSealIntent(pending);
      intent = pending;
      intentChannel.postMessage({ changed: true });
      payload = { requestKey: reference.requestKey, attempt: reference.attempt };
    }
    if (command === "recover") {
      if (!intent)
        throw Error("Original seal intent required");
      payload = { reference: intent.reference };
    }
  } catch (error) {
    storeStatus.textContent = "Operation not sent";
    catalogOutput.textContent = error instanceof Error ? error.message : String(error);
    busy = false;
    buttons();
    return;
  }
  buttons();
  storeStatus.textContent = command === "seal" ? "Seal pending; original intent saved" : "Working…";
  try {
    const result = await requestStore(command, payload);
    catalogOutput.textContent = JSON.stringify(result, null, 2);
    if (result.outcome === "unavailable") {
      storeStatus.textContent = "Store is in use in another tab";
      detach();
    } else if (result.outcome === "closed") {
      storeStatus.textContent = "Store closed";
      detach();
    } else if (result.outcome === "available") {
      available = true;
      prepared = false;
      await refreshIntent();
      storeStatus.textContent = "Local Truss store opened";
    } else if (result.outcome === "prepared") {
      prepared = true;
      preview = null;
      await refreshIntent();
      storeStatus.textContent = "UPDATE prepared";
    } else if (result.outcome === "materialized") {
      if (result.input.sql !== sql.value) {
        preview = null;
        storeStatus.textContent = "Statement changed; preview again";
      } else {
        preview = result;
        storeStatus.textContent = `Frozen manifest: ${result.count} items, ${result.batches.length} batches`;
      }
    } else if (command === "seal" || command === "recover") {
      if (!intent)
        throw Error("Original intent unexpectedly unavailable");
      const retained = { ...intent, phase: result.outcome === "sealed" ? "settled" : "pending", outcome: result };
      intent = retained;
      storeStatus.textContent = "Seal: " + result.outcome;
      try {
        await settleSealIntent(retained);
        intentChannel.postMessage({ changed: true });
      } catch {
        storeStatus.textContent += "; local status not saved, original pending reference retained";
      }
      if (result.outcome === "unknown")
        detach();
    } else {
      storeStatus.textContent = "Operation refused";
    }
  } catch (error) {
    storeStatus.textContent = intent ? "Response unavailable; original seal intent retained" : "Local store unavailable";
    catalogOutput.textContent = error instanceof Error ? error.message : String(error);
    detach();
  } finally {
    busy = false;
    buttons();
  }
}
openStore.addEventListener("click", () => void localOperation("open"));
registerStore.addEventListener("click", () => void localOperation("register"));
closeStore.addEventListener("click", () => void localOperation("close"));
previewStore.addEventListener("click", () => void localOperation("preview"));
sealStore.addEventListener("click", () => void localOperation("seal"));
recoverStore.addEventListener("click", () => void localOperation("recover"));
sql.addEventListener("input", () => {
  preview = null;
  buttons();
});
buttons();
refreshIntent().catch((error) => {
  storeStatus.textContent = "Seal journal unavailable; no new seal allowed";
  catalogOutput.textContent = String(error);
}).finally(buttons);
