import { MAX_SINGLE_REQUEST_UPLOAD_BYTES, type createEdgeEverClient } from "@edgeever/client";
import { File as ExpoFile, FileMode } from "expo-file-system";
import { readMobileResourcePart } from "./mobile-resource-part";

type ResourceUploadClient = Pick<ReturnType<typeof createEdgeEverClient>, "uploadMemoResource" | "uploadMemoResourceParts">;

export const uploadMobileResource = (
  client: ResourceUploadClient,
  memoId: string,
  asset: { uri: string; name: string; type: string },
) => {
  const file = new ExpoFile(asset.uri);
  if (file.size <= MAX_SINGLE_REQUEST_UPLOAD_BYTES) {
    return client.uploadMemoResource(memoId, file);
  }
  return client.uploadMemoResourceParts(memoId, {
    filename: asset.name,
    mimeType: asset.type === "application/octet-stream" ? file.type || asset.type : asset.type,
    byteSize: file.size,
    // Expo File.slice() constructs Blob([Uint8Array]), unsupported by React Native.
    readPart: async (start, end) => readMobileResourcePart(() => file.open(FileMode.ReadOnly), start, end),
  });
};
