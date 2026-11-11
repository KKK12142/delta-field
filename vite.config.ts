import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Tailscale serve(https://<기기>.<망>.ts.net)로 맥·태블릿에서 열 수 있게 한다.
    allowedHosts: ['.ts.net'],
    // 게임 서버(pnpm dev:server, 포트 2567)로 넘긴다. 수업용(pnpm start)에서는 서버가 화면까지 함께 내어 준다.
    proxy: {
      '/colyseus': {
        target: 'http://127.0.0.1:2567',
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
});
