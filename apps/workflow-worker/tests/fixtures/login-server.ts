import { createServer, type Server } from "node:http";

const loginPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Login fixture</title></head>
<body>
  <main>
    <h1>Sign in</h1>
    <label>Email <input data-testid="email" name="email" type="email" /></label>
    <label>Password <input data-testid="password" name="password" type="password" /></label>
    <button data-testid="login" type="button">Sign in</button>
    <section data-testid="dashboard" hidden>Welcome to the dashboard</section>
  </main>
  <script>
    document.querySelector('[data-testid="login"]').addEventListener('click', () => {
      document.querySelector('[data-testid="dashboard"]').hidden = false;
    });
  </script>
</body></html>`;

export async function startLoginFixture({ host, port, publicHost = "workflow-acceptance" }: { host: string; port: number; publicHost?: string }): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture");
    if (url.pathname !== "/login") {
      response.writeHead(404).end("Not found");
      return;
    }
    const delay = Number(url.searchParams.get("delay") ?? "0");
    setTimeout(() => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(loginPage);
    }, Number.isFinite(delay) && delay > 0 ? delay : 0);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return { server, baseUrl: `http://${publicHost}:${port}` };
}
