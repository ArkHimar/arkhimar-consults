import assert from "node:assert/strict";
import test from "node:test";
import { signPayload, snapshotHash } from "../api/_lib/instiserve-capstone.js";

test("signs the exact timestamp and body", () => {
  assert.equal(signPayload("secret", "100", "{}"), "8e1a45bf4cb0f06fc9070524ebc7719df42e3abca9ada83da0314a32a75bbc62");
});

test("snapshot hashes are deterministic and tamper evident", () => {
  assert.equal(snapshotHash({ a: 1 }), snapshotHash({ a: 1 }));
  assert.notEqual(snapshotHash({ a: 1 }), snapshotHash({ a: 2 }));
});
