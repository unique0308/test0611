// MONITORING_MODE=noop 时的空实现(MVP 默认)
// MONITORING_MODE=sentry 时的真实实现:全员推广前必做(后期补全清单 #5)
// 业务代码该埋点的地方都调用了,当前是 no-op,切换时只动本文件

type Context = Record<string, unknown>;

export function logError(err: unknown, context?: Context): void {
  if (process.env.MONITORING_MODE === "sentry") {
    // TODO: Sentry.captureException(err, { extra: context })
    return;
  }
  // noop 模式:打到 stderr 方便本地排错
  // eslint-disable-next-line no-console
  console.error("[monitoring:noop]", err, context);
}

export function recordMetric(name: string, value: number, tags?: Context): void {
  if (process.env.MONITORING_MODE === "sentry") {
    // TODO: Sentry.metrics.distribution(name, value, { tags })
    return;
  }
  // noop:不打 stdout 避免噪声
  void name;
  void value;
  void tags;
}

export function alertCritical(message: string, context?: Context): void {
  if (process.env.MONITORING_MODE === "sentry") {
    // TODO: 触发 Sentry critical + 飞书机器人
    return;
  }
  // eslint-disable-next-line no-console
  console.error(`[monitoring:noop] CRITICAL: ${message}`, context);
}
