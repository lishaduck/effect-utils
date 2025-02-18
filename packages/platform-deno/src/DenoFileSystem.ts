/**
 * This modules exposes file system access to Effect-based applications that use Deno.
 * @module
 *
 * @since 0.1.1
 */

// biome-ignore lint/correctness/noNodejsModules: Using Node.js compat for fid operations.
import * as NFS from "node:fs";
import * as SFS from "jsr:@std/fs@^1.0.13";
import * as Path from "jsr:@std/path@^1.0.8";
import { FileSystem } from "@effect/platform";
import { effectify } from "@effect/platform/Effectify";
import {
  BadArgument,
  type PlatformError,
  SystemError,
} from "@effect/platform/Error";
import {
  Chunk,
  type Context,
  Effect,
  Layer,
  Option,
  type Scope,
  Stream,
  pipe,
} from "effect";
import {
  effectifyAbortablePromise,
  effectifyPromise,
} from "./internal/effectify-promise.ts";
import { handleErrnoException } from "./internal/error.ts";

const handleBadArgument =
  (method: string) =>
  (err: unknown): BadArgument =>
    BadArgument({
      module: moduleName,
      method,
      message: (err as Error).message ?? String(err),
    });

const moduleName = "FileSystem";

// == access

const access = (() => {
  const nodeAccess = effectify(
    // TODO: Use Deno.open & immediately close, use catch to figure out access.
    // See also, denoland/deno#10021
    // NVM, polyfill with `SFS.exists`.
    NFS.access,
    handleErrnoException(moduleName, "access"),
    handleBadArgument("access"),
  );
  return (
    path: string,
    options?: FileSystem.AccessFileOptions,
  ): Effect.Effect<void, PlatformError> => {
    let mode = NFS.constants.F_OK;
    if (options?.readable) {
      mode |= NFS.constants.R_OK;
    }
    if (options?.writable) {
      mode |= NFS.constants.W_OK;
    }
    return nodeAccess(path, mode);
  };
})();

// == copy

const copy = (() => {
  const stdCopy = effectifyPromise(
    SFS.copy,
    handleErrnoException(moduleName, "copy"),
  );
  return (
    fromPath: string,
    toPath: string,
    options?: FileSystem.CopyOptions,
  ): Effect.Effect<void, PlatformError> =>
    stdCopy(fromPath, toPath, {
      overwrite: options?.overwrite ?? false,
      preserveTimestamps: options?.preserveTimestamps ?? false,
    });
})();

// == copyFile

const copyFile = (() => {
  const denoCopyFile = effectifyPromise(
    Deno.copyFile,
    handleErrnoException(moduleName, "copyFile"),
  );
  return (
    fromPath: string,
    toPath: string,
  ): Effect.Effect<void, PlatformError> => denoCopyFile(fromPath, toPath);
})();

// == chmod

const chmod = (() => {
  const denoChmod = effectifyPromise(
    Deno.chmod,
    handleErrnoException(moduleName, "chmod"),
  );
  return (path: string, mode: number): Effect.Effect<void, PlatformError> =>
    denoChmod(path, mode);
})();

// == chown

const chown = (() => {
  const denoChown = effectifyPromise(
    Deno.chown,
    handleErrnoException(moduleName, "chown"),
  );
  return (
    path: string,
    uid: number,
    gid: number,
  ): Effect.Effect<void, PlatformError> => denoChown(path, uid, gid);
})();

// == link

const link = (() => {
  const denoLink = effectifyPromise(
    Deno.link,
    handleErrnoException(moduleName, "link"),
  );
  return (
    existingPath: string,
    newPath: string,
  ): Effect.Effect<void, PlatformError> => denoLink(existingPath, newPath);
})();

// == makeDirectory

const makeDirectory = (() => {
  const denoMkdir = effectifyPromise(
    Deno.mkdir,
    handleErrnoException(moduleName, "makeDirectory"),
  );
  return (
    path: string,
    options?: FileSystem.MakeDirectoryOptions,
  ): Effect.Effect<void, PlatformError> =>
    denoMkdir(path, {
      recursive: options?.recursive ?? false,

      // TODO: PR Deno to fix this type.
      ...(options?.mode !== undefined ? { mode: options?.mode } : {}),
    });
})();

// == makeTempDirectory

const makeTempDirectoryFactory = (
  method: string,
): ((
  options?: FileSystem.MakeTempDirectoryOptions,
) => Effect.Effect<string, PlatformError>) => {
  const denoMakeTempDir = effectifyPromise(
    async (prefix, options) => await Deno.makeTempDir({ ...options, prefix }),
    handleErrnoException(moduleName, method),
  );
  return (
    options: FileSystem.MakeTempDirectoryOptions = {},
  ): Effect.Effect<string, PlatformError> =>
    Effect.suspend(() => {
      const { prefix, ...restOptions } = options;

      return denoMakeTempDir(prefix, restOptions);
    });
};
const makeTempDirectory = makeTempDirectoryFactory("makeTempDirectory");

// == remove

const removeFactory = (
  method: string,
): ((
  path: string,
  options?: FileSystem.RemoveOptions,
) => Effect.Effect<void, PlatformError>) => {
  const denoRemove = effectifyPromise(
    Deno.remove,
    handleErrnoException(moduleName, method),
  );

  return (
    path: string,
    options?: FileSystem.RemoveOptions,
  ): Effect.Effect<void, PlatformError> =>
    denoRemove(path, {
      recursive: (options?.recursive || options?.force) ?? false,
    });
};

const remove = removeFactory("remove");

// == makeTempDirectoryScoped

const makeTempDirectoryScoped = (() => {
  const makeDirectory = makeTempDirectoryFactory("makeTempDirectoryScoped");
  const removeDirectory = removeFactory("makeTempDirectoryScoped");
  return (
    options?: FileSystem.MakeTempDirectoryOptions,
  ): Effect.Effect<string, PlatformError, Scope.Scope> =>
    Effect.acquireRelease(makeDirectory(options), (directory) =>
      Effect.orDie(removeDirectory(directory, { recursive: true })),
    );
})();

// == open

const nodeOpenFactory = (
  method: string,
): ((
  path: NFS.PathLike,
  flags: NFS.OpenMode | undefined,
  mode: NFS.Mode | null | undefined,
) => Effect.Effect<number, PlatformError>) =>
  effectify(
    NFS.open,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method),
  );
const nodeCloseFactory = (
  method: string,
): ((fd: number) => Effect.Effect<void, PlatformError>) =>
  effectify(
    NFS.close,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method),
  );

const openFactory = (
  method: string,
): ((
  path: string,
  options?: FileSystem.OpenFileOptions,
) => Effect.Effect<FileSystem.File, PlatformError, Scope.Scope>) => {
  const nodeOpen = nodeOpenFactory(method);
  const nodeClose = nodeCloseFactory(method);

  return (
    path: string,
    options?: FileSystem.OpenFileOptions,
  ): Effect.Effect<FileSystem.File, PlatformError, Scope.Scope> =>
    pipe(
      Effect.acquireRelease(
        nodeOpen(path, options?.flag ?? "r", options?.mode),
        (fd) => Effect.orDie(nodeClose(fd)),
      ),
      Effect.map((fd) =>
        makeFile(
          FileSystem.FileDescriptor(fd),
          options?.flag?.startsWith("a") ?? false,
        ),
      ),
    );
};
const open = openFactory("open");

const nodeReadFactory = (
  method: string,
): ((
  fd: number,
  options: NFS.ReadAsyncOptions<Uint8Array>,
) => Effect.Effect<number, PlatformError>) =>
  effectify(
    NFS.read,
    handleErrnoException(moduleName, method),
    handleBadArgument(method),
  );
const nodeRead = nodeReadFactory("read");
const nodeReadAlloc = nodeReadFactory("readAlloc");

const nodeFstatFactory = (
  method: string,
): ((fd: number) => Effect.Effect<NFS.Stats, PlatformError>) =>
  effectify(
    NFS.fstat,
    handleErrnoException(moduleName, method),
    handleBadArgument(method),
  );
const fstat = nodeFstatFactory("fstat");

const nodeSyncFactory = (
  method: string,
): ((fd: number) => Effect.Effect<void, PlatformError>) =>
  effectify(
    NFS.fsync,
    handleErrnoException(moduleName, method),
    handleBadArgument(method),
  );
const nodeSync = nodeSyncFactory("sync");

const nodeWriteFactory = (
  method: string,
): ((
  fd: number,
  buffer: Uint8Array,
  offset: number | null | undefined,
  length: number | null | undefined,
  position: number | null | undefined,
) => Effect.Effect<number, PlatformError>) =>
  effectify(
    NFS.write,
    handleErrnoException(moduleName, method),
    handleBadArgument(method),
  );
const nodeWrite = nodeWriteFactory("write");
const nodeWriteAll = nodeWriteFactory("writeAll");

const makeFile = (() => {
  class FileImpl implements FileSystem.File {
    readonly [FileSystem.FileTypeId]: FileSystem.FileTypeId;

    private readonly semaphore = Effect.unsafeMakeSemaphore(1);
    private position = 0n;

    readonly fd: FileSystem.File.Descriptor;
    private readonly append: boolean;

    constructor(fd: FileSystem.File.Descriptor, append: boolean) {
      this[FileSystem.FileTypeId] = FileSystem.FileTypeId;
      this.fd = fd;
      this.append = append;
    }

    get stat(): Effect.Effect<FileSystem.File.Info, PlatformError> {
      return Effect.map(fstat(this.fd), makeNodeFileInfo);
    }

    get sync(): Effect.Effect<void, PlatformError> {
      return nodeSync(this.fd);
    }

    seek(
      offset: FileSystem.SizeInput,
      from: FileSystem.SeekMode,
    ): Effect.Effect<bigint> {
      const offsetSize = FileSystem.Size(offset);
      return this.semaphore.withPermits(1)(
        Effect.sync(() => {
          if (from === "start") {
            this.position = offsetSize;
          } else if (from === "current") {
            this.position += offsetSize;
          }

          // Used in tests.
          return this.position;
        }),
      );
    }

    read(buffer: Uint8Array): Effect.Effect<FileSystem.Size, PlatformError> {
      return this.semaphore.withPermits(1)(
        Effect.map(
          Effect.suspend(() =>
            nodeRead(this.fd, {
              buffer,
              position: this.position,
            }),
          ),
          (bytesRead) => {
            const sizeRead = FileSystem.Size(bytesRead);
            this.position += sizeRead;
            return sizeRead;
          },
        ),
      );
    }

    readAlloc(
      size: FileSystem.SizeInput,
    ): Effect.Effect<Option.Option<Uint8Array>, PlatformError> {
      const sizeNumber = Number(size);
      return this.semaphore.withPermits(1)(
        Effect.flatMap(
          Effect.sync(() => new Uint8Array(sizeNumber)),
          (buffer) =>
            Effect.map(
              nodeReadAlloc(this.fd, {
                buffer,
                position: this.position,
              }),
              (bytesRead): Option.Option<Uint8Array> => {
                if (bytesRead === 0) {
                  return Option.none();
                }

                this.position += BigInt(bytesRead);
                if (bytesRead === sizeNumber) {
                  return Option.some(buffer);
                }

                const dst = buffer.slice(0, bytesRead);

                return Option.some(dst);
              },
            ),
        ),
      );
    }

    truncate(
      length?: FileSystem.SizeInput,
    ): Effect.Effect<void, PlatformError> {
      return this.semaphore.withPermits(1)(
        Effect.map(
          // FIXME: `truncate` takes a path, not a FileDescriptor.
          // TODO: PR `@effect/platform`, b/c passing a `FileDescriptor` to truncate is also deprecated in Node.js.
          ftruncateFactory("truncate")(
            this.fd,
            length ? Number(length) : undefined,
          ),
          () => {
            if (!this.append) {
              const len = BigInt(length ?? 0);
              if (this.position > len) {
                this.position = len;
              }
            }
          },
        ),
      );
    }

    write(buffer: Uint8Array): Effect.Effect<FileSystem.Size, PlatformError> {
      return this.semaphore.withPermits(1)(
        Effect.map(
          Effect.suspend(() =>
            nodeWrite(
              this.fd,
              buffer,
              undefined,
              undefined,
              this.append ? undefined : Number(this.position),
            ),
          ),
          (bytesWritten) => {
            const sizeWritten = FileSystem.Size(bytesWritten);
            if (!this.append) {
              this.position += sizeWritten;
            }

            return sizeWritten;
          },
        ),
      );
    }

    private writeAllChunk(
      buffer: Uint8Array,
    ): Effect.Effect<void, PlatformError> {
      return Effect.flatMap<
        number,
        PlatformError,
        never,
        void,
        PlatformError,
        never
      >(
        Effect.suspend(() =>
          nodeWriteAll(
            this.fd,
            buffer,
            undefined,
            undefined,
            this.append ? undefined : Number(this.position),
          ),
        ),
        (bytesWritten) => {
          if (bytesWritten === 0) {
            return Effect.fail(
              SystemError({
                module: moduleName,
                method: "writeAll",
                reason: "WriteZero",
                pathOrDescriptor: this.fd,
                message: "write returned 0 bytes written",
              }),
            );
          }

          if (!this.append) {
            this.position += BigInt(bytesWritten);
          }

          return bytesWritten < buffer.length
            ? this.writeAllChunk(buffer.subarray(bytesWritten))
            : Effect.void;
        },
      );
    }

    writeAll(buffer: Uint8Array): Effect.Effect<void, PlatformError> {
      return this.semaphore.withPermits(1)(this.writeAllChunk(buffer));
    }
  }

  return (fd: FileSystem.File.Descriptor, append: boolean): FileSystem.File =>
    new FileImpl(fd, append);
})();

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: still waiting for proposal-pattern-matching.
const getNodeFileType = (stat: NFS.Stats): FileSystem.File.Type =>
  stat.isFile()
    ? "File"
    : stat.isDirectory()
      ? "Directory"
      : stat.isSymbolicLink()
        ? "SymbolicLink"
        : stat.isBlockDevice()
          ? "BlockDevice"
          : stat.isCharacterDevice()
            ? "CharacterDevice"
            : stat.isFIFO()
              ? "FIFO"
              : stat.isSocket()
                ? "Socket"
                : "Unknown";

const makeNodeFileInfo = (stat: NFS.Stats): FileSystem.File.Info => ({
  type: getNodeFileType(stat),
  mtime: Option.fromNullable(stat.mtime),
  atime: Option.fromNullable(stat.atime),
  birthtime: Option.fromNullable(stat.birthtime),
  dev: stat.dev,
  rdev: Option.fromNullable(stat.rdev),
  ino: Option.fromNullable(stat.ino),
  mode: stat.mode,
  nlink: Option.fromNullable(stat.nlink),
  uid: Option.fromNullable(stat.uid),
  gid: Option.fromNullable(stat.gid),
  size: FileSystem.Size(stat.size),
  blksize: Option.fromNullable(FileSystem.Size(stat.blksize)),
  blocks: Option.fromNullable(stat.blocks),
});

const ftruncateFactory = (
  method: string,
): ((
  path: number,
  length?: FileSystem.SizeInput,
) => Effect.Effect<void, PlatformError>) => {
  const nodeTruncate = effectify(
    NFS.ftruncate,
    handleErrnoException("FileSystem", method),
    handleBadArgument(method),
  );
  return (
    path: number,
    length?: FileSystem.SizeInput,
  ): Effect.Effect<void, PlatformError> =>
    nodeTruncate(path, length !== undefined ? Number(length) : undefined);
};

// == makeTempFile

/**
 * From
 */
const toHexString = (arr: Iterable<number>): string =>
  Array.from(arr, (i) => i.toString(16).padStart(2, "0")).join("");

const makeTempFileFactory = (
  method: string,
): ((
  options?: FileSystem.MakeTempFileOptions,
) => Effect.Effect<string, PlatformError>) => {
  const makeDirectory = makeTempDirectoryFactory(method);
  const open = openFactory(method);
  const randomHexString = (bytes: number): Effect.Effect<string> =>
    Effect.sync(() =>
      toHexString(crypto.getRandomValues(new Uint8Array(bytes))),
    );

  return (
    options?: FileSystem.MakeTempFileOptions,
  ): Effect.Effect<string, PlatformError> =>
    pipe(
      Effect.zip(makeDirectory(options), randomHexString(6)),
      Effect.map(([directory, random]) => Path.join(directory, random)),
      Effect.tap((path) => Effect.scoped(open(path, { flag: "w+" }))),
    );
};
const makeTempFile = makeTempFileFactory("makeTempFile");

// == makeTempFileScoped

const makeTempFileScoped = (() => {
  const makeFile = makeTempFileFactory("makeTempFileScoped");
  const removeDirectory = removeFactory("makeTempFileScoped");
  return (
    options?: FileSystem.MakeTempFileOptions,
  ): Effect.Effect<string, PlatformError, Scope.Scope> =>
    Effect.acquireRelease(makeFile(options), (file) =>
      Effect.orDie(removeDirectory(Path.dirname(file), { recursive: true })),
    );
})();

// == readDirectory

const readDirectory = (
  path: string,
  options?: FileSystem.ReadDirectoryOptions,
): Effect.Effect<string[], PlatformError> =>
  Effect.gen(function* () {
    const entriesStream =
      options?.recursive === undefined
        ? Stream.fromAsyncIterable(Deno.readDir(path), (err) =>
            handleErrnoException(moduleName, "readDirectory")(err as Error, [
              path,
            ]),
          ).pipe(Stream.map((n) => n.name))
        : walkDir(path, (err) =>
            handleErrnoException(moduleName, "readDirectory")(err as Error, [
              path,
            ]),
          ).pipe(Stream.map((n) => n.path));

    return yield* streamToArray(entriesStream);
  });

const streamToArray = <A, E = never, R = never>(
  stream: Stream.Stream<A, E, R>,
): Effect.Effect<A[], E, R> =>
  Effect.gen(function* () {
    const chunk = yield* stream.pipe(Stream.runCollect);

    return chunk.pipe(Chunk.toArray);
  });

const walkDir = <E>(
  root: string | URL,
  onError: (e: unknown) => E,
  walkOptions?: SFS.WalkOptions,
): Stream.Stream<SFS.WalkEntry, E> =>
  Stream.fromAsyncIterable(SFS.walk(root, walkOptions), onError);

// == readFile

const readFile = (path: string): Effect.Effect<Uint8Array, PlatformError> =>
  (() => {
    const denoReadFile = effectifyAbortablePromise(
      (signal) =>
        (path: string): Promise<Uint8Array> =>
          Deno.readFile(path, { signal }),
      handleErrnoException(moduleName, "readFile"),
    );

    return denoReadFile(path);
  })();

// == readLink

const readLink = (() => {
  const denoReadLink = effectifyPromise(
    Deno.readLink,
    handleErrnoException(moduleName, "readLink"),
  );
  return (path: string): Effect.Effect<string, PlatformError> =>
    denoReadLink(path);
})();

// == realPath

const realPath = (() => {
  const denoRealPath = effectifyPromise(
    Deno.realPath,
    handleErrnoException(moduleName, "realPath"),
  );
  return (path: string): Effect.Effect<string, PlatformError> =>
    denoRealPath(path);
})();

// == rename

const rename = (() => {
  const denoRename = effectifyPromise(
    Deno.rename,
    handleErrnoException(moduleName, "rename"),
  );
  return (
    oldPath: string,
    newPath: string,
  ): Effect.Effect<void, PlatformError> => denoRename(oldPath, newPath);
})();

// == stat

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: still waiting for proposal-pattern-matching.
const getFileType = (stat: Deno.FileInfo): FileSystem.File.Type =>
  stat.isFile
    ? "File"
    : stat.isDirectory
      ? "Directory"
      : stat.isSymlink
        ? "SymbolicLink"
        : stat.isBlockDevice
          ? "BlockDevice"
          : stat.isCharDevice
            ? "CharacterDevice"
            : stat.isFifo
              ? "FIFO"
              : stat.isSocket
                ? "Socket"
                : "Unknown";

const makeFileInfo = (stat: Deno.FileInfo): FileSystem.File.Info => ({
  type: getFileType(stat),
  mtime: Option.fromNullable(stat.mtime),
  atime: Option.fromNullable(stat.atime),
  birthtime: Option.fromNullable(stat.birthtime),
  dev: stat.dev,
  rdev: Option.fromNullable(stat.rdev),
  ino: Option.fromNullable(stat.ino),
  mode: stat.mode ?? 0, // FIXME: Deno doesn't support `mode` on Windows.
  nlink: Option.fromNullable(stat.nlink),
  uid: Option.fromNullable(stat.uid),
  gid: Option.fromNullable(stat.gid),
  size: FileSystem.Size(stat.size),
  blksize: Option.fromNullable(
    FileSystem.Size(
      stat.blksize ?? 0, // FIXME: Deno doesn't support `mode` on Windows.
    ),
  ),
  blocks: Option.fromNullable(stat.blocks),
});
const stat = (() => {
  const denoStat = effectifyPromise(
    Deno.stat,
    handleErrnoException(moduleName, "stat"),
  );
  return (
    path: string,
  ): Effect.Effect<FileSystem.File.Info, PlatformError | BadArgument> =>
    Effect.map(denoStat(path), makeFileInfo);
})();

// == symlink

const symlink = (() => {
  const denoSymlink = effectifyPromise(
    Deno.symlink,
    handleErrnoException(moduleName, "symlink"),
  );
  return (target: string, path: string): Effect.Effect<void, PlatformError> =>
    denoSymlink(target, path);
})();

// == truncate

const truncate = (() => {
  const denoTruncate = effectifyPromise(
    Deno.truncate,
    handleErrnoException(moduleName, "truncate"),
  );
  return (
    path: string,
    length?: FileSystem.SizeInput,
  ): Effect.Effect<void, PlatformError> =>
    denoTruncate(path, length !== undefined ? Number(length) : undefined);
})();

// == utimes

const utimes = (() => {
  const denoUtime = effectifyPromise(
    Deno.utime,
    handleErrnoException(moduleName, "utime"),
  );
  return (
    path: string,
    atime: number | Date,
    mtime: number | Date,
  ): Effect.Effect<void, PlatformError> => denoUtime(path, atime, mtime);
})();

// == watch

const watchNode = (
  path: string,
): Stream.Stream<FileSystem.WatchEvent, PlatformError> =>
  Stream.asyncScoped<FileSystem.WatchEvent, PlatformError>((emit) =>
    Effect.acquireRelease(
      Effect.tryPromise({
        try: async (): Promise<Deno.FsWatcher> => {
          const watcher = Deno.watchFs(path);

          for await (const event of watcher) {
            for (const eventPath of event.paths) {
              switch (event.kind) {
                case "create": {
                  await emit.single(
                    FileSystem.WatchEventCreate({ path: eventPath }),
                  );
                  break;
                }
                case "modify": {
                  await emit.single(
                    FileSystem.WatchEventUpdate({ path: eventPath }),
                  );
                  break;
                }
                case "remove": {
                  await emit.single(
                    FileSystem.WatchEventRemove({ path: eventPath }),
                  );
                  break;
                }
                case "rename": {
                  await emit.fromEffect(
                    Effect.match(stat(path), {
                      onSuccess: (_): FileSystem.WatchEvent.Create =>
                        FileSystem.WatchEventCreate({ path }),
                      onFailure: (_): FileSystem.WatchEvent.Remove =>
                        FileSystem.WatchEventRemove({ path }),
                    }),
                  );

                  break;
                }
              }
            }
          }

          return watcher;
        },
        catch: (error): PlatformError => {
          return SystemError({
            module: moduleName,
            reason: "Unknown",
            method: "watch",
            pathOrDescriptor: path,
            message: (error as Error).message ?? String(error),
          });
        },
      }),
      (watcher) => Effect.sync(() => watcher.close()),
    ),
  );

const watch = (
  backend: Option.Option<Context.Tag.Service<FileSystem.WatchBackend>>,
  path: string,
): Stream.Stream<FileSystem.WatchEvent, PlatformError> =>
  stat(path).pipe(
    Effect.map((stat) =>
      backend.pipe(
        Option.flatMap((_) => _.register(path, stat)),
        Option.getOrElse(() => watchNode(path)),
      ),
    ),
    Stream.unwrap,
  );

// == writeFile

const writeFile = (
  path: string,
  data: Uint8Array,
  options?: FileSystem.WriteFileOptions,
): Effect.Effect<void, PlatformError> =>
  (() => {
    const denoWriteFile = effectifyAbortablePromise(
      (
        signal,
      ): ((
        path: string,
        data: Uint8Array,
        options?: FileSystem.WriteFileOptions,
      ) => Promise<void>) =>
        async (
          path: string,
          data: Uint8Array,
          options?: FileSystem.WriteFileOptions,
        ): Promise<void> =>
          await Deno.writeFile(path, data, { signal, ...options }),
      handleErrnoException(moduleName, "writeFile"),
    );

    return denoWriteFile(path, data, options);
  })();

const makeFileSystem = Effect.map(
  Effect.serviceOption(FileSystem.WatchBackend),
  (backend) =>
    FileSystem.make({
      access,
      chmod,
      chown,
      copy,
      copyFile,
      link,
      makeDirectory,
      makeTempDirectory,
      makeTempDirectoryScoped,
      makeTempFile,
      makeTempFileScoped,
      open,
      readDirectory,
      readFile,
      readLink,
      realPath,
      remove,
      rename,
      stat,
      symlink,
      truncate,
      utimes,
      watch: (path): Stream.Stream<FileSystem.WatchEvent, PlatformError> => {
        return watch(backend, path);
      },
      writeFile,
    }),
);

/**
 * A {@linkplain Layer.Layer | layer} that provides file system operations.
 *
 * @since 0.0.1
 * @category layer
 */
export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(
  FileSystem.FileSystem,
  makeFileSystem,
);
