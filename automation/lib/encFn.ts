export function encode(fn: Function, ...args: unknown[]): string | undefined {
  if (typeof fn !== "function") {
    return undefined;
  }

  const fnstr = fn.toString();

  return `(${fnstr})(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

export function decode(code: string): unknown {
  if (typeof code !== "string") {
    return undefined;
  }

  let __tmp__: unknown = undefined;
  eval("__tmp__ = " + code);

  return __tmp__;
}
