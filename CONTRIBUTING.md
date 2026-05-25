# Contributing to Computer Use Agent Harness

Thanks for your interest in contributing! Please read this before opening a
pull request.

## Ground rules

- Be respectful and constructive.
- Keep changes focused; one logical change per PR.
- Run `npm run build`, `npm test`, and `node dist/index.js --self-test` before
  submitting.
- This is a **desktop-automation / computer-control** project — never include
  destructive examples, real credentials, or capabilities that exist only to
  evade safety controls. See [SECURITY.md](./SECURITY.md).

## Developer Certificate of Origin (sign-off)

Every commit must be signed off, certifying you wrote the code or have the right
to submit it under the terms below:

```
git commit -s -m "your message"
```

This appends a `Signed-off-by: Your Name <you@example.com>` line (the
[Developer Certificate of Origin 1.1](https://developercertificate.org/)).

## Contributor License Agreement (CLA)

This project is **dual-licensed** — under the GNU AGPL-3.0-only **and** a
separate commercial license (see [LICENSE](./LICENSE) and
[LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md)). To keep both paths viable,
contributions must be usable under **both** licenses.

**By submitting a contribution (a pull request, patch, or any work) to this
project, you agree that:**

1. You are legally entitled to grant the licenses below, and the contribution is
   your original work (or you have the necessary rights to submit it).
2. You license your contribution to the public under the **GNU AGPL-3.0-only**.
3. You additionally grant **Emblem Projects** (GitHub: `emblem-NLP`) a
   perpetual, worldwide, non-exclusive, royalty-free, irrevocable **copyright
   license** and **patent license** to reproduce, prepare derivative works of,
   publicly display, publicly perform, sublicense, distribute, and
   **relicense** your contribution and such derivative works — **including under
   proprietary or commercial license terms** — as part of this project or its
   derivatives.
4. You retain all other rights, title, and interest in your contribution. This
   is a license grant, **not** a copyright assignment.
5. Your contribution is provided "AS IS", without warranty of any kind.

If you cannot agree to these terms (for example, the contribution belongs to
your employer), do not submit it without first obtaining the necessary rights or
contacting us.

> This document explains the contribution terms and is **not legal advice**.
> The maintainers should have counsel review it before relying on it
> commercially.

## Optional: codebase knowledge graph (graphify)

[graphify](https://github.com/safishamsi/graphify) is an **optional, third-party**
Claude Code skill (not a dependency of this project) that builds a queryable
knowledge graph of the repo — handy for onboarding and for giving AI agents
cheaper, structured context instead of re-reading raw files.

```bash
pip install graphifyy && graphify install   # Python 3.10+ (macOS: use pipx)
# then, in Claude Code at the repo root:
/graphify
```

Output is written to `graphify-out/` (already git-ignored — do not commit it).

Notes:
- graphify uses **Claude vision**, so it **sends file contents to the Anthropic
  API** (cost + privacy implications). Only run it on code you're comfortable
  sending.
- We intentionally **do not vendor** graphify into this repo: its upstream
  license is unstated, and this project is dual-licensed (AGPL-3.0-only + a
  commercial license). Install it as an external tool instead.

## Questions

Open a discussion or issue, or contact **admin+github@emblemprojects.com**.
