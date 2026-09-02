import { createServer, type Server } from "node:http";

const page = `<!doctype html><main><input data-testid="email"><input data-testid="password"><button data-testid="login">Login</button><section data-testid="dashboard" hidden>Dashboard</section></main><script>document.querySelector('[data-testid=login]').onclick=()=>document.querySelector('[data-testid=dashboard]').hidden=false</script>`;
export async function startLoginFixture({ host, port, publicHost }: { host: string; port: number; publicHost: string }) {
  const server = createServer((_request, response) => response.writeHead(200, { "content-type": "text/html" }).end(page));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  return { server: server as Server, baseUrl: `http://${publicHost}:${port}` };
}
