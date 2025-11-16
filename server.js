import express from "express";
import fetch from "node-fetch";
import http from "http";
import https from "https";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.get("/", async (req, res) => {
  try {
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: "Missing 'id' query parameter." });
    }

    // Target IPTV URL
    const targetUrl = `http://opplex.rw:8080/live/5271013629/08236261/${id}.m3u8`;

    const agent = targetUrl.startsWith("https")
      ? new https.Agent({ keepAlive: true })
      : new http.Agent({ keepAlive: true });

    const response = await fetch(targetUrl, {
      redirect: "follow",
      agent,
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to fetch data from upstream.",
      });
    }

    const finalUrl = response.url;
    const domain = new URL(finalUrl).origin;
    const text = await response.text();

    // Modify TS/HLS paths to absolute URLs
    const modified = text
      .split("\n")
      .map((line) => {
        if ((line.includes("/hls/") || line.endsWith(".ts")) && !line.startsWith("http")) {
          return `${domain}${line}`;
        }
        return line;
      })
      .join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "public, max-age=10");
    res.send(modified);
  } catch (err) {
    console.error("Error in Render M3U8 server:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
