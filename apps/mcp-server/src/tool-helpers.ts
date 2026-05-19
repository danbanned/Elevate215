import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { logUsage } from './usage-log.js';

export async function runTool(
  toolName: string,
  input: unknown,
  handler: () => Promise<unknown>,
): Promise<CallToolResult> {
  const start = Date.now();
  let output: unknown;
  let errorMessage: string | undefined;
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
  });
  const result: CallToolResult = {
    content: [{ type: 'text', text: JSON.stringify(output) }],
  };
  if (errorMessage) result.isError = true;
  return result;
}
