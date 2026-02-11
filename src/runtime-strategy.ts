import { ContainerRuntime } from './container-runtime.js';

export interface RuntimeStrategy {
  useContainer: boolean;
  allowFallbackToDirect: boolean;
}

export function getRuntimeStrategy(
  configuredRuntime: string | undefined,
  detectedRuntime: ContainerRuntime,
): RuntimeStrategy {
  const runtime = configuredRuntime || 'auto';

  if (runtime === 'none' || detectedRuntime === ContainerRuntime.NONE) {
    return {
      useContainer: false,
      allowFallbackToDirect: false,
    };
  }

  if (runtime === 'auto') {
    return {
      useContainer: true,
      allowFallbackToDirect: true,
    };
  }

  return {
    useContainer: true,
    allowFallbackToDirect: false,
  };
}
