import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import express from "express";

const app = express();

app.use(express.json());

const users = {};

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

app.listen(3000, () => {
  console.log("3000 포트");
});
