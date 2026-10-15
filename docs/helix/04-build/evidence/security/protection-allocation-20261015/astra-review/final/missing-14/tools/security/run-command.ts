import {spawn} from "node:child_process";

export interface CommandResult {
  exitCode: number | null;
  timedOut: boolean;
  outputExceeded: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/** POSIX reviewed-runner boundary. Deliberately detached descendants are outside this boundary. */
export function runSecurityCommand(command: readonly string[], options: {
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
}): Promise<CommandResult> {
  if (process.platform === "win32") throw new Error("Security runner requires a qualified POSIX process-group profile");
  if (!command[0] || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 ||
      options.timeoutMs > 600_000) throw new Error("Invalid security runner command/deadline");
  const limit = options.maxOutputBytes ?? 1_048_576;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid output bound");
  return new Promise(resolve => {
    const child = spawn(command[0]!, command.slice(1), {
      detached: true, stdio: ["ignore", "pipe", "pipe"], env: options.env,
    });
    const output: Buffer[][] = [[], []];
    let bytes = 0, done = false;
    const result: CommandResult = {exitCode: null, timedOut: false, outputExceeded: false, stdout: "", stderr: ""};
    let cleanup: ReturnType<typeof setTimeout> | undefined;
    const killGroup = () => {
      if (child.pid !== undefined) {
        try {process.kill(-child.pid, "SIGKILL");} catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") result.error = "Process-group cleanup failed";
        }
      }
    };
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      if (cleanup !== undefined) clearTimeout(cleanup);
      child.stdout?.destroy(); child.stderr?.destroy();
      result.stdout = Buffer.concat(output[0]!).toString("utf8");
      result.stderr = Buffer.concat(output[1]!).toString("utf8");
      resolve(result);
    };
    const stop = () => {
      killGroup();
      // Inherited pipes cannot extend collection indefinitely, even on cleanup failure.
      if (cleanup === undefined) cleanup = setTimeout(finish, 250);
    };
    const deadline = setTimeout(() => {result.timedOut = true; stop();}, options.timeoutMs);
    for (const [index, stream] of [child.stdout, child.stderr].entries()) {
      stream?.on("data", (chunk: Buffer) => {
        const available = Math.max(0, limit - bytes);
        output[index]!.push(chunk.subarray(0, available));
        bytes += chunk.length;
        if (bytes > limit) {result.outputExceeded = true; stop();}
      });
      stream?.on("error", () => {result.error = "Runner output stream failed"; stop();});
    }
    child.on("error", () => {result.error = "Runner failed to spawn"; stop();});
    child.on("exit", code => {result.exitCode = code; stop();});
    child.on("close", finish);
  });
}
