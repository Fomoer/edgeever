# Video notes: save captions already available on the page

On a YouTube or Bilibili watch page, the user chooses **Save video note to EdgeEver**. The extension reads the current video's metadata and any captions already provided by the platform. It saves the title, creator, source link, available cover, and captions with links back to the original timestamps. When captions exist and the workspace has an available chat model, it may also generate a summary, outline, and takeaways; failure does not block saving the note.

Supported pages are ordinary YouTube videos and Shorts, and ordinary Bilibili videos including multipart videos. Live streams, series, courses, and other pages do not create video notes. Without captions, the note contains source information and a **No captions available for this video** message. It does not start speech transcription. Video notes have no command to extract captions again and do not download videos or audio tracks from external platforms.

## Speech transcription for note attachments

Users can explicitly transcribe an audio or MP4/WebM video attachment already uploaded to a note. A workspace configures an OpenAI-compatible speech provider and default model. The note-resource API accepts only a note ID and an attachment ID belonging to that note; it does not accept a media URL. The instance validates attachment ownership and gives the signed-in client the current speech model URL, name, and credential; the credential is encrypted at rest on the instance. The web/desktop client reads the attachment in ranges through the existing resource API, extracts its audio track locally, and splits it by size or duration. The client sends each audio segment of at most 24 MB directly to the configured `/audio/transcriptions` service. The instance serves the original attachment bytes but does not extract or convert audio or relay provider requests. Browser calls require the provider to support cross-origin requests and put the credential in the current browser session; the desktop main process calls the provider locally. The result is shown for copying or insertion into the current note. Plugins can use the same client-side capability through `context.ai.transcribeResource(noteId, resourceId)`, or pass their own audio/video `Blob` to `context.ai.transcribeMedia(blob)`; neither method returns provider credentials or accepts a media URL. Attachments remain subject to the normal upload limit; unreadable formats or audio tracks return an error.

When adding a service, users can test the unsaved URL, model ID, and token. When editing, they can select an existing model and test with either the stored token or a replacement. The current client sends a short bundled speech sample directly to the model service and shows its returned transcript. Testing does not save the form and may incur a small provider charge. Browser CORS limitations are the same as for normal transcription.

When a browser cannot establish a direct connection, the client can only report an incomplete check; this does not establish that the token, model, or speech endpoint is invalid. If the provider blocks cross-origin requests, test in the desktop app. Do not relay the transcription request through the instance merely to make the browser test pass.
"OpenAI-compatible" describes an API shape and does not guarantee that the provider implements `/audio/transcriptions`. Once the desktop app avoids the browser CORS restriction, a real short-speech request is still needed to verify that endpoint and the selected model.

## Withdrawn external media retrieval design: technical notes

The following records an unreleased external media retrieval design for possible future evaluation of authorized use. **It does not describe current product behavior or a planned feature.** The withdrawn scope includes external audio retrieval, browser session reuse, automatic yt-dlp installation and updates, external video transcription jobs, and desktop polling. Note attachment transcription above is a separate implementation.

### Jobs and data boundaries

- The proposed design encoded the platform, video ID, source URL, duration, and missing-caption placeholder in a hidden marker in the note body. Saving a note did not create a job; a user action in the note list created one.
- The API scoped jobs by workspace and note ID and recorded a content hash. Clipper tokens and demo instances could not create or claim jobs. A conditional update let one desktop client claim a job; a job stalled for roughly 20 minutes could be reclaimed.
- Writing the result back to the same note required the expected revision and content hash. A user edit prevented an overwrite. The placeholder would be replaced when present; otherwise the transcript would be appended. Failure left the original note intact and did not trigger repeated automatic retries.

### Local media processing and model calls

- The proposed design checked an HTTPS source against a platform allowlist, then used yt-dlp locally to select only the best audio track, without saving video. It limited known duration to roughly 30 minutes, audio to roughly 24 MiB, and both download and transcription time. Temporary audio was deleted after the job. Resource limits do not grant copyright permission.
- The standalone yt-dlp executable came from its releases and was checked against SHA-256; the desktop client checked for updates in the background. Optional `--cookies-from-browser` reused a local browser session, with the browser choice stored only on that device. This widened the range of accessible media; local execution did not establish permission from a platform or rights holder.
- The old design let an authenticated desktop client obtain speech credentials and send audio directly to the chosen OpenAI-compatible `/audio/transcriptions` endpoint. Current attachment transcription also calls the provider directly from the client, but accepts only uploaded attachments belonging to the current note; it does not revive external media retrieval or the old job mechanism.
- Segments with timestamps became transcript links back to the source; a plain-text-only response became a text block. Failures recorded error codes without writing API tokens to diagnostics.

Any future revival should first establish content rights, platform terms, target markets, and the transcription provider's data handling, then redesign the entry point and verification scope. The retrieval path above should not simply be re-enabled.
