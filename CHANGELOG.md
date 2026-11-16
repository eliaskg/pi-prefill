# Changelog

## [0.2.3] - 2026-11-16

### Changed

- **mlx-serve**: Updated the PR note to the new pull request. 

## [0.2.2] - 2026-11-16

### Fixed

- **ETA flicker on repeated progress chunks**: Some servers repeat the last `prompt_progress` value on heartbeat chunks. Maya does this while the engine is quiet. A zero token delta cleared the rate, so the `eta` and `tps` views dropped out of the line. The extension now keeps the last rate through such chunks. The rate uses uncached tokens only.

## [0.2.0] - 2026-11-05

### New Features

- **Provider wildcards**: `providers` entries support a `*` wildcard. A pattern such as `local-*` matches dynamically registered provider ids like `local-<hash>`, so you no longer hardcode opaque ids. See the wildcard note in the README ([#1](https://github.com/eliaskg/pi-prefill/issues/1))

### Added

- oMLX as a supported engine. Add your oMLX provider id to `providers`.
- Splash as a supported engine. Add your Splash provider id to `providers`.
- mlx-serve as a pending engine. It waits on [mlx-serve#1032](https://github.com/ddalcu/mlx-serve/pull/1032). Add your provider id to `providers` once the PR lands.
