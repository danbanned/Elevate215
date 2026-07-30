import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerQueryFinances } from './tools/query-finances.js';
import { registerGetFinanceBrief } from './tools/get-finance-brief.js';
import { registerSearchDocuments } from './tools/search-documents.js';

import { registerSkillFinanceAudit } from './tools/skill-finance-audit.js';

import { registerFinanceAuditPrompt } from './prompts/finance-audit.js';

export function makeServer(): McpServer {
  const server = new McpServer({
    name: 'lp-internal-ai',
    version: '1.0.0',
  });

  // Data tools
  registerQueryFinances(server);
  registerGetFinanceBrief(server);
  registerSearchDocuments(server);

  // Skill tools (return structured instructions for Claude to follow)
  registerSkillFinanceAudit(server);

  // Prompts (same skills, for clients that support MCP prompts)
  registerFinanceAuditPrompt(server);

  return server;
}
