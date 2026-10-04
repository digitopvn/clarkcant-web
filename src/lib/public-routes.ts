import { ContentService } from './content-service.ts';
import { authenticate } from './auth.ts';
import { articlePage, indexPage, editorPage, escape, pathFor } from './html.ts';
import { markdown, type Locale } from './document.ts';
import { Problem, type Environment } from './platform.ts';

const response=(value:string,type='text/html',privatePage=false)=>new Response(value,{headers:{'content-type':`${type}; charset=utf-8`,'cache-control':privatePage?'private, no-store':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin',...(type==='text/html'?{'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"}:{})}});
export async function publicRoute(request:Request,env:Environment):Promise<Response|null> {
  const url=new URL(request.url); const path=url.pathname;
  if(request.method!=='GET' && request.method!=='HEAD') return null;
  const service=new ContentService(env.DB);
  if(path==='/blog' || path==='/vi/blog') return new Response(null,{status:308,headers:{location:path+'/'+url.search}});
  if(path==='/robots.txt') return response(`User-agent: *\nAllow: /\nDisallow: /blog/editor\nDisallow: /blog/preview/\nDisallow: /api/\nDisallow: /auth/\nDisallow: /oauth/\nSitemap: ${env.SITE_URL}/sitemap.xml\n`,'text/plain');
  if(path==='/sitemap.xml') return response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${env.SITE_URL}/site-sitemap.xml</loc></sitemap><sitemap><loc>${env.SITE_URL}/blog/sitemap.xml</loc></sitemap></sitemapindex>`,'application/xml');
  if(path==='/blog/editor') { try { await authenticate(request,env); } catch(e) { if(e instanceof Problem && e.status===401) return new Response(null,{status:302,headers:{location:'/auth/login','cache-control':'no-store'}}); throw e; } return response(editorPage(),'text/html',true); }
  if(path.startsWith('/blog/preview/')) { await authenticate(request,env); const article=await service.get(path.slice('/blog/preview/'.length)); return response(articlePage(article,url.searchParams.get('locale')==='vi'?'vi':'en',env.SITE_URL,true),'text/html',true); }
  if(path.startsWith('/media/')) {
    const id=path.slice(7); if(!/^[a-f0-9-]{36}$/.test(id)) throw new Problem(404,'NOT_FOUND','Media not found.');
    // Only assets referenced in a published revision are public. Draft media needs an editor session.
    const published=await env.DB.prepare("SELECT a.id FROM articles a JOIN revisions r ON r.article_id=a.id AND r.revision=a.published_revision WHERE r.document LIKE ? LIMIT 1").bind(`%/media/${id}%`).first();
    if(!published) await authenticate(request,env);
    const object=await env.MEDIA.get(id); if(!object) throw new Problem(404,'NOT_FOUND','Media not found.');
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType ?? 'application/octet-stream','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(path==='/blog/sitemap.xml' || path==='/llms.txt' || path==='/llms-full.txt') {
    const all=[]; for(let offset=0;;offset+=50) {const batch=await service.list(true,50,offset); all.push(...batch); if(batch.length<50) break;}
    if(path.endsWith('.xml')) return response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${all.flatMap(a=>(['en','vi'] as Locale[]).map(l=>`<url><loc>${env.SITE_URL+pathFor(l,a.slug)}</loc><lastmod>${a.updated_at}</lastmod></url>`)).join('')}</urlset>`,'application/xml');
    if(path==='/llms.txt') return response(`# ClarkCant technical blog\n\nPublic articles, in English and Vietnamese. Markdown includes the text alternatives and underlying data for interactive blocks.\n\n${all.flatMap(a=>(['en','vi'] as Locale[]).map(l=>`- [${a[l].title}](${env.SITE_URL+pathFor(l,a.slug)}.md): ${a[l].description}`)).join('\n')}\n`,'text/plain');
    const docs=[]; for(const entry of all) {const a=await service.get(entry.id,true); for(const l of ['en','vi'] as Locale[]) docs.push(markdown(a.document,l,env.SITE_URL+pathFor(l,a.slug),a.updated_at));} return response(docs.join('\n---\n'),'text/plain');
  }
  const match=path.match(/^\/(vi\/)?blog\/(.*)$/); if(!match) return null;
  const locale:Locale=match[1]?'vi':'en'; const slug=match[2];
  if(!slug) {const page=Number(url.searchParams.get('page') ?? 1);if(!Number.isSafeInteger(page)||page<1||page>10000)throw new Problem(400,'INVALID_PAGE','Use a positive page number.');const rows=await service.list(true,21,(page-1)*20);return response(indexPage(rows.slice(0,20),locale,env.SITE_URL,page,rows.length>20));}
  if(slug==='feed.xml') { const rows=await service.list(true,50); return response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ClarkCant</title><link>${env.SITE_URL+pathFor(locale)}</link><description>Engineering notes</description><language>${locale}</language>${rows.map(a=>`<item><title>${escape(a[locale].title)}</title><link>${env.SITE_URL+pathFor(locale,a.slug)}</link><guid>${env.SITE_URL+pathFor(locale,a.slug)}</guid><description>${escape(a[locale].description)}</description><pubDate>${new Date(a.updated_at).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`,'application/rss+xml'); }
  const isMarkdown=slug.endsWith('.md'); const article=await service.getBySlug(isMarkdown?slug.slice(0,-3):slug);
  return isMarkdown?response(markdown(article.document,locale,env.SITE_URL+pathFor(locale,article.slug),article.updated_at),'text/markdown'):response(articlePage(article,locale,env.SITE_URL));
}
