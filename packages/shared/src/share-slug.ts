/** Kept free of imports so server entry points loaded by Node can use it. */

/** 3-40 lowercase letters, digits and inner hyphens; never as long as a 43-character token. */
export const MEMO_SHARE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const MEMO_SHARE_SLUG_MAX_LENGTH = 40;
/** Segments that already mean something under /share/. */
export const RESERVED_MEMO_SHARE_SLUGS: readonly string[] = ["notebook"];

export const isValidMemoShareSlug = (value: string) =>
  MEMO_SHARE_SLUG_PATTERN.test(value) && !value.includes("--") && !RESERVED_MEMO_SHARE_SLUGS.includes(value);
