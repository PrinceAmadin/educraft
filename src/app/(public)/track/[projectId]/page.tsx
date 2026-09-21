import { redirect } from "next/navigation";

/** Tracking now lives in the client dashboard; nothing is served from here. */
export default function TrackProjectPage() {
  redirect("/client/login");
}
