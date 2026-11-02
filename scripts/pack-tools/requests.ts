// SPDX-License-Identifier: MIT OR Apache-2.0
// Build exact requests through the production microsite model helper.
import { packEntries, packToolsRequest, slug } from "../../docs/helix/05-deploy/microsite/pack-tools-model";

const catalogPath = process.argv[2];
if (!catalogPath) throw new Error("usage: bun requests.ts SCHEMA_CATALOG.json");
const catalog = await Bun.file(catalogPath).json();
const entries = catalog.entries;
if (!Array.isArray(entries)) throw new Error("Catalog has no entries array");
const packs = packEntries(entries);
if (packs.length !== 28) throw new Error(`Expected 28 catalog packs; found ${packs.length}`);
for (const pack of packs) {
  const request = packToolsRequest(pack, entries, {
    schema: "public",
    package: slug(String(pack.pack)),
    targets: ["ddl", "orm", "crud"],
  });
  process.stdout.write(JSON.stringify(request) + "\n");
}
