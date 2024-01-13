import { deepmerge } from "@wymp/weenie-base";
import { Translator as T } from "../src";

declare type DbUntypedPerson = {
  id: string;
  name: string;
  age: number | null;
  bestFriendId: string | null;
};

declare type ApiUntypedPerson = {
  id: string;
  type: "people";
  name: string;
  age: number | null;
  bestFriend: { data: { id: string; type: "people" } | null };
  otherFriends: { data: Array<{ id: string; type: "people" }>; links: any } | null;
};

declare type People = "mother" | "father" | "son" | "daughter" | "friend";
declare type DbTypedPerson = {
  id: string;
  type: People;
  name: string;
  age: number | null;
  bestFriendId: string | null;
};

declare type ApiTypedPerson = {
  id: string;
  type: People;
  name: string;
  age: number | null;
  bestFriend: { data: { id: string; type: People } | null };
  otherFriends: { data: Array<{ id: string; type: People }>; links: any } | null;
};

const UntypedPerson = new T.Translator<DbUntypedPerson, ApiUntypedPerson>(`/test/v2`, `people`, {
  name: "attr",
  age: "attr",
  bestFriend: ["bestFriendId", "people"],
  otherFriends: [null, "people"],
});

const TypedPerson = new T.Translator<DbTypedPerson, ApiTypedPerson>(`/test/v2`, `people`, {
  type: "attr",
  name: "attr",
  age: "attr",
  bestFriend: ["bestFriendId", "people"],
  otherFriends: [null, "people"],
});

const untypedDbPerson: DbUntypedPerson = {
  id: "abcde",
  name: "Jim Chavo",
  age: 31,
  bestFriendId: "12345",
};

const typedDbPerson: DbTypedPerson = {
  id: "abcde",
  type: "father",
  name: "Jim Chavo",
  age: 31,
  bestFriendId: "12345",
};

const untypedApiPerson: ApiUntypedPerson = {
  id: "abcde",
  type: "people",
  name: "Jim Chavo",
  age: 31,
  bestFriend: { data: { type: "people", id: "12345" } },
  otherFriends: {
    data: [{ type: "people", id: "bbbbb" }],
    links: { self: `/test/v2/people/abcde/otherFriends` },
  },
};

const typedApiPerson: ApiTypedPerson = {
  id: "abcde",
  type: "father",
  name: "Jim Chavo",
  age: 31,
  bestFriend: { data: { type: "friend", id: "12345" } },
  otherFriends: {
    data: [{ type: "mother", id: "bbbbb" }],
    links: { self: `/test/v2/people/abcde/otherFriends` },
  },
};

describe(`Translator`, () => {
  test("should translate normal records from db to api format correctly", () => {
    expect(UntypedPerson.dbToApi(untypedDbPerson)).toMatchObject(
      deepmerge<ApiUntypedPerson>({}, untypedApiPerson, { otherFriends: { data: null } })
    );
    expect(TypedPerson.dbToApi(typedDbPerson)).toMatchObject(
      deepmerge<ApiTypedPerson>({}, typedApiPerson, {
        bestFriend: { data: { id: "12345", type: "people" } },
        otherFriends: { data: null },
      })
    );
    expect(UntypedPerson.dbToApi([untypedDbPerson])).toMatchObject([
      deepmerge({}, untypedApiPerson, { otherFriends: { data: null } }),
    ]);
    expect(TypedPerson.dbToApi([typedDbPerson])).toMatchObject([
      deepmerge<ApiTypedPerson>({}, typedApiPerson, {
        bestFriend: { data: { id: "12345", type: "people" } },
        otherFriends: { data: null },
      }),
    ]);
  });

  test("should translate normal records from api to db format correctly", () => {
    expect(UntypedPerson.apiToDb(untypedApiPerson)).toMatchObject(untypedDbPerson);
    expect(TypedPerson.apiToDb(typedApiPerson)).toMatchObject(typedDbPerson);
    expect(UntypedPerson.apiToDb([untypedApiPerson])).toMatchObject([untypedDbPerson]);
    expect(TypedPerson.apiToDb([typedApiPerson])).toMatchObject([typedDbPerson]);
  });

  test("should handle incoming partial values from the api correctly", () => {
    const val = deepmerge<any>({}, untypedApiPerson);
    delete val.id;
    delete val.otherFriends;
    val.age = null;
    expect(UntypedPerson.apiToDb(val)).toMatchObject({
      name: "Jim Chavo",
      age: null,
      bestFriendId: "12345",
    });
  });

  test("should properly handle null references", () => {
    const person = deepmerge<DbUntypedPerson>({}, untypedDbPerson, { bestFriendId: null });
    expect(UntypedPerson.dbToApi(person)).toMatchObject(
      deepmerge<ApiUntypedPerson>({}, untypedApiPerson, {
        bestFriend: { data: null },
        otherFriends: {
          data: null,
          links: { self: "/test/v2/people/abcde/otherFriends" },
        },
      })
    );
  });

  test("should allow field-level transformations for attributes", () => {
    const TestPerson = new T.Translator<DbUntypedPerson, ApiUntypedPerson & { age: string | null }>(
      `/test/v2`,
      `people`,
      {
        name: "attr",
        age: "attr",
        bestFriend: ["bestFriendId", "people"],
        otherFriends: [null, "people"],
      },
      (from: "db" | "api", k: string | null, v: any) => {
        if (k === "age") {
          return v === null ? v : from === "db" ? String(v) : Number(v);
        }
        return v;
      }
    );

    const testDbPerson = deepmerge<DbUntypedPerson>({}, untypedDbPerson);
    const testApiPerson = deepmerge<ApiUntypedPerson & { age: string | null }>({}, untypedApiPerson, {
      age: testDbPerson.age === null ? null : String(testDbPerson.age),
    });

    expect(TestPerson.dbToApi(testDbPerson)).toMatchObject(
      deepmerge<any>({}, testApiPerson, { otherFriends: null }, { otherFriends: { data: null } })
    );
    expect(TestPerson.apiToDb(testApiPerson)).toMatchObject(testDbPerson);
  });

  test.todo("should allow field-level transformations for relationships");

  /**
   * NOTE: It is possible for people to write transform functions that use `any` for a return
   * value. That is the user's choice, and can absolutely result in unexpected shapes.
   */
  test("should allow result-level transformations", () => {
    const TestPerson = new T.Translator<DbUntypedPerson, ApiUntypedPerson & { age: string | null }>(
      `/test/v2`,
      `people`,
      {
        name: "attr",
        age: "attr",
        bestFriend: ["bestFriendId", "people"],
        otherFriends: [null, "people"],
      },
      (from, k, _v) => {
        if (k === null) {
          const v: any = _v;
          return {
            ...v,
            age: v.age === null ? null : from === "db" ? String(v.age) : Number(v.age),
          };
        }
        return _v;
      }
    );

    const testDbPerson = deepmerge<DbUntypedPerson>({}, untypedDbPerson);
    const testApiPerson = deepmerge<ApiUntypedPerson & { age: string | null }>({}, untypedApiPerson, {
      age: testDbPerson.age === null ? null : String(testDbPerson.age),
    });

    expect(TestPerson.dbToApi(testDbPerson)).toMatchObject(
      deepmerge<any>({}, testApiPerson, { otherFriends: null }, { otherFriends: { data: null } })
    );
    expect(TestPerson.apiToDb(testApiPerson)).toMatchObject(testDbPerson);
  });
});
