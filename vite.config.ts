import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Tailscale serve(https://<기기>.<망>.ts.net)로 맥·태블릿에서 열 수 있게 한다.
    allowedHosts: ['.ts.net'],
  },
});
