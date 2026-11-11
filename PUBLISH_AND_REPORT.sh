#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

OWNER="${GITHUB_OWNER:-juhjuhx}"
WEB_REPO="${1:-OpenDeSqueeze-Web}"
ANDROID_REPO="$OWNER/OpenDeSqueeze"
WEB_FULL="$OWNER/$WEB_REPO"
WEB_URL="https://$OWNER.github.io/$WEB_REPO/"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}
need git
need gh

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Work from the script directory so the command is safe from any caller cwd.
cd "$(dirname "$0")"

echo "== OpenDeSqueeze Web publish =="

if [ ! -d .git ]; then
  git init -b main
  git add .
  git commit -m "feat: initial OpenDeSqueeze Web v0.1.0"
else
  git add .
  if ! git diff --cached --quiet; then
    git commit -m "chore: prepare OpenDeSqueeze Web v0.1.0"
  fi
fi

if gh repo view "$WEB_FULL" >/dev/null 2>&1; then
  echo "Repository exists: $WEB_FULL"
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "https://github.com/$WEB_FULL.git"
  else
    git remote add origin "https://github.com/$WEB_FULL.git"
  fi
  git push -u origin main
else
  gh repo create "$WEB_FULL" \
    --public \
    --source=. \
    --remote=origin \
    --push \
    --description "Local-first anamorphic desqueeze for iPhone, iPad, Mac and modern browsers."
fi

# Repository metadata. Failure here should not invalidate the source publish.
gh repo edit "$WEB_FULL" \
  --homepage "$WEB_URL" \
  --add-topic anamorphic \
  --add-topic ios \
  --add-topic ipad \
  --add-topic macos \
  --add-topic pwa \
  --add-topic webcodecs \
  --add-topic photography \
  --add-topic video \
  --add-topic open-source >/dev/null 2>&1 || true

# Enable GitHub Pages in Actions mode when the repository does not have Pages yet.
if ! gh api "repos/$WEB_FULL/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$WEB_FULL/pages" -f build_type=workflow >/dev/null 2>&1 || true
fi

# Trigger Pages workflow once in case the initial push happened before Pages was enabled.
gh workflow run pages.yml --repo "$WEB_FULL" >/dev/null 2>&1 || true

# Tag/release the first web build. The standalone HTML is useful as a portable artifact.
if ! gh release view v0.1.0 --repo "$WEB_FULL" >/dev/null 2>&1; then
  gh release create v0.1.0 \
    OpenDeSqueeze-Web-standalone.html \
    --repo "$WEB_FULL" \
    --target main \
    --title "OpenDeSqueeze Web v0.1.0" \
    --notes "First public browser build of OpenDeSqueeze for iPhone, iPad, Mac and modern browsers.\n\n- Local-first photo and video desqueeze\n- 1.33x / 1.50x / 1.55x / 1.80x / 2.00x / custom ratios\n- Preserve Width / Preserve Height\n- H.264 / HEVC through WebCodecs where supported\n- PWA shell and iOS Share Sheet support\n- No media upload or cloud transcoding\n\nGitHub Pages: $WEB_URL"
fi

echo
echo "== Android portrait-geometry bug report =="
ISSUE_TITLE="Portrait 1.33x photo desqueeze outputs wrong dimensions for 4000x6000 input"
EXISTING="$(gh issue list --repo "$ANDROID_REPO" --state all --search '4000x6000 1.33 portrait' --json number,title --jq '.[0].number // empty' 2>/dev/null || true)"

if [ -z "$EXISTING" ]; then
  ISSUE_URL="$(gh issue create \
    --repo "$ANDROID_REPO" \
    --title "$ISSUE_TITLE" \
    --body-file - <<'ISSUE'
## Bug report

A real user reported incorrect photo desqueeze output when using a **1.33× anamorphic lens in portrait orientation**.

### Reproduction

- Source image: **4000 × 6000**
- Orientation: portrait
- Squeeze factor: **1.33×**
- Intended geometry: horizontal expansion / Preserve Height

### Expected

The squeeze is horizontal, so the width should expand while height stays unchanged:

```text
4000 × 6000
× 1.33 horizontally
→ 5320 × 6000
```

### Actual

The exported result is reported as:

```text
6000 × 3008
```

This strongly suggests that EXIF/display orientation or width/height normalization is being applied in the wrong order relative to desqueeze geometry.

### Related behavior

The custom squeeze ratio UI is limited to **1.01–3.00×**. Please verify whether this fixed cap is necessary. Prefer validating the resulting dimensions against image/encoder limits rather than relying only on an arbitrary ratio ceiling.

### Acceptance criteria

- Portrait **4000×6000 + 1.33× + Preserve Height** exports **5320×6000**.
- Landscape behavior remains unchanged.
- EXIF orientation is normalized exactly once and before geometry calculations use display width/height.
- Preview dimensions equal actual exported dimensions.
- Add regression tests for portrait input and rotated EXIF orientations.
- Re-evaluate and document the custom-ratio range.

### User impact

This affects real-world phone workflows using a 1.33× anamorphic lens in vertical shooting.
ISSUE
  )"
  echo "Created issue: $ISSUE_URL"
else
  echo "Matching issue already exists: #$EXISTING"
fi

echo
echo "== Done =="
echo "Repo:  https://github.com/$WEB_FULL"
echo "Web:   $WEB_URL"
echo "Release: https://github.com/$WEB_FULL/releases/tag/v0.1.0"
echo
echo "Check deployment with:"
echo "  gh run list --repo $WEB_FULL --limit 5"
