import { SimpleLoggerInterface, TaggedLogger } from "@wymp/ts-simple-interfaces";
import { Auth } from "@wymp/types";

export const logger = (
  log: SimpleLoggerInterface,
  req: {
    method: string;
    path: string;
    get: (h: string) => string | undefined;
    connection?: {
      remoteAddress?: string;
    };
  },
  res: { locals: any }
): SimpleLoggerInterface => {
  if (!res.locals.logtag) {
    let ip: string | undefined = req.get("x-forwarded-for");
    if (!ip && req.connection && req.connection.remoteAddress) {
      ip = req.connection.remoteAddress;
    }
    res.locals.logtag = `HTTP: ${req.method} ${req.path}: (${ip || `unknown`}):`;
  }
  if (!res.locals.log) {
    res.locals.log = new TaggedLogger(res.locals.logtag, log);
  }
  return res.locals.log;
}

export const isAuthdReq = <T>(_req: T): _req is T & { auth: Auth.ReqInfo } => {
  const req: any = _req;
  return (req
    && req.auth
    && req.auth.t !== undefined
    && req.auth.c !== undefined
    && req.auth.a !== undefined
    && req.auth.r !== undefined
    && req.auth.ip !== undefined);
}
