#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
const args=process.argv.slice(2);
const help='Usage: pnpm cli <operation> [--file input.json] [--url https://clarkcant.cc] [--api-key token]\nOperations: list_articles, get_article, get_block_catalog, validate_article, save_article, publish_article, unpublish_article, article_history\nReads JSON from stdin when --file is absent; empty input is {}. Token: --api-key or CLARKCANT_BLOG_TOKEN. Outputs JSON only; failures exit nonzero. Credentials are never persisted.';
if(!args.length || args.includes('--help')) { console.log(help); process.exit(0); }
const operation=args.shift(); const options={};
for(let i=0;i<args.length;i+=2) { if(!['--file','--url','--api-key'].includes(args[i]) || !args[i+1]) { console.error(help); process.exit(2); } options[args[i]]=args[i+1]; }
try {
  const token=options['--api-key'] ?? process.env.CLARKCANT_BLOG_TOKEN;
  if(!token) throw Error('Set CLARKCANT_BLOG_TOKEN or pass --api-key.');
  const site=new URL(options['--url'] ?? 'https://clarkcant.cc');
  if(site.protocol!=='https:' && !(site.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(site.hostname))) throw Error('Use HTTPS outside loopback.');
  let input=''; if(options['--file']) input=await readFile(options['--file'],'utf8'); else if(!process.stdin.isTTY) for await(const chunk of process.stdin) input+=chunk;
  const response=await fetch(new URL(`/api/blog/${encodeURIComponent(operation)}`,site),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(JSON.parse(input || '{}')),redirect:'error'});
  const result=await response.json(); console.log(JSON.stringify(result,null,2)); if(!response.ok) process.exitCode=1;
} catch(error) { console.error(JSON.stringify({error:{code:'CLI_ERROR',message:error.message}})); process.exitCode=1; }
