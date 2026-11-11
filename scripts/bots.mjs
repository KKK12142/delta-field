// 선생님이 만든 방에 가짜 학생(봇)만 넣는다. 학생이 많을 때 화면이 끊기지 않는지 실제 컴퓨터·태블릿에서 눈으로 볼 때 쓴다.
// 봇은 학교 맵의 바닥 칸 아무 데로나 쉬지 않고 돌아다니고, 골든벨이 시작되면 답 구역을 하나 골라 걸어간다. 정한 시간이 지나면 방에서 나간다.
// 학생으로 들어가므로 선생님 비밀번호는 필요 없다.
// 사용: pnpm bots <방 코드> [봇 수] [분] [게임 서버 주소]   기본값: 34명, 5분, http://localhost:2567
import { Bot, runBots } from './lib/bots.mjs';

const [code, countArg = '34', minutesArg = '5', gameUrl = 'http://localhost:2567'] = process.argv.slice(2);
if (!/^\d{4}$/.test(code ?? '')) {
  console.error('사용: pnpm bots <방 코드 4자리> [봇 수] [분] [게임 서버 주소]');
  process.exit(2);
}
const bots = Array.from({ length: Number(countArg) }, (_, i) => new Bot(i, gameUrl));
const joined = await Promise.allSettled(bots.map((b) => b.join(code)));
const live = bots.filter((b) => b.room);
const failed = joined.filter((r) => r.status === 'rejected');
console.log(`봇 ${live.length}명이 방 ${code}에 들어갔습니다.${failed.length ? ` 들어가지 못한 봇 ${failed.length}명: ${failed[0].reason?.message ?? failed[0].reason}` : ''}`);
if (!live.length) process.exit(1);
for (const b of live) b.wander = true;
const stop = runBots(live);

const end = async () => {
  stop();
  await Promise.allSettled(live.map((b) => b.room.leave()));
  console.log('봇이 모두 방에서 나갔습니다.');
  process.exit(0);
};
process.on('SIGINT', end);
process.on('SIGTERM', end);
setTimeout(end, Number(minutesArg) * 60 * 1000);
console.log(`${minutesArg}분 뒤에 나갑니다(Ctrl+C로 바로 끝낼 수 있습니다).`);
