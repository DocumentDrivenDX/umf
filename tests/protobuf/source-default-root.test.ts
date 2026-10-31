// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {importProtobufSources, exportProtobufSources, readDescriptorSet, writeDescriptorSet, proposeProtobufDescriptorEdit} from '../../src/index-node-v4';
import type {DescriptorNode} from '../../src/adapters/protobuf/descriptor';

async function runNative(input: Record<string, unknown>) {
  const process = Bun.spawn(['go', 'run', '.'], {
    cwd: 'native/protobuf',
    stdin: new Blob([JSON.stringify(input)]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]);
  if (await process.exited) throw new Error(stderr);
  const result = JSON.parse(stdout) as {compiler: string; printer?: string; descriptorHex?: string; files?: Record<string, string>; error?: string};
  if (result.error) throw new Error(result.error);
  return result;
}

test('Protobuf default root compiles and emits the edited descriptor while retaining the source archive', async () => {
  const source = 'syntax = "proto2"; message Greeting { optional string text = 1 [default = "before"]; }';
  const document = await importProtobufSources(
    {files: {'greeting.proto': source}, roots: ['greeting.proto']},
    {async compile(request) {
      const result = await runNative(request);
      return {compiler: result.compiler, descriptorSet: Uint8Array.from(Buffer.from(result.descriptorHex!, 'hex'))};
    }},
    {id: 'greeting'},
  );
  const archived = (document.modules[0]!.elements[0]!.extensions['umf.protobuf'] as {sourceArchive: {files: Record<string, string>}}).sourceArchive;
  expect(archived.files['greeting.proto']).toBe(source);

  const edited = proposeProtobufDescriptorEdit(document, (set) => {
    const file = (set.fields.file as unknown as DescriptorNode[]).find((entry) => entry.fields.name === 'greeting.proto')!;
    const message = (file.fields.message_type as unknown as DescriptorNode[])[0]!;
    const field = (message.fields.field as unknown as DescriptorNode[])[0]!;
    field.fields.default_value = 'after';
  }).document;
  const result = await exportProtobufSources(edited, {async emit(descriptorSet) {
    const current = readDescriptorSet(descriptorSet);
    const file = (current.fields.file as unknown as DescriptorNode[]).find((entry) => entry.fields.name === 'greeting.proto')!;
    const message = (file.fields.message_type as unknown as DescriptorNode[])[0]!;
    expect((message.fields.field as unknown as DescriptorNode[])[0]!.fields.default_value).toBe('after');
    const emitted = await runNative({operation: 'emit', descriptorHex: Buffer.from(writeDescriptorSet(current)).toString('hex')});
    return {files: emitted.files!, compiler: emitted.compiler, printer: emitted.printer!};
  }});
  expect(result.files['greeting.proto']).toContain('default = "after"');
  expect(result.source).toEqual(edited);
  expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'PROTOBUF_SOURCE_LAYOUT')).toBe(true);

  await expect(exportProtobufSources(edited, {async emit() {
    return {files: {'greeting.proto': source}, compiler: 'protocompile 0.14.1'} as never;
  }})).rejects.toMatchObject({code: 'PROTOBUF_EMIT'});
}, {timeout: 60_000});
