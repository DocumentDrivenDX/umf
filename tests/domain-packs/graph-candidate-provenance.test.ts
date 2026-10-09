import {expect, test} from 'bun:test';

test('retained graph candidates preserve original provenance and explicit inventory coverage', async () => {
  const child = Bun.spawn(['python3', '-B', 'scripts/domain-packs/test-graph-candidate-provenance.py', '-v'], {
    stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
}, 30000);
