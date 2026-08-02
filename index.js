import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";

const app = express();

app.use(express.json());

const DUMMY_HASH = await bcrypt.hash("dummy", 10);
const users = {}; // { id: string; email: string; passwordHash: string}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization; // 예: "Bearer eyJhbGci..."

  // 헤더 없음
  if (!authHeader) {
    return res.status(401).json({ error: "인증에 실패했습니다." });
  }

  // 형식 틀림
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "인증에 실패했습니다." });
  }

  const token = authHeader.replace(/^Bearer\s+/, "");
  let decoded;

  // try 범위는 예외를 던질 것으로 예상되는 줄만 감싼다.
  // 아래 조회 로직까지 감싸면 그쪽 버그가 401로 둔갑해 디버깅이 어려워진다.
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      // 만료 → 구분해서 알림 (클라이언트가 refresh 판단해야 하니까)
      return res.status(401).json({ error: "토큰이 만료되었습니다." });
    }

    return res.status(401).json({ error: "에러가 발생했습니다." });
  }

  // 토큰이 유효해도 유저는 없을 수 있다 (탈퇴/삭제/재시작).
  // 계정 존재 여부가 새지 않도록 위조 토큰과 동일한 응답을 쓴다.
  const user = Object.values(users).find((u) => u.id === decoded.sub);

  if (!user) {
    return res.status(401).json({ error: "에러가 발생했습니다." });
  }

  req.user = { id: user.id, email: user.email };

  next();
}

app.get("/health", (req, res) => {
  return res.json({ status: "ok" });
});

app.post("/signup", async (req, res) => {
  const { email = "", password = "" } = req?.body || {};

  // 이메일이나 비밀번호 값이 falsy하면 에러처리
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다." });
  }

  // 이미 계정이 있으면 에러 처리
  if (users[email]) {
    return res.status(409).json({ error: "이미 존재하는 이메일입니다." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  users[email] = { id: randomUUID(), email, passwordHash };

  return res.status(201).json({ status: "ok" });
});

app.post("/login", async (req, res) => {
  const { email = "", password = "" } = req.body || {};

  // 이메일이나 비밀번호 값이 falsy하면 에러처리
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호는 필수입니다." });
  }

  const user = users[email];

  if (user) {
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }
  } else {
    const isMatch = await bcrypt.compare(password, DUMMY_HASH);

    return res
      .status(401)
      .json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }

  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

  return res.status(200).json({ token });
});

app.get("/me", authMiddleware, async (req, res) => {
  return res.status(200).json({ id: req.user.id, email: req.user.email });
});

// 혹시 모르는 예외 처리
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET 환경변수가 없습니다.");
  process.exit(1);
}

app.listen(3000, () => {
  console.log("3000 포트");
});
