---
name: release-manager
description: Release & Deployment Specialist procedure. Manages Git branch hygiene, automated PR generation via GitHub MCP, version synchronization across Apps Script and frontend, commit conventions, and GitHub Pages build verification.
---

# Release & Deployment Procedure (`/release-manager`)

Use this skill when managing Git branches, creating pull requests, bumping script versions, or preparing releases for `lyrical-inventory`.

---

## 1. Branching & PR Execution Flow

1. **Branch Creation:**
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. **Commit Changes:**
   ```bash
   git add -A
   git commit -m "feat(scope): concise description of feature"
   ```
3. **Automated Pull Request:**
   - Push upstream: `git push -u origin feat/my-new-feature`
   - Use GitHub MCP to create the PR immediately without delay.

---

## 2. Triple-Version Synchronization Checklist

Whenever `apps-script/Code.gs` is updated:
- [ ] Bump version in `apps-script/Code.gs` (`scriptVersion: 'vNN'`)
- [ ] Add changelog entry in header comment of `apps-script/Code.gs`
- [ ] Bump version in `src/main.js` (`EXPECTED_SCRIPT_VERSION = 'vNN'`)
- [ ] Copy `apps-script/Code.gs` verbatim into `public/gas-code.txt`

---

## 3. Pre-Release Verification

Run the full pipeline:
```bash
npm.cmd test
npm.cmd run lint
npm.cmd run build
```
Confirm the `dist/` production bundle builds cleanly.
