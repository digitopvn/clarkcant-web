import { documentSchema, publicationSchema, slugSchema, flatten, type ArticleDocument } from './document.ts';
import { Problem, requireScope, now, hash, type Database, type Principal } from './platform.ts';

export interface Article { id: string; slug: string; revision: number; published_revision: number | null; updated_at: string; document: ArticleDocument }
interface ArticleState { revision:number; published_revision:number|null }
export class ContentService {
  db: Database;
  constructor(db: Database) { this.db = db; }
  async list(published: boolean, limit = 20, offset = 0, search = '') {
    const result = await this.db.prepare(`SELECT a.id,a.slug,a.revision,a.published_revision,r.created_at AS updated_at,r.document FROM articles a JOIN revisions r ON r.article_id=a.id AND r.revision=${published ? 'a.published_revision' : 'a.revision'} WHERE a.slug LIKE ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(`%${search}%`,Math.min(50,Math.max(1,limit)),Math.max(0,offset)).all<Omit<Article,'document'> & {document:string}>();
    return result.results.map(row => { const doc = JSON.parse(row.document) as ArticleDocument; return { ...row, document: undefined, en: {title:doc.en.title, description:doc.en.description}, vi:{title:doc.vi.title,description:doc.vi.description}, author:doc.author, tags:doc.tags, hero:doc.hero, accent:doc.accent, revision: published ? row.published_revision : row.revision }; });
  }
  private async read(field:'id'|'slug',value:string,published:boolean,revision?:number):Promise<Article> {
    const row = await this.db.prepare(`SELECT a.id,a.slug,a.revision,a.published_revision,r.created_at AS updated_at,r.document FROM articles a JOIN revisions r ON r.article_id=a.id AND r.revision=${published ? 'a.published_revision' : revision === undefined ? 'a.revision' : '?'} WHERE a.${field}=?`).bind(...(!published && revision !== undefined ? [revision] : []),value).first<Omit<Article,'document'> & {document:string}>();
    if(!row) throw new Problem(404,'NOT_FOUND','Article or revision is not available.');
    return {...row, revision: published ? row.published_revision! : revision ?? row.revision, document:documentSchema.parse(JSON.parse(row.document))};
  }
  async get(id:string,published=false,revision?:number) { return this.read('id',id,published,revision); }
  async getBySlug(slug:string,published=true) { return this.read('slug',slug,published); }
  async save(principal: Principal, input: {id?:string; slug:string; expectedRevision:number; document:unknown; key:string}) {
    requireScope(principal,'blog:write');
    const document = documentSchema.parse(input.document); const slug = slugSchema.parse(input.slug);
    if(!/^[\w-]{8,100}$/.test(input.key)) throw new Problem(400,'INVALID_KEY','Supply an idempotency key of 8–100 letters, digits, underscores or hyphens.');
    const fingerprint = await hash(JSON.stringify({...input, document}));
    const receipt = await this.db.prepare('SELECT fingerprint,response FROM receipts WHERE actor=? AND key=?').bind(principal.subject,input.key).first<{fingerprint:string;response:string}>();
    if(receipt) { if(receipt.fingerprint !== fingerprint) throw new Problem(409,'KEY_REUSED','Use a new idempotency key for different content.'); return JSON.parse(receipt.response); }
    const id = input.id ?? crypto.randomUUID(); const revision = input.expectedRevision + 1; const at = now();
    if(!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || (!input.id && input.expectedRevision !== 0)) throw new Problem(400,'INVALID_REVISION','Use the revision returned when reading the article.');
    const response = {id,slug,revision};
    const statements = input.id ? [this.db.prepare('UPDATE articles SET revision=?,updated_at=? WHERE id=? AND revision=? AND slug=?').bind(revision,at,id,input.expectedRevision,slug)] : [this.db.prepare('INSERT INTO articles(id,slug,revision,updated_at) VALUES(?,?,?,?)').bind(id,slug,revision,at)];
    // The revision insert is conditional on this transaction's successful compare-and-swap.
    statements.push(this.db.prepare('INSERT INTO revisions(article_id,revision,document,actor,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(id,revision,JSON.stringify(document),principal.subject,at));
    statements.push(this.db.prepare('INSERT INTO receipts(actor,key,fingerprint,response) SELECT ?,?,?,? WHERE changes()=1').bind(principal.subject,input.key,fingerprint,JSON.stringify(response)));
    statements.push(this.db.prepare('INSERT INTO audit(id,subject,operation,article_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),principal.subject,'save',id,at));
    try { await this.db.batch(statements); } catch { const repeated = await this.db.prepare('SELECT fingerprint,response FROM receipts WHERE actor=? AND key=?').bind(principal.subject,input.key).first<{fingerprint:string;response:string}>(); if(repeated?.fingerprint === fingerprint) return JSON.parse(repeated.response); throw new Problem(409,'CONFLICT','Slug or revision conflicts with an existing article. Reload before saving; your draft was not applied.'); }
    const saved = await this.db.prepare('SELECT response FROM receipts WHERE actor=? AND key=?').bind(principal.subject,input.key).first<{response:string}>();
    if(!saved) throw new Problem(409,'STALE_REVISION','A newer revision exists or the slug changed. Reload before saving; your draft was not applied.');
    return response;
  }
  async publish(principal: Principal, id: string, revision: number, expectedRevision: number) {
    requireScope(principal,'blog:publish');
    const selected = await this.get(id,false,revision);
    publicationSchema.parse(selected.document);
    const results=await this.db.batch([
      this.db.prepare('UPDATE articles SET published_revision=? WHERE id=? AND revision=? AND published_revision IS NOT ?').bind(revision,id,expectedRevision,revision),
      this.db.prepare('INSERT INTO audit(id,subject,operation,article_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),principal.subject,`publish:${revision}`,id,now()),
      this.db.prepare('SELECT revision,published_revision FROM articles WHERE id=?').bind(id),
    ]);
    const current=(results[2] as {results?:ArticleState[]}|undefined)?.results?.[0];
    if(!current) throw new Problem(404,'NOT_FOUND','Article or revision is not available.');
    if(current.revision !== expectedRevision || current.published_revision !== revision) throw new Problem(409,'STALE_REVISION','Article changed. Reload before publishing.');
    return {id,revision,published:true};
  }
  async unpublish(principal: Principal,id:string,expectedRevision:number) {
    requireScope(principal,'blog:publish');
    const results=await this.db.batch([
      this.db.prepare('UPDATE articles SET published_revision=NULL WHERE id=? AND revision=? AND published_revision IS NOT NULL').bind(id,expectedRevision),
      this.db.prepare('INSERT INTO audit(id,subject,operation,article_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),principal.subject,'unpublish',id,now()),
      this.db.prepare('SELECT revision,published_revision FROM articles WHERE id=?').bind(id),
    ]);
    const current=(results[2] as {results?:ArticleState[]}|undefined)?.results?.[0];
    if(!current) throw new Problem(409,'STALE_REVISION','Reload the current article before unpublishing.');
    if(current.revision !== expectedRevision || current.published_revision !== null) throw new Problem(409,'STALE_REVISION','Reload the current article before unpublishing.');
    return {id,published:false};
  }
  async history(principal: Principal,id:string) { requireScope(principal,'blog:read'); return (await this.db.prepare('SELECT revision,actor,created_at FROM revisions WHERE article_id=? ORDER BY revision DESC LIMIT 100').bind(id).all()).results; }
  async survey(id:string, locale:'en'|'vi', blockId:string, option:number, visitor:string) {
    const article = await this.get(id,true);
    const block = flatten(article.document[locale].blocks).find(b => b.id === blockId);
    if(block?.type !== 'survey' || !Number.isInteger(option) || option < 0 || option >= block.options.length) throw new Problem(400,'INVALID_ANSWER','Select an option from the published survey.');
    const cutoff = new Date(Date.now()-60_000).toISOString();
    const saved=await this.db.prepare('INSERT INTO surveys(id,article_id,revision,block_id,answer,created_at,visitor_hash) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM surveys WHERE visitor_hash=? AND created_at>?)<5').bind(crypto.randomUUID(),article.id,article.revision,blockId,JSON.stringify({locale,option,label:block.options[option]}),now(),visitor,visitor,cutoff).run();
    if(!saved.meta.changes) throw new Problem(429,'RATE_LIMITED','Please wait a minute before submitting another response.');
    return {saved:true};
  }
}
