# Node.js 26 runtime target

This service and its private dashboard target Node.js 26 or newer. The root package is private and is not a published library, so this minimum describes the application's tested runtime rather than constraining unrelated consumers.

## Release evidence (checked 2026-10-31)

- The official Node.js previous-releases page lists Node.js 26 as **Active LTS**: <https://nodejs.org/en/about/previous-releases>.
- Node.js v26.13.0 was released on 2026-10-28: <https://nodejs.org/en/blog/release/v26.13.0>.
- The v26.13.0 release information lists the Lithium LTS schedule through the end of April 2029. Use the current 26.x patch, not a pin to 26.13.0, for production image tags and CI.

## Platform caveat

Official Linux binaries may require `libatomic` on some Linux distributions. The Docker runtime uses the official `node:26-alpine` image; validate its architecture-specific dependencies in the image build environment. This is a runtime platform prerequisite, not a reason to retain Node 24.

## Scope

The root package and dashboard are private application components, not published packages with downstream consumer engine contracts. The root `engines.node` and user-facing prerequisites therefore move to `>=26.0.0`; dependency type declarations (`@types/node`) and package-manager versions are independent and are not mechanically changed by this runtime migration.
