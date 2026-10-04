import { z } from 'zod';
import { documentSchema, blockCatalog, slugSchema } from './document.ts';
import { ContentService } from './content-service.ts';
import { requireScope, type Principal } from './platform.ts';

export const operations = {
  list_articles: { description:'List private editorial articles with pagination.', scope:'blog:read', schema:z.strictObject({limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).default(0),search:z.string().max(100).default('')}) },
  get_article: { description:'Read an article or a historical revision for editing.', scope:'blog:read', schema:z.strictObject({id:z.string().min(1),revision:z.number().int().positive().optional()}) },
  get_block_catalog: { description:'Discover document and block schemas, including the public widget host contract.', scope:'blog:read', schema:z.strictObject({}) },
  validate_article: { description:'Validate both translations without saving.', scope:'blog:write', schema:z.strictObject({document:documentSchema}) },
  save_article: { description:'Create or save a bilingual draft. Existing IDs require expectedRevision; slug is immutable. Retry identical requests with the same key.', scope:'blog:write', schema:z.strictObject({id:z.string().min(1).optional(),slug:slugSchema,expectedRevision:z.number().int().min(0),document:documentSchema,key:z.string().min(8).max(100)}) },
  publish_article: { description:'Publish or restore an existing bilingual revision. Requires publication scope and current draft revision.', scope:'blog:publish', schema:z.strictObject({id:z.string().min(1),revision:z.number().int().positive(),expectedRevision:z.number().int().positive()}) },
  unpublish_article: { description:'Remove an article from public reading without deleting its history.', scope:'blog:publish', schema:z.strictObject({id:z.string().min(1),expectedRevision:z.number().int().positive()}) },
  article_history: { description:'List up to 100 retained revisions for recovery.', scope:'blog:read', schema:z.strictObject({id:z.string().min(1)}) },
} as const;
export type Operation = keyof typeof operations;
export async function execute(service:ContentService,principal:Principal,operation:Operation,raw:unknown):Promise<unknown> {
  requireScope(principal,operations[operation].scope);
  switch(operation) {
    case 'list_articles': { const i=operations[operation].schema.parse(raw); return service.list(false,i.limit,i.offset,i.search); }
    case 'get_article': { const i=operations[operation].schema.parse(raw); return service.get(i.id,false,i.revision); }
    case 'get_block_catalog': operations[operation].schema.parse(raw); return blockCatalog();
    case 'validate_article': operations[operation].schema.parse(raw); return {valid:true};
    case 'save_article': return service.save(principal,operations[operation].schema.parse(raw));
    case 'publish_article': { const i=operations[operation].schema.parse(raw); return service.publish(principal,i.id,i.revision,i.expectedRevision); }
    case 'unpublish_article': { const i=operations[operation].schema.parse(raw); return service.unpublish(principal,i.id,i.expectedRevision); }
    case 'article_history': return service.history(principal,operations[operation].schema.parse(raw).id);
  }
}
export function openapi(site:string) { return {openapi:'3.1.0',info:{title:'ClarkCant Blog',version:'1.0.0'},servers:[{url:site}],components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}}},paths:Object.fromEntries(Object.entries(operations).map(([name,op])=>[`/api/blog/${name}`,{post:{operationId:name,description:op.description,security:[{bearer:[]}],requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(op.schema)}}},responses:{200:{description:'Operation result'},400:{description:'Validation error'},401:{description:'Authentication required'},403:{description:'Scope denied'},409:{description:'Revision or idempotency conflict'}}}}]))}; }
