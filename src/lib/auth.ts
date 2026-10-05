import { Problem, hash, secret, json, requestText, type Environment, type Principal, type Role } from './platform.ts';

export const scopesFor = (role: Role) => ['blog:read','blog:write',...(role === 'editor' ? [] : ['blog:publish']),...(role === 'owner' ? ['blog:admin'] : [])];
const seconds = () => Math.floor(Date.now()/1000);
const cookie = (request:Request,name:string) => request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1);
const secure = (env:Environment) => env.SITE_URL.startsWith('https:') ? '; Secure' : '';
const sessionCookie = (token:string,env:Environment,age=43200) => `cc_blog_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure(env)}`;
const publicLimits = {oauth_register:{visitor:10,global:1000},auth_login:{visitor:30,global:3000}} as const;
const oauthClientTtl=90*86400;
const oauthClientCapacity=10_000;
type PublicAction = keyof typeof publicLimits;

async function deleteExpiredAuthRows(env:Environment,at:number) {
  const bucket=Math.floor(at/60);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_states WHERE rowid IN (SELECT rowid FROM login_states WHERE expires_at<=? LIMIT 100)').bind(at),
    env.DB.prepare('DELETE FROM oauth_codes WHERE rowid IN (SELECT rowid FROM oauth_codes WHERE expires_at<=? LIMIT 100)').bind(at),
    env.DB.prepare('DELETE FROM tokens WHERE rowid IN (SELECT rowid FROM tokens WHERE expires_at<=? LIMIT 100)').bind(at),
    env.DB.prepare('DELETE FROM oauth_clients WHERE rowid IN (SELECT rowid FROM oauth_clients WHERE expires_at<=? LIMIT 100)').bind(at),
    env.DB.prepare('DELETE FROM request_rate_limits WHERE rowid IN (SELECT rowid FROM request_rate_limits WHERE bucket<? LIMIT 100)').bind(bucket-2),
  ]);
}

async function admitPublicRequest(request:Request,env:Environment,action:PublicAction) {
  const at=seconds(); const bucket=Math.floor(at/60); const day=new Date(at*1000).toISOString().slice(0,10);
  const visitor=await hash(`${day}:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
  const limits=publicLimits[action];
  const admitted=await env.DB.prepare(`INSERT INTO request_rate_limits(action,visitor_hash,bucket,hits)
    SELECT action,visitor_hash,bucket,1 FROM (SELECT ? AS action,'global' AS visitor_hash,? AS bucket UNION ALL SELECT ?,?,?)
    WHERE COALESCE((SELECT hits FROM request_rate_limits WHERE action=? AND visitor_hash='global' AND bucket=?),0)<?
      AND COALESCE((SELECT hits FROM request_rate_limits WHERE action=? AND visitor_hash=? AND bucket=?),0)<?
    ON CONFLICT(action,visitor_hash,bucket) DO UPDATE SET hits=hits+1`).bind(action,bucket,action,visitor,bucket,action,bucket,limits.global,action,visitor,bucket,limits.visitor).run();
  if(admitted.meta.changes!==2) throw new Problem(429,'RATE_LIMITED','Too many requests. Wait a minute and try again.');
  await deleteExpiredAuthRows(env,at);
}
export async function authenticate(request:Request,env:Environment):Promise<Principal> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const value = bearer ?? cookie(request,'cc_blog_session');
  if(!value) throw new Problem(401,'UNAUTHENTICATED','Sign in or provide a scoped access token.');
  const row = await env.DB.prepare('SELECT t.subject,t.scopes,t.audience,t.kind,m.name,m.role FROM tokens t JOIN members m ON m.subject=t.subject WHERE t.hash=? AND t.expires_at>? AND m.active=1').bind(await hash(value),seconds()).first<{subject:string;scopes:string;audience:string;kind:string;name:string;role:Role}>();
  if(!row || row.audience !== `${env.SITE_URL}/mcp` || (!bearer && row.kind !== 'session') || (bearer && row.kind === 'session')) throw new Problem(401,'UNAUTHENTICATED','Session or token expired or was revoked. Sign in again.');
  if(!bearer && !['GET','HEAD'].includes(request.method) && request.headers.get('origin') !== env.SITE_URL) throw new Problem(403,'ORIGIN_REJECTED','Use the editor on this site.');
  const allowed = scopesFor(row.role);
  return {subject:row.subject,name:row.name,role:row.role,scopes:JSON.parse(row.scopes).filter((s:string)=>allowed.includes(s))};
}
export function requireSessionAuthentication(request:Request) {
  if(request.headers.has('authorization')) throw new Problem(403,'SESSION_REQUIRED','Manage access tokens from the signed-in editor.');
}
// A token that never expires still dies when it is revoked or its member is deactivated.
export const NEVER_EXPIRES = 253402300799; // 9999-12-31T23:59:59Z in epoch seconds
export async function issueToken(env:Environment,subject:string,scopes:string[],kind:string,ttl:number|null=3600) {
  const value = secret();
  await env.DB.prepare('DELETE FROM tokens WHERE rowid IN (SELECT rowid FROM tokens WHERE expires_at<=? LIMIT 100)').bind(seconds()).run();
  await env.DB.prepare('INSERT INTO tokens(hash,subject,scopes,expires_at,kind,audience) VALUES(?,?,?,?,?,?)').bind(await hash(value),subject,JSON.stringify(scopes),ttl===null?NEVER_EXPIRES:seconds()+ttl,kind,`${env.SITE_URL}/mcp`).run();
  return value;
}
const redirect = (url:string,headers:Record<string,string>={}) => new Response(null,{status:302,headers:{location:url,'cache-control':'no-store',...headers}});
export async function login(request:Request,env:Environment):Promise<Response> {
  if(!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.OWNER_GITHUB_ID) throw new Problem(503,'AUTH_NOT_CONFIGURED','Configure the GitHub OAuth application and owner ID before signing in. No content was changed.');
  const url = new URL(request.url);
  if(url.pathname === '/auth/logout') {
    if(request.method !== 'POST' || request.headers.get('origin') !== env.SITE_URL) throw new Problem(403,'ORIGIN_REJECTED','Sign out from the editor.');
    const value = cookie(request,'cc_blog_session');
    if(value) await env.DB.prepare('DELETE FROM tokens WHERE hash=? AND kind=?').bind(await hash(value),'session').run();
    return redirect('/blog/',{'set-cookie':sessionCookie('',env,0)});
  }
  if(url.pathname === '/auth/login') {
    await admitPublicRequest(request,env,'auth_login');
    const returnTo = url.searchParams.get('returnTo') ?? '/blog/editor';
    if(!/^\/(?:blog\/editor|oauth\/authorize)(?:\?|$)/.test(returnTo)) throw new Problem(400,'INVALID_REDIRECT','Return to the editor or OAuth consent screen.');
    const state = secret();
    await env.DB.prepare('INSERT INTO login_states(hash,return_to,expires_at) VALUES(?,?,?)').bind(await hash(state),returnTo,seconds()+600).run();
    const target = new URL('https://github.com/login/oauth/authorize');
    target.search = new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:`${env.SITE_URL}/auth/callback`,scope:'read:user',state}).toString();
    return redirect(target.href,{'set-cookie':`cc_login=${state}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure(env)}`});
  }
  if(url.pathname !== '/auth/callback') throw new Problem(404,'NOT_FOUND','Unknown authentication endpoint.');
  const state = url.searchParams.get('state'); const code = url.searchParams.get('code');
  if(!state || state !== cookie(request,'cc_login') || !code) throw new Problem(400,'INVALID_STATE','Login could not be verified. Start again.');
  const saved = await env.DB.prepare('DELETE FROM login_states WHERE hash=? AND expires_at>? RETURNING return_to').bind(await hash(state),seconds()).first<{return_to:string}>();
  if(!saved) throw new Problem(400,'EXPIRED_STATE','Login expired. Start again.');
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:`${env.SITE_URL}/auth/callback`})});
  const token = await tokenResponse.json() as {access_token?:string};
  if(!token.access_token) throw new Problem(401,'LOGIN_FAILED','GitHub did not complete sign in.');
  const profileResponse = await fetch('https://api.github.com/user',{headers:{authorization:`Bearer ${token.access_token}`,'user-agent':'ClarkCant-Blog',accept:'application/vnd.github+json'}});
  if(!profileResponse.ok) throw new Problem(401,'LOGIN_FAILED','GitHub profile could not be verified.');
  const profile = await profileResponse.json() as {id:number;login:string}; const subject = `github:${profile.id}`;
  if(String(profile.id) === env.OWNER_GITHUB_ID) await env.DB.prepare("INSERT INTO members(subject,name,role) VALUES(?,?,'owner') ON CONFLICT(subject) DO UPDATE SET name=excluded.name").bind(subject,profile.login).run();
  const member = await env.DB.prepare('SELECT role FROM members WHERE subject=? AND active=1').bind(subject).first<{role:Role}>();
  if(!member) throw new Problem(403,'NOT_INVITED','This GitHub account has not been invited to edit the blog.');
  const session = await issueToken(env,subject,scopesFor(member.role),'session',43200);
  return redirect(saved.return_to,{'set-cookie':sessionCookie(session,env)});
}
const escape = (value:string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function validRedirect(value:string) { try { const u=new URL(value); return !u.hash && !u.username && !u.password && (u.protocol==='https:' || (u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))); } catch { return false; } }
export async function oauth(request:Request,env:Environment):Promise<Response> {
  const url = new URL(request.url); const issuer = env.SITE_URL;
  if(url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json({resource:`${issuer}/mcp`,authorization_servers:[issuer],scopes_supported:['blog:read','blog:write','blog:publish']});
  if(url.pathname === '/.well-known/oauth-authorization-server') return json({issuer,authorization_endpoint:`${issuer}/oauth/authorize`,token_endpoint:`${issuer}/oauth/token`,registration_endpoint:`${issuer}/oauth/register`,response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['blog:read','blog:write','blog:publish']});
  if(url.pathname === '/oauth/register' && request.method === 'POST') {
    await admitPublicRequest(request,env,'oauth_register');
    const raw = await requestText(request,5000);
    let data: {redirect_uris?:unknown;client_name?:unknown}; try { data=JSON.parse(raw); } catch { throw new Problem(400,'invalid_client_metadata','Send valid client JSON.'); }
    if(!Array.isArray(data.redirect_uris) || !data.redirect_uris.length || data.redirect_uris.length>5 || !data.redirect_uris.every(v=>typeof v==='string' && validRedirect(v))) throw new Problem(400,'invalid_redirect_uri','Register HTTPS or loopback redirect URIs.');
    const id = crypto.randomUUID(); const name = typeof data.client_name==='string' ? data.client_name.slice(0,100) : 'AI client';
    const created=await env.DB.prepare('INSERT INTO oauth_clients(id,name,redirect_uris,expires_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM oauth_clients)<?').bind(id,name,JSON.stringify(data.redirect_uris),seconds()+oauthClientTtl,oauthClientCapacity).run();
    if(!created.meta.changes) throw new Problem(429,'REGISTRATION_CAPACITY','Too many clients are registered. Try again later.');
    return json({client_id:id,client_name:name,redirect_uris:data.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']},201);
  }
  if(url.pathname === '/oauth/authorize') {
    const fields = request.method === 'POST' ? new URLSearchParams(await requestText(request,10_000)) : url.searchParams;
    const clientId=fields.get('client_id') ?? ''; const redirectUri=fields.get('redirect_uri') ?? ''; const resource=fields.get('resource') ?? '';
    const client=await env.DB.prepare('SELECT name,redirect_uris FROM oauth_clients WHERE id=? AND expires_at>?').bind(clientId,seconds()).first<{name:string;redirect_uris:string}>();
    if(!client || !JSON.parse(client.redirect_uris).includes(redirectUri)) throw new Problem(400,'invalid_request','Client or redirect URI is not registered.');
    if(resource !== `${issuer}/mcp` || fields.get('response_type') !== 'code' || fields.get('code_challenge_method') !== 'S256' || !/^[\w-]{43}$/.test(fields.get('code_challenge') ?? '')) throw new Problem(400,'invalid_request','Use resource /mcp and PKCE S256 with the code response type.');
    let principal:Principal;
    try { principal=await authenticate(request,env); } catch(e) { if(e instanceof Problem && e.status===401 && request.method==='GET') return redirect(`/auth/login?returnTo=${encodeURIComponent(url.pathname+url.search)}`); throw e; }
    const requested=(fields.get('scope') ?? 'blog:read').split(' ').filter(Boolean);
    if(!requested.length || requested.some(s=>!['blog:read','blog:write','blog:publish'].includes(s) || !principal.scopes.includes(s))) throw new Problem(403,'invalid_scope','This account cannot grant the requested scopes.');
    if(request.method==='GET') {
      const hidden=[...fields].filter(([key])=>key!=='decision').map(([k,v])=>`<input type="hidden" name="${escape(k)}" value="${escape(v)}">`).join('');
      return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Connect to ClarkCant</title><link rel="stylesheet" href="/assets/css/tokens.css"><body style="font-family:var(--font-sans);max-width:40rem;margin:10vh auto;padding:2rem;background:var(--bg);color:var(--text)"><h1>Connect ${escape(client.name)}</h1><p>Signed in as ${escape(principal.name)}. This client will receive:</p><ul>${requested.map(s=>`<li>${escape(s)}</li>`).join('')}</ul><form method="post">${hidden}<button name="decision" value="allow">Allow this connection</button> <button name="decision" value="deny">Cancel</button></form></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
    }
    if(request.method!=='POST') throw new Problem(405,'METHOD_NOT_ALLOWED','Use GET or POST.');
    const target=new URL(redirectUri); target.searchParams.set('iss',issuer); if(fields.has('state')) target.searchParams.set('state',fields.get('state')!);
    const decisions=fields.getAll('decision');
    if(decisions.length!==1 || decisions[0]!=='allow') { target.searchParams.set('error','access_denied'); return redirect(target.href); }
    const code=secret();
    await env.DB.prepare('DELETE FROM oauth_codes WHERE rowid IN (SELECT rowid FROM oauth_codes WHERE expires_at<=? LIMIT 100)').bind(seconds()).run();
    const issued=await env.DB.batch([
      env.DB.prepare('UPDATE oauth_clients SET expires_at=? WHERE id=? AND expires_at>?').bind(seconds()+oauthClientTtl,clientId,seconds()),
      env.DB.prepare('INSERT INTO oauth_codes(hash,client_id,redirect_uri,challenge,subject,scopes,resource,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(await hash(code),clientId,redirectUri,fields.get('code_challenge'),principal.subject,JSON.stringify(requested),resource,seconds()+300),
    ]);
    if(!(issued[0] as {meta?:{changes?:number}}|undefined)?.meta?.changes) throw new Problem(400,'invalid_request','Client registration expired. Register again.');
    target.searchParams.set('code',code); return redirect(target.href);
  }
  if(url.pathname === '/oauth/token' && request.method==='POST') {
    const fields=new URLSearchParams(await requestText(request,10_000)); const verifier=fields.get('code_verifier') ?? '';
    if(fields.get('grant_type')!=='authorization_code' || !/^[\w.~-]{43,128}$/.test(verifier)) return json({error:'invalid_grant'},400);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    const challenge=btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const saved=await env.DB.prepare('DELETE FROM oauth_codes WHERE hash=? AND client_id=? AND redirect_uri=? AND challenge=? AND resource=? AND expires_at>? AND client_id IN (SELECT id FROM oauth_clients WHERE expires_at>?) RETURNING subject,scopes').bind(await hash(fields.get('code') ?? ''),fields.get('client_id'),fields.get('redirect_uri'),challenge,fields.get('resource'),seconds(),seconds()).first<{subject:string;scopes:string}>();
    if(!saved) return json({error:'invalid_grant'},400);
    const member=await env.DB.prepare('SELECT role FROM members WHERE subject=? AND active=1').bind(saved.subject).first<{role:Role}>();
    if(!member) return json({error:'invalid_grant'},400);
    const scopes=(JSON.parse(saved.scopes) as string[]).filter(s=>scopesFor(member.role).includes(s));
    return json({access_token:await issueToken(env,saved.subject,scopes,'oauth'),token_type:'Bearer',expires_in:3600,scope:scopes.join(' ')});
  }
  throw new Problem(404,'NOT_FOUND','Unknown OAuth endpoint.');
}
