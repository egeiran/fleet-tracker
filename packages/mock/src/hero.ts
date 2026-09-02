import type { EventTone, Mode, Status } from "@vakt/domain";

export interface HeroEvent {
  time: string;
  label: string;
  place: string;
  tone: EventTone;
}

export interface HeroUnit {
  id: string;
  status: Status;
  mode: Mode;
  lane: [string, string];
  p: number;
  batt: number;
  temp: number;
  booking: string;
  cargo: string;
  place: string;
  events: HeroEvent[];
}

/** Hand-written showcase units from the design prototype (renamed to the VKT prefix). */
export const HERO: HeroUnit[] = [
  {
    id: "VKT-0917",
    status: "alert",
    mode: "vei",
    lane: ["rotterdam", "antwerpen"],
    p: 0.22,
    batt: 94,
    temp: 7,
    booking: "BK-40877",
    cargo: "elektronikk",
    place: "40 km fra levering · Rotterdam",
    events: [
      { time: "03:17", label: "Dør åpnet 40 km før leveringsadressen", place: "E19 · 51,79° N 4,42° Ø", tone: "alert" },
      { time: "03:19", label: "Varsel sendt til driftssenteret", place: "driftssenteret", tone: "warn" },
      { time: "02:04", label: "Underveis · dør lukket", place: "A15 · 51,88° N 4,60° Ø", tone: "muted" },
      { time: "23:40", label: "Gate ut · bekreftet av enheten", place: "Rotterdam terminal", tone: "muted" },
    ],
  },
  {
    id: "VKT-4471",
    status: "alert",
    mode: "sjø",
    lane: ["goteborg", "rotterdam"],
    p: 0.98,
    batt: 91,
    temp: 9,
    booking: "BK-40712",
    cargo: "maskindeler",
    place: "Rotterdam havn · terminalansvar",
    events: [
      { time: "22:10", label: "Støt 6,2 g · sabotasjesikret logg", place: "Rotterdam havn · 51,95° N 4,14° Ø", tone: "alert" },
      { time: "21:44", label: "Gate inn · bekreftet av enheten", place: "Rotterdam terminal", tone: "muted" },
    ],
  },
  {
    id: "VKT-2481",
    status: "moving",
    mode: "sjø",
    lane: ["oslo", "rotterdam"],
    p: 0.46,
    batt: 98,
    temp: 5,
    booking: "BK-40921",
    cargo: "papirruller",
    place: "Skagerrak · underveis Oslo → Rotterdam",
    events: [
      { time: "14:02", label: "Dør lukket · lasteområde", place: "Oslo havn · 59,91° N 10,75° Ø", tone: "ok" },
      { time: "16:20", label: "Gate ut · bekreftet av enheten", place: "Oslo havn", tone: "muted" },
      { time: "22:40", label: "Underveis · dør lukket", place: "Skagerrak · 58,30° N 9,80° Ø", tone: "muted" },
    ],
  },
  {
    id: "VKT-5093",
    status: "idle",
    mode: "bane",
    lane: ["aarhus", "aarhus"],
    p: 1,
    batt: 97,
    temp: 8,
    booking: "BK-40640",
    cargo: "byggevarer",
    place: "Aarhus terminal · står på dag 2",
    events: [
      { time: "dag 2", label: "Står i avgiftsbelagt terminal", place: "Aarhus · gratis til dag 5", tone: "warn" },
      { time: "dag 0", label: "Gate inn · bekreftet av enheten", place: "Aarhus terminal", tone: "muted" },
    ],
  },
  {
    id: "VKT-6612",
    status: "idle",
    mode: "sjø",
    lane: ["bergen", "bergen"],
    p: 1,
    batt: 41,
    temp: 2,
    booking: "ubooket",
    cargo: "tom",
    place: "Bergen · utestabel",
    events: [
      { time: "12:05", label: "Batteri under flåtemedian", place: "Bergen · 60,39° N 5,32° Ø", tone: "warn" },
      { time: "08:00", label: "Våknet etter kald stabel", place: "Bergen", tone: "muted" },
    ],
  },
];
