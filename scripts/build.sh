#!/bin/bash

# Breath in Flow Build Script
# Builds the app for various platforms and collects outputs in dist/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$ROOT_DIR/packages/web"
DIST_DIR="$ROOT_DIR/dist"
RELEASE_DIR="$WEB_DIR/release"

# App configuration - change these when renaming the app
APP_NAME="Breath in Flow"
APP_NAME_SLUG="breath-in-flow"  # Used for APK filename

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from package.json
VERSION=$(node -p "require('$ROOT_DIR/package.json').version")

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Ensure Java and Android SDK are available for Android builds
setup_android_env() {
    if [[ -z "$JAVA_HOME" ]]; then
        if [[ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]]; then
            export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
        elif [[ -d "/usr/lib/jvm/java-21-openjdk" ]]; then
            export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
        fi
    fi
    
    if [[ -z "$ANDROID_HOME" ]]; then
        if [[ -d "$HOME/Library/Android/sdk" ]]; then
            export ANDROID_HOME="$HOME/Library/Android/sdk"
        elif [[ -d "$HOME/Android/Sdk" ]]; then
            export ANDROID_HOME="$HOME/Android/Sdk"
        fi
    fi
    
    if [[ -n "$JAVA_HOME" ]]; then
        export PATH="$JAVA_HOME/bin:$PATH"
    fi
    
    if [[ -n "$ANDROID_HOME" ]]; then
        export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
    fi
}

# Create dist directory structure (preserves existing files)
setup_dist() {
    print_header "Setting up dist directory"
    
    mkdir -p "$DIST_DIR/mac"
    mkdir -p "$DIST_DIR/win"
    mkdir -p "$DIST_DIR/linux"
    mkdir -p "$DIST_DIR/android"
    mkdir -p "$DIST_DIR/ios"
    mkdir -p "$DIST_DIR/web"
    
    print_success "Created dist directory structure"
}

# Clean dist directory (for full rebuilds)
clean_dist() {
    print_header "Cleaning dist directory"
    rm -rf "$DIST_DIR"
    setup_dist
}

# Build web assets
build_web() {
    print_header "Building Web Assets"
    
    cd "$WEB_DIR"
    pnpm build
    
    # Clean and copy web build to dist
    rm -rf "$DIST_DIR/web/"*
    cp -r "$WEB_DIR/dist/"* "$DIST_DIR/web/"
    
    print_success "Web assets built and copied to dist/web/"
}

# Build macOS app
build_mac() {
    print_header "Building macOS App ($APP_NAME)"
    
    cd "$WEB_DIR"
    
    # Clean electron-builder release folder to prevent old artifacts
    rm -rf "$RELEASE_DIR/$VERSION"
    
    pnpm build:mac
    
    # Clean and copy macOS builds to dist
    rm -rf "$DIST_DIR/mac/"*
    if [[ -d "$RELEASE_DIR/$VERSION" ]]; then
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.dmg "$DIST_DIR/mac/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.zip "$DIST_DIR/mac/" 2>/dev/null || true
    fi
    
    print_success "macOS app built and copied to dist/mac/"
}

# Build Windows app
build_win() {
    print_header "Building Windows App ($APP_NAME)"
    
    cd "$WEB_DIR"
    
    # Clean electron-builder release folder to prevent old artifacts
    rm -rf "$RELEASE_DIR/$VERSION"
    
    pnpm build:win
    
    # Clean and copy Windows builds to dist
    rm -rf "$DIST_DIR/win/"*
    if [[ -d "$RELEASE_DIR/$VERSION" ]]; then
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.exe "$DIST_DIR/win/" 2>/dev/null || true
    fi
    
    print_success "Windows app built and copied to dist/win/"
}

# Build Linux app
build_linux() {
    print_header "Building Linux App ($APP_NAME)"
    
    cd "$WEB_DIR"
    
    # Clean electron-builder release folder to prevent old artifacts
    rm -rf "$RELEASE_DIR/$VERSION"
    
    pnpm build:linux
    
    # Clean and copy Linux builds to dist
    rm -rf "$DIST_DIR/linux/"*
    if [[ -d "$RELEASE_DIR/$VERSION" ]]; then
        cp -f "$RELEASE_DIR/$VERSION/"*.AppImage "$DIST_DIR/linux/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/"*.deb "$DIST_DIR/linux/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/"*.rpm "$DIST_DIR/linux/" 2>/dev/null || true
    fi
    
    print_success "Linux app built and copied to dist/linux/"
}

# Build Android APK
build_android() {
    print_header "Building Android APK ($APP_NAME)"
    
    setup_android_env
    
    if [[ -z "$ANDROID_HOME" ]]; then
        print_warning "ANDROID_HOME not set, skipping Android build"
        return 1
    fi
    
    cd "$WEB_DIR"
    pnpm build
    npx cap sync android
    
    cd "$WEB_DIR/android"
    ./gradlew assembleDebug
    
    # Clean and copy APK to dist
    rm -rf "$DIST_DIR/android/"*
    cp -f "$WEB_DIR/android/app/build/outputs/apk/debug/app-debug.apk" \
        "$DIST_DIR/android/$APP_NAME_SLUG-$VERSION.apk"
    
    print_success "Android APK built and copied to dist/android/"
}

# Build iOS (requires Xcode on macOS)
build_ios() {
    print_header "Building iOS App ($APP_NAME)"
    
    if [[ "$(uname)" != "Darwin" ]]; then
        print_warning "iOS builds require macOS, skipping"
        return 1
    fi
    
    cd "$WEB_DIR"
    pnpm build
    npx cap sync ios
    
    # Copy iOS project reference to dist
    rm -rf "$DIST_DIR/ios/"*
    
    # Create a README in the ios dist folder with instructions
    cat > "$DIST_DIR/ios/README.txt" << EOF
iOS Build Instructions for $APP_NAME
=====================================

The iOS project has been synced and is ready for building in Xcode.

To build and archive for distribution:

1. Open the Xcode project:
   cd packages/web && npx cap open ios

2. In Xcode:
   - Select your team in Signing & Capabilities
   - Select "Any iOS Device" as the build target
   - Go to Product > Archive
   - Once archived, click "Distribute App"

3. For TestFlight/App Store:
   - Choose "App Store Connect" distribution
   - Follow the prompts to upload

4. For Ad Hoc distribution:
   - Choose "Ad Hoc" distribution
   - Select devices and export the IPA

Project location: packages/web/ios/
EOF
    
    print_warning "iOS requires Xcode for final build (code signing required)"
    echo ""
    echo "  To open in Xcode:  cd packages/web && npx cap open ios"
    echo "  Then: Product > Archive > Distribute App"
    echo ""
    
    print_success "iOS project synced. See dist/ios/README.txt for instructions"
}

# Build all desktop platforms at once (more efficient, single electron build)
build_desktop() {
    print_header "Building All Desktop Platforms ($APP_NAME)"
    
    cd "$WEB_DIR"
    
    # Clean electron-builder release folder to prevent old artifacts
    rm -rf "$RELEASE_DIR/$VERSION"
    
    pnpm build:all
    
    # Clean and copy all desktop builds to dist
    rm -rf "$DIST_DIR/mac/"* "$DIST_DIR/win/"* "$DIST_DIR/linux/"*
    if [[ -d "$RELEASE_DIR/$VERSION" ]]; then
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.dmg "$DIST_DIR/mac/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.zip "$DIST_DIR/mac/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/$APP_NAME"*.exe "$DIST_DIR/win/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/"*.AppImage "$DIST_DIR/linux/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/"*.deb "$DIST_DIR/linux/" 2>/dev/null || true
        cp -f "$RELEASE_DIR/$VERSION/"*.rpm "$DIST_DIR/linux/" 2>/dev/null || true
    fi
    
    print_success "All desktop apps built and copied to dist/"
}

# Build all platforms
build_all() {
    clean_dist
    build_web
    build_desktop
    build_android
    build_ios
    
    print_header "Build Complete!"
    echo "All builds are in: $DIST_DIR"
    echo ""
    ls -la "$DIST_DIR"/*/ 2>/dev/null || true
}

# Show usage
usage() {
    echo "$APP_NAME Build Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  all       Build all platforms (default)"
    echo "  clean     Clean dist directory"
    echo "  web       Build web assets only"
    echo "  mac       Build macOS app"
    echo "  win       Build Windows app"
    echo "  linux     Build Linux app"
    echo "  android   Build Android APK"
    echo "  ios       Sync iOS project (requires Xcode for archive)"
    echo "  desktop   Build all desktop platforms (mac, win, linux)"
    echo "  mobile    Build all mobile platforms (android, ios)"
    echo ""
    echo "Examples:"
    echo "  $0 android    # Build Android APK only"
    echo "  $0 desktop    # Build all desktop apps"
    echo "  $0            # Build everything"
}

# Main
cd "$ROOT_DIR"

case "${1:-all}" in
    all)
        build_all
        ;;
    web)
        setup_dist
        build_web
        ;;
    mac)
        setup_dist
        build_mac
        ;;
    win)
        setup_dist
        build_win
        ;;
    linux)
        setup_dist
        build_linux
        ;;
    android)
        setup_dist
        build_android
        ;;
    ios)
        setup_dist
        build_ios
        ;;
    desktop)
        setup_dist
        build_web
        build_desktop
        ;;
    mobile)
        clean_dist
        build_web
        build_android
        build_ios
        ;;
    clean)
        clean_dist
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        print_error "Unknown command: $1"
        usage
        exit 1
        ;;
esac
