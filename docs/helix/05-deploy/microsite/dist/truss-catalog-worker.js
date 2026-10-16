// docs/helix/05-deploy/microsite/load-intent.ts
async function admitOriginalLoad(input) {
  const text = JSON.stringify({ profile: "umf.demo.load-intent/1", input });
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    throw Error("Bounded original load intent required");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("umf-products-demo-layout02-control", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("intents");
    request.onerror = () => reject(request.error ?? Error("Load journal unavailable"));
    request.onblocked = () => reject(Error("Load journal blocked"));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("intents", "readwrite", { durability: "strict" });
      let admission = "recover", failure;
      const fail = (error) => {
        failure = error;
        try {
          tx.abort();
        } catch {
          reject(error);
        }
      };
      tx.oncomplete = () => resolve(admission);
      tx.onabort = () => reject(failure ?? tx.error ?? Error("Load journal transaction aborted"));
      tx.onerror = () => {
        failure ??= tx.error ?? Error("Load journal transaction failed");
      };
      if (tx.durability !== "strict") {
        fail(Error("Strict load journal durability required"));
        return;
      }
      const object = tx.objectStore("intents"), request = object.get("load");
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            object.add(text, "load");
            admission = "first";
          } else if (request.result !== text)
            throw Error("Original load intent differs; reconciliation required");
        } catch (error) {
          fail(error);
        }
      };
    });
  } finally {
    db.close();
  }
}

// docs/helix/05-deploy/microsite/truss-catalog-worker.ts
var scope = globalThis;
var current;
var pending = Promise.resolve();
var action;
var readGrant;
var frozen;
var modelSha256;
scope.onmessage = (event) => {
  const id = event.data?.id, command = event.data?.command, payload = event.data?.payload;
  pending = pending.then(async () => {
    try {
      if (!Number.isSafeInteger(id) || !["open", "register", "preview", "seal", "recover", "submit", "recover-submit", "claim", "recover-claim", "review", "execute", "recover-execute", "rows", "cancel", "recover-cancel", "history", "close"].includes(command))
        throw Error("Unknown store request");
      if (command === "open") {
        if (current)
          throw Error("Store already opened");
        const { openBrowserStore } = await import("./truss-browser/store.js");
        const response = await fetch(new URL("./truss-browser/layout.sql", import.meta.url));
        if (!response.ok)
          throw Error("Layout unavailable");
        current = await openBrowserStore({ name: "umf-products-demo-layout02", layoutSql: await response.text() });
        scope.postMessage({ id, result: current.outcome === "available" ? { outcome: "available", info: current.store.info(current.owner), catalog: await current.store.catalog(current.owner) } : current });
      } else {
        if (current?.outcome !== "available")
          throw Error("Available store required");
        if (command === "register") {
          const response = await fetch(new URL("./truss-browser/model.json", import.meta.url));
          if (!response.ok)
            throw Error("Model unavailable");
          const input = await response.json(), request = input.request;
          const registration = await current.store.registerDocument(current.owner, { documentId: request.modelPin.documentId, documentRevision: request.modelPin.revision, sourceUtf8: request.model.utf8 });
          if (registration.outcome === "refused") {
            scope.postMessage({ id, result: registration });
            return;
          }
          const issued = await current.store.registerAction(current.owner, request.action.identity);
          const granted = await current.store.grantSelectionRead(current.owner, issued.action);
          action = issued.action;
          readGrant = granted.grant;
          frozen = undefined;
          modelSha256 = issued.model.sha256;
          const target = { documentId: request.modelPin.documentId, module: "sales", record: "products" };
          const loadInput = { target, rows: input.seed.products.map((row) => ({ fields: [{ module: "sales", field: "product-id", value: row.id }, { module: "sales", field: "product-name", value: row.name }] })), request: { requestKey: "umf-products-demo-layout02-initial-load-b8-v1", attempt: "original-load-v1" } };
          const admission = await admitOriginalLoad(loadInput);
          const loaded = admission === "first" ? await current.store.loadObjects(current.owner, loadInput) : await current.store.recoverLoad(current.owner, loadInput);
          if (loaded.outcome !== "loaded") {
            scope.postMessage({ id, result: { outcome: "bootstrap-unavailable", load: loaded } });
            return;
          }
          const rows = await current.store.readObjects(current.owner, target);
          scope.postMessage({ id, result: { outcome: "prepared", load: loaded, rows, registration: registration.outcome, catalog: await current.store.catalog(current.owner), modelSha256: issued.model.sha256, preparationSha256: issued.preparation.sha256, selectionRead: granted.declaration } });
        } else if (command === "close") {
          await current.store.close(current.owner);
          current = undefined;
          action = undefined;
          readGrant = undefined;
          frozen = undefined;
          modelSha256 = undefined;
          scope.postMessage({ id, result: { outcome: "closed" } });
        } else {
          if (!action || !readGrant || !modelSha256)
            throw Error("Fresh issued action and read grant required");
          if (command === "preview") {
            const input = { sql: payload?.sql, parameters: {}, batchSize: 2, maxItems: 1e4 };
            frozen = undefined;
            frozen = await current.store.materialize(current.owner, action, readGrant, input);
            const info = current.store.info(current.owner);
            scope.postMessage({ id, result: { outcome: "materialized", plan: frozen.plan, manifest: frozen.manifest, count: frozen.count, batches: frozen.batches, input, sealContext: { storeId: info.storeId, incarnation: info.incarnation, modelSha256 } } });
          } else if (command === "seal") {
            if (!frozen)
              throw Error("Original materialization required");
            scope.postMessage({ id, result: await current.store.seal(current.owner, action, readGrant, frozen.work, { requestKey: payload?.requestKey, attempt: payload?.attempt }) });
          } else if (command === "submit")
            scope.postMessage({ id, result: await current.store.submit(current.owner, action, readGrant, payload) });
          else if (command === "recover-submit")
            scope.postMessage({ id, result: await current.store.recoverSubmit(current.owner, action, readGrant, payload) });
          else if (command === "claim")
            scope.postMessage({ id, result: await current.store.claim(current.owner, action, readGrant, payload) });
          else if (command === "recover-claim")
            scope.postMessage({ id, result: await current.store.recoverClaim(current.owner, action, readGrant, payload) });
          else if (command === "execute")
            scope.postMessage({ id, result: await current.store.executeBatch(current.owner, action, readGrant, payload) });
          else if (command === "recover-execute")
            scope.postMessage({ id, result: await current.store.recoverBatch(current.owner, action, readGrant, payload) });
          else if (command === "rows")
            scope.postMessage({ id, result: { rows: await current.store.readObjects(current.owner, { documentId: "product-local-action-demo", module: "sales", record: "products" }) } });
          else if (command === "cancel")
            scope.postMessage({ id, result: await current.store.cancel(current.owner, action, readGrant, payload) });
          else if (command === "recover-cancel")
            scope.postMessage({ id, result: await current.store.recoverCancel(current.owner, action, readGrant, payload) });
          else if (command === "history")
            scope.postMessage({ id, result: await current.store.readFeed(current.owner, { cursor: payload?.cursor ?? null, limit: 5 }) });
          else if (command === "review")
            scope.postMessage({ id, result: await current.store.reviewJob(current.owner, action, readGrant, payload) });
          else
            scope.postMessage({ id, result: await current.store.recoverSeal(current.owner, action, readGrant, payload?.reference) });
        }
      }
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
