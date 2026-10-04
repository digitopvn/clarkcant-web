import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/lib/api.ts';
import { issueToken, login, oauth } from '../src/lib/auth.ts';
import { ContentService } from '../src/lib/content-service.ts';
import { Problem, requestBytes, type Environment, type Principal } from '../src/lib/platform.ts';
import { database } from './database.ts';

const owner:Principal={subject:'github:1',name:'Owner',role:'owner',scopes:['blog:read','blog:write','blog:publish','blog:admin']};
const completeDocument={schemaVersion:1 as const,author:'Test author',tags:[],accent:'violet' as const,en:{title:'English',description:'English description',blocks:[{id:'en-text',type:'text' as const,text:'English body',caption:''}]},vi:{title:'Tiếng Việt',description:'Mô tả tiếng Việt',blocks:[{id:'vi-text',type:'text' as const,text:'Nội dung tiếng Việt',caption:''}]}};

function setup() {
  const db=database();
  return {db,env:{DB:db,SITE_URL:'https://blog.test'} as Environment};
}

async function addOwner(env:Environment) {
  await env.DB.prepare("INSERT INTO members VALUES('github:1','Owner','owner',1)").run();
}

test('OAuth consent ignores injected decisions and requires one explicit choice',async()=>{
  const {db,env}=setup();
  try {
    await addOwner(env);
    const session=await issueToken(env,owner.subject,owner.scopes,'session');
    const registered=await oauth(new Request('https://blog.test/oauth/register',{method:'POST',body:JSON.stringify({client_name:'Test client',redirect_uris:['https://client.test/callback']})}),env);
    const {client_id:clientId}=await registered.json() as {client_id:string};
    const verifier='a'.repeat(64);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
    const challenge=Buffer.from(digest).toString('base64url');
    const fields=new URLSearchParams({client_id:clientId,redirect_uri:'https://client.test/callback',resource:'https://blog.test/mcp',response_type:'code',code_challenge_method:'S256',code_challenge:challenge,scope:'blog:read',decision:'allow'});
    const headers={cookie:`cc_blog_session=${session}`,origin:env.SITE_URL};
    const consent=await oauth(new Request(`https://blog.test/oauth/authorize?${fields}`,{headers}),env);
    assert.doesNotMatch(await consent.text(),/type="hidden" name="decision"/);

    fields.append('decision','deny');
    const denied=await oauth(new Request('https://blog.test/oauth/authorize',{method:'POST',headers,body:fields}),env);
    assert.equal(new URL(denied.headers.get('location')!).searchParams.get('error'),'access_denied');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM oauth_codes').first<{n:number}>())?.n,0);
  } finally { db.close(); }
});

test('delegated tokens cannot mint or revoke access tokens',async()=>{
  const {db,env}=setup();
  try {
    await addOwner(env);
    const delegated=await issueToken(env,owner.subject,['blog:read','blog:write'],'api');
    const body=JSON.stringify({scopes:['blog:read'],days:30});
    const issue=await api(new Request('https://blog.test/api/blog/tokens',{method:'POST',headers:{authorization:`Bearer ${delegated}`,'content-type':'application/json'},body}),env);
    assert.equal(issue.status,403);
    assert.equal((await issue.json() as {error:{code:string}}).error.code,'SESSION_REQUIRED');

    const session=await issueToken(env,owner.subject,owner.scopes,'session');
    const allowed=await api(new Request('https://blog.test/api/blog/tokens',{method:'POST',headers:{cookie:`cc_blog_session=${session}`,origin:env.SITE_URL,'content-type':'application/json'},body}),env);
    assert.equal(allowed.status,201);

    const revoke=await api(new Request('https://blog.test/api/blog/tokens/revoke',{method:'POST',headers:{authorization:`Bearer ${delegated}`}}),env);
    assert.equal(revoke.status,403);
    const stillPresent=await db.prepare('SELECT hash FROM tokens WHERE kind=?').bind('api').first();
    assert.ok(stillPresent);
  } finally { db.close(); }
});

test('request byte limits reject streamed bodies before buffering beyond the limit',async()=>{
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(6));controller.close();}});
  const request=new Request('https://blog.test/upload',{method:'POST',body:stream,duplex:'half'} as RequestInit);
  await assert.rejects(requestBytes(request,5),(error:unknown)=>error instanceof Problem && error.status===413);
});

test('publishing validates historical content and retries do not duplicate audit records',async()=>{
  const {db}=setup();
  try {
    const service=new ContentService(db);
    const draft={...completeDocument,en:{title:'',description:'',blocks:[]},vi:{title:'',description:'',blocks:[]}};
    const incomplete=await service.save(owner,{slug:'incomplete',expectedRevision:0,document:draft,key:'incomplete-key'});
    await assert.rejects(service.publish(owner,incomplete.id,1,1),/Complete the title/);

    const saved=await service.save(owner,{slug:'complete',expectedRevision:0,document:completeDocument,key:'complete-key'});
    await service.publish(owner,saved.id,1,1);
    await service.publish(owner,saved.id,1,1);
    await service.unpublish(owner,saved.id,1);
    await service.unpublish(owner,saved.id,1);
    const rows=(await db.prepare("SELECT operation,count(*) AS n FROM audit WHERE operation IN ('publish:1','unpublish') GROUP BY operation ORDER BY operation").all<{operation:string;n:number}>()).results;
    assert.deepEqual(rows.map(row=>({...row})),[{operation:'publish:1',n:1},{operation:'unpublish',n:1}]);
  } finally { db.close(); }
});

test('article IDs and slugs cannot collide across lookup paths',async()=>{
  const {db}=setup();
  try {
    const service=new ContentService(db);
    const articleA=await service.save(owner,{slug:'article-a',expectedRevision:0,document:completeDocument,key:'article-a-key'});
    const articleB=await service.save(owner,{slug:articleA.id,expectedRevision:0,document:completeDocument,key:'article-b-key'});
    await service.publish(owner,articleA.id,1,1);
    assert.equal((await service.get(articleA.id,true)).id,articleA.id);
    await assert.rejects(service.getBySlug(articleA.id),/not available/);
    assert.equal((await service.get(articleB.id)).published_revision,null);

    await service.publish(owner,articleB.id,1,1);
    assert.equal((await service.getBySlug(articleA.id)).id,articleB.id);
    assert.equal((await service.get(articleA.id,true)).id,articleA.id);
  } finally { db.close(); }
});

test('anonymous OAuth registration and login use persisted per-IP limits and clean expired auth rows',async()=>{
  const {db,env}=setup();
  try {
    Object.assign(env,{GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'secret',OWNER_GITHUB_ID:'1'});
    await addOwner(env);
    await db.prepare("INSERT INTO login_states(hash,return_to,expires_at) VALUES('expired','/blog/editor',0)").run();
    await db.prepare("INSERT INTO oauth_codes(hash,client_id,redirect_uri,challenge,subject,scopes,resource,expires_at) VALUES('expired','client','https://client.test/callback','challenge','github:1','[]','https://blog.test/mcp',0)").run();
    await db.prepare("INSERT INTO tokens(hash,subject,scopes,expires_at,kind,audience) VALUES('expired','github:1','[]',0,'api','https://blog.test/mcp')").run();

    const loginHeaders={'cf-connecting-ip':'192.0.2.10'};
    for(let attempt=0;attempt<30;attempt++) assert.equal((await login(new Request('https://blog.test/auth/login',{headers:loginHeaders}),env)).status,302);
    await assert.rejects(login(new Request('https://blog.test/auth/login',{headers:loginHeaders}),env),(error:unknown)=>error instanceof Problem && error.status===429);
    for(const table of ['login_states','oauth_codes','tokens']) {
      const expired=await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE expires_at<=0`).first<{n:number}>();
      assert.equal(expired?.n,0);
    }

    const registrationHeaders={'cf-connecting-ip':'192.0.2.20'};
    const registrationBody=JSON.stringify({client_name:'Limited client',redirect_uris:['https://client.test/callback']});
    for(let attempt=0;attempt<10;attempt++) assert.equal((await oauth(new Request('https://blog.test/oauth/register',{method:'POST',headers:registrationHeaders,body:registrationBody}),env)).status,201);
    await assert.rejects(oauth(new Request('https://blog.test/oauth/register',{method:'POST',headers:registrationHeaders,body:registrationBody}),env),(error:unknown)=>error instanceof Problem && error.status===429);
    const registrationRate=await db.prepare("SELECT hits FROM request_rate_limits WHERE action='oauth_register' AND visitor_hash!='global'").first<{hits:number}>();
    assert.equal(registrationRate?.hits,10);
  } finally { db.close(); }
});

test('OAuth client registrations expire, are cleaned in bounded batches, and have a hard capacity',async()=>{
  const {db,env}=setup();
  try {
    const first=await oauth(new Request('https://blog.test/oauth/register',{method:'POST',headers:{'cf-connecting-ip':'192.0.2.30'},body:JSON.stringify({redirect_uris:['https://client.test/callback']})}),env);
    const {client_id:firstId}=await first.json() as {client_id:string};
    const active=await db.prepare('SELECT expires_at FROM oauth_clients WHERE id=?').bind(firstId).first<{expires_at:number}>();
    assert.ok((active?.expires_at ?? 0)>Math.floor(Date.now()/1000)+89*86400);
    await db.prepare('UPDATE oauth_clients SET expires_at=0 WHERE id=?').bind(firstId).run();
    await oauth(new Request('https://blog.test/oauth/register',{method:'POST',headers:{'cf-connecting-ip':'192.0.2.31'},body:JSON.stringify({redirect_uris:['https://client.test/callback']})}),env);
    assert.equal(await db.prepare('SELECT id FROM oauth_clients WHERE id=?').bind(firstId).first(),null);

    await db.prepare(`WITH RECURSIVE numbers(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM numbers WHERE value<9999)
      INSERT INTO oauth_clients(id,name,redirect_uris,expires_at) SELECT 'capacity-'||value,'Client','["https://client.test/callback"]',4102444800 FROM numbers`).run();
    await assert.rejects(oauth(new Request('https://blog.test/oauth/register',{method:'POST',headers:{'cf-connecting-ip':'192.0.2.32'},body:JSON.stringify({redirect_uris:['https://client.test/callback']})}),env),(error:unknown)=>error instanceof Problem && error.code==='REGISTRATION_CAPACITY');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM oauth_clients').first<{n:number}>())?.n,10_000);
  } finally { db.close(); }
});

test('survey admission atomically caps each visitor window',async()=>{
  const {db}=setup();
  try {
    const service=new ContentService(db);
    const surveyDocument={...completeDocument,en:{...completeDocument.en,blocks:[{id:'poll',type:'survey' as const,question:'Choose',options:['A','B'],caption:''}]},vi:{...completeDocument.vi,blocks:[{id:'poll',type:'survey' as const,question:'Chọn',options:['A','B'],caption:''}]}};
    const article=await service.save(owner,{slug:'survey-limit',expectedRevision:0,document:surveyDocument,key:'survey-limit-key'});
    await service.publish(owner,article.id,1,1);
    const attempts=await Promise.allSettled(Array.from({length:10},()=>service.survey(article.id,'en','poll',0,'same-visitor')));
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,5);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM surveys').first<{n:number}>())?.n,5);
  } finally { db.close(); }
});
