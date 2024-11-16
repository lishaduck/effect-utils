import type { Buffer } from "node:buffer";
import {
  type PlatformError,
  SystemError,
  type SystemErrorReason,
} from "@effect/platform/Error";

/** @internal */
export const handleErrnoException =
  (module: SystemError["module"], method: string) =>
  (
    err: Error,
    [path]: readonly [
      path?: string | URL | Buffer | number,
      ...args: unknown[],
    ] = [],
  ): PlatformError => {
    let reason: SystemErrorReason = "Unknown";

    switch (err.constructor) {
      case Deno.errors.NotFound:
        reason = "NotFound";
        break;
      case Deno.errors.InvalidData:
        reason = "InvalidData";
        break;

      case Deno.errors.TimedOut:
        reason = "TimedOut";
        break;

      case Deno.errors.UnexpectedEof:
        reason = "UnexpectedEof";
        break;

      case Deno.errors.PermissionDenied:
        reason = "PermissionDenied";
        break;

      case Deno.errors.AlreadyExists:
        reason = "AlreadyExists";
        break;

      case Deno.errors.BadResource:
      case Deno.errors.IsADirectory:
      case Deno.errors.NotADirectory:
      case Deno.errors.FilesystemLoop:
        reason = "BadResource";
        break;

      case Deno.errors.Busy:
        reason = "Busy";
        break;
    }

    return SystemError({
      reason,
      module,
      method,
      pathOrDescriptor:
        typeof path === "number" || typeof path === "string"
          ? path
          : (path?.toString() ?? ""),
      syscall: undefined, // TODO: Figure out how to syscall.
      message: err.message,
    });
  };
