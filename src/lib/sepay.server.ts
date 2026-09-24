/**
 * SePay bank-transfer payments — server-only module (`.server.ts`).
 *
 * Automatically fetches the active receiving bank account from SePay via API (v2 or v1)
 * or falls back to environment variables. Generates dynamic SePay VietQR payment images
 * and verifies incoming SePay webhooks.
 *
 * NO credentials or account numbers are hardcoded.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SepayBankAccount = {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
};

let cachedBankAccount: { account: SepayBankAccount; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export function getSepayApiKey(): string | undefined {
  return process.env["SEPAY_API_KEY"] || undefined;
}

export function getSepayWebhookSecret(): string | undefined {
  return process.env["SEPAY_WEBHOOK_SECRET"] || undefined;
}

function parseSepayAccount(item: any): SepayBankAccount | null {
  if (!item || typeof item !== "object") return null;
  const accountNumber = String(item.account_number || item.accountNumber || "").trim();
  const bankName = String(item.bank_name || item.bank_short_name || item.short_name || item.bankName || "").trim();
  const bankCode = String(item.bank_short_name || item.short_name || item.bank_name || item.bankCode || "").trim();
  const accountName = String(item.account_holder_name || item.account_name || item.accountHolderName || "").trim();

  if (!accountNumber) return null;
  return {
    accountNumber,
    bankName: bankName || bankCode || "Ngân hàng",
    bankCode: bankCode || bankName,
    accountName,
  };
}

function extractAccountFromJson(json: any): SepayBankAccount | null {
  if (!json) return null;
  let rawList: any[] = [];
  if (Array.isArray(json)) rawList = json;
  else if (Array.isArray(json.data)) rawList = json.data;
  else if (Array.isArray(json.data?.items)) rawList = json.data.items;
  else if (Array.isArray(json.data?.bank_accounts)) rawList = json.data.bank_accounts;
  else if (Array.isArray(json.bank_accounts)) rawList = json.bank_accounts;
  else if (json.data && typeof json.data === "object") {
    const single = parseSepayAccount(json.data);
    if (single) return single;
  }

  // Look for active account first
  for (const item of rawList) {
    if (item.active === true || item.active === 1 || item.active === "1" || item.status === "active") {
      const parsed = parseSepayAccount(item);
      if (parsed) return parsed;
    }
  }
  // Otherwise pick the first account in list
  for (const item of rawList) {
    const parsed = parseSepayAccount(item);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Dynamically fetches the active bank account configured in SePay.
 * 1. Checks memory cache (5m TTL).
 * 2. If SEPAY_API_KEY is configured, calls SePay API v2 (`https://userapi.sepay.vn/v2/bank-accounts`)
 *    with fallback to SePay v1 (`https://my.sepay.vn/userapi/bankaccounts/list`).
 * 3. Falls back to environment variables (SEPAY_ACCOUNT_NUMBER, SEPAY_ACCOUNT_NAME, etc.) if set.
 * 4. Never hardcodes any default personal bank details.
 */
export async function getActiveSepayBankAccount(): Promise<SepayBankAccount> {
  const now = Date.now();
  if (cachedBankAccount && cachedBankAccount.expiresAt > now) {
    return cachedBankAccount.account;
  }

  const apiKey = getSepayApiKey();
  if (apiKey) {
    try {
      // 1. Try SePay API v2
      const res = await fetch("https://userapi.sepay.vn/v2/bank-accounts", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const json = await res.json();
        const account = extractAccountFromJson(json);
        if (account) {
          cachedBankAccount = { account, expiresAt: now + CACHE_TTL_MS };
          return account;
        }
      } else {
        // Fallback to SePay v1 / userapi
        const v1Res = await fetch("https://my.sepay.vn/userapi/bankaccounts/list", {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (v1Res.ok) {
          const v1Json = await v1Res.json();
          const account = extractAccountFromJson(v1Json);
          if (account) {
            cachedBankAccount = { account, expiresAt: now + CACHE_TTL_MS };
            return account;
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch bank accounts dynamically from SePay API:", err);
    }
  }

  // Fallback to environment variables if explicitly configured in .env.docker
  const envAccount: SepayBankAccount = {
    bankName: process.env["SEPAY_BANK_NAME"] || "",
    bankCode: process.env["SEPAY_VIETQR_BANK_CODE"] || process.env["SEPAY_BANK_NAME"] || "",
    accountNumber: process.env["SEPAY_ACCOUNT_NUMBER"] || "",
    accountName: process.env["SEPAY_ACCOUNT_NAME"] || "",
  };

  return envAccount;
}

/** Legacy proxy for any legacy reference — without hardcoded strings */
export const SEPAY_BANK = {
  get bankName() {
    return process.env["SEPAY_BANK_NAME"] || "";
  },
  get vietQrBankCode() {
    return process.env["SEPAY_VIETQR_BANK_CODE"] || process.env["SEPAY_BANK_NAME"] || "";
  },
  get accountNumber() {
    return process.env["SEPAY_ACCOUNT_NUMBER"] || "";
  },
  get accountName() {
    return process.env["SEPAY_ACCOUNT_NAME"] || "";
  },
};

const DEFAULT_USD_TO_VND_RATE = 25500;

export function usdToVndRate(): number {
  const raw = Number(process.env["USD_TO_VND_RATE"]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_VND_RATE;
}

export function usdCentsToVnd(usdCents: number, rate = usdToVndRate()): number {
  return Math.round(((usdCents / 100) * rate) / 1000) * 1000;
}

const REFERENCE_PREFIX = "LGR";

export function generateReferenceCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let body = "";
  for (let i = 0; i < 8; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${REFERENCE_PREFIX}${body}`;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies SePay's incoming webhook request:
 * 1. Matches SePay's standard API Key in `Authorization: Apikey <KEY>` or `Bearer <KEY>`
 * 2. Or matches HMAC-SHA256 signature in `X-SePay-Signature` with `X-SePay-Timestamp`
 */
export function verifySepayRequest(
  rawBody: string,
  headers: Headers,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  // 1. Check SePay API Key in Authorization or custom headers
  const auth = headers.get("authorization") || headers.get("x-sepay-api-key") || headers.get("x-api-key") || "";
  const match = auth.match(/^(?:Apikey|Bearer)\s+(.+)$/i);
  const apiKey = match ? match[1]?.trim() : auth.trim();
  if (apiKey && timingSafeEqualStr(apiKey, secret)) {
    return true;
  }

  // 2. Check HMAC-SHA256 signature if provided
  const sig = headers.get("x-sepay-signature");
  const ts = headers.get("x-sepay-timestamp");
  if (sig && ts) {
    if (Math.abs(Date.now() / 1000 - Number(ts)) <= toleranceSeconds) {
      const provided = sig.replace(/^sha256=/, "").trim();
      const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
      if (timingSafeEqualStr(provided, expected)) return true;
    }
  }

  return false;
}

export function verifySepaySignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !timestampHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestampHeader)) > toleranceSeconds) return false;
  const provided = signatureHeader.replace(/^sha256=/, "").trim();
  const expected = createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`).digest("hex");
  return timingSafeEqualStr(provided, expected);
}

/**
 * Official SePay dynamic QR image endpoint (https://qr.sepay.vn/img).
 * Seamlessly formats the amount, receiving bank, and order reference note.
 */
export function sepayQrImageUrl(
  amountVnd: number,
  referenceCode: string,
  bank: SepayBankAccount,
): string {
  if (!bank.accountNumber || !bank.bankCode) {
    return "";
  }
  const params = new URLSearchParams({
    acc: bank.accountNumber,
    bank: bank.bankCode,
    amount: String(amountVnd),
    des: referenceCode,
    template: "compact",
  });
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

/**
 * VietQR public image endpoint fallback.
 */
export function vietQrImageUrl(
  amountVnd: number,
  referenceCode: string,
  bank: SepayBankAccount,
): string {
  if (!bank.accountNumber || !bank.bankCode) {
    return "";
  }
  const params = new URLSearchParams({
    amount: String(amountVnd),
    addInfo: referenceCode,
    accountName: bank.accountName,
  });
  const code = bank.bankCode.toLowerCase();
  return `https://img.vietqr.io/image/${code}-${bank.accountNumber}-compact2.png?${params.toString()}`;
}

export type SepayWebhookPayload = {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount?: string | null;
  code?: string | null;
  content: string;
  transferType: "in" | "out";
  description?: string;
  transferAmount: number;
  accumulated?: number;
  referenceCode?: string | null;
};

export function extractReferenceCode(payload: SepayWebhookPayload): string | null {
  const fromCode = payload.code?.trim();
  if (fromCode?.startsWith(REFERENCE_PREFIX)) return fromCode;
  const match = `${payload.content} ${payload.description ?? ""}`.match(/LGR[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}/);
  return match?.[0] ?? null;
}
