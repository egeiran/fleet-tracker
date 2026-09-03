import { describe, expect, it } from "vitest";
import { carrierProvenance, carrierTitle, trainLine, trainNumber, unitTitle } from "../src/label";
import type { CarrierTrain, CarrierVessel, Unit } from "../src/types";

const vessel: CarrierVessel = {
  kind: "vessel",
  mmsi: 257088370,
  name: "MARION ANITA",
  imo: 9006291,
  callSign: "LAJB8",
  shipType: 79,
  shipTypeLabel: "lasteskip",
  lastSeen: 0,
};

const train: CarrierTrain = {
  kind: "train",
  vehicleId: "834-2026-09-02",
  codespace: "VYG",
  operatorLabel: "Vy",
  lineRef: "VYG:Line:RE11",
  publicCode: "RE11",
  lineName: "Eidsvoll-Oslo S-Skien",
  lastSeen: 0,
};

describe("trainNumber", () => {
  it("strips the operating day from Vy ids and keeps set ids as they are", () => {
    expect(trainNumber("834-2026-09-02")).toBe("834");
    expect(trainNumber("71-10")).toBe("71-10");
    expect(trainNumber("18-2258")).toBe("18-2258");
  });
});

describe("trainLine", () => {
  it("prefers the public code, then the line ref tail, then the line name", () => {
    expect(trainLine(train)).toBe("RE11");
    expect(trainLine({ ...train, publicCode: undefined })).toBe("RE11");
    expect(trainLine({ ...train, publicCode: undefined, lineRef: undefined })).toBe(
      "Eidsvoll-Oslo S-Skien",
    );
    expect(
      trainLine({ ...train, publicCode: undefined, lineRef: undefined, lineName: undefined }),
    ).toBeUndefined();
  });
});

describe("carrierTitle / unitTitle", () => {
  it("names a vessel by its AIS name", () => {
    expect(carrierTitle(vessel)).toBe("MS MARION ANITA");
  });
  it("names a train by operator, train number and line", () => {
    expect(carrierTitle(train)).toBe("Vy RE11 · tog 834");
    expect(
      carrierTitle({ ...train, publicCode: undefined, lineRef: undefined, lineName: undefined }),
    ).toBe("Vy · tog 834");
    expect(
      carrierTitle({
        ...train,
        vehicleId: "71-10",
        codespace: "FLT",
        operatorLabel: "Flytoget",
        publicCode: "FLY1",
      }),
    ).toBe("Flytoget FLY1 · tog 71-10");
  });
  it("falls back to the unit id for mock carriers", () => {
    const u = {
      id: "VKT-0917",
      carrier: { kind: "mock", lane: ["oslo", "rotterdam"], label: "Oslo → Rotterdam" },
    } as unknown as Unit;
    expect(unitTitle(u)).toBe("VKT-0917");
    expect(carrierTitle(u.carrier)).toBeNull();
  });
});

describe("carrierProvenance", () => {
  it("lists the source and lookup identifiers", () => {
    expect(carrierProvenance(vessel)).toBe(
      "Kystverket AIS · MMSI 257088370 · IMO 9006291 · kallesignal LAJB8",
    );
    expect(carrierProvenance({ ...vessel, imo: undefined, callSign: undefined })).toBe(
      "Kystverket AIS · MMSI 257088370",
    );
    expect(carrierProvenance(train)).toBe(
      "Entur sanntid · Vy (VYG) · kjøretøy 834-2026-09-02 · linje VYG:Line:RE11",
    );
  });
});
