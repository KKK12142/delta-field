// 느린 인터넷 흉내: 받은 TCP 바이트를 양쪽 모두 ms만큼 늦게 넘기는 작은 프록시(패키지 없이 node:net).
// 확인용 화면 서버 앞에 두고 한 학생의 창만 이 포트로 열면 그 학생의 HTTP·웹소켓이 모두 늦게 오간다.
import { createServer, connect } from 'node:net';

/**
 * listenPort로 받아 targetPort(127.0.0.1)로 넘긴다. 순서는 그대로, 바이트마다 ms만큼 늦춘다.
 * setDelay(ms)로 도중에 바꾼다(개발 서버는 화면 파일이 많아, 늦춘 채로 열면 오래 걸린다. 연 뒤에 늦춘다). close()로 끈다.
 */
export function startDelayProxy(listenPort, targetPort, ms = 0) {
  let delay = ms;
  // 늦춤을 바꿔도 순서가 바뀌지 않게, 연결마다 앞 조각이 나간 시각보다 먼저 보내지 않는다.
  const sockets = new Set();
  const server = createServer((client) => {
    const upstream = connect(targetPort, '127.0.0.1');
    for (const s of [client, upstream]) {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
      s.on('error', () => {});
    }
    const pipe = (from, to) => {
      let last = 0;
      const later = (fn) => {
        const at = Math.max(Date.now() + delay, last);
        last = at;
        setTimeout(fn, at - Date.now());
      };
      from.on('data', (chunk) => later(() => to.destroyed || to.write(chunk)));
      from.on('end', () => later(() => to.end()));
      from.on('close', () => later(() => to.destroy()));
    };
    pipe(client, upstream);
    pipe(upstream, client);
  });
  return new Promise((resolve) => {
    server.listen(listenPort, '127.0.0.1', () =>
      resolve({
        setDelay: (next) => {
          delay = next;
        },
        close: () => {
          for (const s of sockets) s.destroy();
          server.close();
        },
      }),
    );
  });
}
