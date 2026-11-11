// express는 타입 정의를 따로 내려받아야 한다(@types/express). 서버는 빌드한 화면 파일을 내어 주는 데만 쓰므로 그 부분만 적는다.
declare module 'express' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  type Handler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;

  const express: {
    /** 폴더 안의 파일을 그대로 내어 준다. */
    static(root: string): Handler;
  };
  export default express;
}
