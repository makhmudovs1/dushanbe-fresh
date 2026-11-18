#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
export LC_ALL=C

scripts=$(cd -- "$(dirname -- "$0")" && pwd -P)
mobile=$(dirname -- "$scripts")
repo=$(git -C "$mobile" rev-parse --show-toplevel)
action=${1:-}
key_dir=${DF_PLAY_KEY_DIR:-"$HOME/.local/share/dushanbe-fresh/play"}
alias_name=dushanbe-fresh-upload
if [[ -n ${JAVA_HOME:-} ]]; then export PATH="$JAVA_HOME/bin:$PATH"; fi

fail() { printf '%s\n' "$*" >&2; exit 1; }
private_directory() {
  python3 - "$1" "$repo" <<'PY'
import os
import sys
from pathlib import Path

path, repo = (Path(value).resolve() for value in sys.argv[1:])
if path == repo or repo in path.parents:
    sys.exit("Choose a private directory outside the Git worktree.")
path.mkdir(mode=0o700, parents=True, exist_ok=True)
if path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
    sys.exit("The directory must belong to you and have mode 0700.")
print(path)
PY
}
interactive() { [[ -t 0 && -t 1 ]] || fail 'Run this command in your own interactive Terminal.'; }
fingerprint() { awk '/SHA256:/ && !found { print $NF; found = 1 }' | tr -d ':'; }

case "$action" in
  init-key)
    [[ $# == 1 ]] || fail 'Usage: play-aab.sh init-key'
    interactive
    key_dir=$(private_directory "$key_dir")
    [[ ! -e "$key_dir/upload.p12" && ! -L "$key_dir/upload.p12" && ! -e "$key_dir/upload-certificate.pem" && ! -L "$key_dir/upload-certificate.pem" ]] || fail 'An upload key or certificate already exists. Keep it and use the existing key.'
    scratch=$(mktemp -d "$key_dir/.key-XXXXXXXX")
    trap 'rm -rf -- "$scratch"' EXIT
    keytool -genkeypair -storetype PKCS12 -keystore "$scratch/upload.p12" -alias "$alias_name" \
      -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Dushanbe Fresh Upload'
    keytool -exportcert -rfc -keystore "$scratch/upload.p12" -alias "$alias_name" -file "$scratch/upload-certificate.pem"
    ln -- "$scratch/upload.p12" "$key_dir/upload.p12"
    ln -- "$scratch/upload-certificate.pem" "$key_dir/upload-certificate.pem"
    printf 'Keystore: %s\nPublic certificate: %s\n' "$key_dir/upload.p12" "$key_dir/upload-certificate.pem"
    ;;
  build)
    [[ $# == 4 ]] || fail 'Usage: play-aab.sh build bootstrap|internal VERSION_CODE OUTPUT_DIR'
    mode=$2
    code=$3
    [[ "$mode" == bootstrap || "$mode" == internal ]] || fail 'Invalid Android build mode.'
    [[ "$code" =~ ^[1-9][0-9]*$ ]] || fail 'Invalid versionCode.'
    [[ -f "$repo/.git" && -z $(git -C "$repo" status --porcelain) ]] || fail 'Build from a clean, isolated Git worktree.'
    [[ -f ${DF_BUNDLETOOL_JAR:-} ]] || fail 'Set DF_BUNDLETOOL_JAR before building.'
    output=$(private_directory "$4")
    commit=$(git -C "$repo" rev-parse HEAD)
    artifact="$output/dushanbe-fresh-$mode-$code-${commit:0:7}-unsigned.aab"
    [[ ! -e "$artifact" && ! -L "$artifact" ]] || fail 'This AAB already exists.'
    export EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1
    export EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_API_URL=https://dushanbefresh.tj/api/v1 EXPO_PUBLIC_ASSET_URL=https://dushanbefresh.tj
    export EXPO_PUBLIC_ENABLE_ORDER_SUBMISSION=false MOBILE_APPLICATION_ID=tj.dushanbefresh.app MOBILE_ANDROID_VERSION_CODE="$code"
    unset EXPO_PUBLIC_TEST_RUNTIME_ID SKIP_BUNDLING
    if [[ "$mode" == bootstrap ]]; then
      unset GOOGLE_MAPS_ANDROID_API_KEY
    else
      if [[ -z ${GOOGLE_MAPS_ANDROID_API_KEY:-} ]]; then
        interactive
        read -rs -p 'Restricted Android Maps SDK key: ' GOOGLE_MAPS_ANDROID_API_KEY
        printf '\n'
      fi
      [[ "$GOOGLE_MAPS_ANDROID_API_KEY" =~ ^AIza[A-Za-z0-9_-]+$ ]] || fail 'Invalid Android Maps SDK key format.'
      export GOOGLE_MAPS_ANDROID_API_KEY
    fi

    scratch=$(mktemp -d "$output/.build-XXXXXXXX")
    trap 'rm -rf -- "$scratch"' EXIT
    cat > "$scratch/unsigned.gradle" <<'GRADLE'
gradle.beforeProject { project ->
    if (project.path == ':app') {
        project.pluginManager.withPlugin('com.android.application') {
            project.extensions.getByName('androidComponents').finalizeDsl { android ->
                android.buildTypes.getByName('release').signingConfig = null
            }
        }
    }
}
GRADLE
    # Never copy the raw output to a log. Prebuild / Gradle errors can include config values.
    redact() {
      python3 -u -c '
import os, sys
key = os.environ.get("GOOGLE_MAPS_ANDROID_API_KEY")
for line in sys.stdin:
    sys.stdout.write(line.replace(key, "[redacted Maps key]") if key else line)
'
    }
    cd "$mobile"
    corepack pnpm --filter @dushanbe-fresh/shared build 2>&1 | redact
    corepack pnpm exec expo prebuild --platform android --no-install --clean 2>&1 | redact
    cd android
    ./gradlew :app:bundleRelease --init-script "$scratch/unsigned.gradle" --no-daemon --max-workers=2 \
      '-Dorg.gradle.jvmargs=-Xmx2200m -XX:MaxMetaspaceSize=768m' -Pkotlin.compiler.execution.strategy=in-process \
      -PreactNativeArchitectures=arm64-v8a,x86_64 --offline 2>&1 | redact
    python3 "$scripts/verify-play-aab.py" "$mode" unsigned app/build/outputs/bundle/release/app-release.aab --version-code "$code"
    cp app/build/outputs/bundle/release/app-release.aab "$scratch/app.aab"
    ln -- "$scratch/app.aab" "$artifact"
    printf 'Source commit: %s\n' "$commit"
    shasum -a 256 "$artifact"
    ;;
  sign)
    [[ $# == 5 ]] || fail 'Usage: play-aab.sh sign bootstrap|internal VERSION_CODE UNSIGNED_AAB OUTPUT_DIR'
    interactive
    mode=$2
    code=$3
    bundle=$4
    output=$(private_directory "$5")
    key_dir=$(private_directory "$key_dir")
    key="$key_dir/upload.p12"
    cert="$key_dir/upload-certificate.pem"
    [[ -f "$key" && ! -L "$key" && -f "$cert" ]] || fail 'Create or restore your upload key first.'
    python3 "$scripts/verify-play-aab.py" "$mode" unsigned "$bundle" --version-code "$code"
    expected=$(keytool -printcert -file "$cert" | fingerprint)
    [[ "$expected" =~ ^[A-Fa-f0-9]{64}$ ]] || fail 'Could not read the upload certificate fingerprint.'
    registered=$(printf '%s' "${DF_PLAY_UPLOAD_SHA256:-}" | tr -d '[:space:]:' | tr '[:lower:]' '[:upper:]')
    if [[ "$mode" == internal ]]; then
      [[ "$registered" == "$expected" ]] || fail 'Set DF_PLAY_UPLOAD_SHA256 to the matching public Upload key certificate SHA-256 from Play Console.'
    fi
    final="$output/dushanbe-fresh-$mode-$code-signed.aab"
    [[ ! -e "$final" && ! -L "$final" ]] || fail 'This signed AAB already exists.'
    scratch=$(mktemp -d "$output/.sign-XXXXXXXX")
    trap 'rm -rf -- "$scratch"' EXIT
    jarsigner -keystore "$key" -signedjar "$scratch/app.aab" "$bundle" "$alias_name"
    verification=$(jarsigner -verify "$scratch/app.aab")
    [[ "$verification" == *'jar verified.'* ]] || fail 'AAB signature verification failed.'
    actual=$(keytool -printcert -jarfile "$scratch/app.aab" | fingerprint)
    [[ "$actual" == "$expected" ]] || fail 'AAB signer differs from the local upload certificate.'
    python3 "$scripts/verify-play-aab.py" "$mode" signed "$scratch/app.aab" --version-code "$code"
    ln -- "$scratch/app.aab" "$final"
    printf 'Upload certificate SHA-256: %s\n' "$actual"
    shasum -a 256 "$final"
    ;;
  *) fail 'Usage: play-aab.sh init-key | build MODE VERSION_CODE OUTPUT_DIR | sign MODE VERSION_CODE UNSIGNED_AAB OUTPUT_DIR' ;;
esac
