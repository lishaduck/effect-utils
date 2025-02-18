# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- markdownlint-disable-file MD024 -->

## [0.1.2] - 2025-02-18

### Added

- `KeyValueStore` implementation for `localStorage` and `sessionStorage` ([#11]).
- `KeyValueStore` for Deno KV ([#12]).

### Changed

- Bumped dependency lower bounds ([#10], [#16] \[thanks to [@pixeleet]\], [#20], [#21]).
- Only support passing in `MessagePort`s to `layerMessagePort` ([#21]).
  This means that you’ll need to add `webworker.lib.d.ts` to your TypeScript `compilerOptions`
  if you use `DenoWorkerRunner`.
  ```json
  {
    "compilerOptions": {
      "lib": ["webworker"]
    }
  }
  ```
- Fix JSR import map ([#6]).

## [0.1.1] - 2024-11-24

### Added

- Deno implementation of the `WorkerRunner` API ([#5], [#8]).

### Changed

- The `FileSystem` implementation now (mostly) uses Deno-native APIs ([#2]).

## [0.1.0] - 2024-11-13

### Added

- Deno implementation of Effect’s platform-independent abstractions.

[0.1.0]: https://github.com/lishaduck/effect-utils/releases/tag/platform-deno-v0.1.0
[0.1.1]: https://github.com/lishaduck/effect-utils/releases/tag/platform-deno-v0.1.1
[0.1.2]: https://github.com/lishaduck/effect-utils/releases/tag/platform-deno-v0.1.2
[#2]: https://github.com/lishaduck/effect-utils/pull/2
[#5]: https://github.com/lishaduck/effect-utils/pull/5
[#6]: https://github.com/lishaduck/effect-utils/pull/6
[#8]: https://github.com/lishaduck/effect-utils/pull/8
[#10]: https://github.com/lishaduck/effect-utils/pull/10
[#11]: https://github.com/lishaduck/effect-utils/pull/11
[#12]: https://github.com/lishaduck/effect-utils/pull/12
[#16]: https://github.com/lishaduck/effect-utils/pull/16
[#20]: https://github.com/lishaduck/effect-utils/pull/20
[#21]: https://github.com/lishaduck/effect-utils/pull/21
[@pixeleet]: https://github.com/pixeleet
