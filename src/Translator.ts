import { SimpleLogLevels, SimpleLoggerInterface } from "@wymp/ts-simple-interfaces";

/**
 * Translators perform the work of translating data between database format and api format[1]. They
 * are instantiated with an api prefix (e.g., '/registry/v3', '/brokerage/v2', etc...), a default
 * type, a spec, and an optional tranform function[2]. It is intended that each service will
 * maintain a library of resource translators that can be used throughout the service.
 *
 * Example:
 *
 * export const User = new Translator(
 *   "/users/v1",
 *   "users",
 *   {
 *     fullName: "attr",
 *     birthdate: "attr",
 *     active: "attr",
 *     bestFriend: [ "bestFriendId", "users" ],
 *   },
 *   (from: "db"|"api", k: string, v: unknown) => {
 *     // We happen to know that "active" is boolean, which is stored in the database as an int.
 *     // If coming from the db, we need to make the value boolean, and if coming from the api, we
 *     // need to make it numeric.
 *     if (k === "active") {
 *       return from === "db"
 *         ? !!Number(v)
 *         : Number(v);
 *     }
 *
 *     // We also know that dates are in the database as a date string, but we want to pass them
 *     // as an integer (timestamp in MS)
 *     } else if (k === "birthdate") {
 *       return from === "db"
 *         ? new Date(v).getTime()
 *         : new Date(v).toISOString()
 *     }
 *
 *     // For any other fields, we just want to pass them back as-is
 *     return v;
 *   }
 * )
 *
 * User.dbToApi({
 *   id: "aaaabbbbcccc-dddd-eeee-ffff-0000111122223333",
 *   fullName: "Mr. Katz",
 *   birthdate: "2000-01-01T00:08:00.00-00:00",
 *   active: 1,
 *   bestFriendId: "000011112222-3333-4444-5555-6666777788889999"
 * });
 *
 * // Yields
 * // {
 * //   id: "aaaabbbbcccc-dddd-eeee-ffff-0000111122223333",
 * //   fullName: "Mr. Katz",
 * //   birthdate: 946685280000,
 * //   active: true,
 * //   bestFriend: { data: { type: "users", id: "000011112222-3333-4444-5555-6666777788889999" } }
 * // }
 *
 * User.apiToDb({
 *   id: "aaaabbbbcccc-dddd-eeee-ffff-0000111122223333",
 *   fullName: "Mr. Katz",
 *   birthdate: 946685280000,
 *   active: true,
 *   bestFriend: { data: { type: "users", id: "000011112222-3333-4444-5555-6666777788889999" } }
 * });
 *
 * // Yields
 * // {
 * //   id: "aaaabbbbcccc-dddd-eeee-ffff-0000111122223333",
 * //   fullName: "Mr. Katz",
 * //   birthdate: "2000-01-01T00:08:00.00-00:00",
 * //   active: 1,
 * //   bestFriendId: "000011112222-3333-4444-5555-6666777788889999"
 * // }
 *
 * -------------------------
 *
 * ## Footnotes
 *
 * [1] Unfortunately, these functions cannot be purely type safe because API formats are not
 *     necessarily directly related to DB formats (i.e., there is not a one-to-one relationship
 *     between key-value pairs in the DB format and key-value pairs in the API format). Thus, the
 *     best we can do is provide the _intended_ DB type and the _intended_ API type and then an
 *     additional function (`transform`, see below) that serves to transform attribute data between
 *     database and api formats. Because of this, it is imperitive that you double-check the output
 *     of your Translators using unit tests.
 * [2] The `transform` param allows you to transform values between api and db format. For example,
 *     you may store boolean values as TINYINT in the database, or uuid values as BINARY(16) in the
 *     database. You can use the `transform` function to perform these transformations in each
 *     direction.
 */

/**
 * ResourceSpecs describe the attributes and relationships that a resource has and the way they map
 * between database representations and api representations.
 */
declare type DbFieldName = string;
declare type ApiFieldName = string;
declare type DefaultType = string;
export interface ApiResourceSpec {
  [apiFieldName: string]: "attr" | [DbFieldName | null, DefaultType];
}
export interface DbResourceSpec {
  [dbFieldName: string]: "attr" | [ApiFieldName, DefaultType];
}

declare interface Transform<DT, AT> {
  <K extends keyof DT>(from: "db", fieldName: K, val: DT[K]): unknown | void;
  <K extends keyof AT>(from: "api", fieldName: K, val: AT[K]): unknown | void;
}

declare type Nullable<T> = { [K in keyof T]: T[K] | null };

export class Translator<
  DT extends { id: number | string | Buffer },
  AT extends { id: number | string; type: string }
> {
  protected dbSpec: DbResourceSpec;
  protected apiSpec: ApiResourceSpec;

  public constructor(
    protected apiPrefix: string,
    protected defaultType: string,
    spec: ApiResourceSpec,
    /**
     * `transform` allows you to pass a function that transforms values from db format to api
     * format and back. For example, the database might store booleans in number format, while the
     * API presents them in native boolean format. Or the database might return full dates while the
     * api presents unix timestamps. This function allows you to handle such translations.
     */
    protected transform?: Transform<DT, AT>
  ) {
    this.apiSpec = spec;
    this.dbSpec = {};
    for (const x in spec) {
      if (spec[x] === "attr") {
        this.dbSpec[x] = "attr";
      } else if (spec[x][0]) {
        this.dbSpec[spec[x][0]!] = [x, spec[x][1]];
      }
    }
  }

  public dbToApi(data: DT, logger?: SimpleLoggerInterface): AT;
  public dbToApi(data: Array<DT>, logger?: SimpleLoggerInterface): Array<AT>;
  public dbToApi(data: Array<DT> | DT, logger?: SimpleLoggerInterface): Array<AT> | AT;
  public dbToApi(data: Array<DT> | DT, logger?: SimpleLoggerInterface): Array<AT> | AT {
    // Dress the optional logger
    function log(level: keyof SimpleLogLevels, msg: string) {
      if (logger) {
        logger.log(level, msg);
      }
    }

    // We need to do this for each resource in an array, so make this block reusable
    const trans = (row: DT): AT => {
      // Prepare an initial result
      const result: any = {};

      // For each field in the database row....
      for (const x in row) {
        // If it's not in our spec and it's not the special 'id' or 'type' parameters, skip it.
        if (!this.dbSpec[x] && x !== "id" && x !== "type") {
          log(
            "debug",
            `Field ${x} is not in the specification for objects of type '${this.defaultType}'. ` +
              `Not including in serialization`
          );
          continue;
        }

        // If it's id or type or it matches an attribute from our spec, just use the value
        if (x === "id" || x === "type" || this.dbSpec[x] === "attr") {
          result[x] = this.transform ? this.transform("db", x, row[x]) : row[x];
        } else {
          // Otherwise, it's a relationship
          const relname = this.dbSpec[x][0];

          // If it's null, set data to null
          if (!row[x]) {
            result[relname] = { data: null };
          } else {
            // Get the type
            const type = this.dbSpec[x][1];

            log("debug", `Relationship type for ${relname} is of type '${type}'`);

            // Set the relationship
            result[relname] = {
              data: { type, id: row[x] },
            };
          }
        }
      }

      // Add default type, if none provided
      if (!result.type) {
        result.type = this.defaultType;
      }

      // Add any missing fields. For to-many relationships, `null` means 'not fetched'
      for (const fieldname in this.apiSpec) {
        if (typeof result[fieldname] === "undefined") {
          if (this.apiSpec[fieldname] === "attr") {
            result[fieldname] = null;
          } else {
            result[fieldname] = {
              data: null,
              links: { self: `${this.apiPrefix}/${this.defaultType}/${result.id}/${fieldname}` },
            };
          }
        }
      }

      // Return the result
      return <AT>result;
    };

    // If it's an array, we translate all members. Otherwise, translate single resource.
    const res = Array.isArray(data) ? data.map((v) => trans(v)) : trans(data);

    // Return the resource
    return res;
  }

  public apiToDb<PAT extends Partial<Nullable<AT>>, PDT extends Partial<DT> = DT>(
    data: PAT,
    logger?: SimpleLoggerInterface
  ): PDT;
  public apiToDb<PAT extends Partial<Nullable<AT>>, PDT extends Partial<DT> = DT>(
    data: Array<PAT>,
    logger?: SimpleLoggerInterface
  ): Array<PDT>;
  public apiToDb<PAT extends Partial<Nullable<AT>>, PDT extends Partial<DT> = DT>(
    data: Array<PAT> | PAT,
    logger?: SimpleLoggerInterface
  ): Array<PDT> | PDT;
  public apiToDb<PAT extends Partial<Nullable<AT>>, PDT extends Partial<DT> = DT>(
    data: Array<PAT> | PAT,
    logger?: SimpleLoggerInterface
  ): Array<PDT> | PDT {
    // Dress the optional logger
    function log(level: keyof SimpleLogLevels, msg: string) {
      if (logger) {
        logger.log(level, msg);
      }
    }

    // We need to do this for each resource in an array, so make this block reusable
    const trans = (row: PAT): PDT => {
      // Prepare an initial result. This must be "any" because the keys of the database type do
      // not match up to the keys of the api type in a way that we can directly map in Typescript.
      const result: any = {};

      // For each field in the api row....
      for (const x in row) {
        // If this field is not defined in the API spec and it's not the special 'id' field, skip
        // it.
        if (!this.apiSpec[x] && x !== "id") {
          // If it's not the special 'type' field, then display a warning
          if (x !== "type") {
            log(
              "warning",
              `Field ${x} is not in the API specification for objects of type ` +
                `'${this.defaultType}'. Not including in translation to DB format.`
            );
          }
          continue;
        }

        // If it's id or type or it matches an attribute from our spec, just use the value
        if (x === "id" || x === "type" || this.apiSpec[x] === "attr") {
          result[x] = this.transform
            ? this.transform("api", x as keyof AT, row[x as keyof AT]!)
            : row[x];
        } else {
          // Otherwise, it's a relationship

          // If the field doesn't have a corresponding database field, it's probably a to-many
          // relationship. Just skip it.
          if (!this.apiSpec[x][0]) {
            log(
              "debug",
              `Field ${x} does not have a corresponding db field in the spec. Assuming it's a ` +
                `to-many relationship and skipping.`
            );
            continue;
          }

          const dbFieldName = this.apiSpec[x][0]!;

          log("debug", `Relationship for ${x} will be inserted into db field '${dbFieldName}'`);

          // We know this is a relationship, so we have to assume it has a data.id path
          result[dbFieldName] = (row[x] as any).data.id;
        }
      }

      // Return the result
      return <PDT>result;
    };

    // If it's an array, we translate all members. Otherwise, translate single resource.
    const res = Array.isArray(data) ? data.map((v) => trans(v)) : trans(data);

    // Return the resource
    return res;
  }
}
