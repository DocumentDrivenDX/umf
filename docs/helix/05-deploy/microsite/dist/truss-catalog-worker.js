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
      if (!Number.isSafeInteger(id) || !["open", "register", "preview", "seal", "recover", "close"].includes(command))
        throw Error("Unknown store request");
      if (command === "open") {
        if (current)
          throw Error("Store already opened");
        const { openBrowserStore } = await import("./truss-browser/store.js");
        const response = await fetch(new URL("./truss-browser/layout.sql", import.meta.url));
        if (!response.ok)
          throw Error("Layout unavailable");
        current = await openBrowserStore({ name: "umf-products-demo", layoutSql: await response.text() });
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
          scope.postMessage({ id, result: { outcome: "prepared", registration: registration.outcome, catalog: await current.store.catalog(current.owner), modelSha256: issued.model.sha256, preparationSha256: issued.preparation.sha256, selectionRead: granted.declaration } });
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
          } else
            scope.postMessage({ id, result: await current.store.recoverSeal(current.owner, action, readGrant, payload?.reference) });
        }
      }
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
