import { SimpleLoggerInterface, TaggedLogger } from "@wymp/ts-simple-interfaces";

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
