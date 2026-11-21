import { connect, joinErrorText } from './net/connection';
import { applyCssTheme } from './theme';
import { AnnounceBanner } from './ui/announce';
import { Dialog } from './ui/dialog';
import { loadFonts } from './ui/fonts';
import { isTouchDevice } from './ui/dom';
import { askEntry, rememberEntry } from './ui/start';
import './ui/ui.css';

applyCssTheme();
// 도트 글꼴을 읽기 시작한다. 첫 화면은 기다리지 않고 띄우고(글꼴이 오면 바뀐다),
// 게임 화면은 다 읽은 뒤 시작한다(Phaser 글자는 만들 때의 글꼴로 그려진다).
const fonts = loadFonts();
// 기본은 three.js 3D 화면(src/three/, 2026-11-22 교사 결정). 주소 끝에 ?view=2d를 붙일 때만 Phaser 2D 화면(src/view2d.ts).
// 두 화면은 따로 나눠 읽어, 한쪽 화면이 다른 쪽 라이브러리를 받지 않게 한다.
// 첫 화면을 띄우는 동안 고른 화면의 코드를 미리 받아 둔다(들어가기를 누른 뒤 기다리지 않게).
const view2d = new URLSearchParams(location.search).get('view') === '2d';
const view = view2d ? import('./view2d') : import('./three/view3d');

const net = await askEntry(connect, joinErrorText);
// 끊겨서 첫 화면으로 돌아오면 다시 채워 두도록 방 코드·닉네임을 기억한다(비밀번호는 기억하지 않는다).
rememberEntry(net.role, net.nickname, net.code);
// 같은 닉네임으로 다시 들어와 하던 것을 이어 받았으면 짧게 알리고, 학교 맵이면 있던 자리에 선다.
const resumed = await net.wasResumed();
await fonts;
const dialog = new Dialog();
// 선생님 전체 공지. 학교 맵·골든벨 맵을 옮겨도 이어지게 장면 밖에 둔다.
const announceBanner = new AnnounceBanner();
net.onAnnounce((m) => announceBanner.show(m.text));
if (resumed) announceBanner.show('하던 것을 이어서 합니다.', '다시 들어왔습니다');

// 다시 붙기를 끝내 못 하면 처음 화면으로 돌아가게 한다. 선생님이 방을 닫았으면(다시 붙지 않음) 그 안내를 띄운다.
net.onStatus((status) => {
  if (status !== 'closed') return;
  if (dialog.isOpen()) dialog.abandon();
  const closed = net.closedText;
  void (
    closed
      ? dialog.message('방이 닫혔습니다', `${closed} 확인을 누르면 처음 화면으로 갑니다.`)
      : dialog.message('연결이 끊겼습니다', '서버와 연결이 끊겼습니다. 다시 들어가기를 누르면 처음 화면으로 갑니다.', '다시 들어가기')
  ).then(() => location.reload());
});

const loaded = await view;
if ('start3d' in loaded) await loaded.start3d({ net, dialog, touch: isTouchDevice(), resumed });
else loaded.start2d({ net, dialog, resumed });
