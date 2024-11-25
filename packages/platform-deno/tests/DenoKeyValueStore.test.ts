import * as Kv from "@effect/platform-browser/BrowserKeyValueStore";
import * as KeyValueStore from "@effect/platform/KeyValueStore";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect, type Layer, Option } from "effect";

describe.sequential("KeyValueStore / layerLocalStorage", () => {
  testLayer(Kv.layerLocalStorage);
});
describe.sequential("KeyValueStore / layerSessionStorage", () => {
  testLayer(Kv.layerSessionStorage);
});

const testLayer = <E>(
  layer: Layer.Layer<KeyValueStore.KeyValueStore, E>,
): void => {
  const run = <E, A>(
    effect: Effect.Effect<A, E, KeyValueStore.KeyValueStore>,
  ): Promise<A> => Effect.runPromise(Effect.provide(effect, layer));

  afterEach(async () => {
    await run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.clear;
      }),
    );
  });

  it("set", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("/foo/bar", "bar");

        const value = yield* kv.get("/foo/bar");
        const length = yield* kv.size;

        expect(value).toEqual(Option.some("bar"));
        expect(length).toEqual(1);
      }),
    ));

  it("get/ missing", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.clear;
        const value = yield* kv.get("foo");

        expect(value).toEqual(Option.none());
      }),
    ));

  it("remove", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");
        yield* kv.remove("foo");

        const value = yield* kv.get("foo");
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    ));

  it("clear", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");
        yield* kv.clear;

        const value = yield* kv.get("foo");
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    ));

  it("modify", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        yield* kv.set("foo", "bar");

        const value = yield* kv.modify("foo", (v) => `${v}bar`);
        const length = yield* kv.size;

        expect(value).toEqual(Option.some("barbar"));
        expect(length).toEqual(1);
      }),
    ));

  it("modify - none", () =>
    run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;

        const value = yield* kv.modify("foo", (v) => `${v}bar`);
        const length = yield* kv.size;

        expect(value).toEqual(Option.none());
        expect(length).toEqual(0);
      }),
    ));
};
