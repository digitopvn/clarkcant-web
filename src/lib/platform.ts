export interface Statement { bind(...values: unknown[]): Statement; first<T = Record<string, unknown>>(): Promise<T | null>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes?: number } }> }
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export interface Environment { DB: Database; MEDIA: R2Bucket; SITE_URL: string; GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string; OWNER_GITHUB_ID?: string }
export type Role = 'owner' | 'editor' | 'publisher';
export interface Principal { subject: string; name: string; role: Role; scopes: string[] }
export class Problem extends Error { constructor(publicStatus: number, code: string, message: string) { super(message); this.status = publicStatus; this.code = code; } status: number; code: string; }
export const json = (data: unknown, status = 200, headers: Record<string,string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const now = () => new Date().toISOString();
export const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2,'0')).join('');
export const secret = () => crypto.randomUUID() + crypto.randomUUID();
export function requireScope(principal: Principal, scope: string) { if (!principal.scopes.includes(scope)) throw new Problem(403,'FORBIDDEN',`This connection needs ${scope}. Existing content was preserved.`); }
export async function requestBytes(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Problem(413,'TOO_LARGE','Request body is too large.');
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (reader) for (;;) { const {done,value} = await reader.read(); if(done) break; size += value.byteLength; if(size > maxBytes) { await reader.cancel(); throw new Problem(413,'TOO_LARGE','Request body is too large.'); } chunks.push(value); }
  const data = new Uint8Array(size); let offset = 0; for(const c of chunks) { data.set(c,offset); offset += c.length; }
  return data;
}
export async function requestText(request: Request, maxBytes: number) {
  return new TextDecoder().decode(await requestBytes(request,maxBytes));
}
export async function body(request: Request, maxBytes = 1_000_000) {
  try { return JSON.parse(await requestText(request,maxBytes)); } catch(e) { if(e instanceof Problem) throw e; throw new Problem(400,'INVALID_JSON','Send a valid JSON object.'); }
}
