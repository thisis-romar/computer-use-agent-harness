# Repository Hardening Checklist (pre-public)

Steps that must be done in the GitHub UI/API by a repo admin — they can't be set
from the codebase. Committed files (`.github/workflows/ci.yml`, `CODEOWNERS`,
`dependabot.yml`) make the branch-protection rules below enforceable.

## 1. Branch + visibility
- [ ] **Settings → General → Default branch →** set to `main`.
- [ ] **Settings → General → Danger Zone → Change visibility → Public.**
  - Pages is safe on public (no paid plan required); no Pages site is active
    yet, so nothing breaks.

## 2. Branch protection for `main` (strict, admin-bypass)
Settings → Branches → Add branch ruleset (or classic protection) targeting `main`:
- [ ] **Require a pull request before merging.** Required approvals: **1**;
      enable **Require review from Code Owners**.
      - Solo right now: use **admin bypass** to self-merge, or temporarily set
        required approvals to **0** until a second maintainer joins.
- [ ] **Require status checks to pass** → select **`build-test`** (the CI job).
      Enable **Require branches to be up to date before merging**.
- [ ] **Require conversation resolution before merging.**
- [ ] **Require linear history.**
- [ ] *(Recommended)* **Require signed commits.**
- [ ] **Block force pushes.**
- [ ] **Block deletions.**
- [ ] **Leave "Do not allow bypassing the above settings" UNCHECKED** so admins
      can bypass while solo. Turn it ON once there's a second maintainer.

## 3. Code security
- [ ] **Settings → Code security:** enable **Secret scanning** and **Push
      protection**.
- [ ] Enable **Dependabot alerts** and **Dependabot security updates**
      (`.github/dependabot.yml` already configures version + actions updates).
- [ ] Enable **Private vulnerability reporting** (pairs with `SECURITY.md`).

## 4. Actions
- [ ] **Settings → Actions → General:** restrict to "Allow actions created by
      GitHub and verified creators."
- [ ] Default **workflow permissions: read-only** (the CI workflow already sets
      `permissions: contents: read`).

## 5. Post-launch cleanup
- [ ] Confirm the **`build-test`** check is green on a PR before requiring it.
- [ ] Delete the `claude/quirky-lamport-vENWW` branch once `main` is the default.

> Not legal advice. The CODEOWNERS handle and ruleset values are tunable to your
> team structure.
