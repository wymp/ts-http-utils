/**
 * This module contains utility types and functions for working with the authentication system described in
 * https://wymp.github.io/ts-types/modules/Auth.html.
 *
 * See that documentation for more information on the types and how they work.
 *
 * @module AuthUtils
 */
import { HttpError, ObstructionInterface } from "@wymp/http-errors";
import { SimpleLoggerInterface } from "@wymp/ts-simple-interfaces";
import { Auth } from "@wymp/types";

/**
 * A type-guard function that determines if a given express request object is an AuthdReq object.
 *
 * If you pass in an obstructions array, it will be filled with any reasons why the request is not an AuthdReq.
 *
 * NOTE: This is generally a bad pattern. It's better to use the `assertAuthdReq` function below, which is a
 * type-assertion function and will throw a useful HttpError if the request is not an AuthdReq.
 */
export const isAuthdReq = <T>(_req: T, _obs?: Array<ObstructionInterface>): _req is Auth.AuthdReq<T> => {
  const req: any = _req;
  const obs: Array<ObstructionInterface> = _obs || [];

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
          text: `Auth 'a' param must be a boolean value indicating whether the client id was ` + `authenticated.`,
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

/**
 * A type-assertion function asserting that the given express request object is an AuthdReq object. You should be able
 * to use this at the top of any handler to easily throw an error if the request is not an AuthdReq. If this does not
 * throw an error, you can safely use the `req.auth` object to then authorize the client for the given request.
 */
export function assertAuthdReq<T>(_req: T): asserts _req is Auth.AuthdReq<T> {
  const obs: Array<ObstructionInterface> = [];
  if (!isAuthdReq(_req, obs)) {
    throw new HttpError(
      401,
      `Request 'auth' value does not exist or does not conform to the expected values in ` +
        `@wymp/types:\n\n * ${obs.map((o) => `${o.code}: ${o.text}`).join(`\n * `)}\n\nAuth value: ` +
        JSON.stringify((_req as any)?.auth),
      { subcode: `BAD-AUTH-OBJECT`, obstructions: obs }
    );
  }
}

/**
 * As of a few versions ago, data in our AuthdRequests can now be either bitwise or string-based. This is a type-guard
 * function for the bitwise version
 */
export const isBitwiseAuthdReq = <T>(
  req: T,
  o?: Array<ObstructionInterface>
): req is T & { auth: Auth.ReqInfoBitwise } => {
  return (
    isAuthdReq(req, o) &&
    typeof req.auth.r === "number" &&
    (!req.auth.u ||
      (typeof req.auth.u.r === "number" && typeof req.auth.u.s === "undefined") ||
      typeof req.auth.u.s === "number")
  );
};

/**
 * As of a few versions ago, data in our AuthdRequests can now be either bitwise or string-based. This is a type-guard
 * function for the string-based version
 */
export const isStringAuthdReq = <T>(
  req: T,
  o?: Array<ObstructionInterface>
): req is T & { auth: Auth.ReqInfoString } => {
  return (
    isAuthdReq(req, o) &&
    Array.isArray(req.auth.r) &&
    (req.auth.r.length === 0 || typeof req.auth.r[0] === "string") &&
    (!req.auth.u ||
      (Array.isArray(req.auth.u.r) && (req.auth.u.r.length === 0 || typeof req.auth.u.r[0] === "string"))) &&
    (!req.auth.u ||
      !req.auth.u.s ||
      (Array.isArray(req.auth.u.s) && (req.auth.u.s.length === 0 || typeof req.auth.u.s[0] === "string")))
  );
};

//
//
// `authorize` function and related types
//
//

declare type ClientAuthorized = boolean;
declare type ClientRole = string;
declare type UserRole = string;
declare type OAuthScope = string;
export type NumberAuthzSpec = [number | null, ClientAuthorized | null, number | null, number | null];
export type StringAuthzSpec = [ClientRole | null, ClientAuthorized | null, UserRole | null, OAuthScope | null];

const isNumberAuthzSpec = (spec: any): spec is NumberAuthzSpec => {
  return (
    Array.isArray(spec) &&
    (spec[0] === null || typeof spec[0] === "number") &&
    (spec[2] === null || typeof spec[2] === "number") &&
    (spec[3] === null || typeof spec[3] === "number")
  );
};
const isStringAuthzSpec = (spec: any): spec is StringAuthzSpec => {
  return (
    Array.isArray(spec) &&
    (spec[0] === null || typeof spec[0] === "string") &&
    (spec[2] === null || typeof spec[2] === "string") &&
    (spec[3] === null || typeof spec[3] === "string")
  );
};

/**
 * Use the `authorize` function to easily authorize requests according to the given auth spec. It ensures that requests
 * contain auth info and additionally fulfill one of the given authorization requirements in authSpecs.
 *
 * NOTE: For auth specs, it is sufficient that all of the specified clauses in just ONE of the tuples pass
 * authorization. I.e., `authSpecs` is an array of authorization criteria, _any one of which_ will authorize the request.
 */
export function authorize<T>(
  req: T,
  authSpecs: Array<StringAuthzSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReqString<T>;
export function authorize<T>(
  req: T,
  authSpecs: Array<NumberAuthzSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReqBitwise<T>;
export function authorize<T>(
  req: T,
  authSpecs: Array<StringAuthzSpec> | Array<NumberAuthzSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReq<T>;
export function authorize<T>(
  req: T,
  authSpecs: Array<NumberAuthzSpec> | Array<StringAuthzSpec>,
  log: SimpleLoggerInterface
): asserts req is Auth.AuthdReq<T> {
  assertAuthdReq<T>(req);
  log.info(`Request has auth info attached`);

  // If we haven't specified any auth criteria, then just pass it
  if (authSpecs.length === 0) {
    log.info(`No auth criteria required. Permitting request.`);
    return;
  }

  const o: Array<ObstructionInterface> = [];

  // For bitwise auth....
  if (isBitwiseAuthdReq(req, o)) {
    // Iterate through criteria and see if anything matches
    for (const auth of authSpecs) {
      // If our auth criteria disagrees with our auth object, throw
      if (!isNumberAuthzSpec(auth)) {
        throw new HttpError(
          500,
          `Programmer: type of auth criterion disagrees with type of auth object. Auth object ` +
            `is "Bitwise" (t = 1), but auth criterion appears to be string-based. Can't proceed. ` +
            `Auth object: ${JSON.stringify(req.auth)}; Auth criterion: ${JSON.stringify(auth)};`,
          { subcode: `AUTH-CRITERION-MISMATCH_NUM-STRING` }
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
      if (auth[3] !== null && (!req.auth.u || typeof req.auth.u.s !== "number" || !(req.auth.u.s & auth[3]))) {
        continue;
      }

      // If we've gotten this far, then this is a match and the request is authorized
      log.notice(`Request is authorized.`);
      return;
    }
  } else if (isStringAuthdReq(req, o)) {
    for (const auth of authSpecs) {
      // If our auth criteria disagrees with our auth object, throw
      if (!isStringAuthzSpec(auth)) {
        throw new HttpError(
          500,
          `Programmer: type of auth criterion disagrees with type of auth object. Auth object ` +
            `is "String" (t = 0), but auth criterion appears to be number-based. Can't proceed. ` +
            `Auth object: ${JSON.stringify(req.auth)}; Auth criterion: ${JSON.stringify(auth)};`,
          { subcode: `AUTH-CRITERION-MISMATCH_STRING-NUM` }
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
      if (auth[3] !== null && (!req.auth.u || !Array.isArray(req.auth.u.s) || !req.auth.u.s.includes(auth[3]))) {
        continue;
      }

      // If we've gotten this far, then this is a match and the request is authorized
      log.notice(`Request is authorized.`);
      return;
    }
  } else {
    // Non-conformant auth object
    throw new HttpError(400, `You've passed a non-conforming auth object: ${o.map((_o) => `${_o.code}: ${_o.text}`)}`, {
      subcode: `BAD-AUTH-OBJECT`,
      obstructions: o,
    });
  }

  // If we fell through, it's a bust
  throw new HttpError(403, `This endpoint may only be accessed internally by authorized users.`, {
    obstructions: [
      {
        code: `Does not match authorization criteria`,
        text:
          `The user, API key or OAuth token you passed does not meet the authorization ` +
          `requirements for this request.`,
        data: {
          authSpecs,
          userInfo: {
            clientRoles: req.auth.r,
            clientAuthorized: req.auth.a,
            userRoles: req.auth.u ? req.auth.u.r : null,
            oauthScopes: req.auth.u ? req.auth.u.s : null,
          },
        },
      },
    ],
  });
}
