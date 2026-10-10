# Hacker News clipping

Open a main-post detail page at `https://news.ycombinator.com/item?id=<id>`. Use **Clip current page**, or right-click the page and choose **Save Hacker News post to EdgeEver**. A selected passage takes priority for the toolbar action; the dedicated page menu saves the main post.

The note keeps the title, author, original publication time as supplied by the page, points at capture, external link and main-post text when available. Ask HN, Show HN and link-only posts are supported. Comments are excluded. Each full-post note has `web-clip` and `hacker-news` tags.

The linked article is recorded as a link; its content is not fetched. Missing metadata is omitted. Comment detail pages, deleted posts and unreadable content are rejected. A page change during capture cancels saving. No additional persistent site permission is added.

Images in the saved body use the existing attachment workflow. If copying fails or reaches its limit, text remains saved and the message explains that some images still use external links. A concurrent edit is preserved.

## Verification

Automated coverage uses a redacted public HN DOM fixture, parser and bundled background/injection tests, and a Chromium extension test against the local API that reopens the saved note. The image-storage case adds a synthetic image to the HN fixture. These checks do not replace live-site acceptance across Chrome, Edge and Firefox or store publication.

[简体中文](browser-clipper-hacker-news.zh-CN.md)
