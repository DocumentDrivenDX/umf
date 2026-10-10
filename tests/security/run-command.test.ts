import {expect, test} from "bun:test";
import {runSecurityCommand} from "../../tools/security/run-command";

const run = (script: string, timeoutMs = 2_000, maxOutputBytes = 10_000) =>
  runSecurityCommand([process.execPath, "-e", script], {timeoutMs, maxOutputBytes, env: process.env});

test("collects successful bounded stdout and stderr", async () => {
  const result = await run('console.log("ok"); console.error("diagnostic")');
  expect(result).toEqual({exitCode: 0, timedOut: false, outputExceeded: false,
    stdout: "ok\n", stderr: "diagnostic\n"});
});

test("deadline terminates the runner and inherited-pipe descendant", async () => {
  const start = Date.now();
  const result = await run('const {spawn}=require("node:child_process"); const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); console.log(c.pid); setInterval(()=>{},1000)', 200);
  expect(result.timedOut).toBe(true);
  expect(Date.now() - start).toBeLessThan(1_500);
  const pid = Number(result.stdout.trim());
  expect(pid).toBeGreaterThan(1);
  await Bun.sleep(50);
  expect(() => process.kill(pid, 0)).toThrow();
});

test("parent completion cleans up descendants retaining output pipes", async () => {
  const result = await run('const {spawn}=require("node:child_process"); const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); console.log(c.pid); c.unref()');
  expect(result.exitCode).toBe(0);
  expect(result.timedOut).toBe(false);
  await Bun.sleep(50);
  expect(() => process.kill(Number(result.stdout.trim()), 0)).toThrow();
});

test("combined output cap fails closed and terminates", async () => {
  const result = await run('process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)', 2_000, 100);
  expect(result.outputExceeded).toBe(true);
  expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(100);
});

test("spawn failure returns a bounded failure", async () => {
  const result = await runSecurityCommand(["/nonexistent/umf-security-test"], {timeoutMs: 200, env: process.env});
  expect(result.error).toBeDefined();
  expect(result.exitCode).not.toBe(0);
});
