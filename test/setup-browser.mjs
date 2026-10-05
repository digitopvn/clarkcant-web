import { mkdir,writeFile } from 'node:fs/promises';
import { randomUUID,createHash } from 'node:crypto';
const token=randomUUID()+randomUUID();const digest=createHash('sha256').update(token).digest('hex');
// One file per run: cf records applied seeds, so a fresh name re-seeds an existing local D1.
await mkdir('test-results/setup',{recursive:true});
await writeFile('test-results/access.json',JSON.stringify({token}));
await writeFile(`test-results/setup/${Date.now()}.sql`,`INSERT OR REPLACE INTO members(subject,name,role,active) VALUES('github:browser-test','Browser test editor','owner',1);\nINSERT INTO tokens(hash,subject,scopes,expires_at,kind,audience) VALUES('${digest}','github:browser-test','["blog:read","blog:write","blog:publish","blog:admin"]',${Math.floor(Date.now()/1000)+7200},'session','http://127.0.0.1:4322/mcp');\n`);
