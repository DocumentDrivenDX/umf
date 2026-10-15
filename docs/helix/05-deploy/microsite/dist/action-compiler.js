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
