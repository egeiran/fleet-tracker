import type { Metadata } from "next";
import { FleetMapApp } from "@/components/FleetMapApp";

interface Props {
  params: Promise<{ id: string }>;
}

const ID_PATTERN = /^[A-Za-z0-9-]{1,32}$/;

function cleanId(raw: string): string {
  const id = decodeURIComponent(raw);
  return ID_PATTERN.test(id) ? id.toUpperCase() : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = cleanId((await params).id);
  return { title: id ? `${id} · Vakt` : "Vakt · flåteintelligens" };
}

/** Tracking deep link: renders the same map with the unit pre-selected and framed. */
export default async function TrackingPage({ params }: Props) {
  const id = cleanId((await params).id);
  return <FleetMapApp initialSelectedId={id || undefined} />;
}
