import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";

const app = express();

app.use(express.json());

const DUMMY_HASH = await bcrypt.hash("dummy", 10);
const users = {}; // { id: string; email: string; passwordHash: string}

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

// 혹시 모르는 예외 처리
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET 환경변수가 없습니다.");
  process.exit(1);
}

app.listen(3000, () => {
  console.log("3000 포트");
});
