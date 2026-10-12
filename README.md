# Pokémon Crossing Arena — 설치 · 배포 · 테스트 가이드

이 문서는 저장소에 올릴 필요가 없는 안내서입니다. 실제로 업로드할 파일은 `index.html`, `style.css`, `game.js` 세 개뿐입니다.

> **먼저 알아둘 점**
> 이 게임은 **GitHub Pages(정적 호스팅) + Firebase 클라이언트 SDK만으로** 동작합니다. 장애물 충돌 판정과 점수 계산은 각 참가자의 브라우저에서 이뤄지므로, 브라우저 개발자 도구로 점수를 조작하는 것을 **완전히 막을 수는 없습니다.** 보안 규칙으로 "명백히 불가능한 값"은 거부하지만, 결과 화면의 순위는 **참고용**이며 보상은 반드시 관리자가 확인한 뒤 지급해 주세요.

---

## 1. Firebase 프로젝트 생성

1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 프로젝트 이름 입력 (예: `pokemon-crossing-arena`) → Google 애널리틱스는 꺼도 됩니다 → **프로젝트 만들기**
3. 요금제가 **Spark(무료)** 인지 확인합니다. (콘솔 왼쪽 아래에 표시)

## 2. Realtime Database 생성

1. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**
2. 위치: 한국 사용자라면 **싱가포르(asia-southeast1)** 를 권장합니다.
3. 보안 규칙 시작 모드: **잠금 모드**로 시작 → 아래 4단계에서 규칙을 붙여 넣습니다.
4. 생성 후 화면 상단에 보이는 주소(예: `https://프로젝트ID-default-rtdb.asia-southeast1.firebasedatabase.app`)가 `databaseURL` 입니다.

## 3. 이메일/비밀번호 로그인 활성화

참가자는 **닉네임 + 비밀번호**, 관리자는 **비밀번호만** 입력해 로그인합니다. 둘 다 Firebase의 이메일/비밀번호 로그인을 사용합니다.

1. **빌드 → Authentication → 시작하기**
2. **로그인 방법** 탭 → **이메일/비밀번호** → 사용 설정 → 저장 (익명 로그인은 필요 없습니다)
3. **설정 → 승인된 도메인**에 GitHub Pages 주소의 도메인(예: `내아이디.github.io`)을 추가해 두면 안전합니다.

**참가자 로그인 방식**
- 닉네임은 Firebase 안에서 `p해시값@players.crossing-arena.example.com` 같은 **내부용 주소**로 바뀌어 저장됩니다. 실제 메일은 보내지 않습니다.
- 처음 쓰는 닉네임이면 입력한 비밀번호(6자 이상)로 **자동 등록**되고, 이후에는 같은 비밀번호를 아는 사람만 그 닉네임을 쓸 수 있습니다. → 닉네임 사칭 방지
- 같은 닉네임은 어느 기기에서 접속해도 같은 사용자로 인식되어 **중복 참가가 생기지 않습니다.** 다른 기기에서 접속하면 먼저 접속한 화면이 자동으로 나가집니다.
- 한 번 로그인하면 그 브라우저에서는 로그인 상태가 유지되어 다음부터 비밀번호를 다시 묻지 않습니다. (메인 화면의 **로그아웃**으로 해제)
- 대소문자만 다른 닉네임(`Ash`, `ash`)은 같은 계정으로 취급합니다.

**비밀번호를 잊은 참가자가 있다면**
내부용 주소라 비밀번호 재설정 메일을 보낼 수 없습니다. 관리자가 **Authentication → 사용자** 목록에서 해당 계정을 삭제하면 그 닉네임을 새 비밀번호로 다시 등록할 수 있습니다. (계정 목록에는 닉네임이 아니라 내부 주소가 보이므로, 게임 대기실이나 데이터 탭 `rooms/.../players/{UID}` 의 `nickname` 으로 UID를 찾은 뒤 같은 UID의 계정을 삭제하세요.)

## 4. Firebase 보안 규칙 설정

**Realtime Database → 규칙** 탭에 아래 내용을 **전부 덮어쓰기**한 뒤 **게시**를 누르세요.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "admins": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": false
      }
    },
    "rooms": {
      "$roomId": {
        ".read": "auth != null && $roomId.matches(/^[a-z0-9-]{1,20}$/)",

        "hostId": {
          ".write": "auth != null && newData.val() === auth.uid && newData.parent().child('players').child(auth.uid).exists() && (!data.exists() || data.val() === auth.uid || !data.parent().child('players').child(data.val()).exists() || data.parent().child('players').child(data.val()).child('online').val() === false)",
          ".validate": "newData.isString()"
        },
        "status": {
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || (newData.parent().child('hostId').val() === auth.uid && newData.val() !== 'countdown'))",
          ".validate": "newData.isString() && newData.val().matches(/^(lobby|countdown|playing|ended)$/)"
        },
        "round": {
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || (!data.exists() && newData.val() === 0 && newData.parent().child('hostId').val() === auth.uid))",
          ".validate": "newData.isNumber() && newData.val() >= 0"
        },
        "mapSeed": {
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || (!data.exists() && newData.val() === 0 && newData.parent().child('hostId').val() === auth.uid))",
          ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 2147483647"
        },
        "startAt": {
          ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
          ".validate": "newData.isNumber() && newData.val() > now - 5000 && newData.val() < now + 60000"
        },
        "endAt": {
          ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
          ".validate": "newData.isNumber() && newData.val() === newData.parent().child('startAt').val() + 180000"
        },
        "createdAt": {
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || newData.parent().child('hostId').val() === auth.uid)",
          ".validate": "newData.isNumber() && newData.val() <= now"
        },

        "players": {
          "$uid": {
            ".write": "auth != null && $roomId.matches(/^[a-z0-9-]{1,20}$/) && ((auth.uid === $uid && auth.token.firebase.sign_in_provider === 'password') || (!newData.exists() && data.child('online').val() === false && newData.parent().parent().child('status').val() !== 'countdown' && newData.parent().parent().child('status').val() !== 'playing'))",
            ".validate": "newData.hasChildren(['nickname', 'pokemon', 'online', 'session', 'updatedAt'])",
            "nickname":   { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12 && newData.val() === auth.token.name" },
            "pokemon":    { ".validate": "newData.isString() && newData.val().matches(/^(fox|frog|penguin|bunny|duck|cat)$/)" },
            "online":     { ".validate": "newData.isBoolean()" },
            "session":    { ".validate": "newData.isString() && newData.val().length <= 24" },
            "joinedAt":   { ".validate": "newData.isNumber() && newData.val() <= now" },
            "updatedAt":  { ".validate": "newData.isNumber() && newData.val() <= now" },
            "round":      { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= newData.parent().parent().parent().child('round').val()" },
            "x":          { ".validate": "newData.isNumber() && newData.val() >= -20 && newData.val() <= 20" },
            "z":          { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= newData.parent().child('distance').val()" },
            "distance":   { ".validate": "newData.isNumber() && newData.val() >= 0 && (newData.val() === 0 || newData.val() <= (now - newData.parent().parent().parent().child('startAt').val()) / 120 + 2)" },
            "alive":      { ".validate": "newData.isBoolean() && !(data.val() === false && newData.val() === true && data.parent().child('round').val() === newData.parent().child('round').val())" },
            "survivalMs": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 181000" },
            "reachedAt":  { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 181000" },
            "cause":      { ".validate": "newData.isString() && (newData.val() === '' || newData.val().matches(/^(car|train|water|edge|left)$/))" },
            "finished":   { ".validate": "newData.isBoolean()" },
            "admin":      { ".validate": "newData.isBoolean() && (newData.val() === false || root.child('admins').child($uid).val() === true)" },
            "spectator":  { ".validate": "newData.isBoolean() && (newData.val() === false || root.child('admins').child($uid).val() === true)" },
            "$other":     { ".validate": false }
          }
        },
        "$other": { ".validate": false }
      }
    }
  }
}
```

**이 규칙이 하는 일**

| 보호 내용 | 방법 |
|---|---|
| 로그인하지 않은 사용자 차단 | 모든 읽기·쓰기에 `auth != null`, 참가 데이터 쓰기는 이메일/비밀번호 로그인 계정만 |
| 닉네임 사칭 금지 | 참가자 데이터의 `nickname` 은 로그인한 계정에 등록된 닉네임(`auth.token.name`)과 같아야 함 |
| 다른 사람 데이터 수정 금지 | `players/{uid}` 는 본인(`auth.uid === $uid`)만 쓰기 가능. 예외: 경기 중이 아닐 때 **연결이 끊긴(online=false)** 참가자 삭제(정리용)만 허용 |
| **경기 시작은 관리자만** | `startAt`, `endAt`, 새 `round`·`mapSeed`, `status = countdown` 은 `admins/{UID} = true` 로 등록된 계정만 쓰기 가능. 방장(방을 먼저 만든 사람)도 시작할 수 없음 |
| 경기 진행 상태 정리 | 방장은 `playing`·`ended`·`lobby` 같은 상태 정리만 가능 (카운트다운 시작은 불가) |
| 관리자 목록 보호 | `admins` 는 브라우저에서 쓰기 불가 — Firebase 콘솔에서만 추가/삭제 |
| 관리자 표시 위조 금지 | 참가자 데이터의 `admin`, `spectator` 는 실제 등록된 관리자만 `true` 가능 |
| 방장 가로채기 금지 | 현재 방장이 없거나 연결이 끊겼을 때만 방장 변경 가능 |
| 비정상 값 거부 | 닉네임 1~12자, 캐릭터 id 고정 목록, 경기 시간 180초 고정, 이동 거리 상한(경과 시간 기준), 탈락 후 같은 경기에서 부활 금지 |
| 불필요한 필드 저장 금지 | 정의되지 않은 필드는 `$other` 로 거부 |

> 캐릭터를 추가·변경하면 `pokemon` 규칙의 정규식도 함께 수정해야 합니다.
> `game.js` 의 `MATCH_MS`(180000)를 바꾸면 `endAt` 규칙의 `180000`과 `survivalMs`/`reachedAt`의 `181000`도 함께 바꿔 주세요.

## 4-1. 관리자 계정 만들기 (경기 시작 권한)

경기 시작 버튼은 **관리자에게만** 나타나고, 보안 규칙에서도 관리자만 시작할 수 있습니다. 관리자는 게임 화면에서 **비밀번호만** 입력합니다.

1. **Authentication → 사용자 → 사용자 추가** → 관리자용 이메일(본인 이메일 등)과 비밀번호 입력 → 추가
2. `game.js` 맨 위 설정 영역의 `ADMIN_EMAIL` 에 1번의 이메일을 넣습니다.

```js
const ADMIN_EMAIL = "gachashop-admin@example.com";   // ← 1번에서 만든 관리자 계정 이메일
```

3. 목록에 생긴 관리자 사용자의 **사용자 UID**를 복사합니다. (게임 메인 화면에서 관리자 로그인 후에도 UID가 표시됩니다)
4. **Realtime Database → 데이터** 탭 → 맨 위 루트 옆 **+** → 키 `admins` 추가 → 그 아래에 키 = 복사한 UID, 값 = `true` (불리언)

```
admins
 └─ AbCdEf123...(관리자 UID) : true
```

5. 게임 메인 화면 아래쪽 **관리자 로그인**을 열고 **비밀번호만** 입력 → "관리자로 로그인됨"이 보이면 완료

- 이메일은 `game.js` 에 들어가 공개되지만, 비밀번호를 모르면 로그인할 수 없고 `admins` 등록이 없으면 시작 권한도 없습니다. 관리자 비밀번호는 **길고 추측하기 어렵게** 만들고 디스코드 등에 공유하지 마세요.
- `ADMIN_EMAIL` 이 비어 있으면 관리자 로그인 칸이 숨겨지고, 아무도 경기를 시작할 수 없습니다.

**관리자 진행 방식**
- 관리자 로그인 → 닉네임 칸에 화면에 보일 이름 입력 → 대기실 입장 → 참가자가 2명 이상 모이면 **경기 시작**
- **"경기에는 참가하지 않고 진행만 하기"** 를 체크하면 관리자는 참가 인원(최대 20명, 최소 2명)에 포함되지 않고, 경기는 관전 화면으로 봅니다.

## 5. Firebase 설정값 입력 위치

1. Firebase 콘솔 **⚙ 프로젝트 설정 → 일반 → 내 앱 → 웹(</>) 앱 추가** (호스팅 설정은 체크하지 않음)
2. 표시되는 `firebaseConfig` 값을 복사합니다.
3. `game.js` 맨 위 **「1. 관리자 설정」** 영역의 `FIREBASE_CONFIG` 에 붙여 넣습니다.

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza....",
  authDomain: "프로젝트ID.firebaseapp.com",
  databaseURL: "https://프로젝트ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "프로젝트ID",
  storageBucket: "프로젝트ID.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

const ADMIN_CONTACT_URL = "";   // 실제 디스코드 초대/문의 채널 링크를 넣으면 결과 화면에 문의 버튼이 나타납니다.
const DEFAULT_ROOM_ID = "arena";
const ADMIN_EMAIL = "";         // 4-1단계에서 만든 관리자 계정 이메일
const PLAYER_EMAIL_DOMAIN = "players.crossing-arena.example.com";  // 운영 시작 후에는 바꾸지 마세요
```

- `databaseURL` 이 비어 있으면 멀티플레이가 꺼지고 "혼자 연습하기"만 가능합니다. (Firebase가 최근 생성한 웹 앱 설정에 `databaseURL`이 빠져 있다면 2단계의 주소를 직접 넣으세요.)
- 이 설정값은 공개되어도 되는 **식별용 값**입니다. 보안은 4단계의 규칙이 담당합니다.
- **서비스 계정 키(JSON), 데이터베이스 비밀(legacy secret)은 절대 코드에 넣지 마세요.**
- `ADMIN_CONTACT_URL` 이 비어 있으면 문의 버튼은 숨겨지고 "관리자 문의 링크가 아직 설정되지 않았습니다" 안내가 표시됩니다.

## 6. GitHub 저장소에 세 파일 업로드

1. https://github.com 로그인 → 오른쪽 위 **+ → New repository**
2. 이름 입력 (예: `crossing-arena`) → **Public** → **Create repository**
3. **uploading an existing file** 링크 클릭 → `index.html`, `style.css`, `game.js` 세 파일을 끌어다 놓기 → **Commit changes**

## 7. GitHub Pages 활성화

1. 저장소 **Settings → Pages**
2. **Source: Deploy from a branch** → Branch: `main` / `/(root)` → **Save**
3. 1~2분 뒤 `https://내아이디.github.io/crossing-arena/` 주소가 표시됩니다.
4. 방 코드를 지정해 공유하려면 주소 뒤에 `?room=event1` 을 붙이세요. (예: `.../crossing-arena/?room=event1`)

> 코드를 수정해 다시 올린 뒤 화면이 그대로라면 브라우저 캐시 때문입니다. 강력 새로고침(PC: Ctrl+Shift+R)을 해 주세요.

## 8. PC와 스마트폰에서 테스트

**PC**
- 크롬/엣지에서 주소 접속 → 닉네임 입력, 캐릭터 선택 → **혼자 연습하기**로 조작부터 확인
- 방향키·WASD를 꾹 누르고 있어도 한 칸만 움직이는지 확인
- 창 폭 900px 이상에서 게임 화면과 오른쪽 순위표가 겹치지 않는지 확인

**스마트폰**
- 같은 주소를 디스코드에 붙여 넣고 휴대폰에서 열기
- 스와이프(상하좌우), 화면 탭(앞으로), 하단 방향 버튼이 모두 동작하는지 확인
- 조작 중에 페이지가 스크롤되거나 확대되지 않는지 확인
- 세로 화면에서 HUD, 방향 버튼, 캐릭터가 서로 가리지 않는지 확인

**문제가 생기면** PC에서 F12 → Console 탭의 오류 메시지를 확인하세요. `PERMISSION_DENIED` 는 대부분 보안 규칙이 게시되지 않았거나 이메일/비밀번호 로그인이 꺼져 있는 경우입니다.

## 9. 두 개 이상의 브라우저로 실시간 멀티플레이 검증

같은 브라우저의 탭은 로그인 상태를 공유하므로, 서로 다른 닉네임으로 테스트하려면 아래처럼 하세요.

- 크롬 일반 창 + 크롬 **시크릿 창**
- 크롬 + 엣지(또는 파이어폭스)
- PC + 스마트폰

순서:
1. 두 브라우저에서 같은 방 코드로 **대기실 입장**
2. 관리자 로그인한 브라우저에만 **관리자** 배지와 **경기 시작** 버튼이 보이고, 일반 참가자 화면에는 "관리자가 경기를 시작하면…" 안내만 보이는지 확인 (관리자 + 일반 참가자 2명이 필요하다면 진행만 하기를 체크하지 않거나 브라우저를 3개 사용)
3. 경기 시작 → 두 화면에서 카운트다운 숫자가 거의 동시에 줄어드는지 확인
4. 출발 후 한쪽에서 움직이면 다른 화면에서 그 캐릭터(닉네임 표시)가 부드럽게 따라 움직이는지 확인
5. 두 화면의 차량·열차·통나무 위치가 같은지 확인 (같은 시드 + 서버 시각 기준)
6. Firebase 콘솔 **Realtime Database → 데이터** 탭에서 `rooms/방코드/players/...` 의 `x`, `z`, `distance` 가 약 0.3초 간격으로 바뀌는지 확인

## 10. 위험 상황 테스트

| 테스트 | 방법 | 기대 결과 |
|---|---|---|
| **중복 참가** | 대기실에서 새로고침 / 같은 닉네임으로 휴대폰에서도 접속 | 참가자 목록에 같은 사람이 두 번 나오지 않고, 먼저 접속한 화면이 나가짐 |
| **닉네임 도용** | 다른 브라우저에서 이미 등록된 닉네임 + 틀린 비밀번호로 입장 | "이미 다른 사람이 쓰는 닉네임이거나 비밀번호가 틀렸습니다" 안내 |
| **관리자 비밀번호 오류** | 관리자 로그인에 틀린 비밀번호 | "비밀번호가 올바르지 않습니다" 안내, 시작 버튼 없음 |
| **대기실 연결 끊김** | 한 브라우저 탭을 닫기 | 몇 초 안에 다른 화면의 목록에서 사라짐 |
| **관리자 외 시작 시도** | 일반 참가자 화면 F12 콘솔에서 아래 "시작 시도" 코드 실행 | `PERMISSION_DENIED` 로 거부됨 |
| **경기 중 연결 끊김** | 경기 중 와이파이 끄기 → 10초 뒤 켜기 | 빨간 "연결이 끊어졌습니다" 배너, 게임은 계속 진행, 복구 후 배너가 사라지고 위치 재전송 |
| **경기 중 새로고침** | 경기 중 새로고침 → 같은 방 재입장 | 생존 중이었다면 마지막 위치에서 이어서 플레이, 탈락했다면 관전 |
| **경기 중 이탈** | 경기 중 탭 닫기 | 다른 화면에서 반투명 표시, 결과에 "연결 끊김"으로 표시 |
| **전원 탈락 종료** | 두 사람 모두 일부러 차에 부딪히기 | 180초를 기다리지 않고 결과 화면 표시 |
| **시간 종료** | 끝까지 생존 | 3:00 경과 후 "시간 종료!" → 결과 화면 |
| **인원 제한** | (선택) 21번째 참가자 입장 | "방이 가득 찼습니다" 안내 |
| **점수 조작 시도** | F12 콘솔에서 아래 코드를 실행해 거리 9999 쓰기 시도 | `PERMISSION_DENIED` 로 거부됨 |

점수 조작 테스트용 콘솔 코드(게임 중 실행):

```js
const { getDatabase, ref, update } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
const uid = getAuth().currentUser.uid;
await update(ref(getDatabase(), `rooms/arena/players/${uid}`), { distance: 9999 });
```

관리자가 아닌 사람의 경기 시작 시도 코드:

```js
const { getDatabase, ref, update } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
const t = Date.now() + 25000;
await update(ref(getDatabase(), "rooms/arena"), { status: "countdown", round: 99, mapSeed: 1, startAt: t, endAt: t + 180000 });
```

두 코드 모두 거부된다면 규칙이 정상입니다. 단, 경과 시간에 비해 **그럴듯한 범위 안에서의** 조작(예: 실제 30칸인데 60칸으로 기록)은 규칙만으로 구별할 수 없습니다.

---

## Firebase 사용량 확인 (Spark 무료 요금제)

무료 한도를 넘지 않는다고 **보장할 수는 없습니다.** 아래에서 직접 확인하세요.

- **Realtime Database → 사용량** 탭: 동시 연결 수, 저장 용량, 다운로드 양
- Spark 요금제의 Realtime Database 한도는 대략 **동시 연결 100개, 저장 1GB, 월 다운로드 10GB**입니다. (정확한 최신 수치는 Firebase 요금제 페이지에서 확인)
- 대략적인 추정: 20명이 180초 경기를 하면 각 참가자가 0.3초마다 위치를 보내고 모두가 서로의 변경을 받으므로, 한 경기에 **수십 MB** 수준의 다운로드가 발생할 수 있습니다. 대규모 이벤트를 자주 연다면 사용량 탭을 수시로 확인하세요.
- 사용량을 줄이는 코드 설계: 메인 화면에서는 연결하지 않음 / 대기실에서는 위치 전송 없음 / 움직였을 때만 0.3초 간격으로 전송 / 결과 화면 도달 시 참가자 구독 해제 / 나가면 연결 종료.

**오래된 데이터 정리**
- 누군가 방에 입장할 때 경기 중이 아니면 연결이 끊긴 참가자 데이터가 자동 삭제됩니다.
- 비정상 종료로 멈춘 방은 다음 입장자가 방장을 넘겨받아 상태를 정리합니다.
- 이벤트가 끝나면 콘솔 **데이터** 탭에서 `rooms/방코드` 옆 휴지통 아이콘으로 방 전체를 지울 수 있습니다.

---

## 보상 · 치트 방지에 대한 설명

- 게임은 **경기 기록과 순위를 보여주는 역할만** 합니다. 카드, 포인트, 상품명, 수량은 코드 어디에도 없으며, 디스코드 카드 데이터나 소유권을 바꾸지 않습니다.
- 결과 화면의 "관리자에게 문의하기"는 `ADMIN_CONTACT_URL` 페이지를 여는 버튼일 뿐, 문의 접수나 당첨 확정을 의미하지 않습니다.
- **권장 운영 방법:** 상위권 참가자에게 결과 화면 스크린샷을 받고, 콘솔 데이터 탭의 `distance`, `survivalMs`, `updatedAt` 과 대조한 뒤, 비정상적으로 높은 기록은 재경기로 확인하세요.

**완전한 점수 검증이 필요하다면** 서버 측 기능이 추가로 필요합니다. 예:
1. **Cloud Functions(Blaze 유료 요금제 필요)** 또는 별도 서버가 경기 시드를 보관하고, 참가자가 보낸 **입력 기록(이동 방향 + 시각)** 을 서버에서 같은 코스로 다시 재생(리플레이 검증)해 거리와 생존을 계산
2. 서버만 쓸 수 있는 `results/` 경로에 공식 결과를 기록하고, 클라이언트는 읽기만 허용
3. 관리자 전용 계정(커스텀 클레임)으로만 보상 확정 처리

GitHub Pages + Firebase 클라이언트만으로는 **신뢰할 수 있는 서버 측 계산이 없으므로 완전한 치트 방지는 불가능합니다.** 현재 버전의 보안 규칙은 "불가능한 값 거부"와 "다른 사람 데이터 수정 금지"까지만 보장합니다.
