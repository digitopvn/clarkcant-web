import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { articleFixture } from '../article-fixture.mjs';
const {token}=JSON.parse(readFileSync('test-results/access.json','utf8'));
test.beforeEach(async({context})=>{await context.addCookies([{name:'cc_blog_session',value:token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);});
test('editor creates both translations, saves, publishes, reads widgets and survey, and restores',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/blog/editor');await expect(page.getByText('Your workspace is ready.')).toBeVisible();
 await page.getByRole('button',{name:'New article',exact:true}).click();const slug=`browser-${Date.now()}`;
 await page.getByLabel('Slug',{exact:true}).fill(slug);await page.getByLabel('Title',{exact:true}).fill('Browser authored article');await page.getByLabel('Description',{exact:true}).fill('An article created through the visual editor.');
 await page.getByRole('button',{name:'Add block',exact:true}).click();await page.getByLabel('Text',{exact:true}).fill('Created without editing a document JSON file.');
 await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('vi');await page.getByLabel('Title',{exact:true}).fill('Bài viết từ trình biên tập');await page.getByLabel('Description',{exact:true}).fill('Bài viết được tạo bằng giao diện trực quan.');await page.getByRole('button',{name:'Add block',exact:true}).click();await page.getByLabel('Text',{exact:true}).fill('Không cần chỉnh sửa tệp JSON.');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved revision 1');await page.getByRole('button',{name:'Publish EN + VI'}).click();await expect(page.getByRole('status')).toContainText('published');
 await page.getByLabel('Title',{exact:true}).fill('Bản sửa mới');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved revision 2');await page.getByRole('button',{name:'Publish EN + VI'}).click();await expect(page.getByRole('status')).toContainText('revision 2');await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Restore publication'}).last().click();await expect(page.getByRole('status')).toContainText('revision 1 restored');
 await page.goto(`/blog/${slug}`);await expect(page.getByRole('heading',{level:1})).toHaveText('Browser authored article');await page.getByRole('link',{name:'Tiếng Việt',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Bài viết từ trình biên tập');
 const saved=await page.request.post('/api/blog/save_article',{headers:{origin:'http://127.0.0.1:4322'},data:{slug:`widgets-${Date.now()}`,expectedRevision:0,document:articleFixture,key:crypto.randomUUID()}});expect(saved.ok()).toBeTruthy();const entry=await saved.json();expect((await page.request.post('/api/blog/publish_article',{headers:{origin:'http://127.0.0.1:4322'},data:{id:entry.id,revision:1,expectedRevision:1}})).ok()).toBeTruthy();
 await page.goto(`/blog/${entry.slug}`);await page.locator('#architecture').scrollIntoViewIfNeeded();await expect(page.locator('[data-widget-host] svg').first()).toBeVisible();
 await page.getByRole('button',{name:'Run experiment'}).click();await expect(page.frameLocator('[data-sandbox-host] iframe').locator('#circle')).toBeVisible();await page.getByRole('button',{name:'Stop',exact:true}).click();await expect(page.locator('[data-sandbox-host] iframe')).toHaveCount(0);
 await page.getByLabel('Both',{exact:true}).check();await page.getByRole('button',{name:'Send response'}).click();await expect(page.locator('[data-survey] [role=status]')).toHaveText('Response saved. Thank you.');
 const md=await page.request.get(`/blog/${entry.slug}.md`);expect(await md.text()).toContain('The document provides validated properties');
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:`test-results/article-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
 const browser=context.browser()!;const noJs=await browser.newContext({javaScriptEnabled:false});const plain=await noJs.newPage();await plain.goto(`http://127.0.0.1:4322/blog/${entry.slug}`);await expect(plain.getByText('The document provides validated properties.',{exact:false})).toBeVisible();await noJs.close();
 await page.goto('/blog/editor');await page.getByRole('button',{name:'Edit',exact:true}).first().click();await page.getByRole('combobox',{name:'Widget',exact:true}).selectOption('canvas.line@1');await expect(page.getByRole('status')).toContainText('Unsaved changes');await page.getByRole('button',{name:'Preview saved'}).click();await expect(page.getByRole('status')).toContainText('Save your draft first');
 expect(errors).toEqual([]);
});
test('draft HTML and markdown are private and preview stays no-store',async({page,browser})=>{
 const saved=await page.request.post('/api/blog/save_article',{headers:{origin:'http://127.0.0.1:4322'},data:{slug:`private-${Date.now()}`,expectedRevision:0,document:articleFixture,key:crypto.randomUUID()}});const entry=await saved.json();
 const unauth=await browser.newContext();const client=unauth.request;expect((await client.get(`http://127.0.0.1:4322/blog/${entry.slug}.md`)).status()).toBe(404);expect((await client.get(`http://127.0.0.1:4322/blog/preview/${entry.id}`)).status()).toBe(401);const preview=await page.request.get(`/blog/preview/${entry.id}`);expect(preview.headers()['cache-control']).toContain('no-store');await unauth.close();
});

test('uploaded images become public only when published; CLI uses scoped API access',async({page,browser})=>{
 const origin='http://127.0.0.1:4322';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 const uploaded=await page.request.post('/api/blog/media',{headers:{origin,'content-type':'image/png'},data:png});expect(uploaded.status()).toBe(201);const media=await uploaded.json();
 const anonymous=await browser.newContext();expect((await anonymous.request.get(origin+media.src)).status()).toBe(401);
 const doc=structuredClone(articleFixture);doc.hero=media.src;const saved=await page.request.post('/api/blog/save_article',{headers:{origin},data:{slug:`media-${Date.now()}`,expectedRevision:0,document:doc,key:crypto.randomUUID()}});const article=await saved.json();
 expect((await page.request.post('/api/blog/publish_article',{headers:{origin},data:{id:article.id,revision:1,expectedRevision:1}})).ok()).toBeTruthy();expect((await anonymous.request.get(origin+media.src)).status()).toBe(200);await anonymous.close();
 const issued=await page.request.post('/api/blog/tokens',{headers:{origin},data:{scopes:['blog:read'],days:1}});const credentials=await issued.json();
 const result=JSON.parse(execFileSync(process.execPath,['scripts/blog-cli.mjs','get_article','--url',origin],{input:JSON.stringify({id:article.id}),encoding:'utf8',env:{...process.env,CLARKCANT_BLOG_TOKEN:credentials.token}}));expect(result.id).toBe(article.id);
 const denied=await page.request.post('/api/blog/publish_article',{headers:{authorization:`Bearer ${credentials.token}`},data:{id:article.id,revision:1,expectedRevision:1}});expect(denied.status()).toBe(403);
});

