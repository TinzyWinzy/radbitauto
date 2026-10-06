import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { OfflineBanner, Spinner } from './components/status';
import { InstallBanner, UpdatePrompt } from './components/pwa';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import AppLayout from './pages/AppLayout';

const Onboarding = lazy(() => import('./pages/Onboarding'));
const Pending = lazy(() => import('./pages/Pending'));
const CaseDetail = lazy(() => import('./pages/CaseDetail'));
const NewVehicle = lazy(() => import('./pages/NewVehicle'));
const NewCase = lazy(() => import('./pages/NewCase'));
const NewCustomer = lazy(() => import('./pages/NewCustomer'));
const NewStaff = lazy(() => import('./pages/NewStaff'));
const Team = lazy(() => import('./pages/Team'));
const Account = lazy(() => import('./pages/Account'));
const AgencySetup = lazy(() => import('./pages/AgencySetup'));
const Invitation = lazy(() => import('./pages/Invitation'));
const Operations = lazy(() => import('./pages/Operations'));
const Help = lazy(() => import('./pages/Help'));
const Dealership = lazy(() => import('./pages/Dealership'));
const Showroom = lazy(() => import('./pages/Showroom'));
const RetailPurchase = lazy(() => import('./pages/RetailPurchase'));
const DealerAcquisitions = lazy(() => import('./pages/DealerAcquisitions'));
const Invitations = lazy(() => import('./pages/Invitations'));
const Billing = lazy(() => import('./pages/Billing'));
const BulkImport = lazy(() => import('./pages/BulkImport'));

function routeFor(claims: { appRole?: string; companyId?: string; platformAdmin?: boolean }): string {
  if (claims.appRole === 'platform_admin' && claims.platformAdmin) return '/onboarding';
  if (claims.appRole && claims.companyId) return '/app';
  return '/pending';
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, claims, loading } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const destination = next && (/^\/invite\/[a-f0-9]{64}$/.test(next) || (claims.appRole && claims.companyId && /^\/app\/(?:cases|purchases)\/[A-Za-z0-9_-]+$/.test(next))) ? next : routeFor(claims);
  if (loading) return <Spinner />;
  if (user) return <Navigate to={!claims.appRole && !claims.companyId && params.get('intent') === 'agency' ? '/agency/setup' : destination} replace />;
  return <>{children}</>;
}

function RequireSignedIn({ children }: { children: ReactNode }) {
  const { user, claims, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={/^\/app\/(?:cases|purchases)\/[A-Za-z0-9_-]+$/.test(location.pathname) ? `/login?next=${encodeURIComponent(location.pathname)}` : '/login'} replace />;
  if (claims.appRole === 'platform_admin' && claims.platformAdmin) return <Navigate to="/onboarding" replace />;
  if (!claims.appRole) return <Navigate to="/pending" replace />;
  if (!claims.companyId) return <Navigate to="/pending" replace />;
  return <>{children}</>;
}

function RequireBootstrap({ children }: { children: ReactNode }) {
  const { user, claims, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!claims.platformAdmin || claims.appRole !== 'platform_admin') return <Navigate to="/pending" replace />;
  if (claims.companyId) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequirePending({ children }: { children: ReactNode }) {
  const { user, claims, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (claims.appRole === 'platform_admin' && claims.platformAdmin)
    return <Navigate to="/onboarding" replace />;
  if (claims.companyId) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <UpdatePrompt />
      <OfflineBanner />
      <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/help" element={<Help />} />
        <Route path="/showroom/:slug" element={<Showroom />} />
        <Route path="/showroom/:slug/vehicle/:stockId" element={<Showroom />} />
        <Route path="/invite/:token" element={<Invitation />} />
        <Route path="/agency/setup" element={<RequirePending><AgencySetup /></RequirePending>} />
        <Route path="/" element={<LandingRoute />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireBootstrap>
              <Onboarding />
            </RequireBootstrap>
          }
        />
        <Route
          path="/pending"
          element={
            <RequirePending>
              <Pending />
            </RequirePending>
          }
        />
        <Route
          path="/app"
          element={
            <RequireSignedIn>
              <AppLayout />
            </RequireSignedIn>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="cases/:caseId" element={<CaseDetail />} />
          <Route path="new/vehicle" element={<NewVehicle />} />
          <Route path="new/case" element={<NewCase />} />
          <Route path="new/customer" element={<NewCustomer />} />
          <Route path="new/staff" element={<NewStaff />} />
          <Route path="team" element={<Team />} />
          <Route path="operations" element={<Operations />} />
          <Route path="dealership" element={<Dealership />} />
          <Route path="purchases/:saleId" element={<RetailPurchase />} />
          <Route path="acquisitions" element={<DealerAcquisitions />} />
          <Route path="invitations" element={<Invitations />} />
          <Route path="import-data" element={<BulkImport />} />
          <Route path="account" element={<Account />} /><Route path="billing" element={<Billing />} />
        </Route>
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
      </Suspense>
      <InstallBanner />
    </>
  );
}

function HomeRedirect() {
  const { user, claims } = useAuth();
  if (user) return <Navigate to={routeFor(claims)} replace />;
  return <Navigate to="/login" replace />;
}

function LandingRoute() {
  const { user, claims, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user && claims.companyId) return <Navigate to="/app" replace />;
  if (user && claims.appRole === 'platform_admin' && claims.platformAdmin) return <Navigate to="/onboarding" replace />;
  return <Landing />;
}
