import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAwsTools } from './tools/aws-resources.js';

export function makeServer(): McpServer {
  const server = new McpServer({
    name: 'lp-aws-mcp',
    version: '1.0.0',
  });

  registerAwsTools(server);

  return server;
}
