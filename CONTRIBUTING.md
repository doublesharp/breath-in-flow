# Contributing to Breath in Flow

Thank you for your interest in contributing to Breath in Flow!

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Styling**: TailwindCSS
- **Validation**: Zod
- **Storage**: localStorage (client-side persistence)
- **Package Manager**: pnpm with workspaces
- **Testing**: Vitest + Vue Test Utils
- **Desktop**: Electron (macOS, Windows, Linux)
- **Mobile**: Capacitor (iOS, Android)
- **Charts**: Chart.js + vue-chartjs

## Project Structure

```
breath-in-flow/
├── packages/
│   ├── shared/          # Shared types, schemas, utilities
│   │   ├── src/
│   │   │   ├── schemas.ts   # Zod schemas and types
│   │   │   ├── timer.ts     # Breathing timer logic
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── database/        # Prisma schema and database client
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │
│   └── web/             # Vue frontend application
│       ├── src/
│       │   ├── components/  # Vue components
│       │   ├── composables/ # Vue composables (hooks)
│       │   ├── services/    # External services (wearables)
│       │   └── App.vue
│       ├── electron/        # Electron main process
│       ├── android/         # Capacitor Android project
│       ├── ios/             # Capacitor iOS project
│       └── tests/
│
├── scripts/             # Build scripts
├── .github/workflows/   # CI/CD workflows
├── pnpm-workspace.yaml
└── package.json
```

## Development Setup

1. **Prerequisites**
   - Node.js 22+
   - pnpm 9+
   - For Android builds: Java 21, Android SDK
   - For iOS builds: macOS with Xcode
   - For desktop builds: Platform-specific requirements handled by electron-builder

2. **Clone and Install**
   ```bash
   git clone https://github.com/breathinflow/breath-in-flow.git
   cd breath-in-flow
   pnpm install
   pnpm db:generate
   ```

3. **Start Development Server**
   ```bash
   pnpm dev
   ```

   The app will be available at `http://localhost:3000`.

## Building

All build commands can be run from the workspace root. Built files are collected in the `dist/` directory.

```bash
# Build all platforms
pnpm build:all

# Build specific platforms
pnpm build:web       # Web assets only
pnpm build:mac       # macOS app (DMG, ZIP)
pnpm build:win       # Windows app (NSIS, Portable)
pnpm build:linux     # Linux app (AppImage, DEB)
pnpm build:android   # Android APK
pnpm build:ios       # iOS (syncs project, requires Xcode to archive)

# Build groups
pnpm build:desktop   # All desktop platforms (mac, win, linux)
pnpm build:mobile    # All mobile platforms (android, ios)
```

Build outputs are organized in `dist/`:
```
dist/
├── mac/        # macOS DMG and ZIP files
├── win/        # Windows EXE installers
├── linux/      # Linux AppImage and DEB
├── android/    # Android APK
├── ios/        # (use Xcode to archive)
└── web/        # Static web assets
```

### Running on Emulators

```bash
cd packages/web

# Run in Android emulator
pnpm android:emulator

# Run in iOS simulator (macOS only)
pnpm ios:simulator

# Build APK for sharing
pnpm android:apk
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm --filter @breath-in-flow/web test:watch
```

## Branching Strategy

- `main` - Production releases only
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches

## Pull Request Process

1. Create a feature or fix branch from `develop`
2. Make your changes with clear commit messages
3. Ensure all tests pass: `pnpm test`
4. Ensure linting passes: `pnpm lint`
5. Open a PR against `develop`
6. Request review from maintainers

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm --filter @breath-in-flow/web test:watch
```

## Release Process

Releases are automated via GitHub Actions when a version tag is pushed.

### Creating a Release

1. **Update Version Numbers**
   
   Update version in these files:
   - `package.json` (root)
   - `packages/shared/package.json`
   - `packages/database/package.json`
   - `packages/web/package.json`

2. **Commit Version Bump**
   ```bash
   git add -A
   git commit -m "chore: bump version to 0.1.0"
   ```

3. **Create and Push Tag**
   ```bash
   git tag v0.1.0
   git push origin main --tags
   ```

4. **Review Draft Release**
   
   The GitHub Action will:
   - Run tests
   - Build for all platforms (macOS ARM64/Intel, Windows, Linux, Android)
   - Create a draft release with all artifacts

5. **Publish Release**
   
   Go to GitHub Releases, review the draft, edit release notes if needed, and publish.

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

Pre-release versions:
- `v0.1.0-alpha.1` - Alpha releases
- `v0.1.0-beta.1` - Beta releases  
- `v0.1.0-rc.1` - Release candidates

### Hotfixes

For urgent production fixes:

1. Create branch from `main`: `git checkout -b fix/critical-bug main`
2. Make fix and test
3. PR directly to `main`
4. After merge, tag and release
5. Merge `main` back to `develop`

## Code Style

- Use TypeScript for all code
- Follow Vue 3 Composition API patterns
- Use Tailwind CSS for styling
- Format with Prettier (runs automatically)
- Lint with ESLint

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add breathing pattern presets
fix: correct timer phase transition bug
docs: update README with build instructions
chore: update dependencies
test: add unit tests for timer logic
refactor: simplify breathing visualizer component
```

## Questions?

Open an issue or start a discussion on GitHub.
