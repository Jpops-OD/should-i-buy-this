# Should I Buy This?

React + TypeScript web app deployed through Cloudflare Workers.

## What GitHub and Cloudflare do

- GitHub stores the code.
- Cloudflare builds the code and publishes the live website.

## Local development

```bash
npm install
npm run dev
```

## Cloudflare deployment

Connect this repository directly in Cloudflare Workers & Pages.

- Repository: `Jpops-OD/should-i-buy-this`
- Production branch: `main`
- Root directory: leave blank
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

No settings from the recognition app should be reused.
