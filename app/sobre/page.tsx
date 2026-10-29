import { redirect } from "next/navigation";

/** Endereço antigo da página "Como a conta é feita", de quando o site era em português. */
export default function SobrePage() {
  redirect("/about");
}
