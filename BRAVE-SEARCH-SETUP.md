# Phase 4 retailer search setup

The application can confirm a submitted source without this connection, but it needs a web-search provider to discover other retailer listings.

## One-time setup

1. Create a Brave Search API account.
2. Subscribe to the Search plan and create an API key.
3. In Cloudflare, open the `should-i-buy-this` Worker.
4. Open **Settings → Variables and Secrets**.
5. Add an encrypted secret named exactly:

   `BRAVE_SEARCH_API_KEY`

6. Paste the Brave Search API key as the value and save it.
7. Redeploy the current Worker if Cloudflare does not redeploy automatically.

Do not place the key in this repository, a browser-side environment variable, or a chat message.

## What the app does with it

The Worker searches for candidate public retailer pages using the confirmed model, SKU, brand, title, and variant. It then opens candidate pages itself and verifies the product identity and visible price. Search snippets are never treated as verified prices.

Research results are cached at the Cloudflare edge for 15 minutes to reduce duplicate searches and provider usage.
