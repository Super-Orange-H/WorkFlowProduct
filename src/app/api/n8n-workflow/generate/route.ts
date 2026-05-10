import { envConfigs } from '@/config';
import { db } from '@/core/db';
import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { respData, respErr } from '@/shared/lib/resp';
import { getUuid } from '@/shared/lib/hash';
import {
  consumeCredits,
  getRemainingCredits,
} from '@/shared/models/credit';
import { createN8nWorkflowRecord } from '@/shared/models/n8n_workflow';
import { getUserInfo } from '@/shared/models/user';
import {
  generateN8nWorkflow,
  N8nWorkflowComplexity,
  N8nWorkflowGenerateInput,
  N8nWorkflowTone,
  N8nWorkflowTrigger,
} from '@/shared/services/n8n-workflow';

const TRIGGERS = new Set<N8nWorkflowTrigger>([
  'manual',
  'webhook',
  'schedule',
  'form',
  'email',
  'app_event',
  'auto',
]);

const TONES = new Set<N8nWorkflowTone>([
  'general',
  'business',
  'technical',
  'ops',
  'marketing',
  'support',
]);

const COMPLEXITIES = new Set<N8nWorkflowComplexity>([
  'simple',
  'standard',
  'production',
]);

function cleanString(value: unknown, max = 4000) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => cleanString(item, 80))
    .filter(Boolean)
    .slice(0, 12);
}

function getCostCredits() {
  return Math.max(0, Number(process.env.N8N_GENERATOR_COST_CREDITS) || 2);
}

function shouldRequireAuth() {
  return process.env.N8N_GENERATOR_REQUIRE_AUTH !== 'false';
}

function shouldUseCredits() {
  return (
    !!envConfigs.database_url &&
    process.env.N8N_GENERATOR_CREDITS_ENABLED !== 'false'
  );
}

export async function POST(req: Request) {
  const limited = enforceMinIntervalRateLimit(req, {
    intervalMs: Number(process.env.N8N_GENERATOR_MIN_INTERVAL_MS) || 4000,
    keyPrefix: 'n8n-workflow-generate',
  });
  if (limited) return limited;

  try {
    const user = await getUserInfo();
    const authRequired = shouldRequireAuth();
    const creditsEnabled = shouldUseCredits();
    const costCredits = getCostCredits();

    if (authRequired && !user) {
      return respErr('no auth, please sign in');
    }

    if (creditsEnabled && user && costCredits > 0) {
      const remainingCredits = await getRemainingCredits(user.id);
      if (remainingCredits < costCredits) {
        return respErr('insufficient credits');
      }
    }

    const body = await req.json().catch(() => ({}));

    const description = cleanString(body.description, 4000);
    if (description.length < 12) {
      return respErr(
        'Please describe the automation in at least 12 characters.'
      );
    }

    const trigger = TRIGGERS.has(body.trigger) ? body.trigger : 'auto';
    const tone = TONES.has(body.tone) ? body.tone : 'general';
    const complexity = COMPLEXITIES.has(body.complexity)
      ? body.complexity
      : 'standard';

    const input: N8nWorkflowGenerateInput = {
      description,
      trigger,
      tone,
      complexity,
      integrations: cleanStringList(body.integrations),
      dataShape: cleanString(body.dataShape, 1200),
      schedule: cleanString(body.schedule, 240),
      timezone: cleanString(body.timezone, 80) || 'Asia/Shanghai',
      includeErrorHandling: body.includeErrorHandling !== false,
      includeStickyNotes: body.includeStickyNotes !== false,
    };

    const result = await generateN8nWorkflow(input);

    let remainingCredits: number | undefined;
    let recordId: string | undefined;

    if (envConfigs.database_url && user) {
      const saved = await db().transaction(async (tx: any) => {
        let creditId = '';

        if (creditsEnabled && costCredits > 0) {
          const consumed = await consumeCredits({
            userId: user.id,
            credits: costCredits,
            scene: 'n8n_workflow',
            description: 'Generate n8n workflow',
            metadata: JSON.stringify({
              type: 'n8n-workflow',
              workflowName: result.workflow?.name || '',
            }),
            tx,
          });
          creditId = consumed?.id || '';
        }

        return createN8nWorkflowRecord(
          {
            id: getUuid(),
            userId: user.id,
            title: String(result.workflow?.name || 'Generated n8n workflow'),
            description,
            trigger,
            tone,
            complexity,
            integrations: JSON.stringify(input.integrations),
            input: JSON.stringify(input),
            workflow: JSON.stringify(result.workflow),
            summary: result.summary,
            assumptions: JSON.stringify(result.assumptions || []),
            missingCredentials: JSON.stringify(
              result.missingCredentials || []
            ),
            setup: JSON.stringify(result.setup || []),
            testPlan: JSON.stringify(result.testPlan || []),
            warnings: JSON.stringify(result.warnings || []),
            costCredits,
            creditId,
          },
          tx
        );
      });

      recordId = saved?.id;
      if (creditsEnabled) {
        remainingCredits = await getRemainingCredits(user.id);
      }
    }

    return respData({
      ...result,
      recordId,
      costCredits,
      remainingCredits,
    });
  } catch (error: any) {
    console.log('generate n8n workflow failed:', error);
    return respErr(error?.message || 'generate n8n workflow failed');
  }
}
