# EdgeEver Plugin Marketplace Submission Policy

[简体中文](plugin-marketplace-policy.zh-CN.md)

The official EdgeEver Plugin Marketplace only lists free and open-source plugins. This policy applies to admission to and continued distribution through the official marketplace. It does not restrict users from installing other plugins directly from GitHub or a Manifest URL.

## Open-source requirements

For every marketplace version, a plugin developer must:

- Host the complete source code executed in the EdgeEver client in a publicly accessible repository that does not require an account or special permission to view.
- Include an OSI-approved open-source license that permits use, inspection, modification, and redistribution. The developer is responsible for ensuring that the selected license is compatible with all included code and dependencies.
- Publish the human-readable, non-obfuscated source, build configuration, and instructions reasonably necessary to produce the distributed package. Publishing only a compiled, minified, or bundled `main.js` is not sufficient.
- Associate the marketplace version with a public, immutable Git tag or commit, and ensure that its Manifest and release assets can be traced to that source revision.
- Identify bundled third-party code and comply with its license and source-availability requirements.

Minified or bundled release assets are allowed when their corresponding source remains public and reviewable. Code that executes only on a separately hosted service is not required to be open source, but the plugin listing must clearly disclose the service dependency, data sent to it, privacy policy, and any payment requirement.

Code-free themes must publish their complete Manifest and use a license that permits public use, inspection, modification, and redistribution. Any included third-party material must use compatible terms.

## Continued eligibility

The repository, license, source revision, and build information must remain publicly available while a version is distributed through the official marketplace. EdgeEver may reject, suspend, or remove a listing when it no longer satisfies this policy, when its release assets cannot be traced to the declared source, or when its behavior creates a security, privacy, legal, or reliability risk.

Marketplace verification means that a listing has passed the applicable admission and integrity checks at the time of review. It is not a guarantee that a plugin is secure, error-free, or suitable for every user.
