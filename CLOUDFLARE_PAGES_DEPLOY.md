# Deploy customer website with same-origin API proxy

This repository can be deployed to Cloudflare Pages to avoid relying on third-party cookies between GitHub Pages and the API.

## Cloudflare Pages setup

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application** → **Pages** → **Connect to Git**.
3. Select the GitHub repository `DickyNews/golden-customer` and branch `main`.
4. For a plain static HTML site, leave the build command empty and set the build output directory to `/` (repository root). Do not set a framework preset that expects a build.
5. Deploy and use the assigned `*.pages.dev` URL to open the customer website.

The frontend automatically selects same-origin `/api` when served from a `*.pages.dev` hostname. The Pages Function in `functions/api/[[path]].js` forwards those requests to the existing VPS API and passes the session cookie through. On `dickynews.github.io`, the existing direct API URL remains in use.

## Important

- Do not delete or disable the existing GitHub Pages site until the Cloudflare Pages deployment has been opened and reviewed.
- The VPS API, Nginx configuration, Golden engine, and database are not changed by this repository setup.
- After deployment, use the `pages.dev` URL for customer login so browser requests go through the same-origin proxy.
- Verify upload-size limits for the chosen Cloudflare plan before relying on large uploads.
