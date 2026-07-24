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

// Process documentation
import InternalProcessFlow from "./pages/InternalProcessFlow";
import PublicProcessFlow from "./pages/PublicProcessFlow";
import POCDocumentation from "./pages/poc/POCDocumentation";

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
            <Route path="/poc/dashboard" element={<AuthGate><POCDashboard /></AuthGate>} />

            {/* Invoices & vendors */}
            <Route path="/invoices" element={<AuthGate><InvoiceList /></AuthGate>} />
            <Route path="/invoices/:id" element={<AuthGate><InvoiceDetail /></AuthGate>} />
            <Route path="/vendors" element={<AuthGate><VendorList /></AuthGate>} />
            <Route path="/vendors/:id" element={<AuthGate><VendorDetail /></AuthGate>} />

            {/* Admin */}
            <Route path="/settings/audit" element={<AuthGate><AuditConsole /></AuthGate>} />
            <Route path="/poc/user-management" element={<AuthGate><UserManagement /></AuthGate>} />

            {/* Processing queues */}
            <Route path="/poc/upload" element={<AuthGate><POCUpload /></AuthGate>} />
            <Route path="/poc/high-confidence" element={<AuthGate><HighConfidenceQueue /></AuthGate>} />
            <Route path="/poc/high-confidence/:id" element={<AuthGate><HighConfidenceDetail /></AuthGate>} />
            <Route path="/poc/low-confidence" element={<AuthGate><LowConfidenceList /></AuthGate>} />
            <Route path="/poc/low-confidence/:id" element={<AuthGate><LowConfidenceQueue /></AuthGate>} />
            <Route path="/poc/exceptions" element={<AuthGate><ExceptionsQueue /></AuthGate>} />
            <Route path="/poc/exceptions/:id" element={<AuthGate><ExceptionDetail /></AuthGate>} />
            <Route path="/poc/declined" element={<AuthGate><DeclinedQueue /></AuthGate>} />

            {/* Process documentation */}
            <Route path="/documentation/internal-process-flow" element={<AuthGate><InternalProcessFlow /></AuthGate>} />
            <Route path="/documentation/public-process-flow" element={<AuthGate><PublicProcessFlow /></AuthGate>} />
            <Route path="/poc/documentation" element={<AuthGate><POCDocumentation /></AuthGate>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
