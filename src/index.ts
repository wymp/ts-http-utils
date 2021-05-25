import * as E from "@wymp/http-errors";
import { SimpleLoggerInterface, TaggedLogger } from "@wymp/ts-simple-interfaces";
import { Auth, Api } from "@wymp/types";

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

type Obstruction = {
  code: string;
  text: string;
};

export const isAuthdReq = <T>(_req: T, _obs?: Array<Obstruction>): _req is Auth.AuthdReq<T> => {
  const req: any = _req;
  const obs: Array<Obstruction> = _obs || [];

  if (!req) {
    obs.push({ code: "Missing Request", text: "No request object was given." });
  } else {
    if (!req.auth) {
      obs.push({ code: "Missing Auth", text: "No 'auth' key found on request object." });
    } else {
      if (req.auth.t !== 0 && req.auth.t !== 1) {
        obs.push({
          code: "Missing or Bad Auth Type",
          text: `Auth 't' parameter must be 0 or 1. You passed '${req.auth.t}'.`,
        });
      }

      if (typeof req.auth.c !== "string") {
        obs.push({
          code: "Missing or Bad Client ID",
          text: `Auth 'c' param must be a string representing the client ID.`,
        });
      }

      if (typeof req.auth.a !== "boolean") {
        obs.push({
          code: "Missing or Bad 'Authenticated' Flag",
          text:
            `Auth 'a' param must be a boolean value indicating whether the client id was ` +
            `authenticated.`,
        });
      }

      if (req.t === 0 && !Array.isArray(req.auth.r)) {
        obs.push({
          code: "Missing or Bad 'Client Roles' Collection",
          text: `Auth 'r' param must be an array of strings representing client roles.`,
        });
      }

      if (req.t === 1 && typeof req.auth.r !== "number") {
        obs.push({
          code: "Missing or Bad 'Client Roles' Value",
          text: `Auth 'r' param must be an integer representing client roles.`,
        });
      }

      if (typeof req.auth.ip !== "string") {
        obs.push({
          code: "Missing or Bad 'IP' Value",
          text: `Auth 'ip' param must be a string representing the IP from which this request came.`,
        });
      }
    }
  }

  return obs.length === 0;
};

export function assertAuthdReq<T>(_req: T): asserts _req is Auth.AuthdReq<T> {
  const obs: Array<Obstruction> = [];
  if (!isAuthdReq(_req, obs)) {
    throw new E.Unauthorized(
      `Request 'auth' value does not exist or does not conform to the expected values in ` +
        `@wymp/types:\n\n * ${obs
          .map((o) => `${o.code}: ${o.text}`)
          .join(`\n * `)}\n\nAuth value: ` +
        JSON.stringify((_req as any)?.auth),
      `BAD-AUTH-OBJECT`,
      obs
    );
  }
}

// prettier-ignore
export const isBitwiseAuthdReq = <T>(req: T, o?: Array<Obstruction>): req is T & { auth: Auth.ReqInfoBitwise } => {
  return isAuthdReq(req, o) &&
    typeof req.auth.r === "number" &&
    (!req.auth.u || (typeof req.auth.u.r === "number" && typeof req.auth.u.s === "undefined" || typeof req.auth.u.s === "number"));
}

// prettier-ignore
export const isStringAuthdReq = <T>(req: T, o?: Array<Obstruction>): req is T & { auth: Auth.ReqInfoString } => {
  return isAuthdReq(req, o) &&
    (Array.isArray(req.auth.r) && (req.auth.r.length === 0 || typeof req.auth.r[0] === "string")) &&
    (!req.auth.u || (Array.isArray(req.auth.u.r) && (req.auth.u.r.length === 0 || typeof req.auth.u.r[0] === "string"))) &&
    (!req.auth.u || !req.auth.u.s || (Array.isArray(req.auth.u.s) && (req.auth.u.s.length === 0 || typeof req.auth.u.s[0] === "string")));
}

/**
 * Use this function to easily authorize requests. It ensures that requests contain auth info and
 * additionally fulfill one of the given authorization requirements.
 *
 * NOTE: It is sufficient that all of the specified clauses in just ONE of the tuples pass
 * authorization.
 */
declare type ClientAuthorized = boolean;
declare type ClientRole = string;
declare type UserRole = string;
declare type OAuthScope = string;
declare type NumberSpec = [number | null, ClientAuthorized | null, number | null, number | null];
declare type StringSpec = [
  ClientRole | null,
  ClientAuthorized | null,
  UserRole | null,
  OAuthScope | null
];

const isNumberSpec = (spec: any): spec is NumberSpec => {
  return (
    Array.isArray(spec) &&
    (spec[0] === null || typeof spec[0] === "number") &&
    (spec[2] === null || typeof spec[2] === "number") &&
    (spec[3] === null || typeof spec[3] === "number")
  );
};
const isStringSpec = (spec: any): spec is StringSpec => {
  return (
    Array.isArray(spec) &&
    (spec[0] === null || typeof spec[0] === "string") &&
    (spec[2] === null || typeof spec[2] === "string") &&
    (spec[3] === null || typeof spec[3] === "string")
  );
};

export function authorize<T>(
  req: T,
  authSpecs: Array<StringSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReq<T>;
export function authorize<T>(
  req: T,
  authSpecs: Array<NumberSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReq<T>;
export function authorize<T>(
  req: T,
  authSpecs: Array<NumberSpec> | Array<StringSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReq<T> {
  assertAuthdReq<T>(req);
  log.info(`Request has auth info attached`);

  // If we haven't specified any auth criteria, then just pass it
  if (authSpecs.length === 0) {
    log.info(`No auth criteria required. Permitting request.`);
    return;
  }

  const o: Array<Obstruction> = [];

  // For bitwise auth....
  if (isBitwiseAuthdReq(req, o)) {
    // Iterate through criteria and see if anything matches
    for (const auth of authSpecs) {
      // If our auth criteria disagrees with our auth object, throw
      if (!isNumberSpec(auth)) {
        throw new E.InternalServerError(
          `Programmer: type of auth criterion disagrees with type of auth object. Auth object ` +
            `is "Bitwise" (t = 1), but auth criterion appears to be string-based. Can't proceed. ` +
            `Auth object: ${JSON.stringify(req.auth)}; Auth criterion: ${JSON.stringify(auth)};`,
          `AUTH-CRITERION-MISMATCH_NUM-STRING`
        );
      }

      // Client Roles
      if (auth[0] !== null && !(req.auth.r & auth[0])) {
        continue;
      }
      // Client authorized
      if (auth[1] === true && req.auth.a !== true) {
        continue;
      }
      // User Roles
      if (auth[2] && (!req.auth.u || !(req.auth.u.r & auth[2]))) {
        continue;
      }
      // Auth scopes
      if (
        auth[3] !== null &&
        (!req.auth.u || typeof req.auth.u.s !== "number" || !(req.auth.u.s & auth[3]))
      ) {
        continue;
      }

      // If we've gotten this far, then this is a match and the request is authorized
      log.notice(`Request is authorized.`);
      return;
    }
  } else if (isStringAuthdReq(req, o)) {
    for (const auth of authSpecs) {
      // If our auth criteria disagrees with our auth object, throw
      if (!isStringSpec(auth)) {
        throw new E.InternalServerError(
          `Programmer: type of auth criterion disagrees with type of auth object. Auth object ` +
            `is "String" (t = 0), but auth criterion appears to be number-based. Can't proceed. ` +
            `Auth object: ${JSON.stringify(req.auth)}; Auth criterion: ${JSON.stringify(auth)};`,
          `AUTH-CRITERION-MISMATCH_STRING-NUM`
        );
      }

      // Client Roles
      if (auth[0] !== null && !req.auth.r.includes(auth[0])) {
        continue;
      }
      // Client authorized
      if (auth[1] === true && req.auth.a !== true) {
        continue;
      }
      // User Roles
      if (auth[2] && (!req.auth.u || !req.auth.u.r.includes(auth[2]))) {
        continue;
      }
      // Auth scopes
      if (
        auth[3] !== null &&
        (!req.auth.u || !Array.isArray(req.auth.u.s) || !req.auth.u.s.includes(auth[3]))
      ) {
        continue;
      }

      // If we've gotten this far, then this is a match and the request is authorized
      log.notice(`Request is authorized.`);
      return;
    }
  } else {
    // Non-conformant auth object
    throw new E.BadRequest(
      `You've passed a non-conforming auth object: ${o.map((_o) => `${_o.code}: ${_o.text}`)}`,
      `BAD-AUTH-OBJECT`,
      o
    );
  }

  // If we fell through, it's a bust
  const e = new E.Forbidden(`This endpoint may only be accessed internally by authorized users.`);
  e.obstructions.push({
    code: `Does not match authorization criteria`,
    text:
      `The user, API key or OAuth token you passed does not meet the authorization ` +
      `requirements for this request.`,
    params: {
      authSpecs,
      userInfo: {
        clientRoles: req.auth.r,
        clientAuthorized: req.auth.a,
        userRoles: req.auth.u ? req.auth.u.r : null,
        oauthScopes: req.auth.u ? req.auth.u.s : null,
      },
    },
  });
  throw e;
}

export const getCollectionParams = (
  query: any,
  defaults?: Partial<Api.CollectionParams>
): Api.CollectionParams => {
  const params: Api.CollectionParams = {};

  // First fill in defaults, if given
  if (defaults) {
    if (defaults.__pg && Object.keys(defaults.__pg).length > 0) {
      params.__pg = {};
      if (defaults.__pg.size) {
        params.__pg.size = defaults.__pg.size;
      }
      if (defaults.__pg.cursor) {
        params.__pg.cursor = defaults.__pg.cursor;
      }
    }
    if (defaults.__sort) {
      params.__sort = defaults.__sort;
    }
  }

  // Then fill in actual params, if given
  if (query) {
    if (query.pg && Object.keys(query.pg).length > 0) {
      params.__pg = {};
      if (query.pg.size) {
        params.__pg.size = query.pg.size;
      }
      if (query.pg.cursor) {
        params.__pg.cursor = query.pg.cursor;
      }
    }
    if (query.sort) {
      params.__sort = query.sort;
    }
  }

  // Then return
  return params;
};
