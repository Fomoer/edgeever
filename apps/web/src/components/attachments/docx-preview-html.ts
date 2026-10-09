const PREVIEW_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** The iframe also has an empty sandbox: document markup cannot run scripts or navigate its parent. */
export const buildDocxPreviewHtml = (styles: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
${styles}
<style>html,body{margin:0;min-height:100%;background:#f1f5f9}a{pointer-events:none!important}</style>
</head><body>${body}</body></html>`;
