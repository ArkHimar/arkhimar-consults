import assert from "node:assert/strict";
import test from "node:test";
import { signPayload, snapshotHash } from "../api/_lib/instiserve-capstone.js";

test("signs the exact timestamp and body", () => {
  assert.equal(signPayload("secret", "100", "{}"), "b8382f8fd7a91f1571e6be1e690ef658bdfd4d2d47f956e75164cbb36cfb80d6");
});

test("snapshot hashes are deterministic and tamper evident", () => {
  assert.equal(snapshotHash({ a: 1 }), snapshotHash({ a: 1 }));
  assert.notEqual(snapshotHash({ a: 1 }), snapshotHash({ a: 2 }));
});
