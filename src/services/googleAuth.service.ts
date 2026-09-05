import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { GmailAccountModel } from '../models/GmailAccount.model';
import { encryptSecret, decryptSecret } from './secureToken.service';
import { ApiError } from '../utils/asyncHandler.util';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const OPENID_SCOPES = ['openid', 'email', 'profile'];

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

class GoogleAuthService {
  getAuthorizationUrl(): string {
    if (!env.google.clientId || !env.google.clientSecret) {
      throw new ApiError(503, 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
    const state = jwt.sign({ nonce: crypto.randomUUID() }, env.jwt.secret, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: env.google.clientId,
      redirect_uri: env.google.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: [...OPENID_SCOPES, GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE].join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ token: string; account: GoogleUserInfo }> {
    try {
      jwt.verify(state, env.jwt.secret);
    } catch {
      throw new ApiError(400, 'Invalid or expired Google OAuth state');
    }

    const tokenResponse = await this.exchangeCode(code);
    const user = await this.fetchUserInfo(tokenResponse.access_token);
    if (!user.email || user.email_verified === false) throw new ApiError(400, 'Google account email is not verified');

    const existing = await GmailAccountModel.findOne({ googleSub: user.sub });
    const refreshToken = tokenResponse.refresh_token
      ? tokenResponse.refresh_token
      : existing?.encryptedRefreshToken
        ? decryptSecret(existing.encryptedRefreshToken)
        : '';

    if (!refreshToken) {
      throw new ApiError(400, 'Google did not return a refresh token. Reconnect Gmail and grant offline access.');
    }

    const scopes = tokenResponse.scope?.split(' ').filter(Boolean) ?? [GMAIL_SEND_SCOPE];
    const account = await GmailAccountModel.findOneAndUpdate(
      { googleSub: user.sub },
      {
        email: user.email.toLowerCase(),
        displayName: user.name,
        picture: user.picture,
        encryptedRefreshToken: encryptSecret(refreshToken),
        encryptedAccessToken: encryptSecret(tokenResponse.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        scopes,
        connectedAt: existing?.connectedAt ?? new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const token = jwt.sign(
      { id: user.sub, email: user.email.toLowerCase(), role: 'user' },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn } as jwt.SignOptions,
    );

    return { token, account: user };
  }

  async getConnectedAccount(email: string) {
    return GmailAccountModel.findOne({ email: email.toLowerCase() }).lean();
  }

  async disconnect(email: string): Promise<void> {
    const account = await GmailAccountModel.findOneAndDelete({ email: email.toLowerCase() });
    if (account) {
      try {
        const refreshToken = decryptSecret(account.encryptedRefreshToken);
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }).toString(),
        });
      } catch {
        // Revocation is best-effort; local credentials are already removed.
      }
    }
  }

  async getAccessToken(email: string): Promise<string> {
    const account = await GmailAccountModel.findOne({ email: email.toLowerCase() });
    if (!account) throw new ApiError(400, 'Connect a Gmail account before sending email.');

    if (account.encryptedAccessToken && account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      return decryptSecret(account.encryptedAccessToken);
    }

    const refreshToken = decryptSecret(account.encryptedRefreshToken);
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(401, `Gmail authorization expired. Please reconnect Gmail. ${text}`);
    }
    const data = (await response.json()) as GoogleTokenResponse;
    account.encryptedAccessToken = encryptSecret(data.access_token);
    account.accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    account.lastUsedAt = new Date();
    await account.save();
    return data.access_token;
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: env.google.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const data: any = await response.json();
    if (!response.ok) throw new ApiError(400, `Google authorization failed: ${data?.error_description ?? 'token exchange failed'}`);
    return data as GoogleTokenResponse;
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new ApiError(400, 'Unable to read Google account profile');
    return (await response.json()) as GoogleUserInfo;
  }
}

export const googleAuthService = new GoogleAuthService();
export { GMAIL_SEND_SCOPE, GMAIL_READONLY_SCOPE };
