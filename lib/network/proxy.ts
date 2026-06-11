const GLOBAL_KEY = "__aiPlatformProxyConfigured";

declare global {
  // eslint-disable-next-line no-var
  var __aiPlatformProxyConfigured: boolean | undefined;
}

export function configureNodeProxyFromEnv(): void {
  if (globalThis[GLOBAL_KEY]) return;

  const hasProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (hasProxy) {
    // Keep undici out of Next/Webpack's static graph. Some undici internals use
    // node: built-in specifiers that Next dev can try to bundle otherwise.
    const requireFn = eval("require") as NodeRequire;
    const { EnvHttpProxyAgent, setGlobalDispatcher } = requireFn("undici") as typeof import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }

  globalThis[GLOBAL_KEY] = true;
}
