# M0 — Express 기초

> **한 줄 요약**: Express는 Node의 `http` 모듈 위에 얹는 얇은 층이다. 경로별로 함수를 등록해두는 방식으로 라우팅을 정리해주는 게 전부고, 마법은 없다.

---

## 1. 왜 Express인가

순수 Node `http`로 서버를 짜면 경로 분기를 손으로 다 해야 한다.

```js
// 순수 node http
http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else if (req.url === "/login" && req.method === "POST") {
    // ...
  }
});
```

경로가 늘어날수록 `if` 지옥이 되고, 헤더 설정과 `JSON.stringify`를 매번 손으로 써야 한다. Express는 이걸 **"경로별로 핸들러를 등록"** 하는 구조로 바꿔준다.

---

## 2. 네 조각

### (1) 앱 인스턴스

```js
const app = express();
```

라우트를 담아둘 그릇이자, 나중에 서버로 띄울 대상.

### (2) 라우트 등록 — `app.메서드(경로, 핸들러)`

```js
app.get("경로", 핸들러);
app.post("경로", 핸들러);
```

메서드 이름이 곧 HTTP 메서드다. **같은 경로라도 메서드가 다르면 별개의 라우트**다.

### (3) 핸들러 — `(req, res) => {}`

Express가 요청마다 이 함수를 대신 호출해주고, 인자 두 개를 넣어준다.

| 인자  | 정체                                 | 언제 쓰나                     |
| ----- | ------------------------------------ | ----------------------------- |
| `req` | 들어온 요청 (URL, 헤더, body, 쿠키…) | M1~ `req.body`, M4 `req.user` |
| `res` | 응답을 만들 도구                     | 항상                          |

### (4) 응답 — `res.json(객체)`

```js
res.json({ status: "ok" });
```

한 줄이 세 가지를 다 한다: `Content-Type: application/json` 헤더 설정 + `JSON.stringify` + 응답 종료.

> `res.send()`는 값 타입을 보고 알아서 판단한다(객체 → JSON, 문자열 → HTML). **JSON을 줄 거면 `res.json()`이 의도가 명확해서 낫다.**

### (5) 서버 기동 — `app.listen(포트, 콜백)`

라우트 등록만으로는 서버가 뜨지 않는다. `listen`을 호출해야 포트를 잡고 요청을 받기 시작한다.

---

## 3. 요청 한 번의 흐름

```
curl localhost:3000/health
   ↓
Express가 3000 포트에서 수신
   ↓
등록된 라우트 중 [GET + /health] 매칭 탐색
   ↓
찾으면 → 핸들러 실행 → res.json()으로 응답
못 찾으면 → 자동 404
```

404는 Express가 알아서 처리한다. 따로 만들 필요 없다.

---

## 4. ESM 설정

`package.json`에 `"type": "module"`이 있어야 `import`를 쓸 수 있다.

```js
import express from "express"; // ESM ✅
const express = require("express"); // CommonJS ❌ (type:module에서 에러)
```

> ⚠️ 최신 npm의 `npm init -y`는 `"type": "commonjs"`를 **명시적으로 넣어준다.** 그래서 할 일은 "추가"가 아니라 **"수정"** 이다. 안 바꾸면 `Cannot use import statement outside a module` 에러가 난다.

---

## 5. 🔑 복습 체크리스트

- [ ] Express는 Node `http` 위의 얇은 라우팅 층이다 — 마법 없음
- [ ] `express()` → 앱 인스턴스 생성
- [ ] `app.get(경로, 핸들러)` — 메서드 + 경로 조합이 라우트를 결정
- [ ] 핸들러는 `(req, res)`를 받는다 — `req`=요청, `res`=응답 도구
- [ ] `res.json(객체)` = 헤더 + stringify + 종료, 한 방에
- [ ] `app.listen(포트)`를 호출해야 실제로 뜬다
- [ ] 없는 경로의 404는 Express가 자동 처리
- [ ] `"type": "module"` → `import` 사용 가능

---

## 6. 흔한 실수

| 증상                                           | 원인                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `Cannot use import statement outside a module` | `package.json`의 `type`이 `commonjs`인 채로 `import` 사용 |
| 서버가 안 뜬다                                 | `app.listen()` 누락 — 라우트 등록만으로는 안 뜬다         |
| `EADDRINUSE`                                   | 3000 포트를 이미 다른 프로세스가 쓰는 중                  |
| 응답이 JSON이 아니라 HTML                      | `res.send("문자열")`을 쓴 경우 → `res.json()` 사용        |

---

## 7. ⚠️ M0에서 얻은 규칙 — `req`/`res`를 통째로 로그에 찍지 말 것

```js
console.log({ req, res }); // ❌ 절대 금지
```

**표면적 이유**: `req`/`res`는 소켓·버퍼·순환참조를 물고 있는 거대한 객체다. 실측 결과 **요청 한 번에 약 9KB**가 찍혔다.

**진짜 이유 (보안)**: 이건 인증 서버다. 마일스톤이 진행되면 `req`에 이런 게 실려 온다.

| 시점  | `req`에 담기는 것              | 로그에 찍히면                   |
| ----- | ------------------------------ | ------------------------------- |
| M1~M2 | `req.body.password`            | **평문 비밀번호가 로그에 남음** |
| M4    | `Authorization: Bearer eyJ...` | **access token 유출**           |
| M5    | `Cookie: refreshToken=...`     | **refresh token 유출**          |

로그 파일은 보통 평문이고, 백업되고, 모니터링 도구로 흘러간다. 비밀번호를 bcrypt로 정성껏 해싱해놓고 로그에 평문을 남기면 **해싱한 의미가 사라진다.**

**대안**: 찍을 필드를 콕 집어서.

```js
console.log({ method: req.method, url: req.url }); // ✅
```
