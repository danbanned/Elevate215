import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { loadEnv } from '@lp-ai/lib-config';
import { getAssumedCredentials } from '../sts-helper.js';
import { runTool } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const execAsync = promisify(exec);

const env = await loadEnv();

// Check if we should use mock terraform
const MOCK_TERRAFORM = env.MOCK_TERRAFORM !== 'false';

// Allowed Terraform providers. Blocks arbitrary provider execution.
const ALLOWED_PROVIDERS = new Set(['hashicorp/aws', 'hashicorp/random', 'hashicorp/null', 'hashicorp/local']);

// Patterns that indicate dangerous Terraform configurations
const DANGEROUS_PATTERNS = [
  /\bprovisioner\s+"(local-exec|remote-exec)"/i,  // arbitrary command execution
  /\bbackend\s+"(?!s3)[^"]+"/i,                    // non-S3 backends could exfiltrate state
  /\bexternal\b/i,                                  // external data source runs arbitrary commands
];

function validateTerraformCode(code: string): string | null {
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return `Terraform code contains disallowed pattern: ${pattern.source}`;
    }
  }

  // Validate provider sources if specified
  const providerSourceRegex = /source\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = providerSourceRegex.exec(code)) !== null) {
    const source = match[1];
    if (source && !ALLOWED_PROVIDERS.has(source)) {
      return `Disallowed provider source: ${source}. Allowed: ${[...ALLOWED_PROVIDERS].join(', ')}`;
    }
  }

  return null; // valid
}

async function isTerraformInstalled(): Promise<boolean> {
  try {
    await execAsync('terraform -version');
    return true;
  } catch {
    return false;
  }
}

async function runTerraformCommand(
  jobId: string,
  args: string[],
  developerEmail: string
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const sandboxDir = path.resolve(`./.tf-sandboxes/${jobId}`);
  await fs.promises.mkdir(sandboxDir, { recursive: true });

  const hasTf = await isTerraformInstalled();
  if (MOCK_TERRAFORM || !hasTf) {
    // Return mock terraform outputs
    if (args.includes('plan')) {
      const isDelete = args.some(a => a.includes('destroy') || a.includes('delete'));
      const mockPlan = `
Terraform used the selected providers to generate the following execution plan.
Resource actions are indicated with the following symbols:
  ${isDelete ? '-' : '+'} ${isDelete ? 'destroy' : 'create'}

Terraform will perform the following actions:

  # aws_resource.mock_${jobId.substring(0,6)} will be ${isDelete ? 'destroyed' : 'created'}
  ${isDelete ? '-' : '+'} resource "aws_mock_resource" "mock" {
      ${isDelete ? '-' : '+'} id          = "mock-${jobId.substring(0,8)}"
      ${isDelete ? '-' : '+'} name        = "mcp-created-resource"
      ${isDelete ? '-' : '+'} environment = "dev"
    }

Plan: ${isDelete ? '0' : '1'} to add, 0 to change, ${isDelete ? '1' : '0'} to destroy.
`;
      return { stdout: mockPlan, stderr: '', success: true };
    } else if (args.includes('apply')) {
      const mockApply = `
aws_mock_resource.mock: Creating...
aws_mock_resource.mock: Still creating... (1s elapsed)
aws_mock_resource.mock: Creation complete [id=mock-${jobId.substring(0,8)}]

Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
`;
      return { stdout: mockApply, stderr: '', success: true };
    }
    return { stdout: 'Mock terraform execution completed successfully.', stderr: '', success: true };
  }

  // Real terraform execution
  const credentials = await getAssumedCredentials(developerEmail, jobId);
  const env = { ...process.env };
  if (credentials) {
    env['AWS_ACCESS_KEY_ID'] = credentials.accessKeyId;
    env['AWS_SECRET_ACCESS_KEY'] = credentials.secretAccessKey;
    env['AWS_SESSION_TOKEN'] = credentials.sessionToken;
  }

  try {
    const cmd = `terraform ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: sandboxDir,
      env,
    });
    return { stdout, stderr, success: true };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err),
      success: false,
    };
  }
}

export function registerAwsTools(server: McpServer): void {
  // 1. aws_plan_resource_change
  server.registerTool(
    'aws_plan_resource_change',
    {
      description:
        'Plan AWS resource changes using Terraform. Writes code to a sandbox, runs "terraform init" and "terraform plan", and creates a job awaiting human approval.',
      inputSchema: {
        developerEmail: z
          .string()
          .email()
          .describe('The git/user email of the developer running the agent.'),
        terraformCode: z
          .string()
          .describe('Complete, valid Terraform configuration code.'),
        resourceType: z
          .string()
          .describe('Primary resource type being modified (e.g. aws_s3_bucket, aws_iam_role).'),
        actionType: z
          .enum(['CREATE', 'UPDATE', 'DELETE'])
          .describe('The CRUD action being taken.'),
      },
    },
    (input: any) =>
      runTool('aws_plan_resource_change', input, async () => {
        const { developerEmail, terraformCode, resourceType, actionType } = input as {
          developerEmail: string;
          terraformCode: string;
          resourceType: string;
          actionType: 'CREATE' | 'UPDATE' | 'DELETE';
        };

        // Validate Terraform code before writing to disk
        const validationError = validateTerraformCode(terraformCode);
        if (validationError) {
          return toolError('validation_error', validationError);
        }

        const jobId = randomUUID();
        const sandboxDir = path.resolve(`./.tf-sandboxes/${jobId}`);
        await fs.promises.mkdir(sandboxDir, { recursive: true });
        await fs.promises.writeFile(path.join(sandboxDir, 'main.tf'), terraformCode, 'utf8');

        // Check safety rules (Human in the Loop rules)
        let isDestructive = false;
        const lowercaseCode = terraformCode.toLowerCase();
        if (
          actionType === 'DELETE' ||
          lowercaseCode.includes('destroy') ||
          lowercaseCode.includes('delete') ||
          lowercaseCode.includes('drop')
        ) {
          isDestructive = true;
        }

        // Run Terraform Init & Plan
        let initOutput = '';
        if (!MOCK_TERRAFORM) {
          const initRes = await runTerraformCommand(jobId, ['init', '-no-color'], developerEmail);
          initOutput = initRes.stdout + '\n' + initRes.stderr;
          if (!initRes.success) {
            return toolError('execution_failed', `terraform init failed:\n${initOutput}`);
          }
        }

        const planRes = await runTerraformCommand(
          jobId,
          ['plan', '-no-color', ...(isDestructive ? ['-destroy'] : [])],
          developerEmail
        );
        const planOutput = planRes.stdout + '\n' + planRes.stderr;

        if (!planRes.success) {
          return toolError('execution_failed', `terraform plan failed:\n${planOutput}`);
        }

        // Determine initial status based on safety governance rules
        const isProduction = env.AWS_ENV === 'production' || env.NODE_ENV === 'production';
        const autoApplyDev = env.AUTO_APPLY_DEV === 'true';

        let status = 'PENDING_APPROVAL';
        if (!isProduction && !isDestructive && autoApplyDev) {
          status = 'APPROVED'; // Auto-approved in dev sandbox for non-destructive changes
        }

        // Save to DB
        const job = await prisma.awsResourceJob.create({
          data: {
            id: jobId,
            developer: developerEmail,
            actionType,
            resourceType,
            parameters: { terraformCode },
            planOutput,
            status,
          },
        });

        const approvalUrl = `http://localhost:3000/aws-jobs/${jobId}`;

        return {
          jobId: job.id,
          status: job.status,
          planOutput: job.planOutput,
          isDestructive,
          approvalRequired: job.status === 'PENDING_APPROVAL',
          approvalUrl: job.status === 'PENDING_APPROVAL' ? approvalUrl : null,
          message:
            job.status === 'PENDING_APPROVAL'
              ? `Terraform plan generated successfully. Approval is required before applying this change. Please review and approve here: ${approvalUrl}`
              : `Terraform plan generated and auto-approved. You can now execute "aws_apply_resource_change" with jobId "${jobId}".`,
        };
      })
  );

  // 2. aws_apply_resource_change
  server.registerTool(
    'aws_apply_resource_change',
    {
      description:
        'Executes "terraform apply" for an approved AWS Resource Job. Mutates infrastructure and returns the execution outputs.',
      inputSchema: {
        jobId: z.string().uuid().describe('The UUID of the job generated by aws_plan_resource_change.'),
      },
    },
    (input: any) =>
      runTool('aws_apply_resource_change', input, async () => {
        const { jobId } = input as { jobId: string };

        const job = await prisma.awsResourceJob.findUnique({
          where: { id: jobId },
        });

        if (!job) {
          return toolError('job_not_found', `AWS Resource Job with ID ${jobId} not found.`);
        }

        if (job.status === 'PENDING_APPROVAL') {
          return toolError(
            'approval_required',
            `Job ${jobId} is currently awaiting approval and cannot be applied yet. Please approve it at http://localhost:3000/aws-jobs/${jobId}`
          );
        }

        if (job.status === 'REJECTED') {
          return toolError('unauthorized', `Job ${jobId} was rejected by an administrator.`);
        }

        if (job.status === 'SUCCEEDED') {
          return {
            jobId,
            status: 'SUCCEEDED',
            message: 'This job has already been successfully applied.',
          };
        }

        // Set status to IN_PROGRESS
        await prisma.awsResourceJob.update({
          where: { id: jobId },
          data: { status: 'IN_PROGRESS' },
        });

        // Run Terraform Apply
        const applyRes = await runTerraformCommand(
          jobId,
          ['apply', '-auto-approve', '-no-color'],
          job.developer
        );
        const applyOutput = applyRes.stdout + '\n' + applyRes.stderr;

        if (applyRes.success) {
          await prisma.awsResourceJob.update({
            where: { id: jobId },
            data: {
              status: 'SUCCEEDED',
              planOutput: (job.planOutput ?? '') + '\n\n=== APPLY OUTPUT ===\n' + applyOutput,
            },
          });
          return {
            jobId,
            status: 'SUCCEEDED',
            output: applyOutput,
            message: 'AWS resources successfully created/updated.',
          };
        } else {
          await prisma.awsResourceJob.update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              error: applyOutput,
            },
          });
          return toolError(
            'execution_failed',
            `terraform apply failed:\n${applyOutput}`,
            ['Review logs', 'Verify AWS IAM credentials and roles']
          );
        }
      })
  );

  // 3. aws_get_job_status
  server.registerTool(
    'aws_get_job_status',
    {
      description: 'Checks the current execution or approval status of an AWS Resource Job.',
      inputSchema: {
        jobId: z.string().uuid().describe('The UUID of the job.'),
      },
    },
    (input: any) =>
      runTool('aws_get_job_status', input, async () => {
        const { jobId } = input as { jobId: string };

        const job = await prisma.awsResourceJob.findUnique({
          where: { id: jobId },
        });

        if (!job) {
          return toolError('job_not_found', `AWS Resource Job with ID ${jobId} not found.`);
        }

        return {
          jobId: job.id,
          developer: job.developer,
          actionType: job.actionType,
          resourceType: job.resourceType,
          status: job.status,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      })
  );

  // 4. aws_check_identity
  server.registerTool(
    'aws_check_identity',
    {
      description:
        'Verifies active AWS IAM credentials and the assumed role/session structure.',
      inputSchema: {},
    },
    (input: any) =>
      runTool('aws_check_identity', input, async () => {
        if (MOCK_TERRAFORM) {
          return {
            mode: 'MOCK',
            message: 'Running in mock mode. AWS API calls are simulated.',
            mockIdentity: {
              Arn: 'arn:aws:sts::123456789012:assumed-role/lp-aws-mcp-execution-role/mcp-session',
              Account: '123456789012',
              UserId: 'AROATOCKEN12345:mcp-session',
            },
          };
        }

        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        try {
          const { stdout } = await execAsync('aws sts get-caller-identity');
          return JSON.parse(stdout);
        } catch (err: any) {
          return toolError(
            'execution_failed',
            `Failed to execute "aws sts get-caller-identity": ${err.message}`
          );
        }
      })
  );
}
