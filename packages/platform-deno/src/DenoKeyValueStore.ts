/**
 * @since 1.0.0
 */
import * as KeyValueStore from "@effect/platform/KeyValueStore";
import type * as Layer from "effect/Layer";

/**
 * Creates a {@linkcode KeyValueStore} layer that uses the Web-native {@linkcode localStorage} API.
 *
 * Values are stored between sessions.
 *
 * @since 1.0.0
 * @category models
 */
export const layerLocalStorage: Layer.Layer<KeyValueStore.KeyValueStore> =
  KeyValueStore.layerStorage(() => localStorage);

/**
 * Creates a {@linkcode KeyValueStore} layer that uses the Web-native {@linkcode sessionStorage} API.
 *
 * Values are stored only for the current session.
 *
 * @since 1.0.0
 * @category models
 */
export const layerSessionStorage: Layer.Layer<KeyValueStore.KeyValueStore> =
  KeyValueStore.layerStorage(() => sessionStorage);
