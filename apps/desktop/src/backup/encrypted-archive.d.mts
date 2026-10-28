export const MAX_ENCRYPTED_ARCHIVE_BYTES: number;
export function assertEncryptedArchiveSize(size: number): void;
export function encryptArchive(source: AsyncIterable<Uint8Array>, password: string, options?: { signal?: AbortSignal }): AsyncGenerator<Uint8Array>;
export function decryptArchive(input: string, destination: string, password?: string, options?: { signal?: AbortSignal }): Promise<void>;
