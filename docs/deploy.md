# 수업 서버 올리기(클라우드 기본, 맥은 플랜 B)

## 지금 상태(2026-11-13 올림)
- 학생 접속 주소: https://3-38-62-241.sslip.io (Caddy가 Let's Encrypt 인증서를 받아 https, http는 https로 넘김)
- AWS 계정: 고급 기능을 켠 조직(관리 계정 delta-field-Team Management Account), 서버는 프로젝트 계정 "Delta field".
  - 서울을 쓰려고 SCP AdvancedModeRegionRestrictionSecurityControlPolicy의 RegionFloor에 ap-northeast-2를 더했다(교사가 관리 계정 콘솔에서 고침).
- Lightsail 서울(ap-northeast-2a): 인스턴스 delta-field(Ubuntu 24.04, micro_3_0 1 GB, 월 7달러), 고정 IP delta-field-ip 3.38.62.241, 열린 포트 22·80·443.
- 예산: AWS Budgets delta-field-monthly 월 10달러(실제 50%·100%, 예상 100%에 메일 알림). 고급 기능을 켜면 지출 한도(자동 차단)는 쓸 수 없다.
- 서버 안: 스왑 1 GB, Node 24(/opt/node), pnpm(corepack), Caddy(/etc/caddy/Caddyfile), 저장소 ~/delta-field,
  systemd 서비스 delta-field(NODE_ENV=production, 포트 2567, 꺼지면 다시 켬). 정답 YAML은 scp로 goldenbell/·escape/에만 둔다(권한 600).
- 대장 접속: ~/.ssh/config의 df-cloud(열쇠 ~/.ssh/delta-field-cloud, Lightsail 키 페어 delta-field-lead).
- 35명 시험(2026-11-13, 대장 컴퓨터 → 서울): 35명 동시 접속 0.2초, ping 중앙 12 ms·95% 21~26 ms, 서버 CPU 약 5%, 메모리 약 130 MB.
  골든벨 채점 단계는 loadtest 스크립트가 지금 골든벨 흐름과 맞지 않아 로컬에서도 같이 실패한다(스크립트 고칠 일).

## 자주 하는 일
- 선생님 비밀번호(교사가 직접): Lightsail 브라우저 SSH에서 `cd ~/delta-field && nano .env` → `DF_TEACHER_PASSWORD=...` 저장 → `sudo systemctl restart delta-field`.
- 새 코드 올리기(대장): `ssh df-cloud 'cd ~/delta-field && git pull -q && pnpm install --frozen-lockfile && pnpm build && sudo systemctl restart delta-field'`
- 정답 파일 바꾸기(대장): `scp ~/projects/delta-field/goldenbell/<파일>.yaml df-cloud:delta-field/goldenbell/` (escape도 같음). 서버를 다시 켤 필요는 없다(선생님이 파일 목록을 열 때 폴더를 다시 읽는다).
- 기록 보기: `ssh df-cloud 'sudo journalctl -u delta-field -n 50'`
- 수업이 없는 동안 요금 줄이기: Lightsail에서 인스턴스를 멈춰도 요금은 나온다. 오래 안 쓰면 스냅샷을 만들고 지운다(고정 IP는 붙어 있지 않으면 요금이 나오니 함께 지운다).

2026-11-12 교사 결정: 실제 수업 서버는 AWS Lightsail 서울 지역에 둔다. 인터넷이 안 될 때는 교사의 맥에서 `pnpm start`(플랜 B).

## 왜 클라우드인가
- 학교 와이파이는 기기끼리의 연결을 막는 일이 많아, 학생 기기가 같은 망의 맥에 붙기 어렵다. 클라우드는 학생 기기가 인터넷에만 닿으면 된다.
- 지금 서버는 메모리 약 110 MB, 35명일 때 전체 1.9 Mbps(docs/design.md 2단계 ①)라 가장 작은 서버로 충분하다.
- 서울 지역 왕복 지연은 보통 0.01~0.03초다. 내 캐릭터는 화면에서 바로 움직이고, 남의 위치는 원래 0.05초마다 받으므로 차이를 느끼기 어렵다.

## 교사가 하는 일(계정·결제·열쇠)
1. AWS 계정을 만들고 Lightsail에서 인스턴스를 만든다.
   - 지역: 서울(ap-northeast-2), 이미지: Ubuntu 24.04 LTS, 요금제: 1 GB 메모리 이상.
   - 고정 IP(Static IP)를 붙인다.
   - 네트워킹의 방화벽: 22(SSH), 80(HTTP), 443(HTTPS)만 연다.
2. (바뀜) 대장이 CLI로 공개 열쇠를 Lightsail 키 페어로 올려 서버를 만들었다.
   비밀 열쇠와 AWS 비밀번호는 대장에게 주지 않는다.
3. 서버의 .env(DF_TEACHER_PASSWORD)는 교사가 직접 만든다. 공개 인터넷이므로 맥보다 긴 비밀번호를 쓴다.

## 대장이 하는 일(교사 허락을 받은 뒤)
- 서버에 Node 24·pnpm, HTTPS용 Caddy를 설치한다(설치는 그때 다시 묻는다).
- 공개 저장소를 받아 `pnpm build` 하고, 게임 서버를 systemd 서비스로 켠다(꺼져도 다시 켜짐).
- 정답이 든 goldenbell/·escape/ YAML은 git이 아니라 scp로 서버에만 올린다.
- 주소: 도메인을 사지 않고 `<고정IP>.sslip.io` 같은 이름에 Caddy가 무료 인증서를 받아 https로 연다.
- 확인: 대장 컴퓨터에서 `pnpm loadtest`로 35명 접속 시험, 그다음 교사가 학교에서 태블릿 한두 대로 접속·지연을 재 본다.
- 수업이 없는 동안은 서버를 멈추거나 지워 요금을 줄일 수 있다(지우면 고정 IP와 주소가 바뀐다).

## 플랜 B: 맥 서버
- 교사의 맥에서 `pnpm start`(포트 2567). 학생 기기는 맥과 같은 공유기에 붙는다.
- 공유기: 교사가 지금 공유기 모델을 알려 주면 30대가 붙을 수 있는지 확인한다. 안 되면 와이파이 6 공유기를 쓴다.
