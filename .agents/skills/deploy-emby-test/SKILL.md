---
name: deploy-emby-test
description: Build the current Studio and plugin checkouts, embed the local Studio build, and deploy to the Emby test server. Use when the user asks to deploy or refresh OpenLightFX for hands-on testing.
---

# Deploy OpenLightFX for Emby testing

Use this workflow only when the user asks to deploy, refresh, or test the current code on an Emby server. It restarts Emby and replaces the plugin DLL.

1. Read the Studio and plugin `AGENTS.md` files and the applicable J1 journey section. Check `git status --short` and `git branch --show-current` in both repositories. Preserve all uncommitted work; do not stash, reset, switch branches, or commit as part of deployment.
2. Confirm which Studio and plugin checkouts are being deployed. The deploy script uses the plugin repo's currently checked-out code and builds Studio from the local Studio checkout; it does not fetch a published Studio release.
3. For a build/package check without remote changes, run from Studio:

   ```bash
   STUDIO_REPO="$PWD" ../openlightfx-emby/scripts/deploy.sh --help
   STUDIO_REPO="$PWD" DRY_RUN=1 ../openlightfx-emby/scripts/deploy.sh
   ```

   `DRY_RUN=1` builds and embeds Studio and builds/merges the plugin, but does not SSH to or restart the server.
4. When a deployment is explicitly requested, run:

   ```bash
   STUDIO_REPO="$PWD" ../openlightfx-emby/scripts/deploy.sh
   ```

   The default target is `192.168.1.3`; `EMBY_HOST`, `EMBY_PLUGINS`, and `EMBY_URL` may override it when the user specifies another authorized test server. The script backs up an existing remote plugin DLL before replacing it and checks Emby's authenticated API route after restart. A 401 without a token is expected.
5. Report the target, build/deployment result, and any backup path printed by the script. Give the Studio URL with an API-key placeholder only, e.g. `http://192.168.1.3:8096/emby/OpenLightFX/studio/?api_key=<your-Emby-API-key>`. Never read, print, or store the user's Emby API key.
6. State clearly which tests were and were not run. Deployment is not a substitute for the J1 walkthrough or the full-stack suite. Do not claim a journey is complete because the server accepted the DLL.
