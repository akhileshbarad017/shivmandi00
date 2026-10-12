import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import ExpensesPage from '@/pages/ExpensesPage';
import InvoicesPage from '@/pages/InvoicesPage';
import LoginPage from '@/pages/LoginPage';
import MultiSalePage from '@/pages/MultiSalePage';
import NewPurchasePage from '@/pages/NewPurchasePage';
import NewSalePage from '@/pages/NewSalePage';
import PartiesPage from '@/pages/PartiesPage';
import PartyProfilePage from '@/pages/PartyProfilePage';
import PaymentsPage from '@/pages/PaymentsPage';
import PrintBillPage from '@/pages/PrintBillPage';
import PrintPurchasePage from '@/pages/PrintPurchasePage';
import ProductsPage from '@/pages/ProductsPage';
import PurchasesPage from '@/pages/PurchasesPage';
import ReportsPage from '@/pages/ReportsPage';
import SalesPage from '@/pages/SalesPage';
import SettingsPage from '@/pages/SettingsPage';
import StaffPage from '@/pages/StaffPage';
import WhatsappPage from '@/pages/WhatsappPage';
import { AuthProvider } from './auth';
import { NAV_ITEMS } from './navigation';
import RequireAuth from './RequireAuth';

const PAGES: Record<string, ReactElement> = {
  parties: <PartiesPage />,
  products: <ProductsPage />,
  'purchase-new': <NewPurchasePage />,
  'purchase-history': <PurchasesPage />,
  'sale-new': <NewSalePage />,
  'sale-multi': <MultiSalePage />,
  'sales-history': <SalesPage />,
  invoices: <InvoicesPage />,
  payments: <PaymentsPage />,
  expenses: <ExpensesPage />,
  whatsapp: <WhatsappPage />,
  staff: <StaffPage />,
  reports: <ReportsPage />,
  settings: <SettingsPage />,
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/print/:invoiceNo"
            element={
              <RequireAuth>
                <PrintBillPage />
              </RequireAuth>
            }
          />
          <Route
            path="/print/purchase/:billNo"
            element={
              <RequireAuth>
                <PrintPurchasePage />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="party/:id" element={<PartyProfilePage />} />
            {NAV_ITEMS.filter((item) => item.to !== '/').map((item) => (
              <Route
                key={item.key}
                path={item.to.replace(/^\//, '')}
                element={PAGES[item.key] ?? <Navigate to="/" replace />}
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
