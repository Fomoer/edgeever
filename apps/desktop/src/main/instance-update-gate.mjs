const parseVersion = (value) => {
  const match = String(value ?? "").match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i);
  return match
    ? { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? null }
    : null;
};

const isVersionOutdated = (currentVersion, latestVersion) => {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);
  if (!current || !latest) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current.core[index] !== latest.core[index]) return current.core[index] < latest.core[index];
  }
  if (!current.prerelease) return false;
  if (!latest.prerelease) return true;
  const length = Math.max(current.prerelease.length, latest.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current.prerelease[index];
    const latestPart = latest.prerelease[index];
    if (currentPart === undefined) return true;
    if (latestPart === undefined) return false;
    if (currentPart === latestPart) continue;
    const currentNumber = /^\d+$/.test(currentPart) ? Number(currentPart) : null;
    const latestNumber = /^\d+$/.test(latestPart) ? Number(latestPart) : null;
    if (currentNumber !== null && latestNumber !== null) return currentNumber < latestNumber;
    if (currentNumber !== null) return true;
    if (latestNumber !== null) return false;
    return currentPart.localeCompare(latestPart) < 0;
  }
  return false;
};

export const instanceReleaseVersionFromPayload = (payload) => (
  payload && typeof payload.version === "string" && payload.version.trim()
    ? payload.version.trim()
    : null
);

export const shouldHoldAutoRestartUpdate = (updateVersion, instanceVersion) => (
  Boolean(updateVersion && instanceVersion && isVersionOutdated(instanceVersion, updateVersion))
);
