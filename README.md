# HTTP Utils

This is a small typescript package providing various utilities for HTTP environments. These are
built assuming Express as an HTTP request handler framework.

**NOTE: You can better view documentation for this library by cloning it and running
`pnpm i && pnpm docs:gen && pnpm docs:view`.**

The utilities are:

- `logger` - Take an HTTP request/response pair and attach a logger tagged with the essential
  request details. Returns the same logger (stored in `res.locals`) when called with the same
  `req`/`res` pair.
- `isAuthdReq` - A type guard function indicating that the object passed in has an `auth` key
  whose value conforms to the `Auth.ReqInfo` type from `@wymp/types`.
- `assertAuthdReq` - A type _assertion_ function asserting the above (throws error if not).
- `isBitwiseAuthdReq` - A type guard function indicating the above, but specifically for ReqInfo
  using bitwise client and user roles.
- `isStringAuthdReq` - A type guard function indicating the above, but specifically for ReqInfo
  using string client and user roles (e.g. "user", "sysadmin", "employee", .....).
- `authorize` - A function taking a request and an `AuthSpec` and either returning true or throwing
  a 403 error indicating the requirements for valid authorization. See `src/index.ts::authorize`
  for more information.
- `getCollectionParams` - A function that takes in query parameters and an optional set of default
  values and returns an `Api.CollectionParams` object.
- `Translator` - Instantiate this class with DB and API data definitions (and an optional value
  transformer) to provide an easy way to translate objects between the Wymp-standard API format
  and a flat DB format. See `src/Translator.ts` for more information.
