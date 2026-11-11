import { defineConfig } from 'vite';

// 포트는 보통 화면 5173, 게임 서버 2567이다. 공유 중인 서버를 그대로 둔 채 확인용 서버를 따로 켤 때만
// DF_WEB_PORT, DF_PORT로 바꾼다(게임 서버도 DF_PORT를 쓴다).
const webPort = Number(process.env.DF_WEB_PORT ?? 5173);
const gamePort = Number(process.env.DF_PORT ?? 2567);

export default defineConfig({
  server: {
    port: webPort,
    strictPort: true,
    // Tailscale serve(https://<기기>.<망>.ts.net)로 맥·태블릿에서 열 수 있게 한다.
    allowedHosts: ['.ts.net'],
    // 게임 서버(pnpm dev:server)로 넘긴다. 수업용(pnpm start)에서는 서버가 화면까지 함께 내어 준다.
    proxy: {
      '/colyseus': {
        target: `http://127.0.0.1:${gamePort}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
});
