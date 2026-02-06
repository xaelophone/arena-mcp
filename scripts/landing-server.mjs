import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "landing");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

const server = createServer(async (req, res) => {
  try {
    const urlPath = req.url && req.url !== "/" ? req.url : "/index.html";
    const cleanPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.resolve(root, `.${cleanPath}`);
    if (!filePath.startsWith(root)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeByExtension.get(extension) ?? "application/octet-stream";
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? 404 : 500;
    res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
    res.end(code === 404 ? "Not found" : "Internal server error");
  }
});

server.listen(port, () => {
  process.stdout.write(`Landing page running at http://localhost:${port}\n`);
});
