import baseWorker from './index';

type Env = {
  ASSETS: Fetcher;
  AI: any;
};

export default {
  async fetch(request: Request, env: Env) {
    return baseWorker.fetch(request, env);
  },
};
