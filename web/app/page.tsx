import { AuthGate } from "@/components/auth-gate";
import { FinancialWorkspace } from "@/components/financial-workspace";

export default function Home() {
  return <AuthGate><FinancialWorkspace /></AuthGate>;
}
