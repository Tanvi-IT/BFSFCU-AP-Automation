import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import { EventType, type AuthenticationResult } from "@azure/msal-browser";
import { msalInstance } from "./authConfig";
import App from "./App.tsx";
import "./index.css";

/**
 * MSAL must finish initialising (and process any redirect coming back from
 * Entra) before React renders, otherwise the first paint sees no account.
 */
async function bootstrap() {
  await msalInstance.initialize();

  // Restore the active account across reloads.
  const accounts = msalInstance.getAllAccounts();
  const first = accounts[0];
  if (first && !msalInstance.getActiveAccount()) {
    msalInstance.setActiveAccount(first);
  }

  msalInstance.addEventCallback((event) => {
    if (
      event.eventType === EventType.LOGIN_SUCCESS ||
      event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS
    ) {
      const payload = event.payload as AuthenticationResult;
      if (payload?.account) {
        msalInstance.setActiveAccount(payload.account);
      }
    }
  });

  // Completes the redirect flow if we have just returned from Entra.
  await msalInstance.handleRedirectPromise();

  createRoot(document.getElementById("root")!).render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  );
}

bootstrap().catch((err) => {
  console.error("Failed to start application", err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML =
      '<div style="font-family:system-ui;padding:2rem;max-width:40rem;margin:0 auto">' +
      "<h1>Unable to start</h1>" +
      "<p>Authentication could not be initialised. Check that <code>.env</code> " +
      "contains VITE_ENTRA_TENANT_ID and VITE_ENTRA_CLIENT_ID.</p>" +
      "</div>";
  }
});
