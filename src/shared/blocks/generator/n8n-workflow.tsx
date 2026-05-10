'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Coins,
  Download,
  FileJson2,
  History,
  Loader2,
  LockKeyhole,
  Rocket,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Link } from '@/core/i18n/navigation';
import { SignModal } from '@/shared/blocks/sign/sign-modal';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { useAppContext } from '@/shared/contexts/app';
import { cn } from '@/shared/lib/utils';

interface N8nWorkflowPackage {
  workflow: Record<string, any>;
  summary: string;
  assumptions: string[];
  missingCredentials: string[];
  setup: string[];
  testPlan: string[];
  warnings: string[];
  recordId?: string;
  costCredits?: number;
  remainingCredits?: number;
}

interface N8nWorkflowHistoryItem extends N8nWorkflowPackage {
  id: string;
  title: string;
  description: string;
  trigger: string;
  complexity: string;
  createdAt: string;
}

interface N8nWorkflowGeneratorProps {
  srOnlyTitle?: string;
  className?: string;
}

const EXAMPLES = [
  {
    key: 'lead',
    tone: 'general',
    complexity: 'standard',
  },
  {
    key: 'support',
    tone: 'support',
    complexity: 'production',
  },
  {
    key: 'content',
    tone: 'marketing',
    complexity: 'standard',
  },
];

const GENERATION_COST_CREDITS = 2;

function downloadWorkflow(workflow: Record<string, any>) {
  const safeName = String(workflow.name || 'n8n-workflow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const blob = new Blob([JSON.stringify(workflow, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName || 'n8n-workflow'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ResultList({
  title,
  items,
  empty,
}: {
  title: string;
  items?: string[];
  empty: string;
}) {
  return (
    <div className="bg-background rounded-md border p-4">
      <div className="mb-3 text-sm font-medium">{title}</div>
      {items && items.length > 0 ? (
        <ul className="text-muted-foreground space-y-2 text-sm">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </div>
  );
}

export function N8nWorkflowGenerator({
  srOnlyTitle,
  className,
}: N8nWorkflowGeneratorProps) {
  const t = useTranslations('ai.n8n-workflow.generator');
  const {
    user,
    fetchUserInfo,
    fetchUserCredits,
    setIsShowSignModal,
  } = useAppContext();

  const [description, setDescription] = useState('');
  const [tone, setTone] = useState('general');
  const [complexity, setComplexity] = useState('standard');
  const [includeErrorHandling, setIncludeErrorHandling] = useState(true);
  const [includeStickyNotes, setIncludeStickyNotes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<N8nWorkflowPackage | null>(null);
  const [history, setHistory] = useState<N8nWorkflowHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [didPrefill, setDidPrefill] = useState(false);

  const workflowJson = useMemo(() => {
    if (!result?.workflow) return '';
    return JSON.stringify(result.workflow, null, 2);
  }, [result]);

  const remainingCredits = user?.credits?.remainingCredits ?? 0;
  const hasEnoughCredits =
    !user?.credits || remainingCredits >= GENERATION_COST_CREDITS;
  const canGenerate = description.trim().length >= 12 && !loading;

  const applyExample = useCallback(
    (key: string) => {
      const example = EXAMPLES.find((item) => item.key === key);
      if (!example) return;

      setDescription(t(`examples.${key}.prompt`));
      setTone(example.tone);
      setComplexity(example.complexity);
    },
    [t]
  );

  const loadHistory = useCallback(async () => {
    if (!user) return;

    setHistoryLoading(true);
    try {
      const resp = await fetch('/api/n8n-workflow/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const { code, data } = await resp.json();
      if (code === 0) {
        setHistory(data || []);
      }
    } catch (error) {
      // History is a convenience feature; generation should stay usable.
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserInfo();
  }, [fetchUserInfo]);

  useEffect(() => {
    if (!didPrefill) {
      applyExample('lead');
      setDidPrefill(true);
    }
  }, [applyExample, didPrefill]);

  useEffect(() => {
    if (user) {
      fetchUserCredits();
      loadHistory();
    }
  }, [fetchUserCredits, loadHistory, user]);

  const loadHistoryItem = (item: N8nWorkflowHistoryItem) => {
    setResult(item);
    setDescription(item.description);
    toast.success(t('toast.loaded'));
  };

  const handleGenerate = async () => {
    if (!user) {
      setIsShowSignModal(true);
      return;
    }

    if (!hasEnoughCredits) {
      toast.error(t('toast.insufficientCredits'));
      return;
    }

    if (!canGenerate) return;

    setLoading(true);
    try {
      const resp = await fetch('/api/n8n-workflow/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          trigger: 'auto',
          tone,
          complexity,
          integrations: [],
          dataShape: '',
          schedule: '',
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            'Asia/Shanghai',
          includeErrorHandling,
          includeStickyNotes,
        }),
      });

      if (!resp.ok) {
        throw new Error(`request failed with status ${resp.status}`);
      }

      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setResult(data);
      await fetchUserCredits();
      await loadHistory();
      toast.success(t('toast.success'));
    } catch (error: any) {
      if (String(error?.message || '').includes('no auth')) {
        setIsShowSignModal(true);
      }
      toast.error(error?.message || t('toast.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!workflowJson) return;
    await navigator.clipboard.writeText(workflowJson);
    toast.success(t('toast.copied'));
  };

  return (
    <section className={cn('container py-8 md:py-12', className)}>
      {srOnlyTitle && <h2 className="sr-only">{srOnlyTitle}</h2>}

      <div className="bg-background/90 border-primary/15 mb-5 grid gap-3 rounded-lg border p-3 shadow-xl shadow-[#ea4b71]/5 backdrop-blur md:grid-cols-3">
        <div className="border-primary/15 flex items-center gap-3 rounded-md border bg-white/70 p-3 dark:bg-white/5">
          <Rocket className="text-primary size-5" />
          <div>
            <div className="text-sm font-medium">{t('status.fast.title')}</div>
            <div className="text-muted-foreground text-xs">
              {t('status.fast.description')}
            </div>
          </div>
        </div>
        <div className="border-primary/15 flex items-center gap-3 rounded-md border bg-white/70 p-3 dark:bg-white/5">
          <Coins className="text-primary size-5" />
          <div>
            <div className="text-sm font-medium">
              {user
                ? t('status.credits.signedIn', {
                    credits: remainingCredits,
                    cost: GENERATION_COST_CREDITS,
                  })
                : t('status.credits.signedOut', {
                    cost: GENERATION_COST_CREDITS,
                  })}
            </div>
            <div className="text-muted-foreground text-xs">
              {t('status.credits.description')}
            </div>
          </div>
        </div>
        <div className="border-primary/15 flex items-center gap-3 rounded-md border bg-white/70 p-3 dark:bg-white/5">
          <LockKeyhole className="text-primary size-5" />
          <div>
            <div className="text-sm font-medium">
              {t('status.safe.title')}
            </div>
            <div className="text-muted-foreground text-xs">
              {t('status.safe.description')}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-primary/20 bg-card/95 rounded-lg shadow-2xl shadow-[#ea4b71]/10 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="text-primary size-5" />
              {t('form.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="workflow-description">
                {t('form.description')}
              </Label>
              <Textarea
                id="workflow-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('form.descriptionPlaceholder')}
                className="min-h-[180px] scroll-mt-28 resize-y"
                maxLength={4000}
              />
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>{t('form.examplesLabel')}</span>
                <span>{description.length}/4000</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {EXAMPLES.map((example) => (
                  <Button
                    key={example.key}
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-auto justify-start whitespace-normal py-3 text-left"
                    onClick={() => applyExample(example.key)}
                  >
                    <Sparkles className="size-4 shrink-0" />
                    <span>{t(`examples.${example.key}.title`)}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('form.complexity')}</Label>
                <Select value={complexity} onValueChange={setComplexity}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">
                      {t('options.complexity.simple')}
                    </SelectItem>
                    <SelectItem value="standard">
                      {t('options.complexity.standard')}
                    </SelectItem>
                    <SelectItem value="production">
                      {t('options.complexity.production')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('form.tone')}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">
                      {t('options.tone.general')}
                    </SelectItem>
                    <SelectItem value="business">
                      {t('options.tone.business')}
                    </SelectItem>
                    <SelectItem value="ops">{t('options.tone.ops')}</SelectItem>
                    <SelectItem value="marketing">
                      {t('options.tone.marketing')}
                    </SelectItem>
                    <SelectItem value="support">
                      {t('options.tone.support')}
                    </SelectItem>
                    <SelectItem value="technical">
                      {t('options.tone.technical')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="bg-background flex items-center justify-between rounded-md border px-4 py-3 text-sm">
                <span>{t('form.errorHandling')}</span>
                <Switch
                  checked={includeErrorHandling}
                  onCheckedChange={setIncludeErrorHandling}
                />
              </label>
              <label className="bg-background flex items-center justify-between rounded-md border px-4 py-3 text-sm">
                <span>{t('form.stickyNotes')}</span>
                <Switch
                  checked={includeStickyNotes}
                  onCheckedChange={setIncludeStickyNotes}
                />
              </label>
            </div>

            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {loading
                ? t('form.generating')
                : user
                  ? t('form.generateWithCredits', {
                      credits: GENERATION_COST_CREDITS,
                    })
                  : t('form.signInToGenerate')}
            </Button>

            {user && !hasEnoughCredits && (
              <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span className="text-destructive">
                  {t('status.credits.insufficient')}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href="/pricing">{t('status.credits.topUp')}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/95 rounded-lg shadow-2xl shadow-[#ea4b71]/10 backdrop-blur">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <FileJson2 className="text-primary size-5" />
                {t('result.title')}
              </CardTitle>
              {result?.workflow && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                  >
                    <Clipboard className="size-4" />
                    {t('result.copy')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => downloadWorkflow(result.workflow)}
                  >
                    <Download className="size-4" />
                    {t('result.download')}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="space-y-4">
                <div className="bg-muted/30 flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <Workflow className="text-muted-foreground mb-4 size-10" />
                  <p className="text-muted-foreground max-w-md text-sm">
                    {t('result.empty')}
                  </p>
                </div>

                {user && (
                  <div className="rounded-md border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <History className="text-primary size-4" />
                        {t('history.title')}
                      </div>
                      {historyLoading && (
                        <Loader2 className="text-muted-foreground size-4 animate-spin" />
                      )}
                    </div>
                    {history.length > 0 ? (
                      <div className="space-y-2">
                        {history.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => loadHistoryItem(item)}
                            className="hover:bg-muted/50 block w-full rounded-md border p-3 text-left transition"
                          >
                            <div className="line-clamp-1 text-sm font-medium">
                              {item.title || item.workflow?.name}
                            </div>
                            <div className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                              {item.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {t('history.empty')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-background rounded-md border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {result.workflow?.nodes?.length || 0} nodes
                    </Badge>
                    <Badge variant="outline">
                      {result.workflow?.name || 'n8n workflow'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {result.summary}
                  </p>
                </div>

                {result.warnings?.length > 0 && (
                  <div className="border-destructive/30 bg-destructive/5 rounded-md border p-4">
                    <div className="text-destructive mb-2 flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="size-4" />
                      {t('result.warnings')}
                    </div>
                    <ul className="text-muted-foreground space-y-1 text-sm">
                      {result.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Tabs defaultValue="setup" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="setup">
                      {t('result.tabs.setup')}
                    </TabsTrigger>
                    <TabsTrigger value="credentials">
                      {t('result.tabs.credentials')}
                    </TabsTrigger>
                    <TabsTrigger value="test">
                      {t('result.tabs.test')}
                    </TabsTrigger>
                    <TabsTrigger value="json">
                      {t('result.tabs.json')}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="setup" className="mt-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <ResultList
                        title={t('result.setup')}
                        items={result.setup}
                        empty={t('result.noSetup')}
                      />
                      <ResultList
                        title={t('result.assumptions')}
                        items={result.assumptions}
                        empty={t('result.noAssumptions')}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="credentials" className="mt-4">
                    <ResultList
                      title={t('result.credentials')}
                      items={result.missingCredentials}
                      empty={t('result.noCredentials')}
                    />
                  </TabsContent>
                  <TabsContent value="test" className="mt-4">
                    <ResultList
                      title={t('result.testPlan')}
                      items={result.testPlan}
                      empty={t('result.noTestPlan')}
                    />
                  </TabsContent>
                  <TabsContent value="json" className="mt-4">
                    <pre className="bg-muted/40 max-h-[540px] overflow-auto rounded-md border p-4 text-xs leading-relaxed">
                      <code>{workflowJson}</code>
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <SignModal callbackUrl="/" />
    </section>
  );
}
