import { redirect } from "next/navigation";
import { authSession } from "../lib/staff-server";
import StaffPortal from "./StaffPortal";

export const dynamic = "force-dynamic";

export default async function InternalPage() {
  const session = await authSession();
  if (!session) redirect("/login");
  return <StaffPortal session={session} />;
}
