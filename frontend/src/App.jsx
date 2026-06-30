import './App.css';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';

// Layout & Overlay
import NavigationLayout from './components/NavigationLayout.jsx';
import GlobalTreatmentOverlay from './components/GlobalTreatmentOverlay.jsx';

// Pages
import TreatmentPage from './pages/Treatmentpage.jsx';
import InvoicesPage from './pages/InvoicePage.jsx';
import AppointmentsPage from './pages/AppointmentsPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import PatientFilesPage from './pages/PatientFilesPage.jsx';
import LabPage from './pages/LabOrdersPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import WhatsAppPage from './pages/WhatsAppPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import BookingConfirmPage from './pages/BookingConfirmPage.jsx';
import HelpPage from './features/help/components/HelpPage.jsx';
import ImportCatalogPage from './pages/ImportCatalogPage/index.jsx';
import ConnectDeskLoginPage from './pages/connectdesk/ConnectDeskLoginPage.jsx';
import ConnectDeskLayout from './pages/connectdesk/ConnectDeskLayout.jsx';
import ConnectDeskTenantsTab from './pages/connectdesk/ConnectDeskTenantsTab.jsx';
import ConnectDeskUsersTab from './pages/connectdesk/ConnectDeskUsersTab.jsx';

// Context
import { TreatmentProvider } from './Context/TreatmentContext.jsx';
import { AuthProvider, useAuth } from './Context/AuthContext.jsx';
import { UserProvider } from './Context/UserContext.jsx';
import { IntegrationProvider } from './Context/IntegrationContext.jsx';

// Redirect to /login if not authenticated
function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <NavigationLayout>
      <Outlet />
      <GlobalTreatmentOverlay />
    </NavigationLayout>
  );
}

// Redirect to / if user's role doesn't have access to this route
function RoleRoute({ allow, children }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!allow.includes(role)) return <Navigate to="/" replace />;
  return children;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/connect-dentalclinic/:clinicSlug/:tenantId',
    element: <BookingPage />,
  },
  {
    path: '/book-confirm',
    element: <BookingConfirmPage />,
  },
  {
    path: '/help',
    element: <HelpPage />,
  },
  // Connect Desk — super admin console (independent auth via cd_token)
  {
    path: '/connect-desk/login',
    element: <ConnectDeskLoginPage />,
  },
  {
    path: '/connect-desk',
    element: <ConnectDeskLayout />,
    children: [
      { index: true,    element: <Navigate to="/connect-desk/tenants" replace /> },
      { path: 'tenants', element: <ConnectDeskTenantsTab /> },
      { path: 'users',   element: <ConnectDeskUsersTab /> },
    ],
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      { path: '/',              element: <AppointmentsPage /> },
      { path: 'treatment/:id',  element: <TreatmentPage /> },
      { path: 'patients',       element: <PatientsPage /> },
      { path: 'files',          element: <RoleRoute allow={['Owner','Assistant','Doctor']}><PatientFilesPage /></RoleRoute> },
      { path: 'invoices',       element: <RoleRoute allow={['Owner','Assistant']}><InvoicesPage /></RoleRoute> },
      { path: 'lab',            element: <RoleRoute allow={['Owner','Assistant','Doctor']}><LabPage /></RoleRoute> },
      { path: 'insights',       element: <RoleRoute allow={['Owner']}><ReportsPage /></RoleRoute> },
      { path: 'whatsapp',       element: <RoleRoute allow={['Owner']}><WhatsAppPage /></RoleRoute> },
      { path: 'settings',       element: <RoleRoute allow={['Owner']}><SettingsPage /></RoleRoute> },
      { path: 'settings/import-catalog', element: <RoleRoute allow={['Owner']}><ImportCatalogPage /></RoleRoute> },
      { path: 'promotions',     element: <div>Promotions Page</div> },
    ],
  },
]);

function App() {
  return (
    <AuthProvider>
      <UserProvider>
          <IntegrationProvider>
            <TreatmentProvider>
              <RouterProvider router={router} />
            </TreatmentProvider>
          </IntegrationProvider>
      </UserProvider>
    </AuthProvider>
  );
}

export default App;
