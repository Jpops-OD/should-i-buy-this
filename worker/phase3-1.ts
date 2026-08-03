import baseWorker from './index';
import { handleVisualSearch } from './visual-search';

type Env = {
  ASSETS: Fetcher;
  AI: any;
  GOOGLE_CLOUD_VISION_API_KEY?: string;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/api/visual-search' && request.method === 'POST') {
      return handleVisualSearch(request, env);
    }
    return baseWorker.fetch(request, env, ctx);
  },
};
