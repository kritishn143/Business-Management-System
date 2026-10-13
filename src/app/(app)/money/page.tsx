import { redirect } from "next/navigation";

/** Money was folded into Accounts; old links keep working. */
export default function MoneyRedirect() {
  redirect("/accounts");
}
