/**
 * Ed25519 public keys for the signed community registry.
 * The first key is current. The next key is the previous one, kept for one
 * client release so a registry signed before rotation still verifies.
 * The private key stays in the tianma-if/edgeever-plugins publish environment.
 */
export const COMMUNITY_REGISTRY_PUBLIC_KEYS_BASE64 = [
  "vkaOJCCApTIzFvkDRGguUW+hg7tK7oF9WsWoNfUbB8g=",
] as const;

export const decodeCommunityRegistryKey = (value: string) => {
  const trimmed = value.trim();
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

export const communityRegistryPublicKeys = (
  encodedKeys: readonly string[] = COMMUNITY_REGISTRY_PUBLIC_KEYS_BASE64,
) => encodedKeys.flatMap((value) => {
  const bytes = decodeCommunityRegistryKey(value);
  return bytes?.byteLength === 32 ? [bytes] : [];
});

export const verifyCommunityRegistrySignature = async (
  registryBytes: Uint8Array,
  signature: Uint8Array,
  publicKeys: readonly Uint8Array[],
) => {
  if (signature.byteLength !== 64 || publicKeys.length === 0) return false;
  const data = new Uint8Array(registryBytes);
  const signatureBytes = new Uint8Array(signature);
  for (const publicKey of publicKeys) {
    if (publicKey.byteLength !== 32) continue;
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(publicKey),
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, data)) return true;
    } catch {
      // A runtime without Ed25519, or a rejected key, fails closed for that key.
    }
  }
  return false;
};
