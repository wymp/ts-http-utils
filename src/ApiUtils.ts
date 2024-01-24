/**
 * This module is a collection of types and utilities representing a highly experimental API definition system. This can
 * potentially be very powerful, as the goal of it is to allow you to define your entire API - from endpoints to
 * authorization to validation to response - in a single place. This is a work in progress, and is probably not ready
 * for production yet, but feel free to play around with it and see what you think. (It should be safe-enough - I'm just
 * not sure the opinions expressed in this module are optimal yet.)
 *
 * IMPORTANT: It makes the following assumptions:
 *
 * 1. You've used _some_ system to authenticate the request and attach `Auth.ReqInfo` to the request object. You can
 *    stub this out in development, but you'd typically do this by attaching a bearer token to the request with this
 *    information encoded in it and then authenticating and decoding the token. (See
 *    https://github.com/wymp/ts-auth-gateway and https://github.com/wymp/ts-auth-gateway-header-decoder)
 * 2. You're happy with my standardized API response formats and pagination ideas (see
 *    https://wymp.github.io/ts-types/modules/Api.html)
 *
 * See {@link ApiSpec} for more information.
 *
 * @module ApiUtils
 */
import {
  SimpleLoggerInterface,
  SimpleHttpRequestHandlerInterface,
  SimpleHttpRequestHandlerBasicInterface,
} from "@wymp/ts-simple-interfaces";
import { Api, Auth } from "@wymp/types";
import { logger } from "./Logger";
import { NumberAuthzSpec, StringAuthzSpec, assertAuthdReq, authorize } from "./AuthUtils";

export type SuccessResponse<Data, Meta = any> = {
  type: "success";
  status: 100 | 200 | 201 | 204;
  headers?: { [k: string]: string };
  data: Data;
  included?: Array<any>;
  meta?: Meta;
};

export type RedirectResponse = {
  type: "redirect";
  status: 301 | 302 | 307 | 308;
  headers: {
    location: string;
    [k: string]: string;
  };
};

export type Response<Data, Meta = any> = SuccessResponse<Data, Meta> | RedirectResponse;

export type GenericEndpointSpec = {
  [EndpointName: string]: {
    params: unknown;
    response: any;
  };
};

/**
 * This type defines an API specification. It's a map of endpoint names to endpoint specifications. While the names
 * are arbitrary, it's generally easiest to use something like "GET /users/:id" as the name, as that makes it very
 * obvious what endpoint we're dealing with and also very easy to find an endpoint within a given spec.
 *
 * Important things to know about an API spec:
 *
 * * You must provide a method, endpoint, and validate, authorize, and handle functions for each endpoint. The rest are
 *   optional. If you don't feel the need to validate inputs or authorize requests, you can just provide pass-through
 *   functions.
 * * The `validate` function is intended to take in the request's URL params, query params, and body, along with the
 *   request's auth information and return a specifically-typed "params" object which may be anything you'd like. This
 *   is to address annoyance of your handlers having to figure out where to get the params they need to do their work.
 *   Your handler, then, simply works with the params output from this function and can forget about the details of
 *   where those params come from.
 * * The `authorize` function can technically be any logic, but is pre-configured to work with the `authorize` function
 *   exported from this library. See the main readme for more information.
 * * The `handle` function is your primary handler and will often be a thin wrapper over a library function representing
 *   a piece of your business logic. It may do some minor transformations of input params (or not) and will then return
 *   a standardized response object that this system recognizes.
 * * Finally, if you need additional functionality for any reason (for example, to insert headers into the response or
 *   further manipulate input params or something), you can pass a variety of hooks.
 *
 * @typeParam EndpointSpec - A type defining the inputs (`params`) and outputs (`response`) of each endpoint. Note that
 * `response` is intended to be the type of the _data_ returned by this endpoint. This API system will wrap that data
 * in a more fully-featured response object (see {@link https://wymp.github.io/ts-types/modules/Api.html | Api.Response}
 * for more on that).
 */
export type ApiSpec<EndpointSpec extends GenericEndpointSpec = GenericEndpointSpec> = {
  [K in keyof EndpointSpec]: {
    method: keyof SimpleHttpRequestHandlerBasicInterface;
    endpoint: string;
    bodyParsers?: Array<(req: any, res: any, next: (e?: Error) => void) => any>;
    validate: (
      /** These are the `req.params` (i.e., url params, such as `:id` in `/users/:id`), not the final params */
      urlParams: unknown,
      /** req.query */
      query: unknown,
      /** req.body */
      body: unknown,
      auth: Auth.ReqInfo,
      log: SimpleLoggerInterface
    ) => Promise<EndpointSpec[K]["params"]>;
    authorize:
      | Array<NumberAuthzSpec>
      | Array<StringAuthzSpec>
      | ((params: EndpointSpec[K]["params"], auth: Auth.ReqInfo, log: SimpleLoggerInterface) => Promise<void>);
    handle: (
      params: EndpointSpec[K]["params"],
      auth: Auth.ReqInfo,
      log: SimpleLoggerInterface
    ) => Promise<Response<EndpointSpec[K]["response"]>>;
    hooks?: {
      preValidate?: (req: any, res: any, log: SimpleLoggerInterface) => Promise<void>;
      postValidate?: (
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[K]["params"]>;
      preAuthorize?: (
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[K]["params"]>;
      postAuthorize?: (
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[K]["params"]>;
      preHandle?: (
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[K]["params"]>;
      postHandle?: (
        response: Response<EndpointSpec[K]["response"]>,
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<Response<EndpointSpec[K]["response"]>>;
      preReturn?: (
        response: Response<EndpointSpec[K]["response"]>,
        params: EndpointSpec[K]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<Response<EndpointSpec[K]["response"]>>;
    };
  };
};

/**
 * Apply an API specification to a SimpleHttpRequestHandlerBasicInterface. This takes a standard
 * http server (express or similar) and registers endpoints against it using a standard algorithm.
 * That algorithm is outlined clearly in the code.
 *
 * See [code](https://github.com/wymp/ts-http-utils/blob/current/src/ApiUtils.ts) for more details,
 * and see {@link ApiSpec} for more detailed information about the input to this function. Finally,
 * see the [main readme](../#md:api-spec-example) for a detailed example.
 */
export const applyApiSpec = <EndpointSpec extends GenericEndpointSpec = GenericEndpointSpec>(
  apiSpec: ApiSpec<EndpointSpec>,
  r: {
    http: SimpleHttpRequestHandlerInterface;
    log: SimpleLoggerInterface;
  },
  authStub?: Auth.ReqInfo | undefined,
  globalBodyParsers?: Array<(req: any, res: any, next: (e: any) => void) => void>
): void => {
  // Breaking this out into a more narrowly scoped variable is necessary for typescript
  const basicHttp: SimpleHttpRequestHandlerBasicInterface = r.http;

  // Register global body parsers, if specified
  if (globalBodyParsers) {
    r.log.notice(`Registering ${globalBodyParsers.length} global body parser(s)`);
    globalBodyParsers.forEach((parser) => r.http.use(parser));
  }

  // For each endpoint spec....
  for (const name in apiSpec) {
    // Get the current endpoint spec into a variable
    const endpointSpec = apiSpec[name];
    r.log.notice(
      `HTTP: Registering ${endpointSpec.method.toUpperCase().padEnd(7)} ${endpointSpec.endpoint.toString()}`
    );

    // Register the endpoint against the HTTP server object
    basicHttp[endpointSpec.method](endpointSpec.endpoint, [
      // If we've specified body parser, insert them as a middleware before the handler
      ...(endpointSpec.bodyParsers ? endpointSpec.bodyParsers : []),

      // Then insert the handler
      async (req, res, next) => {
        try {
          // 0. If we're stubbing out auth, do that
          if (authStub) {
            (req as any).auth = authStub;
          }

          // 1. Make sure this is an authd request
          assertAuthdReq(req);

          // 2. Get a request-tagged logger
          const log = logger(r.log, req, res);

          // 3. Validate the request, returning standardized and typed params
          if (endpointSpec.hooks?.preValidate) {
            await endpointSpec.hooks.preValidate(req, res, log);
          }
          let params = await endpointSpec.validate(req.params, req.query, req.body, req.auth, log);
          if (endpointSpec.hooks?.postValidate) {
            params = await endpointSpec.hooks.postValidate(params, req, res, log);
          }

          // 4. Authorize the request according to the authorization specification we've passed in or
          // a custom authorization function.
          if (endpointSpec.hooks?.preAuthorize) {
            await endpointSpec.hooks.preAuthorize(params, req, res, log);
          }
          if (typeof endpointSpec.authorize === "function") {
            await endpointSpec.authorize(params, req.auth, log);
          } else {
            authorize(req, endpointSpec.authorize, log);
          }
          if (endpointSpec.hooks?.postAuthorize) {
            await endpointSpec.hooks.postAuthorize(params, req, res, log);
          }

          // 5. Run the primary handler for the request, returning a standardized response
          if (endpointSpec.hooks?.preHandle) {
            params = await endpointSpec.hooks.preHandle(params, req, res, log);
          }
          let response = await endpointSpec.handle(params, req.auth, log);
          if (endpointSpec.hooks?.postHandle) {
            response = await endpointSpec.hooks.postHandle(response, params, req, res, log);
          }

          // TODO: 6. Run include logic

          // 7. Return a response

          // Run pre-return hook
          if (endpointSpec.hooks?.preReturn) {
            response = await endpointSpec.hooks.preReturn(response, params, req, res, log);
          }

          // Apply headers
          let applyJsonHeader = true;
          if (response.headers) {
            for (const h in response.headers) {
              if (h.toLowerCase() === "content-type") {
                applyJsonHeader = false;
              }
              res.set(h, response.headers[h]);
            }
          }
          if (applyJsonHeader && response.type === "success") {
            res.set("Content-Type", "application/json");
          }

          // Assemble and send response
          if (response.type === "success") {
            // On success, send a data response
            let responseObject: Api.Response;
            if (Array.isArray(response.data)) {
              responseObject = {
                t: "collection",
                data: response.data,
                // TODO: ...(included.length > 0 ? { included } : {}),
                meta: Object.assign({ pg: { size: 25, nextCursor: null, prevCursor: null } }, response.meta || {}),
              };
            } else if (response.data === null) {
              responseObject = {
                t: "null",
                data: null,
                ...(response.meta ? { meta: response.meta } : {}),
              };
            } else {
              responseObject = {
                t: "single",
                data: response.data,
                // TODO: ...(included.length > 0 ? { included } : {}),
                ...(response.meta ? { meta: response.meta } : {}),
              };
            }

            // Send it off
            res.status(response.status).send(responseObject);
          } else {
            // Otherwise, for redirects, send a redirect response
            res.status(response.status).send();
          }
        } catch (e) {
          // On error, pass to the error handler function
          next(e);
        }
      },
    ]);
  }
};

/**
 * Take a query object (usually from `req.query`, but technically can be anything) along with
 * optional defaults and return an object of type Api.CollectionParams. This allows you to easily
 * extract collection parameters (pagination and sorting) from a request to pass into the data
 * system.
 */
export const getCollectionParams = (
  query: Api.Client.CollectionParams,
  defaults?: Partial<Api.Server.CollectionParams>
): Api.Server.CollectionParams => {
  const params: Api.Server.CollectionParams = {};

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
