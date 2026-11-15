import SaasBillingTab from "../../components/fees/SaasBillingTab";

// Super Admin only (enforced by RequireRole in App.jsx).
//
// "Subscription Plans" is the platform side of the SaaS revenue model: it
// assigns a plan (FREE / BASIC / PREMIUM), a billing cycle and a renewal term
// to each school (tenant). The UI itself lives in SaasBillingTab, which is
// wired to /api/fees-dues/saas/subscriptions (superAdmin-only, unscoped by
// design because the platform owner bills every tenant). Per-invoice
// receivables are summarised separately on the "Global Billing" page.
export default function SubscriptionPlans() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
        <p className="text-muted-foreground">
          Assign a plan, billing cycle and renewal term to every school on the platform.
        </p>
      </div>
      <SaasBillingTab />
    </div>
  );
}
