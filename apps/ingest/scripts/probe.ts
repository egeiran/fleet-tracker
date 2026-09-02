/** Quick credential + data check: `pnpm ingest:probe`. Never touches the database. */
import { shipTypeInfo } from "@vakt/domain";
import { loadConfig } from "../src/config";
import { BarentsWatchClient } from "../src/sources/barentswatch/client";
import { TokenProvider } from "../src/sources/barentswatch/token";
import { EnturClient } from "../src/sources/entur/client";

const config = loadConfig();
const t0 = Date.now();

async function main(): Promise<number> {
  let failed = false;
  if (!config.barentswatch) {
    console.log("BarentsWatch: ingen BARENTSWATCH_CLIENT_ID/SECRET i miljøet → sjø kjører som mock");
  } else {
    try {
      const tokens = new TokenProvider(config.barentswatch);
      await tokens.get();
      console.log("BarentsWatch: token OK (scope ais)");
      const bw = new BarentsWatchClient(tokens);
      const latest = await bw.latestInArea({ bbox: config.bbox });
      const counts: Record<string, number> = {};
      let moving = 0;
      for (const v of latest) {
        const cls = shipTypeInfo(v.shipType).class;
        counts[cls] = (counts[cls] ?? 0) + 1;
        if ((v.speedOverGround ?? 0) >= 1) moving++;
      }
      console.log(`BarentsWatch: ${latest.length} fartøy i utsnittet, ${moving} i bevegelse`, counts);
      for (const v of latest.filter((x) => (x.speedOverGround ?? 0) > 5).slice(0, 5)) {
        console.log(`  ${v.name} (${v.mmsi}) ${shipTypeInfo(v.shipType).label} ${v.speedOverGround} kn → ${v.destination ?? "?"}`);
      }
    } catch (e) {
      failed = true;
      console.error("BarentsWatch FEIL:", e instanceof Error ? e.message : e);
    }
  }
  try {
    const trains = await new EnturClient(config.enturClientName).railVehicles(config.bbox);
    console.log(`Entur: ${trains.length} tog i utsnittet`);
  } catch (e) {
    failed = true;
    console.error("Entur FEIL:", e instanceof Error ? e.message : e);
  }
  console.log(`ferdig på ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code));
