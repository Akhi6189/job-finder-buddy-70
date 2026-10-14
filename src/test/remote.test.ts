import { describe, it, expect } from "vitest";
import { isRemote } from "@/lib/data";
describe("isRemote", () => {
  it("detects remote in location", () => expect(isRemote({ location: "Remote, India" })).toBe(true));
  it("detects work from home in description", () => expect(isRemote({ location: "Pune", description: "Work from home allowed" })).toBe(true));
  it("on-site role is not remote", () => expect(isRemote({ location: "Bengaluru", description: "Office based" })).toBe(false));
});
