import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

const NAME = 'finance_audit_readiness';

const DESCRIPTION =
  'Generate multi-view financial reports and audit-ready documentation. ' +
  'Produces the same dollars reported three ways (by fund, by funder, by function), ' +
  'reconciliation checks, restricted fund tracking, and board-ready financial summaries. ' +
  'Supports monthly close, audit prep, funder-specific financial reports, and ad-hoc queries.';

export const financeAuditArgsSchema = {
  report_type: z
    .enum([
      'monthly_close',
      'audit_prep',
      'funder_report',
      'board_financials',
      'fund_reconciliation',
      'custom_query',
    ])
    .describe(
      'Type of financial report. ' +
      '"monthly_close" — month-end summary with fund balances, income/expense, variances. ' +
      '"audit_prep" — comprehensive audit package: trial balance, restricted funds, transaction support. ' +
      '"funder_report" — how a specific funder\'s dollars were spent. ' +
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
  funder_name: z
    .string()
    .optional()
    .describe('For funder_report: which funder to report on. Will pull their giving history and map spend against it.'),
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
  funder_name?: string | undefined;
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
    case 'funder_report':
      reportInstructions = buildFunderReport(period, args.funder_name);
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
${args.funder_name ? `**Funder:** ${args.funder_name}` : ''}
${args.fund_name ? `**Fund:** ${args.fund_name}` : ''}
${args.custom_question ? `**Question:** ${args.custom_question}` : ''}
${extraClause}

---

## Step 1: Gather Financial Data

Call these MCP tools to collect the raw financial data. Make parallel calls where possible.

### Core financial data (always pull):

- \`get_finance_brief\` — fund balances, recent gifts, revenue snapshot
- \`query_finances\` with query_type "ytd" — year-to-date income and expenses
- \`query_finances\` with query_type "fund_balances" — current fund balances by fund
- \`query_finances\` with query_type "budget_actuals" — budget vs. actual performance
- \`query_finances\` with query_type "monthly" — monthly breakdown for trend analysis

### Revenue & giving data:

- \`query_donors\` with query_type "summary" — total donor count, lifetime giving
- \`query_finances\` with query_type "dev_giving_history" — giving history from Development CRM
- \`query_finances\` with query_type "dev_grants_tracker" — active grants and their status
${args.funder_name ? `- \`query_donors\` with query_type "profile" and donor_name "${args.funder_name}" — this funder's specific giving history and pipeline` : ''}

### Program cost data:

- \`query_finances\` with query_type "phase_budget_summary" — budget by program phase
- \`query_finances\` with query_type "phase_actuals_2025" — actual spending by phase (2025)
- \`query_finances\` with query_type "q3_2026_actuals" — Q3 2026 actuals if applicable
- \`query_enrollment\` with query_type "total" — total students (for cost-per-student)
- \`query_enrollment\` with query_type "by_phase" — enrollment by phase (for per-phase cost-per-student)

### Stipend & direct cost data:

- \`query_finances\` with query_type "rapid_stipends" — Rapid stipend disbursements
- \`query_finances\` with query_type "pex_stipends" — PEX card stipend disbursements

### Prior period data (if comparison requested):

${comparison ? `- \`query_finances\` with query_type "prior_month" — prior month data for comparison
- Make additional calls with date filters matching "${comparison}" for variance analysis` : '- No comparison period specified — skip prior period pulls unless needed for context'}

---

${reportInstructions}

---

## Final Output Rules

- **Every number must trace to a tool call.** If you cite "$142,000 in program expenses," you must have gotten that from a specific query_finances call.
- **Flag ALL discrepancies.** Use \`[RECONCILIATION NEEDED: ...]\` for any mismatches between data sources.
- **Flag ALL missing data.** Use \`[DATA UNAVAILABLE: ...]\` when a tool returns no data for a required field.
- **Use consistent formatting.** Dollar amounts with commas and two decimals ($12,345.67). Percentages with one decimal (87.3%). Dates in Month YYYY format.
- **Clearly label data sources.** Each section should note which tool/query produced the numbers.

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

**2. Income Statement (Statement of Activities)**
\`\`\`
                          ${period}      ${comparison || 'Budget'}     Variance    Var %
REVENUE
  Grants & Contributions   $___          $___          $___        ___%
  Government Contracts     $___          $___          $___        ___%
  Earned Revenue           $___          $___          $___        ___%
  In-Kind                  $___          $___          $___        ___%
  Other Income             $___          $___          $___        ___%
TOTAL REVENUE              $___          $___          $___        ___%

EXPENSES
  Program Services         $___          $___          $___        ___%
  Management & General     $___          $___          $___        ___%
  Fundraising              $___          $___          $___        ___%
TOTAL EXPENSES             $___          $___          $___        ___%

NET SURPLUS/(DEFICIT)      $___          $___          $___        ___%
\`\`\`

**3. Fund Balances**
For each fund, show: opening balance, inflows, outflows, closing balance.
Flag restricted funds approaching their spend-down deadline.

**4. Budget vs. Actual by Program Phase**
Use phase budget data to show each program's burn rate:
- Foundations: budget $X, spent $Y, remaining $Z (XX% through budget, XX% through year)
- 101: ...
- Lightspeed: ...
- LiftOff: ...

Flag any phase that is significantly over or under budget.

**5. Cash Position**
Current cash, accounts receivable (expected grants), upcoming obligations.

**6. Key Metrics**
- Cost per student (total expenses / total enrolled)
- Cost per student by phase
- Revenue per student
- Program expense ratio (program expenses / total expenses) — nonprofits target >80%

**7. Action Items**
Flag items requiring attention: overdue receivables, funds running low, budget variances >10%.`;
}

function buildAuditPrep(period: string): string {
  return `## Step 2: Produce Audit Preparation Package

This package helps the finance team prepare for the annual audit. Organize everything the auditors will ask for.

### Report Structure:

**1. Financial Summary**
High-level income statement and balance sheet data for ${period}.

**2. Revenue by Source — Three Views**

Auditors need revenue classified three ways. Produce each:

**View A: By Fund (restriction)**
\`\`\`
Fund                    | Revenue    | Expenses   | Net        | Restriction Status
Unrestricted/General    | $___       | $___       | $___       | None
[Grant Fund 1]          | $___       | $___       | $___       | Temporarily restricted — expires [date]
[Grant Fund 2]          | $___       | $___       | $___       | Temporarily restricted — expires [date]
...
TOTAL                   | $___       | $___       | $___       |
\`\`\`

**View B: By Funder**
\`\`\`
Funder                  | Awarded    | Received   | Spent      | Remaining  | Report Due
[Funder 1]              | $___       | $___       | $___       | $___       | [date]
[Funder 2]              | $___       | $___       | $___       | $___       | [date]
Individual Donors       | $___       | $___       | N/A        | N/A        | N/A
...
TOTAL                   | $___       | $___       | $___       | $___       |
\`\`\`

**View C: By Function (GAAP functional expense allocation)**
\`\`\`
Expense Category        | Program    | Mgmt & General | Fundraising | Total
Salaries & Benefits     | $___       | $___           | $___        | $___
Professional Services   | $___       | $___           | $___        | $___
Occupancy               | $___       | $___           | $___        | $___
Technology              | $___       | $___           | $___        | $___
Stipends                | $___       | $___           | $___        | $___
Travel                  | $___       | $___           | $___        | $___
Other                   | $___       | $___           | $___        | $___
TOTAL                   | $___       | $___           | $___        | $___
\`\`\`

**3. Restricted Fund Tracking**
For each restricted fund:
- Original award amount and date
- Cumulative spend to date
- Remaining balance
- Restriction terms (what it can be spent on)
- Expiration date
- Status: on track / at risk / expired

**4. Grant Compliance Checklist**
For each active grant:
- [ ] Award letter on file
- [ ] Budget approved by funder
- [ ] Spending within approved budget categories
- [ ] Reporting deadlines met (list dates)
- [ ] Match/leverage requirements met (if applicable)
- [ ] \`[DATA UNAVAILABLE]\` for any items that can't be verified from the data

**5. Transaction Volume Summary**
- Total transactions for the period
- Largest 10 transactions (amount, date, vendor/source, fund)
- Stipend disbursement summary (Rapid + PEX totals)

**6. Reconciliation Flags**
List every discrepancy found between data sources:
\`\`\`
Source A              | Source B              | Field           | Source A Value | Source B Value | Variance
[Aplos]              | [Finance Sheet]       | [field]         | $___           | $___           | $___
\`\`\`

**7. Missing Documentation Checklist**
List anything the auditors will ask for that isn't in the data:
- [ ] Board meeting minutes approving budget
- [ ] Conflict of interest statements
- [ ] [Other items flagged as DATA UNAVAILABLE]`;
}

function buildFunderReport(period: string, funderName: string | undefined): string {
  const funder = funderName ?? '[FUNDER NAME NEEDED — specify funder_name]';
  return `## Step 2: Produce Funder Financial Report

Generate a financial report showing how **${funder}**'s dollars were spent during ${period}.

### Additional Data Gathering

If you haven't already:
- \`query_donors\` with query_type "profile" and donor_name "${funder}" — full giving history, pipeline
- \`search_documents\` with query: "${funder}" — find the original grant agreement, budget, or reporting template
- \`query_finances\` with query_type "dev_grants_tracker" — this funder's grant status

### Report Structure:

**1. Grant Summary**
\`\`\`
Funder:          ${funder}
Grant Period:    [from data or DATA UNAVAILABLE]
Award Amount:    $___
Amount Received: $___
Amount Spent:    $___
Remaining:       $___
\`\`\`

**2. Budget vs. Actual**
Map spending against the original grant budget categories:
\`\`\`
Budget Category         | Budgeted   | Actual     | Variance   | Var %    | Notes
[Category 1]            | $___       | $___       | $___       | ___%     |
[Category 2]            | $___       | $___       | $___       | ___%     |
...
TOTAL                   | $___       | $___       | $___       | ___%     |
\`\`\`

If the original budget categories are not in the data, use standard categories and flag: \`[BUDGET CATEGORIES: original grant budget not found in data — using standard categories. Verify against award letter.]\`

**3. Program Outcomes Delivered**
Pull outcomes data to show what this funding achieved:
- \`query_enrollment\` — students served during the grant period
- \`query_certifications\` with date filters — certifications earned
- \`query_employment\` with date filters — employment outcomes
- \`query_attendance\` — engagement metrics

Present as: "With ${funder}'s support, [X] students [achieved Y]..."

**4. Cost-Per-Outcome Metrics**
- Cost per student served: grant amount / students served
- Cost per certification: grant amount / certifications earned
- Cost per job placement: grant amount / students employed

**5. Narrative Summary**
2-3 paragraphs summarizing how the funding was used and what it achieved. Use real numbers from the data. This can feed directly into the grant_writing skill for a full report.

**6. Flags & Notes**
- Any budget categories significantly over/under
- Any unspent funds and plan for use
- Upcoming reporting deadlines for this funder`;
}

function buildBoardFinancials(period: string, comparison: string): string {
  return `## Step 2: Produce Board-Ready Financial Summary

Board members need a clear, concise financial picture — not an accounting dump. Translate the numbers into a narrative they can act on.

### Report Structure:

**1. Financial Health Dashboard** (1-page summary)

\`\`\`
FINANCIAL SNAPSHOT — ${period}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Revenue:     $___  (${comparison ? `vs. $__ ${comparison}` : 'budget: $__'})  [arrow up/down/flat]
Expenses:    $___  (${comparison ? `vs. $__ ${comparison}` : 'budget: $__'})  [arrow up/down/flat]
Net:         $___

Cash on Hand:     $___
Months of Runway: ___

Program Expense Ratio: ___%  (target: >80%)
Fundraising Efficiency: $__ raised per $1 spent on fundraising

Active Grants:    ___  (total committed: $___)
Donor Count:      ___  (${comparison ? `vs. __ ${comparison}` : ''})
\`\`\`

**2. Revenue Story** (2-3 paragraphs)
Where money came from. Trends. Any notable gifts or grants. Pipeline outlook. Written in plain language, not accounting jargon.

**3. Expense Story** (2-3 paragraphs)
Where money went. Program costs by phase. Any significant variances from budget and why. Staffing costs if significant.

**4. Program Investment Summary**
\`\`\`
Program Phase    | Enrolled | Cost     | Cost/Student | Key Outcome
Foundations      | ___      | $___     | $___         | [top metric]
101              | ___      | $___     | $___         | [top metric]
Lightspeed       | ___      | $___     | $___         | [top metric]
LiftOff          | ___      | $___     | $___         | [top metric]
TOTAL            | ___      | $___     | $___         |
\`\`\`

**5. Fundraising Pipeline**
- Grants pending: $__ across __ applications
- Grants in pipeline (prospect stage): $__
- Renewal opportunities: $__
- Donor retention rate: __% [if available]

**6. Items Requiring Board Attention**
Bullet list of anything that needs a board decision or awareness:
- Budget variances >15%
- Restricted funds at risk
- Cash flow concerns
- Major grant decisions upcoming

**7. Trend Charts** (describe for the user to create)
Suggest 2-3 visualizations:
- Monthly revenue vs. expenses (12-month trend)
- Fund balance trajectory
- Program expense ratio over time`;
}

function buildFundReconciliation(period: string, fundName: string | undefined): string {
  const fund = fundName ?? 'all funds';
  return `## Step 2: Reconcile Fund Balances

Reconcile **${fund}** across all data sources for ${period}.

### Additional Data Gathering

Pull every financial data source available:
- \`query_finances\` with query_type "fund_balances" — current balances
- \`query_finances\` with query_type "ytd" — YTD activity
- \`query_finances\` with query_type "dev_giving_history" — giving records
- \`query_finances\` with query_type "dev_grants_tracker" — grant tracking
- \`get_finance_brief\` — summary view

### Reconciliation Report:

**1. Balance Comparison**
\`\`\`
Fund: ${fund}
                    | Finance Sheet | Aplos     | Dev CRM   | Variance
Opening Balance     | $___          | $___      | $___      | $___
+ Revenue/Inflows   | $___          | $___      | $___      | $___
- Expenses/Outflows | $___          | $___      | $___      | $___
= Closing Balance   | $___          | $___      | $___      | $___
\`\`\`

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

**4. Recommended Journal Entries**
If reconciliation reveals needed adjustments:
\`\`\`
Date        | Account          | Debit    | Credit   | Memo
[date]      | [account]        | $___     |          | [explanation]
[date]      | [account]        |          | $___     | [explanation]
\`\`\`

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
