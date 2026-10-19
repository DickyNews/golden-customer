// Fixed-origin proxy for the customer API.
// When deployed on Cloudflare Pages, browser requests use the same origin
// as the customer site, so Safari does not need a third-party API cookie.
export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  const upstream = new URL("https://103-235-74-92.sslip.io");

  upstream.pathname = incoming.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  upstream.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const forwardedRequest = new Request(upstream.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });

  // Pass upstream headers (including Set-Cookie) through to the browser.
  const upstreamResponse = await fetch(forwardedRequest);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("access-control-allow-origin");
  responseHeaders.delete("access-control-allow-credentials");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}
