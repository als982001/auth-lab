import express from "express";

const app = express();

app.get("/health", (req, res) => {
  return res.json({ status: "ok" });
});

app.listen(3000, () => {
  console.log("3000 포트");
});
