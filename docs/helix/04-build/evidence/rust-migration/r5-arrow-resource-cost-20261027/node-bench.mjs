const entry = process.env.UMF_ARROW_NODE_ENTRY;
if (!entry) throw new Error("UMF_ARROW_NODE_ENTRY must point to the pinned private Node package index.js");
const {createArrowSchemaEngine} = await import(new URL(entry.startsWith("file:") ? entry : `file://${entry}`));
const arrow = createArrowSchemaEngine();
const source = '{"fields":[{"name":"x","nullable":true,"type":{"name":"utf8"}}]}';
const document = arrow.importSchema(source, "node-bench-setup");
const operations = [
  ["import", () => arrow.importSchema(source, "node-bench")],
  ["export", () => arrow.exportSchema(document)],
  ["inspect", () => arrow.inspect(document)],
  ["getNode", () => arrow.getNode(document, "/fields/0/name")],
  ["proposeNodeEdit", () => arrow.proposeNodeEdit(document, "/fields/0/name", '"y"')],
];
console.log(JSON.stringify({runtime: process.version, addonArtifact: process.env.UMF_ARROW_ADDON_SHA256, sourcePins: process.env.UMF_ARROW_SOURCE_PINS}, null, 2));
for (const [name, operation] of operations) {
  const samplesMs = [];
  for (let i = 0; i < 2; i++) {
    const start = process.hrtime.bigint();
    operation();
    samplesMs.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  console.log(JSON.stringify({operation: name, samplesMs, meanMs: samplesMs.reduce((a,b)=>a+b,0)/samplesMs.length}));
}
