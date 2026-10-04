import { z } from 'zod';
import { authenticate, issueToken, login, oauth, requireSessionAuthentication } from './auth.ts';
import { operations, execute, openapi, type Operation } from './operations.ts';
import { ContentService } from './content-service.ts';
import { body, hash, json, now, Problem, requestBytes, requireScope, type Environment } from './platform.ts';
import { mcp } from './mcp.ts';
import { shell } from './html.ts';
import { publicRoute } from './public-routes.ts';

export async function api(request:Request,env:Environment):Promise<Response> {
  try {
    const url=new URL(request.url); const path=url.pathname;
    const page=await publicRoute(request,env); if(page) return page;
    if(path.startsWith('/.well-known/oauth') || path.startsWith('/oauth/')) return await oauth(request,env);
    if(path.startsWith('/auth/')) return await login(request,env);
    if(path==='/openapi.json' && request.method==='GET') return json(openapi(env.SITE_URL));
    if(path==='/api/blog/survey' && request.method==='POST') {
      if(request.headers.get('origin')!==env.SITE_URL) throw new Problem(403,'ORIGIN_REJECTED','Submit the survey from this site.');
      const input=z.strictObject({article:z.string().max(100),locale:z.enum(['en','vi']),block:z.string().max(64),option:z.number().int()}).parse(await body(request,5000));
      const visitor=await hash(`${new Date().toISOString().slice(0,10)}:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
      return json(await new ContentService(env.DB).survey(input.article,input.locale,input.block,input.option,visitor));
    }
    if(path!=='/mcp' && !path.startsWith('/api/blog/')) throw new Problem(404,'NOT_FOUND','This page does not exist.');
    const principal=await authenticate(request,env);
    if(path==='/mcp') return await mcp(request,env,principal);
    if(path==='/api/blog/me' && request.method==='GET') return json(principal);
    if(path==='/api/blog/tokens' && request.method==='POST') {
      requireSessionAuthentication(request);
      const input=z.strictObject({scopes:z.array(z.enum(['blog:read','blog:write','blog:publish'])).min(1),days:z.number().int().min(1).max(30)}).parse(await body(request,5000));
      if(input.scopes.some(s=>!principal.scopes.includes(s))) throw new Problem(403,'FORBIDDEN','Cannot grant scopes your connection does not have.');
      return json({token:await issueToken(env,principal.subject,input.scopes,'api',input.days*86400),expiresIn:input.days*86400},201);
    }
    if(path==='/api/blog/tokens/revoke' && request.method==='POST') {
      requireSessionAuthentication(request);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM tokens WHERE subject=? AND kind!='session'").bind(principal.subject),
        env.DB.prepare('DELETE FROM oauth_codes WHERE subject=?').bind(principal.subject),
      ]);
      return json({revoked:true});
    }
    if(path==='/api/blog/members') {
      requireScope(principal,'blog:admin');
      if(request.method==='GET') return json((await env.DB.prepare('SELECT subject,name,role,active FROM members').all()).results);
      if(request.method==='POST') {
        const input=z.strictObject({githubId:z.string().regex(/^\d+$/),name:z.string().min(1).max(100),role:z.enum(['editor','publisher']),active:z.boolean().default(true)}).parse(await body(request,5000));
        const subject=`github:${input.githubId}`;
        if(input.githubId===env.OWNER_GITHUB_ID || subject===principal.subject) throw new Problem(400,'OWNER_PROTECTED','Owner membership is configured by deployment.');
        await env.DB.prepare('INSERT INTO members(subject,name,role,active) VALUES(?,?,?,?) ON CONFLICT(subject) DO UPDATE SET name=excluded.name,role=excluded.role,active=excluded.active').bind(subject,input.name,input.role,input.active?1:0).run();
        return json({subject,...input});
      }
    }
    if(path==='/api/blog/media' && request.method==='POST') {
      requireScope(principal,'blog:write');
      const type=request.headers.get('content-type') ?? '';
      if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'].includes(type)) throw new Problem(400,'UNSUPPORTED_MEDIA','Upload PNG, JPEG, WebP, GIF, MP4 or WebM.');
      const bytes=await requestBytes(request,20*1024*1024);
      const id=crypto.randomUUID(); const name=(request.headers.get('x-file-name') ?? id).slice(0,200);
      await env.MEDIA.put(id,bytes,{httpMetadata:{contentType:type}});
      try { await env.DB.prepare('INSERT INTO assets(id,name,type,size,owner,created_at) VALUES(?,?,?,?,?,?)').bind(id,name,type,bytes.byteLength,principal.subject,now()).run(); }
      catch(error) { try { await env.MEDIA.delete(id); } catch {} throw error; }
      return json({id,src:`/media/${id}`,name,type},201);
    }
    if(path==='/api/blog/survey-results' && request.method==='POST') {
      requireScope(principal,'blog:read'); const input=z.strictObject({id:z.string().min(1)}).parse(await body(request,5000));
      return json((await env.DB.prepare('SELECT revision,block_id,answer,count(*) AS responses FROM surveys WHERE article_id=? GROUP BY revision,block_id,answer').bind(input.id).all()).results);
    }
    const operation=path.slice('/api/blog/'.length);
    if(path.startsWith('/api/blog/') && Object.hasOwn(operations,operation) && request.method==='POST') return json(await execute(new ContentService(env.DB),principal,operation as Operation,await body(request)));
    throw new Problem(404,'NOT_FOUND','Unknown route or method. Read /openapi.json.');
  } catch(e) {
    const status=e instanceof Problem?e.status:e instanceof z.ZodError?400:500;
    const message=e instanceof Problem?e.message:e instanceof z.ZodError?e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):'The operation failed. Existing published content was preserved; retry or contact the site owner.';
    if(status===404 && request.headers.get('accept')?.includes('text/html') && !new URL(request.url).pathname.endsWith('.md')) return new Response(shell('Page not found','en','<main id="main" class="journal empty-state"><h1>Page not found.</h1><p>This article may have moved or is no longer published.</p><a href="/blog/">Explore the journal →</a></main>','<meta name="robots" content="noindex">'),{status:404,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    return json({error:{code:e instanceof Problem?e.code:status===400?'INVALID_INPUT':'INTERNAL_ERROR',message}},status,status===401?{'www-authenticate':`Bearer resource_metadata="${env.SITE_URL}/.well-known/oauth-protected-resource/mcp"`}:{});
  }
}
