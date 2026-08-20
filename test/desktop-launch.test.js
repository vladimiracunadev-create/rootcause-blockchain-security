import assert from "node:assert/strict";
import test from "node:test";
import { openBrowserIfRequested } from "../src/server.js";

const loopback = { host: "127.0.0.1" };

test("does not open a browser unless the desktop launcher asks for it", () => {
  assert.equal(openBrowserIfRequested({}, loopback, "http://127.0.0.1:8790"), false);
  assert.equal(
    openBrowserIfRequested({ ROOTCAUSE_OPEN_BROWSER: "0" }, loopback, "http://127.0.0.1:8790"),
    false
  );
});

test("never opens a browser for a non-loopback bind", () => {
  assert.equal(
    openBrowserIfRequested(
      { ROOTCAUSE_OPEN_BROWSER: "1" },
      { host: "0.0.0.0" },
      "http://0.0.0.0:8790"
    ),
    false
  );
  assert.equal(
    openBrowserIfRequested(
      { ROOTCAUSE_OPEN_BROWSER: "1" },
      { host: "203.0.113.10" },
      "http://203.0.113.10:8790"
    ),
    false
  );
});
