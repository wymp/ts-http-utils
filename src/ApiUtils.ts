import {
  SimpleLoggerInterface,
  SimpleHttpRequestHandlerInterface,
  SimpleHttpRequestHandlerBasicInterface,
} from "@wymp/ts-simple-interfaces";
import { Api, Auth } from "@wymp/types";
import { logger } from "./Logger";
import { NumberAuthzSpec, StringAuthzSpec, assertAuthdReq, authorize } from "./AuthdReq";

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

export type ApiSpec<EndpointSpec extends GenericEndpointSpec = GenericEndpointSpec> = {
  [T in keyof EndpointSpec]: {
    method: keyof SimpleHttpRequestHandlerBasicInterface;
    endpoint: string;
    bodyParsers?: Array<(req: any, res: any, next: (e?: Error) => void) => any>;
    validate: (
      url: unknown,
      query: unknown,
      body: unknown,
      auth: Auth.ReqInfo,
      log: SimpleLoggerInterface
    ) => Promise<EndpointSpec[T]["params"]>;
    authorize:
      | Array<NumberAuthzSpec>
      | Array<StringAuthzSpec>
      | ((
          params: EndpointSpec[T]["params"],
          auth: Auth.ReqInfo,
          log: SimpleLoggerInterface
        ) => Promise<void>);
    handle: (
      params: EndpointSpec[T]["params"],
      auth: Auth.ReqInfo,
      log: SimpleLoggerInterface
    ) => Promise<Response<EndpointSpec[T]["response"]>>;
    hooks?: {
      preValidate?: (req: any, res: any, log: SimpleLoggerInterface) => Promise<void>;
      postValidate?: (
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[T]["params"]>;
      preAuthorize?: (
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[T]["params"]>;
      postAuthorize?: (
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[T]["params"]>;
      preHandle?: (
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<EndpointSpec[T]["params"]>;
      postHandle?: (
        response: Response<EndpointSpec[T]["response"]>,
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<Response<EndpointSpec[T]["response"]>>;
      preReturn?: (
        response: Response<EndpointSpec[T]["response"]>,
        params: EndpointSpec[T]["params"],
        req: any,
        res: any,
        log: SimpleLoggerInterface
      ) => Promise<Response<EndpointSpec[T]["response"]>>;
    };
  };
};

/**
 * Apply an API specification to a SimpleHttpRequestHandlerBasicInterface. This takes a standard
 * http server (express or similar) and registers endpoints against it using a standard algorithm.
 * That algorithm is outlined clearly in the code below.
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

  // For each endpoint spec....
  for (const name in apiSpec) {
    // Get the current endpoint spec into a variable
    const endpointSpec = apiSpec[name];
    r.log.notice(
      `HTTP: Registering ${endpointSpec.method
        .toUpperCase()
        .padEnd(7)} ${endpointSpec.endpoint.toString()}`
    );

    // Register global body parsers, if specified
    if (globalBodyParsers) {
      r.log.notice(`Registering ${globalBodyParsers.length} global body parser(s)`);
      globalBodyParsers.forEach((parser) => r.http.use(parser));
    }

    // Register the endpoint against the HTTP server object
    basicHttp[endpointSpec.method](endpointSpec.endpoint, [
      // If we've specified body parser, insert them as a middleware before the handler
      ...(endpointSpec.bodyParsers ? endpointSpec.bodyParsers : []),

      // Then run the handler
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

          // 3. Validate the request, returning standardized and types params
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
                meta: Object.assign(
                  { pg: { size: 25, nextCursor: null, prevCursor: null } },
                  response.meta || {}
                ),
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
