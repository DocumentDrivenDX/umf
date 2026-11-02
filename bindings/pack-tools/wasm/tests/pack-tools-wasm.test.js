import { beforeAll, describe, expect, test } from "bun:test";
import { encodeRequestWire, fromWire } from "../../../core/wasm/src/wire.js";
const packageDir=process.env.UMF_PACK_TOOLS_WASM_DIR;
let executeNativeFamilyWire,nativeFamilyDispatcherProfileVersion;
beforeAll(async()=>{
 if(!packageDir)return;
 const module=await import(new URL('umf_core_wasm.js',new URL('file://'+packageDir.replace(/\/$/,'')+'/')).href);
 await module.default({module_or_path:await Bun.file(packageDir+'/umf_core_wasm_bg.wasm').arrayBuffer()});
 ({executeNativeFamilyWire,nativeFamilyDispatcherProfileVersion}=module);
});

function packToolsEnvelope() {
  const pack = {
    id: "wasm-smoke",
    version: "1.0.0",
    schemas: [{ id: "items", reference: "items.json", format: "tablespec" }],
  };
  const source = {
    version: "1.0",
    table_name: "items",
    columns: [
      { name: "id", data_type: "INTEGER", nullable: false },
      { name: "label", data_type: "VARCHAR", nullable: false },
    ],
    primary_key: ["id"],
  };
  return {
    profile: "umf.pack-tools-wire/1",
    op: "pack-tools.generatePackTools",
    request: {
      profile: "umf.pack-tools/1",
      pack: { id: pack.id, version: pack.version, text: JSON.stringify(pack) },
      sources: [
        {
          id: "items",
          path: "items.json",
          format: "json",
          schemaFormat: "tablespec",
          text: JSON.stringify(source),
        },
      ],
      options: { schema: "public", package: "wasm_smoke" },
      targets: ["ddl", "orm", "crud"],
    },
  };
}

describe.skipIf(!packageDir)("focused Pack Tools WASM family", () => {
  test("exports the shared native-family profile and dispatches Pack Tools", () => {
    expect(nativeFamilyDispatcherProfileVersion()).toBe("umf.native-family-dispatch/1");
    const response = JSON.parse(
      executeNativeFamilyWire("pack-tools", encodeRequestWire(packToolsEnvelope())),
    );
    expect(response).toMatchObject({ profile: "umf.core-wire/1", status: "ok" });
    const result = fromWire(JSON.parse(response.wire));
    expect(result).toMatchObject({
      profile: "umf.pack-tools-result/1",
      status: "generated",
      pack: { id: "wasm-smoke", version: "1.0.0" },
    });
  });

  test("returns the standard structured refusal for other families", () => {
    let controlCalls = 0;
    const response = JSON.parse(
      executeNativeFamilyWire("graphql", "not-json", () => {
        controlCalls++;
        return "";
      }),
    );
    expect(response).toMatchObject({
      profile: "umf.core-wire/1",
      status: "error",
      code: "REQUEST",
    });
    expect(controlCalls).toBe(0);
  });

  test("forwards cooperative host cancellation into the Pack Tools wire result", () => {
    let controlCalls = 0;
    const cancelled = encodeRequestWire({
      ok: false,
      code: "CANCELLED",
      message: "Cancelled by WASM fixture",
    });
    const response = JSON.parse(
      executeNativeFamilyWire("pack-tools", encodeRequestWire(packToolsEnvelope()), () => {
        controlCalls++;
        return cancelled;
      }),
    );
    expect(controlCalls).toBeGreaterThan(0);
    expect(response).toMatchObject({
      profile: "umf.core-wire/1",
      status: "error",
      code: "CANCELLED",
    });
  });
});
