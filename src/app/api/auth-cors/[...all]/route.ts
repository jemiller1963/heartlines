import 'server-only';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

const { GET: innerGET, POST: innerPOST } = toNextJsHandler(auth);

const ALLOWED_ORIGINS = new Set([
  'https://heart-lines.polsia.io',
  'https://heart-lines.polsia.app',
]);

function withCors(res: Response, origin: string | null): Response {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return res;
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cookie, X-Better-Auth-*',
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rewriteAuthUrl(req: NextRequest): NextRequest {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api\/auth-cors\//, '/api/auth/');
  const inner: RequestInit & { duplex: 'half' } = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    duplex: 'half',
  };
  return new NextRequest(new Request(url, inner));
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new Response(null, { status: 204 }), req.headers.get('origin'));
}

export async function GET(req: NextRequest) {
  const res = await innerGET(rewriteAuthUrl(req));
  return withCors(res, req.headers.get('origin'));
}

export async function POST(req: NextRequest) {
  const res = await innerPOST(rewriteAuthUrl(req));
  return withCors(res, req.headers.get('origin'));
}
