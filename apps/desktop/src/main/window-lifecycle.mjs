export const shouldQuitAfterAllWindowsClosed = ({
  platform = process.platform,
  rendererOriginMigrationInProgress = false,
} = {}) => platform !== "darwin" && !rendererOriginMigrationInProgress;
