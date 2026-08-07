import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";

// Auth
import Auth from "./pages/Auth";

// Invoices & vendors
import InvoiceList from "./pages/InvoiceList";
import InvoiceDetail from "./pages/InvoiceDetail";
import VendorList from "./pages/VendorList";
import VendorDetail from "./pages/VendorDetail";

// Admin
import UserManagement from "./pages/poc/UserManagement";
import AuditConsole from "./pages/AuditConsole";

import NotFound from "./pages/NotFound";

// Queues (the daily work)
import POCDashboard from "./pages/poc/POCDashboard";
import POCUpload from "./pages/poc/POCUpload";
import HighConfidenceQueue from "./pages/poc/HighConfidenceQueue";
import HighConfidenceDetail from "./pages/poc/HighConfidenceDetail";
import LowConfidenceList from "./pages/poc/LowConfidenceList";
import LowConfidenceQueue from "./pages/poc/LowConfidenceQueue";
import ExceptionsQueue from "@/pages/poc/ExceptionsQueue";
import ExceptionDetail from "./pages/poc/ExceptionDetail";
import DeclinedQueue from "./pages/poc/DeclinedQueue";
import InboxMonitor from "./pages/poc/InboxMonitor";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<AuthGate requireAuth={false}><Auth /></AuthGate>} />

            {/* Dashboard — the queue-oriented landing view. */}
            <Route path="/dashboard" element={<AuthGate><POCDashboard /></AuthGate>} />

            {/* Invoices & vendors */}
            <Route path="/invoices" element={<AuthGate><InvoiceList /></AuthGate>} />
            <Route path="/invoices/:id" element={<AuthGate><InvoiceDetail /></AuthGate>} />
            <Route path="/vendors" element={<AuthGate><VendorList /></AuthGate>} />
            <Route path="/vendors/:id" element={<AuthGate><VendorDetail /></AuthGate>} />

            {/* Admin */}
            <Route path="/settings/audit" element={<AuthGate><AuditConsole /></AuthGate>} />
            <Route path="/user-management" element={<AuthGate><UserManagement /></AuthGate>} />

            {/* Processing queues */}
            <Route path="/upload" element={<AuthGate><POCUpload /></AuthGate>} />
            <Route path="/inbox-monitor" element={<AuthGate><InboxMonitor /></AuthGate>} />
            <Route path="/high-confidence" element={<AuthGate><HighConfidenceQueue /></AuthGate>} />
            <Route path="/high-confidence/:id" element={<AuthGate><HighConfidenceDetail /></AuthGate>} />
            <Route path="/low-confidence" element={<AuthGate><LowConfidenceList /></AuthGate>} />
            <Route path="/low-confidence/:id" element={<AuthGate><LowConfidenceQueue /></AuthGate>} />
            <Route path="/exceptions" element={<AuthGate><ExceptionsQueue /></AuthGate>} />
            <Route path="/exceptions/:id" element={<AuthGate><ExceptionDetail /></AuthGate>} />
            <Route path="/declined" element={<AuthGate><DeclinedQueue /></AuthGate>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
