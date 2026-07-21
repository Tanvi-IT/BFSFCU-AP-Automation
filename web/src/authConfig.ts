/**
 * MSAL configuration for Entra ID sign-in.
 *
 * Replaces Supabase Auth entirely. There is no signup, no password reset and
 * no email verification in this application — Entra owns all of that.
 */

import {
  PublicClientApplication,
  LogLevel,
  type Configuration,
  type RedirectRequest,
} from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
const apiScope = import.meta.env.VITE_API_SCOPE as string | undefined;

if (!tenantId || !clientId) {
  // Fail loudly at startup rather than with a confusing redirect later.
  throw new Error(
    "Missing VITE_ENTRA_TENANT_ID or VITE_ENTRA_CLIENT_ID. Copy .env.example to .env and fill in the values."
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps the token out of long-lived browser storage.
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error("[msal]", message);
        else if (level === LogLevel.Warning) console.warn("[msal]", message);
      },
    },
  },
};

/** Scopes requested when signing in. */
export const loginRequest: RedirectRequest = {
  scopes: apiScope ? [apiScope] : ["openid", "profile", "email"],
};

/** Scopes for silently acquiring an access token for our own API. */
export const apiRequest = {
  scopes: apiScope ? [apiScope] : [],
};

export const msalInstance = new PublicClientApplication(msalConfig);
