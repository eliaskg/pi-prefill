# Changelog

## [0.2.0] - 2026-11-05

### New Features

- **Provider wildcards**: `providers` entries support a `*` wildcard. A pattern such as `local-*` matches dynamically registered provider ids like `local-<hash>`, so you no longer hardcode opaque ids. See the wildcard note in the README ([#1](https://github.com/eliaskg/pi-prefill/issues/1))

### Added

- oMLX as a supported engine. Add your oMLX provider id to `providers`.
- Splash as a supported engine. Add your Splash provider id to `providers`.
- mlx-serve as a pending engine. It waits on [mlx-serve#1032](https://github.com/ddalcu/mlx-serve/pull/1032). Add your provider id to `providers` once the PR lands.
