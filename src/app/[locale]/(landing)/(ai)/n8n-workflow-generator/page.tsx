import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getThemePage } from '@/core/theme';
import { N8nWorkflowGenerator } from '@/shared/blocks/generator';
import { getMetadata } from '@/shared/lib/seo';
import { DynamicPage } from '@/shared/types/blocks/landing';

export const revalidate = 3600;

export const generateMetadata = getMetadata({
  metadataKey: 'ai.n8n-workflow.metadata',
  canonicalUrl: '/n8n-workflow-generator',
});

export default async function N8nWorkflowGeneratorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('ai.n8n-workflow');

  const page: DynamicPage = {
    sections: {
      hero: {
        title: t.raw('page.title'),
        highlight_text: t.raw('page.highlight'),
        description: t.raw('page.description'),
        tip: t.raw('page.tip'),
        background_image: {
          src: '/imgs/bg/tree.jpg',
          alt: 'n8n workflow generator',
        },
        buttons: [
          {
            title: t.raw('page.primaryButton'),
            icon: 'Workflow',
            url: '#generator',
          },
          {
            title: t.raw('page.secondaryButton'),
            icon: 'FileJson2',
            url: 'https://docs.n8n.io/workflows/export-import/',
            target: '_blank',
            variant: 'outline',
          },
        ],
      },
      generator: {
        id: 'generator',
        component: (
          <N8nWorkflowGenerator srOnlyTitle={t.raw('generator.title')} />
        ),
      },
    },
  };

  const Page = await getThemePage('dynamic-page');

  return <Page locale={locale} page={page} />;
}
