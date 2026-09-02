import { describe, expect, it } from "vitest";
import { normalizeDestination, seaArea, trainPlace, vesselPlace } from "../src/place";

describe("normalizeDestination", () => {
  it("maps LOCODEs, names and multi-leg strings", () => {
    expect(normalizeDestination("NOTRD")).toBe("Trondheim");
    expect(normalizeDestination("OSLO>KIEL")).toBe("Kiel");
    expect(normalizeDestination("GOTHENBURG")).toBe("Göteborg");
    expect(normalizeDestination("NO BGO")).toBe("Bergen");
    expect(normalizeDestination("NO.SVG")).toBe("Stavanger");
    expect(normalizeDestination("aalesund")).toBe("Ålesund");
  });
  it("never returns raw noise", () => {
    expect(normalizeDestination("FOR ORDERS")).toBeUndefined();
    expect(normalizeDestination("")).toBeUndefined();
    expect(normalizeDestination(null)).toBeUndefined();
    expect(normalizeDestination("CH 16")).toBeUndefined();
    expect(normalizeDestination("FISHFARMS 488 53 19")).toBeUndefined();
    expect(normalizeDestination("48854046")).toBeUndefined();
  });
});

describe("labels", () => {
  it("vessel near a port", () => {
    expect(vesselPlace({ pos: [5.33, 60.39], status: "idle", moored: true })).toBe("Bergen havn · til kai");
    expect(vesselPlace({ pos: [5.33, 60.39], status: "moving", destination: "Hamburg" })).toBe(
      "Bergen · underveis → Hamburg",
    );
  });
  it("vessel at sea uses the sea area", () => {
    expect(seaArea([9.8, 58.3])).toBe("Skagerrak");
    expect(vesselPlace({ pos: [9.0, 58.0], status: "moving", origin: "Oslo", destination: "Rotterdam" })).toBe(
      "Skagerrak · underveis Oslo → Rotterdam",
    );
    expect(vesselPlace({ pos: [9.0, 58.0], status: "alert", destination: "Rotterdam" })).toContain("· avvik");
  });
  it("train labels", () => {
    expect(
      trainPlace({ pos: [10.75, 59.91], status: "moving", publicCode: "R31", origin: "Oslo S", destination: "Gjøvik" }),
    ).toBe("Oslo · tog R31 · Oslo S → Gjøvik");
    expect(trainPlace({ pos: [8.4, 60.56], status: "idle", lineName: "Oslo S-Bergen" })).toBe(
      "tog Oslo S-Bergen · Oslo S-Bergen · står stille",
    );
  });
});
