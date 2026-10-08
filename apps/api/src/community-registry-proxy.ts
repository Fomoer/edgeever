const COMMUNITY_REGISTRY_MAX_BYTES = 1024 * 1024;
const COMMUNITY_REGISTRY_SIGNATURE_MAX_BYTES = 2048;

export const COMMUNITY_REGISTRY_SIGNATURE_HEADER = "x-edgeever-community-registry-signature";

export const resolveCommunityRegistryUrl = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Community registry URL is invalid.");
  }
  const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) throw new Error("Community registry URL must use HTTPS.");
  if (url.username || url.password) throw new Error("Community registry URL cannot include credentials.");
  return url;
};

export const communityRegistrySignatureUrl = (registryUrl: URL) => {
  const signature = new URL(registryUrl.href);
  signature.pathname = `${registryUrl.pathname}.sig`;
  return signature;
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const trimmed = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
};

const readBoundedBody = async (response: Response, maximumBytes: number, label: string) => {
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} redirects are not followed.`);
  }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maximumBytes) throw new Error(`${label} exceeds the allowed size.`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maximumBytes) throw new Error(`${label} exceeds the allowed size.`);
  return buffer;
};

const normalizeSignature = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes);
  if (view.byteLength === 64) return encodeBase64(view);
  const text = new TextDecoder().decode(view).trim();
  const decoded = decodeBase64(text);
  if (!decoded || decoded.byteLength !== 64) throw new Error("Community registry signature is invalid.");
  return text.replace(/\s+/g, "");
};

export const fetchCommunityRegistryRelease = async ({
  registryUrl,
  request = fetch,
  timeoutMs = 10_000,
}: {
  registryUrl: string;
  request?: typeof fetch;
  timeoutMs?: number;
}) => {
  const url = resolveCommunityRegistryUrl(registryUrl);
  if (!url) throw new Error("Community registry URL is not configured.");
  const signatureUrl = communityRegistrySignatureUrl(url);
  const init = {
    redirect: "manual" as const,
    credentials: "omit" as const,
    signal: AbortSignal.timeout(timeoutMs),
  };
  const [registryResponse, signatureResponse] = await Promise.all([
    request(url.href, { ...init, headers: { Accept: "application/json", "User-Agent": "EdgeEver" } }),
    request(signatureUrl.href, {
      ...init,
      headers: { Accept: "text/plain, application/octet-stream", "User-Agent": "EdgeEver" },
    }),
  ]);
  const registryBytes = await readBoundedBody(registryResponse, COMMUNITY_REGISTRY_MAX_BYTES, "Community registry");
  const signatureBytes = await readBoundedBody(signatureResponse, COMMUNITY_REGISTRY_SIGNATURE_MAX_BYTES, "Community registry signature");
  return {
    registryBytes,
    signatureBase64: normalizeSignature(signatureBytes),
  };
};
