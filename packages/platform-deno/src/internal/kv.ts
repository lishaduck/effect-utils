import { KeyValueStore } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, Option } from "effect";

export const makeKvStore = (): Effect.Effect<KeyValueStore.KeyValueStore> =>
  Effect.promise(async () => {
    const store = await Deno.openKv();
    const encoder = new TextEncoder();

    const get = (key: string): Effect.Effect<Option.Option<string>> =>
      Effect.promise(async () => {
        const val = await store.get([key]);
        const value = val.value;

        if (value == null) return Option.none();
        if (typeof value === "string") return Option.some(value);

        return Option.none();
      });

    const getUint8Array = (
      key: string,
    ): Effect.Effect<Option.Option<Uint8Array>> =>
      Effect.gen(function* () {
        const val = yield* Effect.promise(async () => await store.get([key]));

        const value = Option.fromNullable(val.key[0]);

        return value.pipe(
          Option.flatMap((value) => {
            if (typeof value === "string") {
              return Option.some(encoder.encode(value));
            }
            if (value instanceof Uint8Array) {
              return Option.some(value);
            }

            return Option.none();
          }),
        );
      });

    const modifyUint8Array = (
      key: string,
      f: (value: Uint8Array) => Uint8Array,
    ): Effect.Effect<Option.Option<Uint8Array>, PlatformError> =>
      Effect.flatMap(getUint8Array(key), (o) => {
        if (Option.isNone(o)) {
          return Effect.succeedNone;
        }
        const newValue = f(o.value);
        return Effect.as(set(key, newValue), Option.some(newValue));
      });

    const set = (
      key: string,
      value: string | Uint8Array,
    ): Effect.Effect<void> =>
      Effect.promise(async () => {
        await store.set([key], value);
      });

    const remove = (key: string): Effect.Effect<void> =>
      Effect.promise(async () => {
        await store.delete([key]);
      });

    const getAll = <T>(): Deno.KvListIterator<T> =>
      store.list<T>({ prefix: [] });

    const clear = Effect.promise(async () => {
      const entries = getAll();

      const promises: Promise<void>[] = [];

      for await (const entry of entries) {
        promises.push(store.delete(entry.key));
      }

      await Promise.all(promises);
    });

    const size = Effect.promise(async () => {
      const entries = getAll();

      let size = 0;
      for await (const _ of entries) {
        size++;
      }
      return size;
    });

    return KeyValueStore.make({
      get,
      getUint8Array,
      modifyUint8Array,
      set,
      remove,
      clear,
      size,
    });
  });
