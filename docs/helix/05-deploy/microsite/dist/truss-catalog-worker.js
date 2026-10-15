// docs/helix/05-deploy/microsite/truss-catalog-worker.ts
var scope = globalThis;
var current;
var pending = Promise.resolve();
scope.onmessage = (event) => {
  const id = event.data?.id, command = event.data?.command;
  pending = pending.then(async () => {
    try {
      if (!Number.isSafeInteger(id) || !["open", "register", "close"].includes(command))
        throw Error("Unknown catalog request");
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
          const result = await current.store.registerDocument(current.owner, { documentId: request.modelPin.documentId, documentRevision: request.modelPin.revision, sourceUtf8: request.model.utf8 });
          scope.postMessage({ id, result });
        } else {
          await current.store.close(current.owner);
          current = undefined;
          scope.postMessage({ id, result: { outcome: "closed" } });
        }
      }
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
