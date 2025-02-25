import * as Fs from "@effect/platform/FileSystem";
import { it } from "@effect/vitest";
import { Chunk, Effect, Stream, pipe } from "effect";
import * as DenoFileSystem from "../src/DenoFileSystem.ts";

it.layer(DenoFileSystem.layer)("FileSystem", (it) => {
  it.effect("readFile", ({ expect }) =>
    Effect.gen(function* () {
      const fs = yield* Fs.FileSystem;
      const data = yield* fs.readFile(
        `${import.meta.dirname}/fixtures/text.txt`,
      );
      const text = new TextDecoder().decode(data);
      expect(text.trim()).toEqual("lorem ipsum dolar sit amet");
    }),
  );

  it.scoped("makeTempDirectory", ({ expect }) =>
    Effect.gen(function* () {
      const fs = yield* Fs.FileSystem;
      let dir = "";
      yield* Effect.gen(function* () {
        dir = yield* fs.makeTempDirectory();
        const stat = yield* fs.stat(dir);
        expect(stat.type).toEqual("Directory");
      });
      const stat = yield* fs.stat(dir);
      expect(stat.type).toEqual("Directory");
    }),
  );

  it.scoped("makeTempDirectoryScoped", ({ expect }) =>
    Effect.gen(function* () {
      const fs = yield* Fs.FileSystem;
      let dir = "";
      yield* Effect.gen(function* () {
        dir = yield* fs.makeTempDirectoryScoped();
        const stat = yield* fs.stat(dir);
        expect(stat.type).toEqual("Directory");
      })
        // TODO: Figure out why removing this causes this error:
        // TypeError: Do not know how to serialize a BigInt\n    at undefined
        .pipe(Effect.scoped);
      const error = yield* Effect.flip(fs.stat(dir));
      expect(error._tag === "SystemError" && error.reason === "NotFound").toBe(
        true,
      );
    }),
  );

  it.effect("truncate", ({ expect }) =>
    Effect.gen(function* () {
      const fs = yield* Fs.FileSystem;
      const file = yield* fs.makeTempFile();

      const text = "hello world";
      yield* fs.writeFile(file, new TextEncoder().encode(text));

      const before = yield* pipe(
        fs.readFile(file),
        Effect.map((_) => new TextDecoder().decode(_)),
      );
      expect(before).toEqual(text);

      yield* fs.truncate(file);

      const after = yield* pipe(
        fs.readFile(file),
        Effect.map((_) => new TextDecoder().decode(_)),
      );
      expect(after).toEqual("");
    }),
  );

  // The Node-compat layer for `NFS.read` is buggy.
  it.scoped.fails(
    "should track the cursor position when reading",
    ({ expect }) =>
      Effect.gen(function* () {
        const fs = yield* Fs.FileSystem;

        let text: string;
        const file = yield* pipe(
          fs.open(`${import.meta.dirname}/fixtures/text.txt`),
        );

        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(5))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("lorem");

        yield* file.seek(Fs.Size(7), "current");
        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(5))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("dolar");

        yield* file.seek(Fs.Size(1), "current");
        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(8))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("sit amet");

        yield* file.seek(Fs.Size(0), "start");
        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(11))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("lorem ipsum");

        text = yield* pipe(
          fs.stream(`${import.meta.dirname}/fixtures/text.txt`, {
            offset: Fs.Size(6),
            bytesToRead: Fs.Size(5),
          }),
          Stream.map((_) => new TextDecoder().decode(_)),
          Stream.runCollect,
          Effect.map(Chunk.join("")),
        );
        expect(text).toBe("ipsum");
      }),
  );

  it.scoped("should track the cursor position when writing", ({ expect }) =>
    Effect.gen(function* () {
      const fs = yield* Fs.FileSystem;

      let text: string;
      const path = yield* fs.makeTempFileScoped();
      const file = yield* fs.open(path, { flag: "w+" });

      yield* file.write(new TextEncoder().encode("lorem ipsum"));
      yield* file.write(new TextEncoder().encode(" "));
      yield* file.write(new TextEncoder().encode("dolor sit amet"));
      text = yield* fs.readFileString(path);
      expect(text).toBe("lorem ipsum dolor sit amet");

      yield* file.seek(Fs.Size(-4), "current");
      yield* file.write(new TextEncoder().encode("hello world"));
      text = yield* fs.readFileString(path);
      expect(text).toBe("lorem ipsum dolor sit hello world");

      yield* file.seek(Fs.Size(6), "start");
      yield* file.write(new TextEncoder().encode("blabl"));
      text = yield* fs.readFileString(path);
      expect(text).toBe("lorem blabl dolor sit hello world");
    }),
  );

  // The Node-compat layer for `NFS.read` is buggy.
  it.scoped.fails(
    "should maintain a read cursor in append mode",
    ({ expect }) =>
      Effect.gen(function* () {
        const fs = yield* Fs.FileSystem;

        let text: string;
        const path = yield* fs.makeTempFileScoped();
        const file = yield* fs.open(path, { flag: "a+" });

        yield* file.write(new TextEncoder().encode("foo"));
        yield* file.seek(Fs.Size(0), "start");

        yield* file.write(new TextEncoder().encode("bar"));
        text = yield* fs.readFileString(path);
        expect(text).toBe("foobar");

        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(3))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("foo");

        yield* file.write(new TextEncoder().encode("baz"));
        text = yield* fs.readFileString(path);
        expect(text).toBe("foobarbaz");

        text = yield* pipe(
          Effect.flatten(file.readAlloc(Fs.Size(6))),
          Effect.map((_) => new TextDecoder().decode(_)),
        );
        expect(text).toBe("barbaz");
      }),
  );

  it.scoped(
    "should keep the current cursor if truncating doesn't affect it",
    ({ expect }) =>
      Effect.gen(function* () {
        const fs = yield* Fs.FileSystem;

        const path = yield* fs.makeTempFileScoped();
        const file = yield* fs.open(path, { flag: "w+" });

        yield* pipe(
          file.write(new TextEncoder().encode("lorem ipsum dolor sit amet")),
        );
        yield* file.seek(Fs.Size(6), "start");
        yield* file.truncate(Fs.Size(11));

        const cursor = yield* file.seek(Fs.Size(0), "current");
        expect(cursor).toBe(Fs.Size(6));
      }),
  );

  it.scoped(
    "should update the current cursor if truncating affects it",
    ({ expect }) =>
      Effect.gen(function* () {
        const fs = yield* Fs.FileSystem;

        const path = yield* fs.makeTempFileScoped();
        const file = yield* fs.open(path, { flag: "w+" });

        yield* pipe(
          file.write(new TextEncoder().encode("lorem ipsum dolor sit amet")),
        );
        yield* file.truncate(Fs.Size(11));

        const cursor = yield* file.seek(Fs.Size(0), "current");
        expect(cursor).toBe(Fs.Size(11));
      }),
  );
});
