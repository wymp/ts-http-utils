HTTP Utils
================================================================================

This is a small typescript package providing various utilities for HTTP environments. These are
built assuming Express as a HTTP request handler framework.

The utilities are:

* `logger` - Take an HTTP request/response pair and attach a logger tagged with the essential
  request details. Returns the same logger (stored in `res.locals`) when called with the same
  `req`/`res` pair.

