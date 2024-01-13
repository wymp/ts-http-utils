import { ApiSpec, getCollectionParams } from "../src";

/**
 * To test this module, we must define and create a small API. Since this module is basically
 * entirely types, we don't really have much to do for actual tests - we're just testing to see if
 * all this compiles correctly.
 *
 * TO TEST THIS MODULE, YOU MUST GO THROUGH AND ADJUST COMMENTS TO EXPOSE EXPECTED TYPE ERRORS.
 */

declare type User = {
  id: string;
  name: string;
  email: string;
  createdMs: number;
  active: boolean;
};

declare type EndpointSpecs = {
  "GET /users": {
    params: unknown;
    response: Array<User>;
  };
  "GET /users/:id": {
    params: { userId: string };
    response: User;
  };
  "POST /users": {
    params: {
      body: { data: Pick<User, "name" | "email"> };
    };
    response: User;
  };
  "PATCH /users/:id": {
    params: {
      userId: string;
      body: { data: Partial<Pick<User, "name" | "email">> };
    };
    response: User;
  };
};

describe("ApiUtils", () => {
  describe("API Definitions", () => {
    test("API definition compiles correctly", () => {
      const Api: ApiSpec<EndpointSpecs> = {
        "GET /users": {
          method: "get" as const,
          endpoint: "/users",
          validate: (u, q, b, log) => Promise.resolve(null),
          authorize: [
            ["system", true, null, null],
            ["internal", null, "sysadmin", null],
            ["internal", null, "employee", null],
          ],
          handle: (p, log) => {
            /** Error response * /
            return Promise.resolve({
              type: "success",
              status: 200 as const,
              data: [{
                id: "abcde"
              }]
            })
            /** Good response */
            return Promise.resolve({
              type: "success",
              status: 200 as const,
              data: [
                {
                  id: "abcde",
                  name: "Jim Chavo",
                  email: "jim.chavo@user.com",
                  createdMs: 12345,
                  active: true,
                },
              ],
            });
            /**/
          },
        },
        "GET /users/:id": {
          method: "get" as const,
          endpoint: "/users/:id",
          validate: (u, q, b, log) => Promise.resolve({ userId: "abcde" }),
          authorize: [],
          hooks: {},
          handle: (p, log) => {
            /** Error response * /
            return Promise.resolve({
              type: "success",
              status: 200 as const,
              data: {
                id: p.userId,
                name: p.userName,
                email: "abcde@user.com",
                createdMs: 12345,
                active: true,
              }
            })
            /** Good response */
            return Promise.resolve({
              type: "success",
              status: 200 as const,
              data: {
                id: p.userId,
                name: "Jim Chavo",
                email: "jim.chavo@user.com",
                createdMs: 12345,
                active: true,
              },
            });
            /**/
          },
        },
        "POST /users": {
          method: "post" as const,
          endpoint: "/users",
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ id: "abcde", name: "Jim Chavo" }),
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ body: { data: { id: "abcde", name: "Jim Chavo" } } }),
          /** Good value */
          validate: (u, q, b, log) =>
            Promise.resolve({ body: { data: { name: "Jim Chavo", email: "jim.chavo@user.com" } } }),
          /**/
          authorize: [],
          hooks: {
            preValidate: (req, res) => Promise.resolve(),
          },
          handle: (p, log) => {
            return Promise.resolve({
              type: "success",
              status: 201 as const,
              data: {
                id: "abcde",
                /** Error value * /
                name: p.body.name,
                email: p.body.userEmail,
                /** Error value * /
                name: p.body.data.name,
                email: p.body.data.userEmail,
                /** Good value */
                name: p.body.data.name,
                email: p.body.data.email,
                /**/
                createdMs: 12345,
                active: true,
              },
            });
          },
        },
        "PATCH /users/:id": {
          method: "patch" as const,
          endpoint: "/users/:id",
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ url: {}, body: {} }),
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ userId: "abcde", body: { data: { chow: "mein" } } }),
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ userId: "abcde", body: { data: { name: "Jim Chavo", email: 1 } } }),
          /** Error value * /
          validate: (u, q, b, log) => Promise.resolve({ userId: true, body: { data: { name: "Jimmy Chavo" } } }),
          /** Good value * /
          validate: (u, q, b, log) => Promise.resolve({ userId: "abcde", body: { data: {} } }),
          /** Good value */
          validate: (u, q, b, log) => Promise.resolve({ userId: "abcde", body: { data: { name: "Jimmy Chavo" } } }),
          /**/
          authorize: (p, auth, log) => {
            /** Error value * /
            if (auth.u && auth.u.id !== p.user) {
              throw new Error("Not authorized");
            }
            /** Good value */
            if (auth.u && auth.u.id !== p.userId) {
              throw new Error("Not authorized");
            }
            /**/
            return Promise.resolve();
          },
          hooks: {
            /** Error value * /
            notAHook: (req, res) => Promise.resolve(),
            /** Error value * /
            postValidate: (params, req, res) => Promise.resolve({ not: "your params" }),
            /** Error value * /
            postValidate: (params, req, res) => params,
            /** Error value * /
            postValidate: (params, req, res) => Promise.resolve({ ...params, body: { data: { nonexistent: p.body.data.nonexistent } } }),
            /** Error value * /
            preReturn: (response, params, req, res) => Promise.resolve({ bad: "response" }),
            /** Good value * /
            preValidate: (req, res) => Promise.resolve(),
            /** Good value * /
            postValidate: (params, req, res) => Promise.resolve(params),
            /** Good value */
            preReturn: (response, params, req, res) => Promise.resolve(response),
            /**/
          },
          handle: (p, log) => {
            return Promise.resolve({
              type: "success",
              status: 200 as const,
              data: {
                /** Error value * /
                id: p.userId,
                name: p.body.data.name || "Jim Chavo",
                email: 1,
                /** Error value * /
                id: p.userId,
                name: p.body.data.newName || "Jim Chavo",
                email: p.body.data.email || "jim.chavo@user.com",
                /** Error value * /
                id: p.myId,
                name: p.body.data.name || "Jim Chavo",
                email: p.body.data.email || "jim.chavo@user.com",
                /** Good value */
                id: p.userId,
                name: p.body.data.name || "Jim Chavo",
                email: p.body.data.email || "jim.chavo@user.com",
                /**/
                createdMs: 12345,
                active: true,
              },
            });
          },
        },
      };

      // useless assertion to use the Api constant so typescript doesn't yell at us
      expect(Api["GET /users"].method).toBe("get");
    });
  });

  describe("getCollectionParams", () => {
    test("returns empty object if nothing passed in and no defaults", () => {
      expect(Object.keys(getCollectionParams({}))).toHaveLength(0);
    });

    test("returns defaults if nothing passed in", () => {
      expect(getCollectionParams({}, { __pg: { size: 25 }, __sort: "id" })).toMatchObject({
        __pg: { size: 25 },
        __sort: "id",
      });
    });

    test("overrides defaults if params passed in", () => {
      expect(
        getCollectionParams(
          {
            pg: {
              size: 100,
              cursor: "abcde",
            },
          },
          { __pg: { size: 25 }, __sort: "id" }
        )
      ).toMatchObject({
        __pg: { size: 100 },
        __sort: "id",
      });
    });
  });
});
