#!/usr/bin/env bash
set -euo pipefail

resolve_host_tags() {
  case "$(uname -s)" in
    Darwin)
      printf '%s\n' "darwin-x86_64" "darwin-arm64"
      ;;
    Linux)
      printf '%s\n' "linux-x86_64" "linux-x86"
      ;;
    MINGW* | MSYS* | CYGWIN*)
      printf '%s\n' "windows-x86_64" "windows"
      ;;
    *)
      ;;
  esac
}

append_ndk_root() {
  local path="$1"
  if [[ -z "$path" ]]; then
    return 0
  fi
  if [[ -d "$path/toolchains/llvm/prebuilt" ]]; then
    printf '%s\n' "$path"
  fi
}

append_sdk_ndk_roots() {
  local sdk_root="$1"
  if [[ -z "$sdk_root" || ! -d "$sdk_root/ndk" ]]; then
    return 0
  fi

  while IFS= read -r ndk_dir; do
    append_ndk_root "$ndk_dir"
  done < <(find "$sdk_root/ndk" -mindepth 1 -maxdepth 1 -type d | sort -Vr)
}

collect_ndk_roots() {
  {
    append_ndk_root "${ANDROID_NDK_HOME:-}"
    append_ndk_root "${ANDROID_NDK_ROOT:-}"
    append_ndk_root "${NDK_HOME:-}"
    append_sdk_ndk_roots "${ANDROID_HOME:-}"
    append_sdk_ndk_roots "${ANDROID_SDK_ROOT:-}"
    append_sdk_ndk_roots "$HOME/Library/Android/sdk"
  } | awk '!seen[$0]++'
}

find_llvm_ranlib() {
  local host_tags
  local ndk_roots
  local host_tag
  local ndk_root
  local candidate_bin

  host_tags="$(resolve_host_tags)"
  if [[ -z "$host_tags" ]]; then
    return 1
  fi

  ndk_roots="$(collect_ndk_roots)"
  while IFS= read -r ndk_root; do
    [[ -n "$ndk_root" ]] || continue
    while IFS= read -r host_tag; do
      [[ -n "$host_tag" ]] || continue
      candidate_bin="$ndk_root/toolchains/llvm/prebuilt/$host_tag/bin/llvm-ranlib"
      if [[ -x "$candidate_bin" ]]; then
        printf '%s\n' "$candidate_bin"
        return 0
      fi
    done <<<"$host_tags"
  done <<<"$ndk_roots"

  if command -v llvm-ranlib >/dev/null 2>&1; then
    command -v llvm-ranlib
    return 0
  fi

  return 1
}

if ! ranlib_path="$(find_llvm_ranlib)"; then
  cat >&2 <<'EOF'
Failed to locate llvm-ranlib for Android NDK.
Set one of:
  - ANDROID_NDK_HOME (preferred)
  - ANDROID_NDK_ROOT
  - NDK_HOME
or provide ANDROID_HOME / ANDROID_SDK_ROOT with installed ndk/*.
EOF
  exit 1
fi

exec "$ranlib_path" "$@"
