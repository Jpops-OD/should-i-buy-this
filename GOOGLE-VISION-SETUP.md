# Google image search setup

Phase 3.1 uses Google Cloud Vision Web Detection to find public pages containing the same or a closely matching product image.

## One-time setup

1. Open Google Cloud Console and create or select a personal project.
2. Enable **Cloud Vision API** for that project.
3. Confirm billing is attached to the Google Cloud project.
4. Create an API key under **APIs & Services → Credentials**.
5. Restrict the key to the **Cloud Vision API**. Do not put the key in GitHub or in `wrangler.jsonc`.
6. In Cloudflare, open the `should-i-buy-this` Worker.
7. Open **Settings → Variables and Secrets → Add**.
8. Add an encrypted secret named exactly:

   `GOOGLE_CLOUD_VISION_API_KEY`

9. Paste the Google API key as the value and save it.
10. Redeploy the current `main` branch, or wait for the next GitHub deployment.

The Worker sends the uploaded image directly to Google for the requested visual match. The app does not save the uploaded image in a database or object store.

## Without the secret

The app still deploys. Product links, name/model entry, screenshot text reading, and manual product entry continue to work. The **Search image online** action shows a clear setup message until the secret is added.
