# WARNING: 
# First pump the version in the manifest.json file
# and then run this script

# more: 
# https://developer.chrome.com/docs/webstore/prepare
# https://developer.chrome.com/docs/webstore/publish
# use s*****i@gmail.com account to login to the developer console

_SHELL="$(ps -p $$ -o comm=)"; # bash || sh || zsh
_SHELL="$(basename ${_SHELL//-/})"
case ${_SHELL} in
  zsh)
    _DIR="$( cd "$( dirname "${(%):-%N}" )" && pwd -P )"
    _0="$( basename "${(%):-%N}" )"
    _SCRIPT="${(%):-%N}"
    _BINARY="/bin/zsh"
    _PWD="$(pwd)"
    ;;
  sh)
    # be carefull this will not work when sourcing this file in sh shell
    # will though work when called /bin/sh my_script.sh from any shell
    _DIR="$( cd "$( dirname "${0}" )" && pwd -P )"
    _0="$( basename "${0}" )"
    _SCRIPT="${0}"
    _BINARY="/bin/sh"
    _PWD="$(pwd)"
    ;;
  *)
    _DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd -P )"
    _0="$( basename "${BASH_SOURCE[0]}" )"
    _SCRIPT="${BASH_SOURCE[0]}"
    _BINARY="/bin/bash"
    _PWD="$(pwd)"
    ;;
esac

cd "${_DIR}/extension"
_DIR="$(pwd)"

# Get the current version from manifest.json if it exists
VERSION=""
if [ -f "manifest.json" ]; then
  VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4)
  if [ -n "$VERSION" ]; then
    VERSION="_${VERSION//./_}"
  fi
fi

# Create zip file with the current date and version if available

ZIP_NAME="extension${VERSION}.zip"

if [ -f "${ZIP_NAME}" ]; then
  echo "Removing existing zip file: ${ZIP_NAME}"
  rm -f "${ZIP_NAME}"
fi

echo "Creating zip file: ${ZIP_NAME}"
echo "Excluding: zip.sh, extension*.zip, and .DS_Store files"

# Zip everything in the current directory, excluding zip.sh, extension*.zip, .DS_Store files, and _metadata directory
find . -type f \
  ! -name "extension*.zip" \
  ! -name ".DS_Store" \
  ! -path "*/_metadata/*" \
  | zip -@ "${ZIP_NAME}"

echo "Done! Created ${ZIP_NAME}"