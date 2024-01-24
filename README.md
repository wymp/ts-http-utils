HTTP Utils
==============================================================================================================

**WARNING: EXPERIMENTAL. This library contains several experimental utilities whose goal is to make creating robust APIs
easier. Some of these utilities are intended to work within a highly opinionated system and may not work well for you if
your opinions differ.**

This is a small typescript package providing various utilities for HTTP environments. These are built assuming Express
as an HTTP request handler framework.

NOTE: You can better view documentation for this library by cloning it and running `pnpm i && pnpm docs:gen && pnpm docs:view`.

The utilities are:

- `logger` - Take an HTTP request/response pair and attach a logger tagged with the essential request details. Returns
  the same logger (stored in `res.locals`) when called with the same `req`/`res` pair.
- `isAuthdReq` - A type guard function indicating that the object passed in has an `auth` key whose value conforms to
  the `Auth.ReqInfo` type from `@wymp/types`.
- `assertAuthdReq` - A type _assertion_ function asserting the above (throws error if not).
- `isBitwiseAuthdReq` - A type guard function indicating the above, but specifically for ReqInfo using bitwise client
  and user roles.
- `isStringAuthdReq` - A type guard function indicating the above, but specifically for ReqInfo using string client and
  user roles (e.g. "user", "sysadmin", "employee", .....).
- `authorize` - A function taking a request and an `AuthSpec` and either returning true or throwing a 403 error
  indicating the requirements for valid authorization. See `src/index.ts::authorize` for more information.
- `getCollectionParams` - A function that takes in query parameters and an optional set of default values and returns an
  `Api.CollectionParams` object.
- `Translator` - Instantiate this class with DB and API data definitions (and an optional value transformer) to provide
  an easy way to translate objects between the Wymp-standard API format and a flat DB format. See `src/Translator.ts`
  for more information.


## API Spec

In addition to the above, this library provides an experimental idea for the easy and clear creation of a robust API
server. That's fairly well documented over in [./src/ApiUtils.ts](https://wymp.github.io/ts-http-utils/modules/ApiUtils.html),
but following is a detailed example of it.


### API Spec Example

This system is an attempt at externalizing and consolidating your API definition so that your code is both type-safe and
also easy to read and understand. There are three parts to that:

1. Data model definition
2. API I/O definition
3. Full API definition

You might do the first two parts in `types.ts` file such as the following:

```ts
// src/types.ts

//
// Data Model
//

export type People = {
  name: string;
  dobMs: number;
}

export type Place = {
  name: string;
  lat: number;
  long: number;
}

export type Obj = {
  length: number;
  width: number;
}


//
// API I/O
//

export type ApiIO = {
  "GET /people/:id": {
    params: {
      people: People;
    };
    response: People;
  };

  "POST /people": {
    params: {
      people: People;
    };
    response: People;
  };

  "DELETE /people/:id": {
    params: {
      people: People;
    };
    response: null;
  };

  "GET /places/:id": {
    params: {
      places: Place;
    };
    response: Place;
  };

  "POST /places": {
    params: {
      places: Place;
    };
    response: Place;
  };

  "DELETE /places/:id": {
    params: {
      places: Place;
    };
    response: null;
  };

  "GET /objects/:id": {
    params: {
      objects: Obj;
    };
    response: Obj;
  };

  "POST /objects": {
    params: {
      objects: Obj;
    };
    response: Obj;
  };

  "DELETE /objects/:id": {
    params: {
      objects: Obj;
    };
    response: null;
  };
}

```

Notice in the above definition that in all cases we're expecting an actual object in our params, not just an id. This is
because, for GET requests, verifying that the resources with the given id exists is typically part of the `validate`
phase, and for POST requests, you're expecting (and validating) the object in the body as part of the `validate` phase
as well. Thus, in all cases, it's actually the `validate` function that is doing the work here. Note that the `validate`
function can return literally anything, so you can define your params exactly as you please. It's only there to help
separate out the concerns.

Now we'll look at the actually API definition. We're wrapping this in a function so that everything within the
definition has full access to all of our application dependencies (via the DI container we'll pass in).

```ts
// src/http.ts
import { type ApiSpec, applyApiSpec } from '@wymp/http-utils';
import { HttpError } from '@wymp/http-errors';
import { json } from 'express';
import type { ApiIO } from './types';
import type { Deps } from './deps/production';
import { Validators } from './validators';

/** We put this in function form so that we can pass in our dependencies so the API functions can use them */
export const defineHttpApi = (deps: Deps) => {
  const apiSpec: ApiSpec<ApiIO> = {
    "GET /people/:id": {
      method: "get",
      endpoint: "/people/:id",
      validate: async (urlParams) => ({
        // Will throw HttpError(404) if not exists
        people: await deps.db.getPeople({ id: urlParams.id! });
      }),
      authorize: (params, auth) => {
        // If the requested user is not the requesting user, throw
        if (auth.u?.id !== params.people.id) {
          // Throwing a 404 here so as not to leak sensitive data
          throw new HttpError(404, 'User not found');
        }
      },
      handle: (params) => ({
        type: "success",
        status: 200,
        data: params.people,
      }),
    },

    "POST /people": {
      method: "post",
      endpoint: "/people",
      validate: async (urlParams, query, body) => {
        if (!body.data) {
          throw new HttpError(400, 'Request body is missing `data` element.');
        }
        // Suppose this is a [runtype](https://github.com/pelotom/runtypes)
        const result = Validators.People.validate(body.data);
        if (!result.success) {
          throw new HttpError(
            400,
            `Bad data: ${result.message} (Details: ${JSON.stringify(result.details)})`
          );
        }

        // Now we know result.value contains the correct type
        return result.value;
      },
      authorize: [
        // Must be an internal client (i.e., our own website)
        ['internal-client', true, null, null],
        // Or it must be an admin user
        [null, null, 'admin-user', null],
      ],
      handle: (params) => {
        const person = deps.db.createPerson(params.people);
        return {
          type: "success",
          status: 201,
          data: person,
        };
      },
    },

    "DELETE /people/:id": {
      method: "delete",
      endpoint: "/people/:id",
      validate: async (urlParams) => ({
        // Will throw HttpError(404) if not exists
        people: await deps.db.getPeople({ id: urlParams.id! });
      }),
      authorize: (params, auth) => {
        if (
          // if it's not an authenticated internal client
          !(auth.r.includes('internal-client') && auth.a) &&
          // and it's not an admin user
          !(auth.u?.r.includes('admin-user')) &&
          // And the requested user is not the requesting user
          !(auth.u?.id === params.people.id)
        ) {
          // Throw a 404 here so as not to leak sensitive data
          throw new HttpError(404, 'User not found');
        }
      },
      handle: (params) => {
        await deps.db.deletePeople({ id: params.people.id });
        return {
          type: "success",
          status: 200,
          data: null,
        }
      },
    },

    // ......
  }

  return applyApiSpec(apiSpec, deps, undefined, [json]);
}
```