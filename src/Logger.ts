import { SimpleLoggerInterface, TaggedLogger } from "@wymp/ts-simple-interfaces";

/**
 * Call this function at the top of your request handlers and/or middleware to obtain a logger tagged with information
 * from the current request. For a given request, you'll always get the same logger back.
 *
 * @example
 *
 * ```ts
 * export const myRequestHandler = (deps: { log: SimpleLoggerInterface }) =>
 *   (req: Request, res: Response, next: NextFunction) => {
 *     try {
 *       const log = logger(deps.log, req, res);
 *       log.info("Starting request `myRequestHandler`");
 *       // ...
 *       res.send("OK");
 *     } catch (e) {
 *       next(e);
 *     }
 *   }
 * ```
 */
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
};
