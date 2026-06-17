import { err, ok, Result, type Result as ResultType } from "neverthrow";

export const parseJson = <E>(
  text: string,
  toError: (cause: unknown) => E,
): ResultType<unknown, E> =>
  Result.fromThrowable((value: string): unknown => JSON.parse(value) as unknown, toError)(text);

export const nonEmptyTrimmed = <E>(value: string, error: E): ResultType<string, E> => {
  const trimmed = value.trim();

  return trimmed.length > 0 ? ok(trimmed) : err(error);
};
