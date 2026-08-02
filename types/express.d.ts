// Express의 Request 타입에 우리가 런타임에 붙이는 프로퍼티를 선언한다.
// authMiddleware가 req.user를 주입하는데, Express 기본 타입은 이를 모르기 때문.
// 타입 전용 파일이라 런타임 동작에는 아무 영향이 없다.

declare global {
  namespace Express {
    interface Request {
      // authMiddleware가 담는 값과 정확히 일치해야 한다.
      // 실제로 안 담는 필드를 선언하면 타입은 통과하는데 런타임엔 undefined가 된다.
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
