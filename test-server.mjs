import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

createServer(async (request, response) => {
  const requested = request.url === "/" ? "/index.html" : request.url;
  const path = normalize(join(root, requested));
  if (!path.startsWith(root)) return response.end("Not found");
  try {
    response.setHeader("Content-Type", `${types[extname(path)] || "text/plain"}; charset=utf-8`);
    response.end(await readFile(path));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}).listen(8000);
