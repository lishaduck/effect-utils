import * as KeyValueStore from "@effect/platform/KeyValueStore";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, type Layer, Option } from "effect";
import * as Kv from "../src/DenoKeyValueStore.ts";

describe.sequential("layerLocalStorage", () => {
  testLayer(Kv.layerLocalStorage);
});
describe.sequential("layerSessionStorage", () => {
  testLayer(Kv.layerSessionStorage);
});
describe.sequential("layerKv", () => {
  testLayer(Kv.layerKv);
});

const testLayer = <E>(
  layer: Layer.Layer<KeyValueStore.KeyValueStore, E>,
): void => {
  it.layer(layer)((it) => {
    afterEach(async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const kv = yield* KeyValueStore.KeyValueStore;
          yield* kv.clear;
        }).pipe(Effect.provide(layer)),
      );
    });

    it.effect("set", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("/foo/bar", "bar");

        const value = yield* kv.get("/foo/bar");
        const length = yield* kv.size;

        expect(value).toEqual(Option.some("bar"));
        expect(length).toEqual(1);
      }),
    );

    it.effect("get/ missing", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.clear;
        const value = yield* kv.get("foo");

        expect(value).toEqual(Option.none());
      }),
    );

    it.effect("remove", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");
        yield* kv.remove("foo");

        const value = yield* kv.get("foo");
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    );

    it.effect("clear", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");
        yield* kv.clear;

        const value = yield* kv.get("foo");
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    );

    it.effect("modify", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");

        const value = yield* kv.modify("foo", (v) => `${v}bar`);
        const length = yield* kv.size;

        expect(value).toEqual(Option.some("barbar"));
        expect(length).toEqual(1);
      }),
    );

    it.effect("modify - none", () =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;

        const value = yield* kv.modify("foo", (v) => `${v}bar`);
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    );
  });
};
