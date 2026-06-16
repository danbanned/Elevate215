import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

const NAME = 'grant_prospecting';

const DESCRIPTION =
  'Find funders whose giving history, priorities, and focus areas align with the organization. ' +
  'Builds an organizational profile from live data, researches peer organizations and their funders, ' +
  'searches funder databases and 990 filings, checks for LinkedIn/board connections, and produces ' +
  'a ranked prospect list with fit analysis, deadlines, and a prioritized action calendar.';

const argsSchema = {
  funding_need: z
    .string()
    .describe(
      'What you need funding for. Be specific: "general operating support", ' +
      '"expand LiftOff workforce placement program to serve 50 additional students", ' +
      '"purchase laptops and upgrade lab infrastructure", etc.',
    ),
  program_details: z
    .string()
    .optional()
    .describe(
      'If this is for a specific program (not general operating), describe it: ' +
      'program name, who it serves, what it does, target outcomes, current budget, ' +
      'and how this funding would be used. Most applications are program-specific — ' +
      'capture this detail upfront so research targets the right funders.',
    ),
  grant_size_range: z
    .string()
    .optional()
    .describe(
      'Target grant size range (e.g., "$10,000-$50,000", "$100,000+", "under $25,000"). ' +
      'Helps filter to funders whose typical grant size matches.',
    ),
  grant_type: z
    .enum(['general_operating', 'program_specific', 'capacity_building', 'capital', 'any'])
    .optional()
    .describe('Type of grant sought. Defaults to "any".'),
  organization_location: z
    .string()
    .optional()
    .describe(
      'Where the organization is based (e.g., "Philadelphia, PA"). Defaults to Philadelphia. ' +
      'This is the org\'s home base, not necessarily the only geography to search.',
    ),
  regional_preference: z
    .string()
    .optional()
    .describe(
      'Geographic scope for the funder search. Examples: ' +
      '"local first but include national", "Philadelphia and Pennsylvania only", ' +
      '"national — we\'ll apply anywhere", "Mid-Atlantic region prioritized". ' +
      'Default: prioritize local/regional funders but include strong national matches.',
    ),
  peer_organizations: z
    .string()
    .optional()
    .describe(
      'Comma-separated list of organizations you consider peers. The system will suggest ' +
      'its own peer list first and ask you to add any it missed. These peers\' funders ' +
      'become high-priority prospects. Example: "Year Up, Per Scholas, Philadelphia Youth Network"',
    ),
  board_members: z
    .string()
    .optional()
    .describe(
      'Comma-separated list of board members and their affiliations. Used to find ' +
      'LinkedIn/professional connections to funder boards and officers. ' +
      'Example: "Jane Smith (Comcast), John Doe (PNC Bank), Maria Garcia (Temple University)"',
    ),
  scoring_weights: z
    .string()
    .optional()
    .describe(
      'Custom weights for prospect scoring. The default weights are: ' +
      'Mission alignment 25%, Specific grant alignment 20%, Population match 15%, ' +
      'Geographic match 15%, Grant size fit 10%, Track record 10%, Accessibility 5%. ' +
      'Provide overrides as: "Mission 30%, Population 25%, ..." or "use defaults".',
    ),
  exclude_current_funders: z
    .boolean()
    .optional()
    .describe('If true, exclude organizations already in the donor database. Default: false (include them as renewal prospects).'),
  additional_context: z
    .string()
    .optional()
    .describe(
      'Any extra context: sectors to target, upcoming deadlines, known connections, etc.',
    ),
};

interface PromptArgs {
  funding_need: string;
  program_details?: string | undefined;
  grant_size_range?: string | undefined;
  grant_type?: string | undefined;
  organization_location?: string | undefined;
  regional_preference?: string | undefined;
  peer_organizations?: string | undefined;
  board_members?: string | undefined;
  scoring_weights?: string | undefined;
  exclude_current_funders?: boolean | undefined;
  additional_context?: string | undefined;
}

function buildPromptMessages(args: PromptArgs): GetPromptResult {
  const grantSize = args.grant_size_range ?? 'not specified — include a range of sizes';
  const grantType = args.grant_type ?? 'any';
  const orgLocation = args.organization_location ?? 'Philadelphia, PA';
  const regionalPref = args.regional_preference ?? 'prioritize local/regional funders but include strong national matches';
  const excludeCurrent = args.exclude_current_funders ?? false;
  const hasProgram = !!args.program_details?.trim();
  const hasPeers = !!args.peer_organizations?.trim();
  const hasBoard = !!args.board_members?.trim();
  const hasCustomWeights = !!args.scoring_weights?.trim();
  const extraClause = args.additional_context
    ? `\n\nAdditional context from the user:\n${args.additional_context}`
    : '';

  const systemMessage = `You are a grant prospecting researcher working with a nonprofit organization. You build data-backed organizational profiles and research the funding landscape to find best-fit funders.

You have access to the organization's live data through MCP tools AND web search capabilities. You are methodical, thorough, and interactive — you confirm key assumptions with the user before proceeding.

## CRITICAL SAFETY RULES

1. **NEVER FABRICATE DATA.** All organizational statistics must come from MCP tool results. If data is unavailable, state it clearly with \`[DATA UNAVAILABLE: ...]\`. Fabricated data puts the entire organization at risk.

2. **NEVER CONTACT FUNDERS.** You produce research and prospect lists. You MUST NOT send emails, fill out inquiry forms, or take any action that contacts a funder or external party. The user handles all outreach.

3. **VERIFY FUNDER INFORMATION.** When citing funder details (grant sizes, deadlines, focus areas), note the source. Web information may be outdated — flag anything you're uncertain about with \`[VERIFY: ...]\`.

## INTERACTION MODEL

This skill involves several checkpoints where you MUST pause and ask the user for input before continuing. Do NOT skip these checkpoints — the user's knowledge is essential for accurate prospecting.`;

  const userMessage = `# Task: GRANT PROSPECTING

**Funding need:** ${args.funding_need}
${hasProgram ? `**Program details:** ${args.program_details}` : '**Program details:** Not provided — you MUST ask the user about this (see Step 1).'}
**Target grant size:** ${grantSize}
**Grant type:** ${grantType}
**Organization location:** ${orgLocation}
**Regional preference:** ${regionalPref}
**Exclude current funders:** ${excludeCurrent ? 'Yes — find new prospects only' : 'No — include current funders as renewal/upgrade prospects'}
${hasBoard ? `**Board members:** ${args.board_members}` : '**Board members:** Not provided — ask the user in Step 1.'}
${extraClause}

---

## Step 1: Build the Organizational Profile

Before searching for funders, assemble the organization's profile from live data. This profile is what you'll match against funder priorities.

### 1a. Gather data from MCP tools (parallel calls):

**Scale & demographics:**
- \`query_enrollment\` with query_type "total" — total students served
- \`query_enrollment\` with query_type "by_race" — demographic breakdown
- \`query_enrollment\` with query_type "by_phase" — program phase distribution

**Outcomes (the strongest selling points):**
- \`query_certifications\` with query_type "summary" — certification pass rates
- \`query_employment\` with query_type "aggregate" — employment rates, wages, earnings
- \`query_postsecondary\` with query_type "summary" — college enrollment and completion
- \`query_attendance\` with query_type "aggregate" — engagement metrics

**Financial profile:**
- \`get_finance_brief\` — current fund health, recent giving, revenue mix
- \`query_finances\` with query_type "budget_actuals" — budget size and fiscal discipline
- \`query_donors\` with query_type "summary" — current donor base size and giving totals

**Existing funder relationships:**
- \`query_donors\` with query_type "list" — full donor roster (to identify current funders${excludeCurrent ? ' and exclude them' : ' and flag renewal opportunities'})
- \`query_finances\` with query_type "dev_grants_tracker" — active grants and their status

**Organizational voice & past work:**
- \`search_documents\` with query: "mission" or "program description" or "about" — for positioning language
- \`search_documents\` with query: "${args.funding_need}" — past documents related to this specific need

### 1b. Output the Org Profile and pause for user input

After gathering data, produce a structured **Org Profile**:

\`\`\`
ORGANIZATION: [name]
LOCATION: ${orgLocation}
TYPE: 501(c)(3) [primary category from data]
POPULATION SERVED: [from enrollment data — age range, demographics, count]
ANNUAL BUDGET: [from finance data]
PROGRAMS: [from enrollment phases]
KEY OUTCOMES:
  - Certification pass rate: [from tool]
  - Employment placement rate: [from tool]
  - Average hourly wage: [from tool]
  - Postsecondary enrollment rate: [from tool]
  - Attendance rate: [from tool]
CURRENT FUNDING BASE: [donor count, total giving, major funders]
FUNDING NEED: ${args.funding_need}
${hasProgram ? `PROGRAM-SPECIFIC DETAILS: ${args.program_details}` : 'PROGRAM-SPECIFIC DETAILS: [see question below]'}
TARGET GRANT SIZE: ${grantSize}
\`\`\`

Flag any fields where data was unavailable: \`[DATA UNAVAILABLE: ...]\`

### CHECKPOINT 1 — Pause and ask the user:

${hasProgram ? '' : `**Program details (REQUIRED):** "Most grant applications are for specific programs, not general operating support. Can you describe the specific program or use of funds in more detail? Include:
- Program name
- Who it serves (number, demographics, geography)
- What participants do / learn / achieve
- Current program budget vs. what this new funding would cover
- Specific outcomes you'd commit to with this funding"

`}**Board & leadership:** ${hasBoard ? `"You provided these board members: ${args.board_members}. Are there any others, or any key staff leadership, whose professional networks we should check for funder connections?"` : `"Please list your board members and their professional affiliations (company, title). We'll use this to find connections to funder boards and officers. Format: 'Name (Affiliation)'"`}

**Profile review:** "Does this organizational profile look accurate? Anything to correct or add before we search for funders?"

**Wait for the user's response before proceeding to Step 2.**

---

## Step 2: Confirm Scoring Weights

Present the default scoring framework and get user buy-in before researching.

### Default weights:

| Dimension | Weight | What it measures |
|---|---|---|
| **Mission alignment** | 25% | Does the funder's overall mission match what this organization does? |
| **Specific grant alignment** | 20% | Does this particular grant program fund the specific type of work described in the funding need? (A funder may align broadly but their open grants may not match.) |
| **Population match** | 15% | Do they fund the demographic this organization serves? |
| **Geographic match** | 15% | Do they fund in ${orgLocation} / regionally / nationally? |
| **Grant size fit** | 10% | Is their typical grant size in the target range? |
| **Track record** | 10% | Have they funded similar programs or peer organizations before? |
| **Accessibility** | 5% | Is there an open application? Is the deadline feasible? |

${hasCustomWeights ? `The user provided custom weights: "${args.scoring_weights}". Apply these instead of the defaults, but still present the table for confirmation.` : ''}

### CHECKPOINT 2 — Ask the user:

"Here are the default scoring weights for ranking prospects. Would you like to:
1. **Use these as-is** — proceed with the defaults
2. **Adjust weights** — tell me which dimensions to weight higher or lower
3. **Add a dimension** — if there's a factor I'm not considering (e.g., 'alignment with strategic plan', 'board relationship potential')
4. **Remove a dimension** — if any of these aren't relevant to your search"

**Wait for the user's response before proceeding to Step 3.**

---

## Step 3: Peer Organization Analysis

This is a high-value research step. Funders who already fund organizations like yours are pre-qualified prospects.

### 3a. Propose a peer list

Based on the org profile, propose a list of peer organizations. Consider:
- **National peers** in the same space (workforce development, youth tech education, career readiness)
- **Regional peers** in ${orgLocation} and surrounding area
- **Program-model peers** — organizations with similar phased/cohort approaches
- **Population peers** — organizations serving similar demographics

Present the list organized by category:

**Suggested national peers:**
- [Org 1] — [why they're a peer: similar program model, population, etc.]
- [Org 2] — ...

**Suggested regional peers:**
- [Org 1] — ...

${hasPeers ? `**User-provided peers (will be included):**
${args.peer_organizations}` : ''}

### CHECKPOINT 3 — Ask the user:

"Here are the peer organizations I'll research to find who funds them. Please:
1. **Add any I missed** — especially local organizations you consider peers or competitors for the same funding
2. **Remove any that aren't relevant** — if any of these are too different from your org
3. **Flag any you have relationships with** — personal connections to peer org leaders can help with funder introductions"

**Wait for the user's response, then proceed to research.**

### 3b. Research peer funders

For each confirmed peer organization:
- Search their website for donor/funder pages, annual reports, sponsor lists
- Look up their 990 filings on ProPublica Nonprofit Explorer for incoming grants
- Note which funders gave, how much, and for what purpose
- Build a **Peer Funder Matrix** — which funders appear across multiple peers (these are the strongest prospects)

Output format:
\`\`\`
PEER FUNDER MATRIX
Funder Name          | Peers Funded | Total Given  | Notes
[Foundation A]       | 3 of 6 peers | $500K+       | Focus: workforce dev
[Corporation B]      | 2 of 6 peers | $50K each    | Corporate giving program
...
\`\`\`

---

## Step 4: Broad Funder Research

Expand beyond peer funders using web search across these channels:

### 4a. Foundation Directories & Databases

Search using terms derived from the org profile and funding need:
- **Program alignment:** "[specific program keywords]" + "grants" + "funding"
- **Population alignment:** grants matching the demographic profile
- **Geographic alignment:** "${orgLocation}" + "foundations", regional/state grant makers
- **Size alignment:** funders whose typical grants match ${grantSize}

Key sources to search:
- **Candid / Foundation Directory** — by focus area and geography
- **ProPublica Nonprofit Explorer** — 990 filings for foundations giving to similar organizations
- **State-specific grant databases** — state foundation directories
- **Corporate giving programs** — tech companies, local employers, employer partners from the data

### 4b. 990 Filing Deep Dives

For each promising foundation, verify via 990 data:
- **Total annual giving** — Active and well-funded?
- **Typical grant size** — Matches target range?
- **Past grantees** — Similar organizations? Same region?
- **Giving trends** — Increasing or decreasing in relevant areas?
- **Officers and trustees** — Any connections? (Cross-reference with board members from Step 1)

### 4c. LinkedIn & Board Connection Analysis

${hasBoard ? `Using the board members provided (${args.board_members}):` : 'Using the board members gathered in Step 1:'}

For each identified funder prospect:
1. **Search for the funder's board of directors and officers** (from 990 filings, website, LinkedIn)
2. **Cross-reference against the organization's board members and leadership**
3. **Look for shared connections:** same companies, same universities, same nonprofit boards, same professional associations
4. **Flag any direct connections** prominently — these dramatically increase the chance of a successful application

Connection types to look for:
- **Direct:** Board member knows a funder trustee personally
- **Professional:** Board member works at the same company or in the same industry as a funder trustee
- **Institutional:** Shared alma mater, shared board service at another org, same professional association
- **Warm path:** A peer org leader who could make an introduction

Output:
\`\`\`
CONNECTION MAP
Funder              | Connection Type | Details
[Foundation A]      | Direct         | [Board member X] served on [Org] board with [Funder trustee Y]
[Corporation B]     | Professional   | [Board member Z] is at [Company], which employs [Funder officer W]
...
\`\`\`

If no connections are found for a funder, note: "No connections identified — cold application."

### 4d. Government & Institutional Sources

If relevant to the grant type and funding need:
- **Federal:** Department of Labor (WIOA), Department of Education, AmeriCorps, NSF (if tech-related)
- **State:** relevant state agencies for the org's location
- **City/County:** local workforce boards, commerce departments, youth agencies
- **Institutional:** United Way, community foundations, regional associations

### Regional search strategy:

**${regionalPref}**

Structure the search in tiers:
1. **Local** (${orgLocation} metro area) — search first, these funders prefer local impact
2. **State/regional** — state-level foundations and programs
3. **National** — national funders who have funded in ${orgLocation} or fund the specific program type anywhere
4. Label each prospect with its geographic tier so the user can prioritize

---

## Step 5: Score & Rank Prospects

Apply the confirmed scoring weights (from Step 2) to every prospect.

For each prospect, score each dimension and compute a weighted total:

\`\`\`
[Funder Name]
  Mission alignment (25%):        [High/Med/Low] — [brief reason]
  Specific grant alignment (20%): [High/Med/Low] — [does their open grant match our specific need?]
  Population match (15%):         [High/Med/Low] — [brief reason]
  Geographic match (15%):         [High/Med/Low] — [local/state/national]
  Grant size fit (10%):           [High/Med/Low] — [their typical size vs our target]
  Track record (10%):             [High/Med/Low] — [funded peers? similar orgs?]
  Accessibility (5%):             [High/Med/Low] — [open app? feasible deadline?]
  OVERALL: Strong Fit / Good Fit / Possible Fit
\`\`\`

Important: **Specific grant alignment** is separate from mission alignment. A health-focused foundation might have a "workforce development" grant — mission doesn't align but the specific grant does. Conversely, a youth development funder might only have grants for K-8 programs right now. Score both independently.

---

## Step 6: Produce the Prospect List

### Format for each prospect:

\`\`\`
### [Rank]. [Funder Name]
**Fit Score:** Strong Fit / Good Fit / Possible Fit
**Geographic Tier:** Local / State / National
**Funder Type:** Private foundation / Corporate / Community foundation / Government / Family foundation
**Location:** [City, State]
**Annual Giving:** [Total from 990 or website] [VERIFY if uncertain]
**Typical Grant Size:** [Range]
**Website:** [URL]
**Board Connection:** [connection details or "None identified"]

**Why they match:**
[2-3 sentences on specific alignment — mission language, past grantees, stated priorities, specific grant program fit]

**Specific grant program:**
[Name of the specific grant/program that matches, if identified. Include: purpose, typical award, cycle.]
[If no specific program identified: "General grantmaking — no specific program found. [VERIFY current funding priorities]"]

**Key programs/focus areas:**
- [Relevant focus area 1]
- [Relevant focus area 2]

**Past grants to similar orgs:**
- [Org name]: $[amount] ([year]) — [what it funded]
- [or "No similar grants found in public records"]

**Application details:**
- Deadline: [date or "rolling" or "LOI required first" or VERIFY]
- Process: [open application / invitation only / LOI first / RFP cycle]
- URL: [direct link to application page if found]
- Key deliverables: [what must be submitted — LOI, full proposal, budget, attachments]

**Recommended approach:**
[Specific next step — leverage connections if any, or cold application strategy]

**Talking points for this funder:**
[2-3 bullet points tailored to THIS funder's language and priorities, using real org data from Step 1]
\`\`\`

### Organize the list:

1. **Immediate opportunities** — Open applications with upcoming deadlines, sorted by deadline
2. **Strong fits — research further** — Strong alignment but need more info on application process
3. **Connection-based opportunities** — Funders where board/leadership connections exist (regardless of deadline)
4. **Relationship-building targets** — Strong fit but invitation-only or no current open cycle
${excludeCurrent ? '' : `5. **Current funder renewal/upgrade opportunities** — Existing donors who could be approached for larger or renewed grants`}

---

## Step 7: Deadline Calendar & Action Plan

This section is critical — it turns research into action and ensures nothing is missed.

### 7a. Master Deadline Calendar

Produce a chronological calendar of ALL deadlines and key dates:

\`\`\`
DEADLINE CALENDAR
Date         | Funder              | Action Required          | Priority | Status
[earliest]   | [Funder A]          | LOI due                  | URGENT   | Needs drafting
[date]       | [Funder B]          | Full application due     | HIGH     | Needs drafting
[date]       | [Funder C]          | Info session (optional)  | MEDIUM   | Attend if possible
[date]       | [Funder D]          | Next RFP cycle opens     | MEDIUM   | Watch for announcement
[ongoing]    | [Funder E]          | Rolling deadline         | MEDIUM   | Submit when ready
\`\`\`

### 7b. Pre-Deadline Deliverables

For each upcoming deadline, work backwards and list what must be prepared:

\`\`\`
FUNDER A — LOI due [date]
  - [ ] [date - 14 days]: Draft LOI (use grant_writing skill)
  - [ ] [date - 10 days]: Internal review of LOI
  - [ ] [date - 7 days]:  Gather required attachments (501(c)(3) letter, board list, etc.)
  - [ ] [date - 3 days]:  Final review and submission
  - [ ] [date]:           LOI DEADLINE

FUNDER B — Full application due [date]
  - [ ] [date - 30 days]: Start proposal draft (use grant_writing skill)
  - [ ] [date - 21 days]: Gather budget and financial attachments
  - [ ] [date - 14 days]: Internal review cycle
  - [ ] [date - 7 days]:  Final edits and formatting
  - [ ] [date - 3 days]:  Final review, proofread, submit
  - [ ] [date]:           APPLICATION DEADLINE
\`\`\`

### 7c. Priority Action Items

Sorted by urgency:

**THIS WEEK:**
- [ ] [specific action] — [funder] — [reason it's urgent]

**THIS MONTH:**
- [ ] [specific action] — [funder]

**NEXT 90 DAYS:**
- [ ] [specific action] — [funder]

**ONGOING:**
- [ ] Monitor [funder] for next RFP cycle (expected [month/quarter])
- [ ] Build relationship with [funder] through [specific suggestion]

### 7d. Summary Table

| # | Funder | Fit | Type | Typical Size | Deadline | Geo Tier | Connection | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | [Name] | Strong | Foundation | $25K-$50K | [date] | Local | Direct | URGENT — LOI due soon |
| 2 | [Name] | Strong | Corporate | $10K-$25K | Rolling | National | None | Ready to apply |
| ... | | | | | | | | |

---

**"This is a research document for your review. No funders have been contacted. Review the prospects, discuss with your team, and proceed with outreach and applications at your discretion."**

---

## Important Notes

- **Funder information may be outdated.** Every \`[VERIFY]\` flag means the user should check the funder's current website before acting.
- **Quality over quantity.** 10 well-researched, strong-fit prospects are more valuable than 50 surface-level names.
- **Use the org's real numbers in talking points.** All Launchpad data must come from Step 1 tool calls.
- **Connections are gold.** Any board/leadership connection to a funder should be flagged prominently — warm introductions dramatically improve success rates.
- **Program specificity matters.** A funder whose mission broadly aligns is less valuable than one with a specific open grant that matches the exact funding need. The "Specific grant alignment" scoring dimension captures this.`;

  return {
    messages: [
      { role: 'assistant', content: { type: 'text', text: systemMessage } },
      { role: 'user', content: { type: 'text', text: userMessage } },
    ],
  };
}

export function registerGrantProspectingPrompt(server: McpServer): void {
  server.registerPrompt(NAME, { description: DESCRIPTION, argsSchema }, (args) => {
    return buildPromptMessages(args);
  });
}
