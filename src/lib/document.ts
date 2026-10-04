import { z } from 'zod';
import { validateWidget, widgetCatalog } from '../generated/widget-contract.mjs';

const text = z.string().max(100_000);
const url = z.string().max(2000).refine(v => {
  if (/^\/media\/[a-f0-9-]{36}$/.test(v)) return true;
  try { const parsed=new URL(v); return parsed.protocol==='https:' && !!parsed.hostname && !parsed.username && !parsed.password; } catch { return false; }
}, 'Use a valid HTTPS URL without credentials or an uploaded media URL');
const base = { id: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/), caption: text.default('') };
const leaf = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('text'), text }),
  z.strictObject({ ...base, type: z.literal('heading'), text: z.string().min(1).max(300), level: z.enum(['2','3','4']).default('2') }),
  z.strictObject({ ...base, type: z.literal('image'), src: url, alt: z.string().min(1).max(1000) }),
  z.strictObject({ ...base, type: z.literal('carousel'), images: z.array(z.strictObject({ src: url, alt: z.string().min(1).max(1000) })).min(1).max(20) }),
  z.strictObject({ ...base, type: z.literal('code'), language: z.string().max(30), code: text }),
  z.strictObject({ ...base, type: z.literal('video'), src: url, transcript: z.string().min(1).max(100_000) }),
  z.strictObject({ ...base, type: z.literal('youtube'), videoId: z.string().regex(/^[\w-]{11}$/), transcript: z.string().min(1).max(100_000) }),
  z.strictObject({ ...base, type: z.literal('sandbox'), html: text, css: text, js: text, explanation: z.string().min(1).max(100_000) }),
  z.strictObject({ ...base, type: z.literal('survey'), question: z.string().min(1).max(1000), options: z.array(z.string().min(1).max(200)).min(2).max(12) }),
  z.strictObject({ ...base, type: z.literal('widget'), definitionId: z.string().regex(/^canvas\.[\w-]+@\d+$/), version: z.string().min(1).max(80), props: z.record(z.string(), z.unknown()), state: z.record(z.string(), z.unknown()).default({}), rows: z.array(z.record(z.string(), z.unknown())).max(1000).default([]), semantic: z.string().min(1).max(100_000) }),
]);
export const blockSchema = z.union([leaf, z.strictObject({ ...base, type: z.literal('layout'), layout: z.enum(['stack','columns','wide','aside']), children: z.array(leaf).min(1).max(20) })]);
export const localeSchema = z.strictObject({ title: z.string().max(180), description: z.string().max(320), blocks: z.array(blockSchema).max(150) }).superRefine((doc, ctx) => {
  const ids = new Set<string>();
  for (const block of doc.blocks.flatMap(b => b.type === 'layout' ? [b, ...b.children] : [b])) {
    if (ids.has(block.id)) ctx.addIssue({ code: 'custom', message: `Duplicate block id: ${block.id}` });
    ids.add(block.id);
  }
});
export const documentSchema = z.strictObject({ schemaVersion: z.literal(1), author: z.string().min(1).max(160), tags: z.array(z.string().min(1).max(40)).max(12).default([]), accent: z.enum(['violet','ocean','moss','ember']).default('violet'), hero: url.optional(), en: localeSchema, vi: localeSchema });
export const publicationSchema = documentSchema.superRefine((doc,ctx) => {
  for(const locale of ['en','vi'] as const) {
    const content=doc[locale];
    if(!content.title.trim() || !content.description.trim() || !content.blocks.length) ctx.addIssue({code:'custom',path:[locale],message:'Complete the title, description and content before publishing both languages.'});
    for(const block of flatten(content.blocks)) if(block.type==='widget') {const error=validateWidget(block);if(error)ctx.addIssue({code:'custom',path:[locale,block.id],message:error});}
  }
});
export type ArticleDocument = z.infer<typeof documentSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Locale = 'en' | 'vi';
// These names belong to the blog's application routes.
export const reservedSlugs = new Set(['editor', 'preview']);
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).refine(value => !reservedSlugs.has(value), 'This slug is reserved for a blog application route');
export const flatten = (blocks: Block[]) => blocks.flatMap(b => b.type === 'layout' ? b.children : [b]);
const fence = (value: string, language = '') => { const ticks = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1))); return `${ticks}${language}\n${value}\n${ticks}`; };
const mdText = (value: string) => value.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
export function blockMarkdown(block: Block): string {
  let body: string;
  switch (block.type) {
    case 'layout': body = block.children.map(blockMarkdown).join('\n\n'); break;
    case 'heading': body = `${'#'.repeat(Number(block.level))} ${mdText(block.text)}`; break;
    case 'text': body = mdText(block.text); break;
    case 'image': body = `![${mdText(block.alt)}](<${block.src}>)`; break;
    case 'carousel': body = block.images.map(i => `![${mdText(i.alt)}](<${i.src}>)`).join('\n\n'); break;
    case 'code': body = fence(block.code, block.language); break;
    case 'video': body = `[Video](<${block.src}>)\n\n${mdText(block.transcript)}`; break;
    case 'youtube': body = `[YouTube](https://www.youtube.com/watch?v=${block.videoId})\n\n${mdText(block.transcript)}`; break;
    case 'sandbox': body = `${mdText(block.explanation)}\n\n${fence(block.html,'html')}\n\n${fence(block.css,'css')}\n\n${fence(block.js,'javascript')}`; break;
    case 'survey': body = `${mdText(block.question)}\n\n${block.options.map(o => `- ${mdText(o)}`).join('\n')}`; break;
    case 'widget': body = `${mdText(block.semantic)}\n\n${block.rows.length ? fence(JSON.stringify(block.rows,null,2),'json') : ''}`; break;
  }
  return `${body}${block.caption ? `\n\n${mdText(block.caption)}` : ''}`;
}
export function markdown(doc: ArticleDocument, locale: Locale, canonical: string, updated: string): string {
  const body = doc[locale];
  return `# ${mdText(body.title)}\n\n${mdText(body.description)}\n\n${mdText(doc.author)} · ${updated}\n\nSource: ${canonical}\n\n${body.blocks.map(blockMarkdown).join('\n\n')}\n`;
}
export const blockCatalog = () => ({ schemaVersion: 1, document: z.toJSONSchema(documentSchema), blocks: ['text','heading','image','carousel','code','video','youtube','sandbox','survey','widget','layout'], widgets:widgetCatalog, widgetHost: { apiVersion: 1, capabilities: ['local-view-state'], marketplaceInstall: false } });
