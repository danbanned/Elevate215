import { NextResponse } from 'next/server';
import { prisma } from '@lp-ai/lib-db';
import { auth } from '../../../../auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  try {
    const job = await prisma.awsResourceJob.findUnique({
      where: { id },
    });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    process.stderr.write(`GET /api/aws-jobs/${id} error: ${err instanceof Error ? err.message : String(err)}\n`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  try {
    const session = await auth();
    const approverEmail = session?.user?.email;
    if (!approverEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be approve or reject' }, { status: 400 });
    }

    const job = await prisma.awsResourceJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updatedJob = await prisma.awsResourceJob.update({
      where: { id },
      data: {
        status: newStatus,
        approver: approverEmail,
      },
    });

    // Write structured JSON audit log to stdout for security auditing
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'aws_job_governance_action',
        jobId: id,
        action: action.toUpperCase(),
        developer: job.developer,
        resourceType: job.resourceType,
        actionType: job.actionType,
        approver: approverEmail,
      }) + '\n'
    );

    return NextResponse.json(updatedJob);
  } catch (err) {
    process.stderr.write(`POST /api/aws-jobs/${id} error: ${err instanceof Error ? err.message : String(err)}\n`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
