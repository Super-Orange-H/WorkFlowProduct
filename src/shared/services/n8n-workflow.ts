export type N8nWorkflowTone =
  | 'general'
  | 'business'
  | 'technical'
  | 'ops'
  | 'marketing'
  | 'support';

export type N8nWorkflowTrigger =
  | 'manual'
  | 'webhook'
  | 'schedule'
  | 'form'
  | 'email'
  | 'app_event'
  | 'auto';

export type N8nWorkflowComplexity = 'simple' | 'standard' | 'production';

export interface N8nWorkflowGenerateInput {
  description: string;
  trigger: N8nWorkflowTrigger;
  tone: N8nWorkflowTone;
  complexity: N8nWorkflowComplexity;
  integrations: string[];
  dataShape?: string;
  schedule?: string;
  timezone?: string;
  includeErrorHandling: boolean;
  includeStickyNotes: boolean;
}

export interface N8nWorkflowPackage {
  workflow: Record<string, any>;
  summary: string;
  assumptions: string[];
  missingCredentials: string[];
  setup: string[];
  testPlan: string[];
  warnings: string[];
}

const DEFAULT_BASE_URL = 'https://direct.evolink.ai';
const FALLBACK_BASE_URL = 'https://api.evolink.ai';
const DEFAULT_MODEL = 'deepseek-v4-pro';

const COMMON_N8N_NODE_HINTS = [
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.set',
  'n8n-nodes-base.if',
  'n8n-nodes-base.switch',
  'n8n-nodes-base.merge',
  'n8n-nodes-base.code',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.respondToWebhook',
  'n8n-nodes-base.noOp',
  'n8n-nodes-base.stickyNote',
];

export const N8N_WORKFLOW_SYSTEM_PROMPT = `
You are an expert n8n automation architect and workflow JSON compiler.

Your job:
- Convert a plain-language automation request into a valid n8n workflow JSON object.
- The workflow must be practical for non-technical users and importable into n8n.
- Prefer stable, built-in n8n nodes. Use these type names when possible:
  ${COMMON_N8N_NODE_HINTS.join(', ')}.
- Use app-specific nodes only when the user's request clearly needs them and the node type is widely used in n8n.
- If external credentials are required, keep the workflow importable and list them in missingCredentials. Do not invent credential IDs.
- When credentials or account-specific IDs are unknown, use safe placeholders in node parameters and explain setup steps.
- Always include clear node names, deterministic positions, and valid connection references.
- Keep active=false. Do not include secrets, API keys, passwords, OAuth tokens, or private URLs.
- For webhook workflows, include a Respond to Webhook node unless another response strategy is explicitly better.
- For production complexity, include validation, branching, logging notes, and error-handling structure where useful.
- Sticky notes are allowed only when requested. They must not be connected.

Return ONLY valid JSON. No markdown, no comments, no prose outside JSON.

Return this exact outer shape:
{
  "workflow": {
    "name": "string",
    "nodes": [],
    "connections": {},
    "settings": {},
    "active": false,
    "pinData": {}
  },
  "summary": "One paragraph explaining what the workflow does.",
  "assumptions": ["..."],
  "missingCredentials": ["..."],
  "setup": ["..."],
  "testPlan": ["..."],
  "warnings": ["..."]
}

n8n JSON requirements:
- workflow.nodes is an array.
- Every connected node must have: id, name, type, typeVersion, position, parameters.
- position must be a two-number array.
- connections keys must match source node names exactly.
- connection targets must match target node names exactly.
- connections format: { "Source Node": { "main": [[{ "node": "Target Node", "type": "main", "index": 0 }]] } }.
- The JSON should be directly usable as an n8n workflow import body.
`.trim();

export function buildN8nWorkflowUserPrompt(input: N8nWorkflowGenerateInput) {
  return `
Create an n8n workflow for this user request:

USER REQUEST:
${input.description}

PRODUCT CONFIGURATION:
- Target workflow scenario: ${input.tone}
- Trigger preference: ${input.trigger}
- Complexity level: ${input.complexity}
- Requested integrations: ${input.integrations.length ? input.integrations.join(', ') : 'infer from request'}
- Expected data shape: ${input.dataShape || 'infer from request'}
- Schedule preference: ${input.schedule || 'none provided'}
- Timezone: ${input.timezone || 'Asia/Shanghai'}
- Include error handling: ${input.includeErrorHandling ? 'yes' : 'no'}
- Include sticky notes: ${input.includeStickyNotes ? 'yes' : 'no'}

DESIGN GUIDANCE:
- Make it useful on first import.
- Favor understandable node names over cleverness.
- Use placeholders like "{{YOUR_WEBHOOK_PATH}}" or "Replace with your sheet ID" only where unavoidable.
- Put credential/account requirements in missingCredentials and setup, not inside credentials objects.
- If the request is ambiguous, make reasonable assumptions and list them.
- If an app integration is not certain, use HTTP Request with clear placeholder fields.
`.trim();
}

function extractTextContent(response: any): string {
  if (!response?.content || !Array.isArray(response.content)) {
    return '';
  }

  return response.content
    .filter((block: any) => block?.type === 'text' && block.text)
    .map((block: any) => block.text)
    .join('\n')
    .trim();
}

function extractJsonObjectText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function slugifyWorkflowName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function createFallbackWorkflow(
  input: N8nWorkflowGenerateInput
): N8nWorkflowPackage {
  const workflowName = `AI Generated Workflow - ${slugifyWorkflowName(input.description) || 'Draft'}`;

  return {
    workflow: {
      name: workflowName,
      active: false,
      nodes: [
        {
          id: 'manual-trigger',
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          id: 'capture-brief',
          name: 'Capture Automation Brief',
          type: 'n8n-nodes-base.set',
          typeVersion: 3.4,
          position: [260, 0],
          parameters: {
            assignments: {
              assignments: [
                {
                  id: 'automation-description',
                  name: 'automationDescription',
                  type: 'string',
                  value: input.description,
                },
                {
                  id: 'target-integrations',
                  name: 'targetIntegrations',
                  type: 'string',
                  value: input.integrations.join(', ') || 'To be configured',
                },
              ],
            },
            options: {},
          },
        },
        {
          id: 'prepare-output',
          name: 'Prepare Output',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [520, 0],
          parameters: {
            jsCode:
              "return items.map((item) => ({ json: { ...item.json, status: 'draft-ready', generatedAt: new Date().toISOString() } }));",
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [
            [{ node: 'Capture Automation Brief', type: 'main', index: 0 }],
          ],
        },
        'Capture Automation Brief': {
          main: [[{ node: 'Prepare Output', type: 'main', index: 0 }]],
        },
      },
      settings: {
        executionOrder: 'v1',
      },
      pinData: {},
    },
    summary:
      'The AI response could not be parsed safely, so this fallback workflow captures the automation brief and creates a runnable draft inside n8n.',
    assumptions: [
      'The final workflow needs another generation attempt or manual refinement.',
    ],
    missingCredentials: input.integrations,
    setup: [
      'Import this JSON into n8n.',
      'Open the nodes and replace the captured brief with concrete app actions.',
      'Generate again with a more specific description for a full workflow.',
    ],
    testPlan: [
      'Run the Manual Trigger and confirm the output item contains your automation brief.',
    ],
    warnings: [
      'Fallback workflow generated because the model output was not valid JSON.',
    ],
  };
}

function normalizeWorkflowPackage(
  value: any,
  input: N8nWorkflowGenerateInput
): N8nWorkflowPackage {
  if (!value || typeof value !== 'object') {
    return createFallbackWorkflow(input);
  }

  const workflow = value.workflow;
  if (
    !workflow ||
    typeof workflow !== 'object' ||
    !Array.isArray(workflow.nodes) ||
    typeof workflow.connections !== 'object'
  ) {
    return createFallbackWorkflow(input);
  }

  workflow.name =
    typeof workflow.name === 'string' && workflow.name.trim()
      ? workflow.name.trim()
      : `AI Generated n8n Workflow`;
  workflow.active = false;
  workflow.settings =
    workflow.settings && typeof workflow.settings === 'object'
      ? workflow.settings
      : {};
  workflow.pinData =
    workflow.pinData && typeof workflow.pinData === 'object'
      ? workflow.pinData
      : {};

  workflow.nodes = workflow.nodes
    .slice(0, 40)
    .map((node: any, index: number) => ({
      id: String(node.id || `node-${index + 1}`),
      name: String(node.name || `Node ${index + 1}`),
      type: String(node.type || 'n8n-nodes-base.noOp'),
      typeVersion:
        typeof node.typeVersion === 'number' ||
        typeof node.typeVersion === 'string'
          ? node.typeVersion
          : 1,
      position:
        Array.isArray(node.position) && node.position.length === 2
          ? node.position
          : [index * 260, 0],
      parameters:
        node.parameters && typeof node.parameters === 'object'
          ? node.parameters
          : {},
      ...(node.notes ? { notes: node.notes } : {}),
      ...(node.disabled ? { disabled: Boolean(node.disabled) } : {}),
    }));

  return {
    workflow,
    summary: String(value.summary || 'Generated n8n workflow.'),
    assumptions: Array.isArray(value.assumptions)
      ? value.assumptions.map(String)
      : [],
    missingCredentials: Array.isArray(value.missingCredentials)
      ? value.missingCredentials.map(String)
      : [],
    setup: Array.isArray(value.setup) ? value.setup.map(String) : [],
    testPlan: Array.isArray(value.testPlan) ? value.testPlan.map(String) : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
  };
}

export async function generateN8nWorkflow(
  input: N8nWorkflowGenerateInput
): Promise<N8nWorkflowPackage> {
  const apiKey = process.env.EVOLINK_API_KEY;
  if (!apiKey) {
    throw new Error('EVOLINK_API_KEY is not configured');
  }

  const baseUrl = (process.env.EVOLINK_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ''
  );
  const model = process.env.EVOLINK_N8N_MODEL || DEFAULT_MODEL;
  const baseUrls = Array.from(new Set([baseUrl, FALLBACK_BASE_URL]));

  let payload: any = null;
  let lastError: Error | null = null;

  for (const currentBaseUrl of baseUrls) {
    try {
      const response = await fetch(`${currentBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          temperature: 0.2,
          thinking: { type: 'disabled' },
          system: N8N_WORKFLOW_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: buildN8nWorkflowUserPrompt(input),
            },
          ],
        }),
      });

      if (!response.ok) {
        let message = `EvoLink request failed with status ${response.status}`;
        try {
          const error = await response.json();
          message = error?.error?.message || error?.message || message;
        } catch {
          // ignore parse errors
        }

        throw new Error(message);
      }

      payload = await response.json();
      break;
    } catch (error: any) {
      lastError = error;
    }
  }

  if (!payload) {
    throw lastError || new Error('EvoLink request failed');
  }

  const text = extractTextContent(payload);
  if (!text) {
    return createFallbackWorkflow(input);
  }

  try {
    const parsed = JSON.parse(extractJsonObjectText(text));
    return normalizeWorkflowPackage(parsed, input);
  } catch {
    return createFallbackWorkflow(input);
  }
}
