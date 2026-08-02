# Should I Buy This?

A mobile-first Progressive Web App that compares the real delivered cost, arrival time, fit, and purchase risk before recommending whether to buy, wait, or skip.

## Version 1

- Personal, shared, work, and custom profiles
- Product intake by link, screenshot, or search terms
- Overall, Compare, Fit, and Risk assessment tabs
- Delivered-price and shipping comparisons
- Product-match confidence labels
- Saved spaces and measurements
- Weighted scoring with risk overrides
- Installable PWA with share-target support where available
- Cloudflare Workers and Workers AI integration

## Local development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

The app is configured through `wrangler.jsonc` for Cloudflare Workers Static Assets and a Workers AI binding named `AI`.

See `docs/PRODUCT_SPEC.md` and `docs/TECHNICAL_HANDOFF.md` for product decisions, limitations, and implementation details.
