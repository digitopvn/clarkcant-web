import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
for (const name of ['index.html', '404.html', 'assets', 'docs', 'vi']) {
  await cp(name, `public/${name}`, { recursive: true });
}
const pages=['/','/blog/','/vi/blog/'];
for(const directory of ['docs','vi/docs']) for(const file of await readdir(directory)) if(file.endsWith('.html'))pages.push(`/${directory}/${file==='index.html'?'':file}`);
await writeFile('public/site-sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(path=>`<url><loc>https://clarkcant.cc${path}</loc></url>`).join('')}</urlset>`);
