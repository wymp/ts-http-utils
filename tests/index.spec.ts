import { MockSimpleLogger } from "@wymp/ts-simple-interfaces-testing";
import { logger } from "../src";

describe("HTTP Utils", () => {
  describe("logger", () => {
    let req: any;
    let res: any;
    let _log: MockSimpleLogger;

    beforeEach(() => {
      req = {
        method: "GET",
        path: "/test",
        get: jest.fn((h: string) => "127.0.0.1,13.525.51.122"),
        connection: {
          remoteAddress: "13.525.51.122",
        }
      }
      res = { locals: {} }
      _log = new MockSimpleLogger();
    });

    test("returns the same logger on each call", () => {
      const log1 = logger(_log, req, res);
      const log2 = logger(_log, req, res);
      expect(log1 === log2).toBe(true);
    });
  });
});
