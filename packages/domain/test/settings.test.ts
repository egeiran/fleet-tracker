import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants";
import { coerceSettings, parseSettings, serializeSettings } from "../src/settings";

const fromParams = (q: string) => {
  const p = new URLSearchParams(q);
  return parseSettings((k) => p.get(k));
};

describe("settings", () => {
  it("parses and clamps URL params", () => {
    expect(fromParams("src=live&reticle=minimal&wake=0&cluster=off&clusterPx=61&trails=sel&fleet=999")).toEqual({
      source: "live",
      reticle: "minimal",
      wake: false,
      clustering: false,
      clusterPx: 60,
      trails: "valgt",
      fleetSize: 320,
    });
  });
  it("ignores garbage", () => {
    expect(fromParams("src=x&reticle=y&wake=maybe&clusterPx=abc&trails=nope")).toEqual(DEFAULT_SETTINGS);
  });
  it("round-trips through serialize and omits defaults", () => {
    expect(serializeSettings(DEFAULT_SETTINGS)).toEqual({});
    const s = { ...DEFAULT_SETTINGS, trails: "alle" as const, clusterPx: 64, source: "live" as const };
    const params = new URLSearchParams(serializeSettings(s));
    expect(parseSettings((k) => params.get(k))).toEqual(s);
  });
  it("coerces stored objects", () => {
    expect(coerceSettings({ source: "live", trails: "av", wake: false, clusterPx: 32 })).toMatchObject({
      source: "live",
      trails: "av",
      wake: false,
      clusterPx: 32,
    });
    expect(coerceSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });
});
