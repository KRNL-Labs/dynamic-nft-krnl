import { createRemoteJWKSet, jwtVerify } from "jose";

export interface PrivyAuthResult {
  privyUserId: string;
  walletAddress: string | null;
}

const getJwksUrl = () => {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) {
    throw new Error("PRIVY_APP_ID must be set");
  }
  return new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
};

const jwks = createRemoteJWKSet(getJwksUrl());

export const verifyAccessToken = async (token: string): Promise<PrivyAuthResult> => {
  try {
    const appId = process.env.PRIVY_APP_ID;
    if (!appId) {
      throw new Error("PRIVY_APP_ID must be set");
    }
    const raw = token.replace(/^Bearer\s+/i, "");
    const { payload } = await jwtVerify(raw, jwks, {
      issuer: "privy.io",
      audience: appId
    });

    return {
      privyUserId: payload.sub as string,
      walletAddress: null // TODO: fetch identity token to extract linked wallets
    };
  } catch (error) {
    console.error("Privy token verification failed", error);
    throw new Error("Unauthorized");
  }
};
