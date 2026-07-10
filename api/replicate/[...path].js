// Vercel serverless function: same-origin proxy to Replicate's API.
// Replicate doesn't set CORS headers for browser calls, so the client hits
// /api/replicate/* (same origin as the app) and this forwards to
// https://api.replicate.com/v1/* with the caller's own Authorization header.
// It's a dumb pass-through — no secrets live here, the user's own Replicate
// token travels in the request exactly as it would with a direct call.

export default async function handler(req, res) {
  const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
  const upstreamUrl = `https://api.replicate.com/v1/${segments.join("/")}`;

  const headers = { "Content-Type": "application/json" };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers.prefer) headers.Prefer = req.headers.prefer;

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  res.send(text);
}
