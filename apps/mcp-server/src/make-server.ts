import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerGetStudentInfo } from './tools/get-student-info.js';
import { registerQueryStudents } from './tools/query-students.js';
import { registerQueryOutcomes } from './tools/query-outcomes.js';
import { registerQueryEnrollment } from './tools/query-enrollment.js';
import { registerQueryCertifications } from './tools/query-certifications.js';
import { registerQueryCompetency } from './tools/query-competency.js';
import { registerQueryFinances } from './tools/query-finances.js';
import { registerQueryDonors } from './tools/query-donors.js';
import { registerQueryAttendance } from './tools/query-attendance.js';
import { registerSearchConversations } from './tools/search-conversations.js';
import { registerSearchByPerson } from './tools/search-by-person.js';
import { registerGetEntityBrief } from './tools/get-entity-brief.js';
import { registerGetFinanceBrief } from './tools/get-finance-brief.js';
import { registerSearchDocuments } from './tools/search-documents.js';

export function makeServer(): McpServer {
  const server = new McpServer({
    name: 'lp-internal-ai',
    version: '1.0.0',
  });

  registerGetStudentInfo(server);
  registerQueryStudents(server);
  registerQueryOutcomes(server);
  registerQueryEnrollment(server);
  registerQueryCertifications(server);
  registerQueryCompetency(server);
  registerQueryFinances(server);
  registerQueryDonors(server);
  registerQueryAttendance(server);
  registerSearchConversations(server);
  registerSearchByPerson(server);
  registerGetEntityBrief(server);
  registerGetFinanceBrief(server);
  registerSearchDocuments(server);

  return server;
}
