// tests/helpers/supply-chain-dataset.ts
function supplyChainDataset(source, graph) {
  const elements = new Map(source.modules.flatMap((m) => m.elements.map((e) => [JSON.stringify([m.id, e.id]), e])));
  const objects = new Map(graph.objects.map((o) => [o.key, o]));
  const value = (ref, obj) => {
    const field = elements.get(JSON.stringify([ref.module, ref.element])), token = obj.values[ref.element];
    if (token === null)
      return null;
    if (typeof token !== "string")
      throw Error("Original candidate lexical text required");
    if (field.scalarType === "integer")
      return { integerToken: token };
    if (field.scalarType === "decimal")
      return { decimalToken: token };
    if (field.scalarType === "string")
      return { string: token };
    throw Error("Explicit supported original supply-chain family required");
  };
  return {
    scope: { id: "original-supply-chain-fixture", closure: "supplied-dataset-only" },
    context: { fixtureFormat: graph.format, fixtureVersion: graph.version, qualification: graph.qualification },
    records: graph.objects.map((obj) => {
      if (obj.type.document !== source.id)
        throw Error("Original source identity differs");
      const identity = { module: obj.type.module, element: obj.type.element };
      const record = elements.get(JSON.stringify([identity.module, identity.element]));
      return { instanceId: obj.key, identity, values: record.members.map((ref) => ({ field: ref, state: "present", value: value(ref, obj) })) };
    }),
    relationships: graph.edges.map((edge) => {
      if (edge.relationship.document !== source.id)
        throw Error("Original relationship source differs");
      const module = source.modules.find((m) => m.id === edge.relationship.module), relationship = module.relationships.find((r) => r.id === edge.relationship.id), target = objects.get(edge.target);
      const record = elements.get(JSON.stringify([target.type.module, target.type.element])), endpoint = relationship.target.find((r) => r.module === target.type.module && r.element === target.type.element), key = record.keys.find((k) => k.id === endpoint.key);
      return { instanceId: edge.key, identity: { module: module.id, id: relationship.id }, sourceInstanceId: edge.source, target: { identity: { module: target.type.module, element: target.type.element, key: key.id }, values: key.fields.map((ref) => value(ref, target)) } };
    })
  };
}
export {
  supplyChainDataset
};
