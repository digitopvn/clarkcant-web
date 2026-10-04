import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { operations, execute, type Operation } from './operations.ts';
import { ContentService } from './content-service.ts';
import { Problem, requestBytes, type Environment, type Principal } from './platform.ts';

function errorContent(error:unknown) {
  const code=error instanceof Problem?error.code:'INVALID_INPUT';
  const message=error instanceof Problem?error.message:error instanceof z.ZodError?error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '):'Operation failed';
  return {isError:true as const,content:[{type:'text' as const,text:JSON.stringify({code,message})}]};
}

export async function mcp(request:Request,env:Environment,principal:Principal) {
  const origin=request.headers.get('origin');
  if(origin && origin!==env.SITE_URL) throw new Problem(403,'ORIGIN_REJECTED','Cross-origin browser MCP requests are not allowed.');
  const server=new McpServer({name:'clarkcant-blog',version:'1.0.0'});
  const service=new ContentService(env.DB);
  for(const [name,operation] of Object.entries(operations)) {
    if(!principal.scopes.includes(operation.scope)) continue;
    server.registerTool(name,{description:operation.description,inputSchema:operation.schema,annotations:{readOnlyHint:operation.scope==='blog:read'||name==='validate_article',destructiveHint:name==='unpublish_article',openWorldHint:false}},async (input:unknown)=>{
      try { const data=await execute(service,principal,name as Operation,input); return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{data}}; }
      catch(error) { return errorContent(error); }
    });
  }
  const transport=new WebStandardStreamableHTTPServerTransport({enableJsonResponse:true});
  await server.connect(transport);
  try {
    const boundedRequest=new Request(request.url,{method:request.method,headers:request.headers,body:request.body?await requestBytes(request,1_000_000):null});
    return await transport.handleRequest(boundedRequest);
  } finally { await server.close(); }
}
