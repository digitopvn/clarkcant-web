import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { api } from '../lib/api.ts';
import type { Environment } from '../lib/platform.ts';
export const ALL: APIRoute = ({request}) => api(request,env as unknown as Environment);
