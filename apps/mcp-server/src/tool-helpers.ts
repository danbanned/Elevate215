import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { logUsage } from './usage-log.js';
import { canCallTool, permissionDeniedError } from './permissions.js';
import type { CallerIdentity } from './auth.js';

// AsyncLocalStorage would be cleaner, but every MCP request is processed
// synchronously inside the transport handler so a module-level slot works.
let currentCaller: CallerIdentity | null = null;

export function setCurrentCaller(caller: CallerIdentity | null): void {
  currentCaller = caller;
}

export async function runTool(
  toolName: string,
  input: unknown,
  handler: () => Promise<unknown>,
): Promise<CallToolResult> {
  const start = Date.now();
  const caller = currentCaller;
  let output: unknown;
  let errorMessage: string | undefined;

  // Per-tool ACL (Phase 23). Service callers (EventBridge etc.) bypass.
  if (caller && caller.kind === 'user' && !(await canCallTool(toolName, caller.roles))) {
    const denied = permissionDeniedError(toolName);
    errorMessage = denied.message;
    output = { error: denied };
    const durationMs = Date.now() - start;
    void logUsage({
      toolName,
      input,
      output,
      durationMs,
      error: errorMessage,
      callerEmail: caller.email,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      isError: true,
    };
  }

  try {
    output = await handler();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    output = {
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    };
  }
  const durationMs = Date.now() - start;
  void logUsage({
    toolName,
    input,
    output,
    durationMs,
    error: errorMessage,
    callerEmail: caller?.kind === 'user' ? caller.email : '_service',
  });
  const result: CallToolResult = {
    content: [{ type: 'text', text: JSON.stringify(output) }],
  };
  if (errorMessage) result.isError = true;
  return result;
}

export function parseStr(raw: Record<string, unknown>, key: string): string | undefined {
  return typeof raw[key] === 'string' ? (raw[key] as string) : undefined;
}

export function parseNum(raw: Record<string, unknown>, key: string): number | undefined {
  return typeof raw[key] === 'number' ? (raw[key] as number) : undefined;
}
