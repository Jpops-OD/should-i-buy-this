import phaseThreeWorker from './phase3-1';
import { handleResearch, type ResearchEnv } from './research';

type Env = ResearchEnv & {
  ASSETS: Fetcher;
  AI: any;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/api/research' && request.method === 'POST') {
      return handleResearch(request, env, ctx);
    }
    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'should-i-buy-this',
        phase: 4,
        costModel: 'no-cost-only',
        intake: ['link', 'search', 'screenshot'],
        retailerResearch: 'user-supplied listing verification',
        screenshotReading: 'Cloudflare Workers AI free allowance',
      });
    }
    return phaseThreeWorker.fetch(request, env);
  },
};
