export interface PeriodUsage {
  autoPercentUsed: number;
  apiPercentUsed: number;
  autoRemaining: number;
  apiRemaining: number;
  billingCycleEnd?: string;
}

const USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const OAUTH_URL = "https://api2.cursor.sh/oauth/token";
const OAUTH_CLIENT_ID = "KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB";

/** Used % as shown in Plan & Usage. Clamp to [0, 100], round to nearest int. */
export function usedPercent(used: number): number {
  if (!Number.isFinite(used)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(used)));
}

/** Remaining % of a usage pool. Clamp to [0, 100], round to nearest int. */
export function remainingPercent(used: number): number {
  return usedPercent(100 - (Number.isFinite(used) ? used : 100));
}

function parseCycleMs(msOrIso: number | string): number | undefined {
  const ms =
    typeof msOrIso === "number"
      ? msOrIso
      : Number.isFinite(Number(msOrIso)) && /^\d+$/.test(msOrIso.trim())
        ? Number(msOrIso)
        : Date.parse(msOrIso);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Format cycle end as DD/MM/YY HH:MM (local time). */
export function formatCycleEnd(msOrIso: number | string): string | undefined {
  const ms = parseCycleMs(msOrIso);
  if (ms === undefined) {
    return undefined;
  }
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Days and hours until cycle end (floored; past end → 0). */
export function formatCycleRemaining(
  msOrIso: number | string,
  now = Date.now()
): string | undefined {
  const ms = parseCycleMs(msOrIso);
  if (ms === undefined) {
    return undefined;
  }
  const totalH = Math.floor(Math.max(0, ms - now) / 3_600_000);
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  const dayPart = days === 1 ? "1 day" : `${days} days`;
  const hourPart = hours === 1 ? "1 hour" : `${hours} hours`;
  return `${dayPart}, ${hourPart} left`;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function parseUsage(body: unknown): PeriodUsage {
  const root = body as {
    planUsage?: {
      autoPercentUsed?: number;
      apiPercentUsed?: number;
    };
    billingCycleEnd?: string | number;
  };
  const plan = root.planUsage ?? {};
  const autoPercentUsed = asNumber(plan.autoPercentUsed);
  const apiPercentUsed = asNumber(plan.apiPercentUsed);

  let billingCycleEnd: string | undefined;
  const rawEnd = root.billingCycleEnd;
  if (typeof rawEnd === "number" || typeof rawEnd === "string") {
    const when = formatCycleEnd(rawEnd);
    const left = formatCycleRemaining(rawEnd);
    billingCycleEnd =
      when && left ? `${when} (${left})` : when;
  }

  return {
    autoPercentUsed: usedPercent(autoPercentUsed),
    apiPercentUsed: usedPercent(apiPercentUsed),
    autoRemaining: remainingPercent(autoPercentUsed),
    apiRemaining: remainingPercent(apiPercentUsed),
    billingCycleEnd,
  };
}

type FetchResult = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

/** Node 18+ / extension host global; typed locally so tsserver need not pull DOM. */
const httpFetch = (
  globalThis as unknown as {
    fetch(
      input: string,
      init: { method: string; headers: Record<string, string>; body: string }
    ): Promise<FetchResult>;
  }
).fetch;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await httpFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let json: unknown = undefined;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { ok: res.ok, status: res.status, json };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { ok, status, json } = await postJson(
    OAUTH_URL,
    {},
    {
      grant_type: "refresh_token",
      client_id: OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }
  );
  if (!ok) {
    throw new Error(`Token refresh failed (HTTP ${status})`);
  }
  const access =
    json && typeof json === "object" && "access_token" in json
      ? (json as { access_token?: unknown }).access_token
      : undefined;
  if (typeof access !== "string" || !access) {
    throw new Error("Token refresh response missing access_token");
  }
  return access;
}

async function fetchUsageOnce(accessToken: string): Promise<{
  status: number;
  usage?: PeriodUsage;
}> {
  const { ok, status, json } = await postJson(
    USAGE_URL,
    {
      Authorization: `Bearer ${accessToken}`,
      "Connect-Protocol-Version": "1",
    },
    {}
  );
  if (status === 401 || status === 403) {
    return { status };
  }
  if (!ok) {
    throw new Error(`GetCurrentPeriodUsage failed (HTTP ${status})`);
  }
  return { status, usage: parseUsage(json) };
}

export async function fetchPeriodUsage(
  accessToken: string,
  refreshToken?: string
): Promise<PeriodUsage> {
  const first = await fetchUsageOnce(accessToken);
  if (first.usage) {
    return first.usage;
  }
  if ((first.status === 401 || first.status === 403) && refreshToken) {
    const next = await refreshAccessToken(refreshToken);
    const second = await fetchUsageOnce(next);
    if (second.usage) {
      return second.usage;
    }
    throw new Error(`Usage fetch unauthorized after refresh (HTTP ${second.status})`);
  }
  throw new Error(`Usage fetch unauthorized (HTTP ${first.status})`);
}
