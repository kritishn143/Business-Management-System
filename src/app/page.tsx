import { redirect } from "next/navigation";

// Proxy decides where an unauthenticated visitor lands.
export default function RootPage() {
  redirect("/dashboard");
}
