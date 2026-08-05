/**
 * Microsoft Entra sign-in (MSAL, public client + PKCE).
 *
 * The tenant and client ids are fetched at runtime from /auth/sso/config (set by
 * an admin in User Management), so nothing Entra-specific is hard-coded or built
 * in. This returns the ID token, which the backend verifies and exchanges for
 * the normal application session — MSAL is only the identity step.
 *
 * The app registration must list this origin as a SPA redirect URI.
 */

import { PublicClientApplication, type AuthenticationResult } from "@azure/msal-browser";

let instance: PublicClientApplication | null = null;
let instanceKey = "";

async function getInstance(tenantId: string, clientId: string): Promise<PublicClientApplication> {
  const key = `${tenantId}:${clientId}`;
  if (instance && instanceKey === key) return instance;

  const pca = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage" },
  });
  await pca.initialize();
  instance = pca;
  instanceKey = key;
  return pca;
}

/**
 * Open the Microsoft sign-in popup and return the ID token.
 * Throws if the user cancels or no token is returned.
 */
export async function signInWithMicrosoft(tenantId: string, clientId: string): Promise<string> {
  const pca = await getInstance(tenantId, clientId);
  const result: AuthenticationResult = await pca.loginPopup({
    scopes: ["openid", "profile", "email"],
    prompt: "select_account",
  });
  if (!result.idToken) {
    throw new Error("Microsoft did not return an ID token.");
  }
  return result.idToken;
}
