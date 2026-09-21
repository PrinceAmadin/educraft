import { redirect } from "next/navigation";

/** Tracking now lives in the client dashboard; the public lookup is retired. */
export default function TrackHomePage() {
  redirect("/client/login");
}
