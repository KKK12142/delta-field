// Delta Field 서버. 실행: pnpm start(수업용, 게임 화면까지 함께 내어 줌) / pnpm dev:server(개발용)
// 선생님 비밀번호는 저장소 맨 위의 .env 파일에 DF_TEACHER_PASSWORD=... 로 넣는다(.env는 저장소에 올라가지 않는다).
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { ROOM_NAME } from '../shared/protocol.ts';
import { ClassRoom } from './ClassRoom.ts';

const port = Number(process.env.DF_PORT ?? 2567);
const production = process.env.NODE_ENV === 'production';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

if (!process.env.DF_TEACHER_PASSWORD) {
  console.warn('선생님 비밀번호(DF_TEACHER_PASSWORD)가 없어 방을 만들 수 없습니다. .env 파일에 넣고 다시 켭니다.');
}

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  // 수업용으로 켤 때는 빌드한 게임 화면(dist/)도 이 서버가 내어 준다.
  express: production
    ? (app) => {
        app.use(express.static(dist));
      }
    : undefined,
});
server.define(ROOM_NAME, ClassRoom);
await server.listen(port);

console.log(`Delta Field 서버를 켰습니다(포트 ${port}).`);
if (production) {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}:${port}`);
  console.log('학생 접속 주소:', addresses.length ? addresses.join('  ') : '(네트워크에 연결되어 있지 않습니다)');
}
