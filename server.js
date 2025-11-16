// server.js
import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

// Utility: send JSON error
function jsonError(res, message, status = 500, extra = {}) {
  res.status(status).json({ error: message, status, ...extra });
}

app.get("/", async (req, res) => {
  // simple health
  res.set("Access-Control-Allow-Origin", "*");
  res.type("text/plain").send("HLS proxy is running");
});

app.get("/proxy", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  const id = req.query.id;
  if (!id) return jsonError(res, "Missing id query parameter", 400);

  // allow clients to pass .m3u8 or id; accept both
  const upstreamPath = id.endsWith(".m3u8") ? id : `${id}.m3u8`;

  // Build upstream URL (adjust to your exact upstream path)
  const targetUrl = `http://opplex.rw/live/5271013629/08236261/${upstreamPath}`;

  try {
    const resp = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      // Send browser-like headers to reduce blocking
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "http://opplex.rw/",
        "Origin": "http://opplex.rw"
      }
    });

    if (!resp.ok) {
      // try to capture upstream body for debugging (trim to 1000 chars)
      const body = await resp.text().catch(() => "");
      return jsonError(res, "Failed to fetch data from upstream.", resp.status, {
        upstream_response: body ? body.slice(0, 1000) : ""
      });
    }

    const finalUrl = resp.url; // actual resolved URL (after redirects)
    const origin = new URL(finalUrl).origin;
    const text = await resp.text();

    // Rewrite relative .ts and /hls/ references to absolute
    const modified = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // If already absolute, leave it
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return line;

        // If it's a comment/tag line, leave it
        if (trimmed.startsWith("#")) return line;

        // If it looks like a .ts or contains /hls/ or ends with .m3u8 (relative sub-playlist)
        if (trimmed.endsWith(".ts") || trimmed.includes("/hls/") || trimmed.endsWith(".m3u8")) {
          // ensure only one slash between origin and trimmed
          const slash = trimmed.startsWith("/") ? "" : "/";
          return `${origin}${slash}${trimmed}`;
        }

        return line;
      })
      .join("\n");

    res.set("Content-Type", "application/vnd.apple.mpegurl");
    // small cache to reduce requests
    res.set("Cache-Control", "public, max-age=10");
    return res.status(200).send(modified);
  } catch (err) {
    console.error("Proxy error:", err);
    return jsonError(res, "Internal proxy error", 500);
  }
});

// Allow CORS preflight
app.options("/proxy", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.sendStatus(204);
});

app.listen(PORT, () => {
  console.log(`HLS proxy listening on port ${PORT}`);
});
