# M5 — Refresh 토큰

> **한 줄 요약**: 토큰 하나로 "짧아서 안전"과 "길어서 편함"을 동시에 만족시킬 수 없다. **역할을 둘로 쪼개서** access는 짧게·무상태로, refresh는 길게·서버 저장으로 가져간다. 그러면 JWT의 최대 약점인 **무효화 불가**도 함께 풀린다.

> ✅ **구현 완료.** 서버(`index.js`) + 검증용 클라이언트(`public/index.html`). 구현하며 실제로 부딪힌 것들은 **13절**에 정리했다.

---

## 1. 풀어야 할 문제

M3에서 남긴 딜레마다.

| access 수명 | 유출 시 피해 창 | UX                       |
| ----------- | --------------- | ------------------------ |
| 15분        | 15분            | **15분마다 재로그인** 😱 |
| 30일        | **30일** 😱     | 편함                     |

서버가 발급된 토큰을 취소할 수 없으니 **수명이 곧 피해 창**이다. 그렇다고 짧게 하면 쓸 수 없는 물건이 된다.

---

## 2. 해법 — 역할을 쪼갠다

토큰 하나로 두 가지를 다 하려니 안 되는 것이다. **둘로 나누면** 각각 최적화할 수 있다.

|           | access token               | refresh token            |
| --------- | -------------------------- | ------------------------ |
| 수명      | **15분** (짧게)            | **7~30일** (길게)        |
| 저장 위치 | 서버에 저장 안 함 (무상태) | **서버에 저장**          |
| 전송 빈도 | **모든 요청**에 실림       | **`/refresh` 호출 때만** |
| 담는 곳   | 클라이언트 **메모리**      | **`httpOnly` 쿠키**      |
| 무효화    | 불가 (만료 대기)           | **가능** (서버에서 삭제) |

> **자주 노출되는 건 짧게, 오래 사는 건 적게 노출되게.**

access는 매 요청 헤더에 실려 노출 기회가 많으니 짧게. refresh는 재발급 때만 나가므로 노출이 적고, 그래서 길어도 상대적으로 안전하다.

---

## 3. 저장 위치 — XSS vs CSRF 트레이드오프

M5에서 가장 중요한 판단. 정답이 하나로 떨어지지 않는다.

|                  | `localStorage`                           | `httpOnly` 쿠키                  |
| ---------------- | ---------------------------------------- | -------------------------------- |
| **XSS**로 훔치기 | ❌ `localStorage.getItem()` 한 줄로 털림 | ✅ **JS가 읽을 수 없음**         |
| **CSRF** 위험    | ✅ 자동 전송 안 됨                       | ❌ 브라우저가 자동으로 실어 보냄 |
| 방어 수단        | XSS를 완벽히 막아야 함 (어려움)          | `SameSite` 한 줄로 차단 (쉬움)   |

**둘 다 위험이 있고, 막기 쉬운 쪽을 고르는 것이다.**

XSS는 완벽 방어가 어렵다. 라이브러리에 악성 코드가 섞이거나(supply chain), 사용자 입력을 한 군데에서 이스케이프를 빠뜨리면 뚫린다. 뚫리는 순간 `localStorage`는 통째로 털린다.

CSRF는 `SameSite` 속성으로 거의 막힌다. **그래서 refresh는 `httpOnly` 쿠키가 정답.**

### access는 메모리에

```js
let accessToken = null; // JS 변수. localStorage 아님
```

`localStorage`에 두면 XSS 때 털린다. 새로고침하면 날아가지만 **그게 문제가 안 된다** — refresh 쿠키가 살아있으니 `/refresh` 한 번 호출해 다시 받으면 된다.

> 이것이 refresh 구조의 숨은 이득이다. **access를 안전하게 버릴 수 있게 된다.**

---

## 4. 쿠키 옵션

```js
res.cookie("refreshToken", token, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/refresh",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
});
```

실제로 만들어지는 헤더 (실측):

```
옵션 없이 : Set-Cookie: refreshToken=eyJ...; Path=/

옵션 전부 : Set-Cookie: refreshToken=eyJ...; Max-Age=604800; Path=/refresh;
            Expires=Sun, 09 Aug 2026 ...; HttpOnly; Secure; SameSite=Strict
```

| 옵션                 | 막는 것                                                         |
| -------------------- | --------------------------------------------------------------- |
| `httpOnly`           | **JS 접근 차단.** `document.cookie`에 안 보임 → XSS로도 못 훔침 |
| `secure`             | HTTPS에서만 전송 → 중간자가 평문으로 못 봄                      |
| `sameSite: "strict"` | **다른 사이트에서 온 요청엔 안 실림** → CSRF 차단               |
| `path: "/refresh"`   | **그 경로에만 전송.** `/me` 등에는 아예 안 감 → 노출 최소화     |
| `maxAge`             | 쿠키 자체의 수명                                                |

`path`가 은근히 중요하다. 없으면 refresh 쿠키가 **모든 요청에 딸려가서** access만큼 자주 노출된다. 그러면 나눈 의미가 사라진다.

> 💡 `secure: true`인데 `http://localhost`에서 되나? → **된다.** 브라우저가 localhost를 신뢰할 수 있는 출처로 취급해 예외를 둔다. 운영에선 당연히 HTTPS 필요.

---

## 5. 서버 저장 = 무효화 능력

M3에서 "JWT는 발급하면 취소할 수 없다"가 최대 약점이라 했다. **refresh를 서버에 저장하면 그 약점이 풀린다.**

```js
const refreshTokens = {}; // 메모리 저장소 (M6에서 DB로)
```

로그아웃:

```
서버의 refresh 삭제  →  더 이상 재발급 불가
access는?           →  15분 뒤 자연 만료
```

**최대 15분 뒤 완전히 로그아웃된다.** 완벽한 즉시 무효화는 아니지만 실용적으로 충분하다.

이것이 M3 표에서 말한 **하이브리드**다.

```
확장성  ← access(JWT, 무상태)에서 챙김
무효화  ← refresh(서버 저장)에서 챙김
```

세션의 장점과 JWT의 장점을 각각 다른 토큰에 배분한 것.

---

## 6. 회전 (rotation)

**refresh를 쓸 때마다 새 것으로 교체하고 옛것은 폐기한다.**

```
POST /refresh (토큰A)
   → 검증 통과
   → 토큰A 폐기
   → 새 access + 새 refresh(토큰B) 발급
```

유출된 refresh의 유효 기간이 **"다음 사용 시점까지"** 로 줄어든다. 30일짜리를 훔쳐도 정상 유저가 한 번 갱신하면 무용지물.

---

## 7. 재사용 탐지 — 도난을 알아채는 법

회전을 하면 공짜로 따라온다. **이미 폐기된 refresh가 다시 들어오면 도난 신호다.**

정상 유저는 항상 최신 토큰만 갖고 있다. 폐기된 옛 토큰을 쓴다는 건 **어딘가에 사본이 있다**는 뜻.

```
공격자가 토큰A를 훔침
  ├─ 공격자가 먼저 사용 → A 폐기, 공격자는 B를 얻음
  │     → 나중에 정상 유저가 A로 시도 → 폐기된 토큰! → 🚨 탐지
  │
  └─ 정상 유저가 먼저 사용 → A 폐기, 유저는 B를 얻음
        → 공격자가 A로 시도 → 폐기된 토큰! → 🚨 탐지
```

**누가 먼저 쓰든 반드시 걸린다.** 이것이 rotation의 진짜 가치.

대응은 **그 유저의 refresh 전부 무효화.** 누가 진짜인지 서버는 모르므로 둘 다 끊고 재로그인시킨다. 불편하지만 안전하다.

---

## 8. 전체 흐름

```
[로그인]
POST /login  →  access(15분) + refresh(7일, httpOnly 쿠키)
                서버: refreshTokens[토큰] = userId 저장

[평소]
GET /me  +  Authorization: Bearer <access>     ← refresh는 안 감 (path=/refresh)

[access 만료]
GET /me  →  401 "토큰이 만료되었습니다"          ← M4에서 만든 그 응답
   ↓  클라이언트가 감지
POST /refresh                                  ← 쿠키는 브라우저가 자동으로 실음
   ↓  서버: 저장된 refresh인지 확인 → 폐기 → 새로 발급
새 access + 새 refresh
   ↓
GET /me 재시도 → 200

[로그아웃]
POST /logout  →  서버에서 refresh 삭제 + 쿠키 제거
```

M4에서 **만료만 따로 구분해 알린 것**이 여기서 쓰인다. 클라이언트가 "만료구나 → refresh 하자"를 판단할 수 있어야 이 흐름이 돈다.

---

## 9. 왜 이제 브라우저가 필요한가

실측:

```
curl이 저장한 쿠키: refreshToken  eyJhbGci...
서버가 받은 것:     {"req.headers.cookie":"refreshToken=eyJhbGci..."}
```

**curl은 `httpOnly`를 그냥 무시한다.** 저장하고 되돌려보낸다. `httpOnly`는 "**JS가 못 읽는다**"는 뜻인데 curl엔 JS가 없으니 검증할 대상 자체가 없다.

| 확인할 것                   | curl           | 브라우저                    |
| --------------------------- | -------------- | --------------------------- |
| `httpOnly`가 JS 접근을 막나 | ❌ 불가        | ✅ `document.cookie`로 확인 |
| 쿠키가 자동 전송되나        | ❌ (수동 `-b`) | ✅ 자동                     |
| `path=/refresh` 제한이 먹나 | ❌             | ✅                          |

그래서 **`index.html` 한 장**이 필요하다. (TASK.md 3절 "클라이언트" 규칙)

---

## 10. 🔑 복습 체크리스트

- [ ] 문제: 토큰 수명이 곧 유출 피해 창 ↔ 짧으면 UX 붕괴
- [ ] 해법: **역할 분리.** access=짧게·무상태·매 요청 / refresh=길게·서버저장·`/refresh`에만
- [ ] 원칙: **자주 노출되는 건 짧게, 오래 사는 건 적게 노출되게**
- [ ] refresh 저장 위치 = **`httpOnly` 쿠키** (XSS 방어). CSRF는 `SameSite`로 막기 쉬우니까
- [ ] access 저장 위치 = **메모리(JS 변수)**. 새로고침에 날아가도 refresh로 복구
- [ ] `localStorage` ❌ — XSS 한 방에 털림
- [ ] 쿠키 옵션 5종: `httpOnly` / `secure` / `sameSite` / **`path=/refresh`** / `maxAge`
- [ ] `path`를 안 주면 모든 요청에 딸려가 **나눈 의미가 사라진다**
- [ ] refresh를 서버에 저장 → **JWT의 무효화 불가 약점이 풀린다** (로그아웃 = 삭제, access는 15분 뒤 만료)
- [ ] **회전**: 쓸 때마다 교체·폐기 → 유출 토큰의 수명이 "다음 사용까지"로 축소
- [ ] **재사용 탐지**: 폐기된 토큰이 다시 오면 도난. 누가 먼저 쓰든 반드시 걸림 → 해당 유저 전체 무효화
- [ ] `httpOnly`·쿠키 자동 전송·`path` 제한은 **curl로 검증 불가** → 브라우저 필요

---

## 11. 구현 시 할 일 (다음 세션)

**서버**

1. `cookie-parser` 설치 — `express.json()`이 body에 하는 일을 쿠키에 하는 미들웨어
2. refresh 저장소 준비 (`{}` 또는 `Map`)
3. `POST /login` — access + refresh 둘 다 발급, refresh는 `res.cookie()`로 (옵션 포함)
4. `POST /refresh` — 쿠키에서 읽기 → **서버 저장소에 있는지 확인** → 폐기 → 새로 발급
5. `POST /logout` — 저장소에서 삭제 + `res.clearCookie()`

**클라이언트**

6. `index.html` — 로그인 / `/me` 호출 / 로그아웃 버튼, `fetch` 몇 줄. 프레임워크 없음
7. **별도 포트**로 띄우기 (`npx serve -l 5173` 등) → cross-origin 구성

> ⚠️ 다른 포트에서 `fetch`를 쏘면 **CORS 벽**에 부딪힌다. 정식 대응은 M6지만 M5 검증에 최소한은 필요하다. 쿠키를 실으려면 클라이언트에서 `credentials: "include"`도 필요.
>
> 참고: `localhost:5173`과 `localhost:3000`은 **같은 site, 다른 origin**이다. `SameSite`는 site 기준이라 쿠키 전송은 막히지 않지만, **CORS는 origin 기준**이라 별도 설정이 필요하다.

---

## 12. 흔한 실수 (예상)

| 실수                              | 결과                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| refresh를 `localStorage`에        | XSS 한 방에 장기 토큰 탈취                                           |
| `path` 미지정                     | refresh가 모든 요청에 딸려가 노출 빈도가 access와 같아짐             |
| 회전 없이 재사용 허용             | 유출 시 만료까지 계속 유효 + **도난 탐지 불가**                      |
| 서버 저장 없이 JWT 검증만         | 로그아웃해도 무효화 불가 — 세션의 장점을 못 챙김                     |
| 재사용 탐지 시 해당 토큰만 폐기   | 공격자가 이미 받아간 새 토큰이 살아있음. **유저 전체 무효화**가 맞다 |
| 클라이언트에서 `credentials` 누락 | 쿠키가 아예 안 실려 `/refresh`가 계속 401                            |

---

## 13. 구현하며 실제로 부딪힌 것

문서를 쓸 때는 몰랐고 코드를 짜면서 드러난 것들. **여기가 이 문서에서 제일 값어치 있는 부분이다.**

### (1) `path: "/refresh"` 와 `/logout` 이 충돌한다

쿠키를 `path: "/refresh"` 로 심으면 브라우저는 **`/refresh` 에만** 쿠키를 보낸다. 그래서 `POST /logout` 에서는 `req.cookies.refreshToken` 이 `undefined` 가 되고, 저장소를 지우는 로직이 통째로 안 돈다.

해결은 **공통 prefix**. 라우트를 `/auth/refresh`, `/auth/logout` 으로 옮기고 쿠키 `path` 를 `/auth` 로 두면 둘 다 받는다.

> `path: "/"` 로 넓히는 방법도 있지만 그러면 모든 요청에 딸려가 나눈 의미가 사라진다.

### (2) `clearCookie` 는 심을 때와 같은 `path` 를 줘야 한다

```
심을 때 : Set-Cookie: refreshToken=...; Path=/auth; HttpOnly; Secure; SameSite=Strict
지울 때 : Set-Cookie: refreshToken=;    Path=/;     Expires=Thu, 01 Jan 1970 ...
                                        ^^^^^^ 안 맞으면 브라우저가 안 지운다
```

쿠키의 **신원은 `name` + `domain` + `path`** 다. 이 셋이 같아야 같은 쿠키로 취급된다. `httpOnly`·`secure`·`sameSite` 는 동작 규칙이라 삭제엔 영향이 없다.

```js
res.clearCookie("refreshToken", { path: "/auth" });
```

> HTTP에는 "쿠키 삭제" 명령이 없다. `clearCookie` 가 하는 일은 **값을 비우고 `Expires` 를 1970년으로 설정해 다시 보내는 것** — 이미 만료된 쿠키를 심어서 브라우저가 스스로 버리게 만든다.

### (3) `expiresAt: ""` 는 "1970년에 만료됨"이 된다

회전할 때 `expiresAt` 을 빈 문자열로 두면:

```
Date.now() > ""  →  true      (Number("") === 0 이라 0과 비교됨)
```

**방금 발급한 토큰이 즉시 만료 판정**된다. 증상은 "2차 refresh가 401"인데, 원인이 "저장소에 없음"에서 "만료됨"으로 옮겨간 것뿐이라 에러 메시지를 구분해두지 않으면 헷갈린다.

> `undefined` 였다면 `Date.now() > undefined` → **`false`** (NaN 비교는 항상 false)가 되어 **만료가 영원히 안 걸리는** 반대 버그가 났을 것이다. 빈 문자열이 그나마 눈에 띄게 터진 셈.

### (4) 회전은 "새 키에 저장 + 옛 키 삭제" 둘 다여야 한다

흔한 실수 조합:

```js
refreshTokens[refreshToken] = { ... };   // ❌ 옛 키에 씀 (newRefreshToken 이어야)
delete refreshTokens[refreshToken];      // 방금 쓴 걸 바로 지움 → 아무것도 저장 안 됨
```

쿠키로는 새 토큰이 나가는데 서버 저장소엔 없어서 **다음 `/refresh` 가 무조건 401**. 즉 refresh를 한 번 쓰면 그다음부터 못 쓴다.

### (5) CORS 최소 설정 — `*` 는 못 쓴다

```js
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
```

- `Content-Type: application/json` 은 **단순 요청이 아니라** 브라우저가 `OPTIONS` **preflight** 를 먼저 보낸다. 이 분기를 처리하지 않으면 본 요청이 아예 안 나간다
- **`credentials` 를 쓰면 `Access-Control-Allow-Origin: *` 가 거부된다.** "아무 사이트나 사용자 인증으로 API를 호출"하는 걸 막기 위해 정확한 origin 문자열을 요구한다
- `Authorization` 을 `Allow-Headers` 에 빠뜨리면 `/me` 만 실패한다

### (6) CORS는 요청이 아니라 **응답 읽기**를 막는다

허용하지 않은 출처에서 회원가입을 보내본 결과:

```
POST /signup (Origin: https://evil.com)
→ HTTP/1.1 201 Created                              서버가 처리함
→ Access-Control-Allow-Origin: http://localhost:5173  (불일치)

계정이 만들어졌나? → 로그인 200 {"token":"eyJ..."}   실제로 생성됨
```

**요청은 막히지 않았고 부작용도 일어났다.** 브라우저는 응답을 JS에 넘기지 않을 뿐이다.

|                                 | preflight | 서버 실행?                            |
| ------------------------------- | --------- | ------------------------------------- |
| 단순 요청 (GET, 폼 POST)        | 없음      | ✅ 실행됨. 응답만 차단                |
| 비단순 요청 (JSON, 커스텀 헤더) | 있음      | ❌ preflight에서 막혀 본 요청이 안 감 |

**결론 두 가지:**

1. **CORS는 서버 보안 장치가 아니다.** 브라우저만 지키는 규칙이라 curl·Postman·서버간 통신엔 적용되지 않는다 (M0~M5의 모든 테스트를 curl로 통과시킨 게 그 증거)
2. **CORS는 서버가 아니라 사용자를 보호한다.** "남의 사이트가 내 인증으로 API를 읽어가는 것"을 막는다
3. **CORS로는 CSRF를 못 막는다.** CSRF는 응답을 읽을 필요가 없기 때문. 그래서 `sameSite` 가 따로 필요하다

|            | 막는 것                                   |
| ---------- | ----------------------------------------- |
| CORS       | 남의 사이트가 응답을 **읽는** 것          |
| `SameSite` | 남의 사이트발 요청에 **쿠키가 실리는** 것 |

### (7) `ERR_CONNECTION_REFUSED` 는 CORS 에러가 아니다

| 에러                     | 뜻                                   | 원인                          |
| ------------------------ | ------------------------------------ | ----------------------------- |
| `ERR_CONNECTION_REFUSED` | **TCP 연결 자체가 거부**             | 서버가 안 떠 있음 / 포트 틀림 |
| `blocked by CORS policy` | 연결은 됐는데 브라우저가 응답을 차단 | CORS 헤더 문제                |

**CORS 에러는 서버에 도달한 뒤에야 나올 수 있다.** 연결이 안 되면 판단할 응답 자체가 없다. `CONNECTION_REFUSED` 가 뜨면 CORS를 아무리 만져도 소용없고 서버 생존부터 확인해야 한다.

### (8) 쿠키는 포트를 구분하지 않는다

```
localhost:3000  ─┐
localhost:5173  ─┼─ 전부 "localhost" 하나로 취급 → 쿠키 공유
localhost:8080  ─┘
```

**CORS는 origin(프로토콜+도메인+포트) 기준인데 쿠키는 도메인 기준이다.** 두 규칙의 기준이 달라 헷갈리기 쉽다.

그래서 `document.cookie` 에 다른 localhost 프로젝트의 쿠키가 섞여 보인다. 실제로 Supabase를 쓰는 다른 프로젝트의 `sb-...-auth-token` 이 보였다.

**이게 오히려 좋은 대조군이 된다:**

| 쿠키                           | `document.cookie` 에 |                      |
| ------------------------------ | -------------------- | -------------------- |
| `sb-...-auth-token` (Supabase) | ✅ 보임              | `httpOnly` 아님      |
| `refreshToken` (우리 것)       | ❌ 안 보임           | **`httpOnly: true`** |

같은 브라우저, 같은 호출인데 하나는 읽히고 하나는 안 읽힌다. `httpOnly` 가 작동한다는 직접 증거다. 콘솔에서 확인:

```js
document.cookie.includes("refreshToken"); // → false 여야 정상
```

### (9) `secure: true` 쿠키는 curl이 http에서 저장하지 않는다

브라우저는 localhost를 신뢰할 수 있는 출처로 취급해 예외를 두지만, **curl은 그렇지 않다.** `-c` 로 쿠키통을 만들어도 비어 있다.

curl로 테스트하려면 헤더에 직접 실어야 한다.

```bash
curl -X POST localhost:3000/auth/refresh -H "Cookie: refreshToken=<값>"
```

### (10) 정적 서버를 프로젝트 루트에서 돌리면 `.env` 가 노출된다

```
npx serve -l 5173          # ❌ http://localhost:5173/.env 로 시크릿이 통째로 다운로드됨
npx serve public -l 5173   # ✅ public/ 하위만 노출
```

그래서 클라이언트를 `public/` 에 두었다. 확인:

```
/           → 200
/.env       → 404
/index.js   → 404
```
