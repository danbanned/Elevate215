import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

const NAME = 'finance_audit_readiness';

const DESCRIPTION =
  'Generate multi-view financial reports and audit-ready documentation. ' +
  'Produces the same dollars reported multiple ways (by fund, by function), ' +
  'reconciliation checks, restricted fund tracking, and board-ready financial summaries. ' +
  'Supports monthly close, audit prep, board financials, fund reconciliation, and ad-hoc queries.';

export const financeAuditArgsSchema = {
  report_type: z
    .enum([
      'monthly_close',
      'audit_prep',
      'board_financials',
      'fund_reconciliation',
      'custom_query',
    ])
    .describe(
      'Type of financial report. ' +
      '"monthly_close" — month-end summary with fund balances, income/expense, variances. ' +
      '"audit_prep" — comprehensive audit package: trial balance, restricted funds, transaction support. ' +
      '"board_financials" — board-ready financial summary with narrative. ' +
      '"fund_reconciliation" — reconcile fund balances across sources. ' +
      '"custom_query" — answer a specific financial question.',
    ),
  period: z
    .string()
    .optional()
    .describe(
      'Reporting period. Examples: "June 2026", "Q3 2026", "FY2025", "YTD", ' +
      '"last 12 months", "January 2026 - March 2026". Defaults to YTD.',
    ),
  fund_name: z
    .string()
    .optional()
    .describe('For fund_reconciliation: specific fund/restriction to reconcile (e.g., "WIOA", "Comcast Grant", "General Operating").'),
  custom_question: z
    .string()
    .optional()
    .describe('For custom_query: the specific financial question to answer (e.g., "What is our cost per student by phase?", "How much restricted funding expires this quarter?").'),
  comparison_period: z
    .string()
    .optional()
    .describe('Optional comparison period for variance analysis (e.g., "same month last year", "prior quarter", "budget").'),
  additional_context: z
    .string()
    .optional()
    .describe('Extra context: specific line items to focus on, auditor questions to address, board concerns, etc.'),
};

interface PromptArgs {
  report_type: string;
  period?: string | undefined;
  fund_name?: string | undefined;
  custom_question?: string | undefined;
  comparison_period?: string | undefined;
  additional_context?: string | undefined;
}

export function buildFinanceAuditMessages(args: PromptArgs): GetPromptResult {
  const period = args.period ?? 'YTD';
  const comparison = args.comparison_period ?? '';
  const extraClause = args.additional_context
    ? `\n\nAdditional context from the user:\n${args.additional_context}`
    : '';

  const systemMessage = `You are a nonprofit financial analyst. You produce accurate, audit-ready financial reports from live organizational data. You understand nonprofit accounting: fund accounting, restricted vs. unrestricted funds, functional expense allocation (program/management/fundraising), GAAP for nonprofits, and the specific pain of reporting the same dollars three different ways.

You have access to the organization's live financial data through MCP tools. You MUST call these tools to get real numbers. Do not fabricate any financial figures.

## CRITICAL SAFETY RULES

1. **NEVER FABRICATE FINANCIAL DATA.** Every number must come from an MCP tool result. If data is unavailable, state it clearly with \`[DATA UNAVAILABLE: ...]\`. Fabricated financial data can trigger audit findings, funder clawbacks, and loss of nonprofit status.

2. **FLAG DISCREPANCIES, DON'T HIDE THEM.** If numbers from different sources don't match, report both figures and flag the variance: \`[RECONCILIATION NEEDED: source A shows $X, source B shows $Y, variance $Z]\`. The user needs to investigate — do not pick one and suppress the other.

3. **NEVER TRANSMIT FINANCIAL DATA EXTERNALLY.** You produce reports for internal review. Do not send emails, upload to portals, or share with any external party. The user handles all external distribution.

4. **THIS IS A DRAFT.** All financial reports must be reviewed by the finance team before distribution. End every report with a review prompt.`;

  // Build the report-specific instructions
  let reportInstructions: string;

  switch (args.report_type) {
    case 'monthly_close':
      reportInstructions = buildMonthlyClose(period, comparison);
      break;
    case 'audit_prep':
      reportInstructions = buildAuditPrep(period);
      break;
    case 'board_financials':
      reportInstructions = buildBoardFinancials(period, comparison);
      break;
    case 'fund_reconciliation':
      reportInstructions = buildFundReconciliation(period, args.fund_name);
      break;
    case 'custom_query':
      reportInstructions = buildCustomQuery(args.custom_question);
      break;
    default:
      reportInstructions = buildMonthlyClose(period, comparison);
  }

  const userMessage = `# Task: FINANCIAL REPORT — ${args.report_type.toUpperCase().replace(/_/g, ' ')}

**Period:** ${period}
${comparison ? `**Comparison:** ${comparison}` : ''}
${args.fund_name ? `**Fund:** ${args.fund_name}` : ''}
${args.custom_question ? `**Question:** ${args.custom_question}` : ''}
${extraClause}

---

## Step 1: Gather Financial Data

Call these MCP tools to collect the raw financial data. Make parallel calls where possible.

### Core financial data (always pull):

- \`get_finance_brief\` — fund balances, chart-of-accounts summary, recent transactions
- \`query_finances\` with query_type "aplos_funds" — fund balances
- \`query_finances\` with query_type "aplos_accounts" — chart of accounts
- \`query_finances\` with query_type "aplos_transactions" — transaction detail

### Prior period data (if comparison requested):

${comparison ? `- Repeat the core pulls above with a \`period\` filter matching "${comparison}" for variance analysis` : '- No comparison period specified — skip prior period pulls unless needed for context'}

---

${reportInstructions}

---

## Output Format: CSV

**All tabular data MUST be output as CSV.** The user needs data they can open in Excel or Google Sheets — not markdown tables in a chat window.

### How to structure the output:

1. **Start with a brief narrative summary** (2-3 sentences) explaining what the report covers and flagging anything notable.

2. **Output each table as a separate, clearly labeled CSV block.** Use this format:

\`\`\`
--- FILENAME: income_statement_${period.replace(/\\s+/g, '_').toLowerCase()}.csv ---
\`\`\`
\`\`\`csv
Category,${period},Budget,Variance,Variance %
"Grants & Contributions",142000.00,150000.00,-8000.00,-5.3%
"Government Contracts",85000.00,80000.00,5000.00,6.3%
...
\`\`\`

3. **Use proper CSV conventions:**
   - First row is always headers
   - Wrap text fields containing commas in double quotes
   - Numbers as raw values (no $ signs, no commas in numbers) — formatting happens in the spreadsheet
   - Percentages as decimal values with % suffix (e.g., 5.3%)
   - Empty cells for unavailable data with a \`[DATA UNAVAILABLE]\` note row at the bottom
   - Dates in YYYY-MM-DD format

4. **Produce one CSV block per logical table.** Typical outputs by report type:
   - **monthly_close:** income_statement.csv, fund_balances.csv, key_metrics.csv
   - **audit_prep:** revenue_by_fund.csv, functional_expenses.csv, restricted_funds.csv, large_transactions.csv, reconciliation_flags.csv
   - **board_financials:** financial_snapshot.csv
   - **fund_reconciliation:** balance_comparison.csv, restricted_fund_status.csv, recommended_journal_entries.csv
   - **custom_query:** query_results.csv

5. **After the CSV blocks, include:**
   - A \`flags.csv\` with all \`[RECONCILIATION NEEDED]\` and \`[DATA UNAVAILABLE]\` items: columns Flag Type, Description, Source A, Source B, Variance, Recommended Action
   - A notes section (plain text, not CSV) with any narrative context, caveats, or action items

### Data integrity rules:

- **Every number must trace to a tool call.** If you output 142000.00, you must have gotten that from a specific query_finances call.
- **Flag ALL discrepancies.** Include in flags.csv: \`RECONCILIATION NEEDED,"source A shows $X source B shows $Y",X,Y,variance,action\`
- **Flag ALL missing data.** Include in flags.csv: \`DATA UNAVAILABLE,"description of what's missing","tool checked","","",""\`
- **Clearly label data sources.** Add a "Source" column to each CSV where practical, or a source_notes.csv mapping each table to the tool calls that produced it.

**"This is a draft financial report for internal review. All figures should be verified by the finance team before distribution to the board, funders, or auditors."**`;

  return {
    messages: [
      { role: 'assistant', content: { type: 'text', text: systemMessage } },
      { role: 'user', content: { type: 'text', text: userMessage } },
    ],
  };
}

// ── Report type builders ──────────────────────────────────────────

function buildMonthlyClose(period: string, comparison: string): string {
  return `## Step 2: Produce Monthly Close Report

### Report Structure:

**1. Executive Summary**
One paragraph: total revenue, total expenses, net surplus/deficit for ${period}. Flag anything unusual.

**2. Income Statement (Statement of Activities)** → \`income_statement.csv\`

Columns: Section, Category, ${period}, ${comparison || 'Budget'}, Variance, Variance %
Rows: Revenue line items (Grants & Contributions, Government Contracts, Earned Revenue, In-Kind, Other Income, TOTAL REVENUE), then Expense line items (Program Services, Management & General, Fundraising, TOTAL EXPENSES), then NET SURPLUS/(DEFICIT).

**3. Fund Balances** → \`fund_balances.csv\`

Columns: Fund Name, Restriction Type, Opening Balance, Inflows, Outflows, Closing Balance, Spend-Down Deadline, Status
Flag restricted funds approaching their spend-down deadline with Status = "AT RISK".

**4. Cash Position** → include as rows in \`key_metrics.csv\`

**5. Key Metrics** → \`key_metrics.csv\`

Columns: Metric, Value, Benchmark, Status
Rows: Program Expense Ratio (target >80%), Cash On Hand, Months of Runway, Accounts Receivable.

**6. Action Items** → include in \`flags.csv\`

Flag items requiring attention: overdue receivables, funds running low, budget variances >10%.`;
}

function buildAuditPrep(period: string): string {
  return `## Step 2: Produce Audit Preparation Package

This package helps the finance team prepare for the annual audit. Organize everything the auditors will ask for.

### Report Structure:

**1. Financial Summary**
High-level income statement and balance sheet data for ${period}.

**2. Revenue by Source — Two Views**

Auditors need revenue classified multiple ways. Produce each:

**View A: By Fund (restriction)** → \`revenue_by_fund.csv\`

Columns: Fund, Revenue, Expenses, Net, Restriction Type, Restriction Status, Expiration Date

**View B: By Function (GAAP functional expense allocation)** → \`functional_expenses.csv\`

Columns: Expense Category, Program, Management & General, Fundraising, Total
Rows: Salaries & Benefits, Professional Services, Occupancy, Technology, Stipends, Travel, Other, TOTAL

**3. Restricted Fund Tracking** → \`restricted_funds.csv\`

Columns: Fund Name, Original Award, Award Date, Cumulative Spend, Remaining Balance, Restriction Terms, Expiration Date, Status
Status values: On Track, At Risk, Expired

**4. Grant Compliance Checklist**
For each active grant:
- [ ] Award letter on file
- [ ] Budget approved by funder
- [ ] Spending within approved budget categories
- [ ] Reporting deadlines met (list dates)
- [ ] Match/leverage requirements met (if applicable)
- [ ] \`[DATA UNAVAILABLE]\` for any items that can't be verified from the data

**5. Transaction Volume Summary** → \`large_transactions.csv\`

Columns: Rank, Date, Amount, Vendor/Source, Fund, Description
Include the 10 largest transactions. Add a summary row at the top for total transaction count and total stipend disbursements.

**6. Reconciliation Flags** → \`reconciliation_flags.csv\`

Columns: Source A, Source B, Field, Source A Value, Source B Value, Variance, Likely Cause, Recommended Action

**7. Missing Documentation Checklist**
List anything the auditors will ask for that isn't in the data:
- [ ] Board meeting minutes approving budget
- [ ] Conflict of interest statements
- [ ] [Other items flagged as DATA UNAVAILABLE]`;
}

function buildBoardFinancials(period: string, comparison: string): string {
  return `## Step 2: Produce Board-Ready Financial Summary

Board members need a clear, concise financial picture — not an accounting dump. Translate the numbers into a narrative they can act on.

### Report Structure:

**1. Financial Health Dashboard** → \`financial_snapshot.csv\`

Columns: Metric, Current Value, ${comparison || 'Budget'}, Trend
Rows: Revenue, Expenses, Net, Cash On Hand, Months of Runway, Program Expense Ratio (target >80%).
Trend column: Up / Down / Flat.

**2. Revenue Story** (2-3 paragraphs)
Where money came from. Trends. Written in plain language, not accounting jargon.

**3. Expense Story** (2-3 paragraphs)
Where money went. Any significant variances from budget and why. Staffing costs if significant.

**4. Items Requiring Board Attention**
Bullet list of anything that needs a board decision or awareness:
- Budget variances >15%
- Restricted funds at risk
- Cash flow concerns

**5. Trend Charts** (describe for the user to create)
Suggest 2-3 visualizations:
- Monthly revenue vs. expenses (12-month trend)
- Fund balance trajectory`;
}

function buildFundReconciliation(period: string, fundName: string | undefined): string {
  const fund = fundName ?? 'all funds';
  return `## Step 2: Reconcile Fund Balances

Reconcile **${fund}** across all data sources for ${period}.

### Additional Data Gathering

Pull every financial data source available:
- \`query_finances\` with query_type "aplos_funds" — current balances
- \`query_finances\` with query_type "aplos_transactions" — activity for the period
- \`get_finance_brief\` — summary view

### Reconciliation Report:

**1. Balance Comparison** → \`balance_comparison.csv\`

Columns: Line Item, Aplos, Other Source, Variance
Rows: Opening Balance, + Revenue/Inflows, - Expenses/Outflows, = Closing Balance

**2. Variance Analysis**
For each discrepancy:
- What: which line items don't match
- How much: dollar amount of the variance
- Likely cause: timing difference, categorization difference, missing entry, data sync lag
- Recommended action: which source to trust, what to investigate

**3. Restricted Fund Status**
${fundName ? `For ${fundName}:` : 'For each restricted fund:'}
- Original restriction amount and terms
- Cumulative recognized revenue
- Cumulative qualified expenses
- Remaining obligation
- Deadline for spend-down
- Risk level: Green (on track) / Yellow (needs attention) / Red (at risk of return)

**4. Recommended Journal Entries** → \`recommended_journal_entries.csv\`

Columns: Date, Account, Debit, Credit, Memo

**5. Open Items**
List everything that needs human follow-up to resolve.`;
}

function buildCustomQuery(question: string | undefined): string {
  const q = question ?? '[No question provided — ask the user what they need]';
  return `## Step 2: Answer the Financial Question

**Question:** ${q}

### Approach:

1. **Parse the question** — Identify what data points are needed to answer it.
2. **Gather additional data** — Make targeted MCP tool calls beyond the core pulls if the question requires specific data not already gathered.
3. **Compute the answer** — Show your work. If the answer involves calculations, show each input and the formula.
4. **Present clearly** — Use a table or structured format. Include context (benchmarks, trends, comparisons) that makes the answer actionable.
5. **Flag limitations** — Note any caveats: data freshness, missing inputs, assumptions made.

### Output Format:

**Answer:** [Direct answer to the question with the specific number or finding]

**Supporting Data:**
[Table or breakdown showing how you arrived at the answer]

**Context:**
[What this means — is it good/bad? How does it compare to benchmarks or prior periods?]

**Caveats:**
[Any DATA UNAVAILABLE flags, assumptions, or limitations]`;
}

export function registerFinanceAuditPrompt(server: McpServer): void {
  server.registerPrompt(NAME, { description: DESCRIPTION, argsSchema: financeAuditArgsSchema }, (args) => {
    return buildFinanceAuditMessages(args);
  });
}
