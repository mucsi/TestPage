# GitHub content studio

Extract the complete Content Studio ZIP and serve the folder over HTTP/HTTPS in
a current Chrome, Edge or Opera browser. Keep all accompanying files together.
The real Godot renderer needs a web server: double-clicking index.html still opens
the editor, but cannot start its WebAssembly preview. On this development PC use
http://127.0.0.1:8766/ while the local server is running. For any-PC use, host the
complete folder on GitHub Pages; no Godot installation is needed by editors.
Sign in with an existing Expo Quest organizer account, not Supabase dashboard credentials.
No GitHub token or server secret is entered into the browser.

## Admin accounts

The header's Admins button opens account management, separate from content
publication. Only the existing active master in expo_admins can list or change
accounts. Regular editor permission is not enough. Master access cannot be added,
transferred, revoked or changed through this screen or its endpoint.

- Create new account: email and a 12–128 character initial password. Supabase
  creates a confirmed account, then grants regular phone-admin access. Share the
  password privately; no invitation email is sent. No existing password is reset.
- Grant access: use an existing confirmed Auth account's email, with no password.
- Revoke/restore: changes the regular admin role without deleting the Auth user
  or receipts. Offline phones learn about revocation when they reconnect.
- New phone admins do not receive content-editor publishing access.
- On an uncertain failure, refresh the list before retrying. If account creation
  succeeded but granting failed, use Grant access to complete it.

Deploy admin-accounts with verify_jwt=false (the handler verifies the Auth token
and active master role on every request), using the same EXPO_STUDIO_ORIGINS as
admin-content. Publish admins.js together with index.html and auth.js.
Deployed to the existing Supabase project and GitHub Pages on 2026-09-24.

## Online hosting and authentication (deployment pending)

Deploy `admin-content` and the updated `admin-expo` Supabase functions. The content
endpoint verifies Supabase Auth and EXPO_EDITOR_USER_IDS on EVERY read/publication.
Set EXPO_EDITOR_USER_IDS to a comma-separated list of editor Auth user UUIDs.
This is intentionally separate from EXPO_ADMIN_USER_IDS: content editors do not
automatically receive expo-reset or prize-draw access. No configured editors means
access is denied to every account.
It reuses the existing server-only EXPO_GITHUB_TOKEN, restricts writes to the fixed
mucsi/TestPage/main/rewards.json destination, preserves reset metadata, validates
the catalog, and uses GitHub SHA conflicts to protect concurrent edits/resets.
Deploy from this repository root with the Supabase CLI so its shared catalog.js
import is bundled. Leave gateway verify_jwt=false: authentication happens inside
the handler, and requests without a verified organizer token are rejected.

Set EXPO_STUDIO_ORIGINS to the approved hosting origin (default includes
https://mucsi.github.io and the development origin http://127.0.0.1:8766).
Publish the complete output/content-studio folder to the chosen static host.
auth-config.js contains only the existing public Supabase URL/publishable key.
Passwords and session/refresh tokens are not persisted by the editor.

GitHub Pages serves static files publicly. Sign-in protects organizer operations
on the server, not the JavaScript/preview assets or already-public app catalog.
If the editor files themselves must be private, use an access-controlled host.
The localhost-only preview button does not publish and does not bypass backend auth.
Verify an unauthorized request returns 401/403 before making the editor public.

## IMPORTANT: rollout order (not deployed automatically)

1. Deploy the updated Supabase `admin-expo` function first. It now reads feeds over
   1 MB and safely base64-encodes large catalogs. Existing deployed reset code cannot
   read the embedded-image catalog reliably. Do not exercise a reset against real data
   as a smoke test.
2. Back up the current mucsi/TestPage rewards.json. Load that feed in the studio,
   then import the generated migration draft. Review IDs, QR values, prices and images.
3. Validate, preview, and explicitly publish. This updates only the `content` member
   of rewards.json, preserving CurrentExpoID, reset metadata and legacy rewards.
   Wait for GitHub Pages to serve the new content before distributing the new app.
4. Build/test the visitor app on Android and iOS. `online_catalog_required: true`
   means no bundled quests/rewards fallback. First use needs an online catalog;
   subsequent use restores the last valid downloaded catalog and images offline.
   Existing released apps remain on their bundled quests until upgraded.

No live publishing, backend deployment or mobile installation has been performed
by adding these source files. The current release ZIPs/APKs do not include this work.

## Daily publishing from any PC

- After organizer sign-in, the editor automatically loads rewards.json from GitHub
  through the protected content service. When the feed has no content catalog yet,
  the included migration draft is clearly labelled; it is not represented as live data.
  If downloading fails, the included draft remains editable but cannot be published
  until the current feed is successfully loaded.
- Drag challenges from the library onto quest cards or into the selected quest.
  Drag assigned challenges to reorder them, or use the arrow buttons. Reusing a
  challenge preserves its QR value and shares completion across all linked quests.
  The quest dropdown and challenge checkboxes provide keyboard/touch alternatives.
- Click an item's card or Edit button to change its fields visually. Changes appear
  immediately in the mobile preview. Select Home, Quest, Scan or Reward preview and
  a 320/360/390-pixel phone width. The preview now runs the production Godot UI,
  not a separately styled HTML approximation. Test progress options include the
  supplied 5-star screenshot state, a new visitor, and all-completed challenges.
- Upload images directly on each item's form. PNG/JPEG up to 12 MB are resized to
  at most 768 pixels, preserving PNG transparency. Images upload only on publication.
- Independent challenge duplication generates a new ID and QR value, unlike shared
  reuse. It needs a free analytics slot; the current 100-challenge migration draft
  already occupies all slots. Shared reuse across quests does not need another slot.

- Use the existing organizer email/password. The server's fine-grained GitHub token
  should remain restricted to mucsi/TestPage with Contents read/write access.
- Review & publish validates the draft and opens a confirmation summary.
  Optional backup restoration
  is under those settings; importing a file is not part of normal editing.
- Images are embedded in the catalog, not remotely hotlinked: a snapshot contains
  everything needed offline. Whole feed limit: 8 MB; keep source images compressed.
- Promos have two formats: full-image banners of any aspect ratio (shown without cropping or stretching), or text with
  a 1:1 square logo (e.g. 600 × 600). Choose the format before uploading its image.
  Aspect ratio mismatches are rejected rather than silently cropping your design.
  Drag the carousel with the mouse in the actual preview; finger scrolling on phones
  remains native. Both pause automatic rotation while held.
- Download draft backups before reloading or closing. Drafts are not autosaved.
- A changed SHA or active expo reset blocks publication. Export your draft and reload.
  To restore an older catalog, load the CURRENT feed first, import an older draft,
  then validate and publish. Do not restore an old whole rewards.json over reset metadata.
- Preserve IDs for existing challenges/quests/rewards. Use enabled:false to hide them.
  Do not recycle analytics keys. Existing backend accepts challenge_001–challenge_100
  and quest1–quest20; extending these ranges requires a separate database migration.
- Legacy top-level online rewards/promotions are preserved, not edited by this studio.
  New reward and promo content belongs in reward_levels and partners respectively.
- The app viewport uses the production layout, shaders, artwork and scene code.
  Its Android typography fallback is bundled because browsers cannot access Android
  system fonts. Device status/navigation bars and the camera feed remain simulated.
  Preview state never writes progress, submits claims, or initializes live services.
  An already-installed app may use a different catalog/version or saved progress;
  matching these inputs is necessary for a meaningful visual comparison.

## Migration draft and tests

From the repository root, with Godot 4.7.1:

    Godot --headless --path . --script res://tools/content-admin/export_seed.gd -- OUTPUT.json

This expands the current challenge pool without changing IDs, embeds optimized
512-pixel JPEG artwork on white backgrounds, and leaves original artwork untouched.
Review transparent artwork in the preview if you want to replace it with PNGs.

    node --test tools/content-admin/catalog.test.cjs
    node --test tools/content-admin/editor-model.test.cjs
    Godot --headless --path . --script res://scripts/test_online_catalog.gd

The Godot test expects the migration draft at %TEMP%/expo-catalog-seed.json.
Existing UI regression fixtures explicitly request bundled test data, never network.

After exporting a seed, run `node tools/content-admin/build-package.cjs SEED.json`
to regenerate the migration fallback, preview assets and portable output folder.

## Rebuilding the actual renderer

Run `node tools/content-admin/build-preview.cjs` after app layout changes, then
rebuild the portable package. It stages a separate project in .local-work, copies
the production scripts/assets/layout, and exports app-preview with Godot 4.7.1.
No Android/iOS export configuration or phone install is changed. The Web template
is downloaded separately using download-web-template.py from the official release.
The preview uses Godot's JavaScriptBridge for draft updates:
https://docs.godotengine.org/en/4.7/classes/class_javascriptbridge.html
