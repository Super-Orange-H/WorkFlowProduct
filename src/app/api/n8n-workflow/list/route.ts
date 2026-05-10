import { envConfigs } from '@/config';
import { respData, respErr } from '@/shared/lib/resp';
import { getN8nWorkflowRecords } from '@/shared/models/n8n_workflow';
import { getUserInfo } from '@/shared/models/user';

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseWorkflow(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    if (!envConfigs.database_url) {
      return respData([]);
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 20);

    const records = await getN8nWorkflowRecords({
      userId: user.id,
      page: 1,
      limit,
    });

    return respData(
      records.map((record) => ({
        id: record.id,
        title: record.title,
        description: record.description,
        summary: record.summary,
        trigger: record.trigger,
        complexity: record.complexity,
        costCredits: record.costCredits,
        createdAt: record.createdAt,
        workflow: parseWorkflow(record.workflow),
        assumptions: parseJsonArray(record.assumptions),
        missingCredentials: parseJsonArray(record.missingCredentials),
        setup: parseJsonArray(record.setup),
        testPlan: parseJsonArray(record.testPlan),
        warnings: parseJsonArray(record.warnings),
      }))
    );
  } catch (error: any) {
    console.log('list n8n workflows failed:', error);
    return respErr(error?.message || 'list n8n workflows failed');
  }
}
