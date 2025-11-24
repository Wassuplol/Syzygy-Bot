import { Logger } from '../utils/logger';
import os from 'os';
import { performance } from 'perf_hooks';

export class PerformanceMonitor {
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkInterval: number = 30000; // 30 seconds
  private metrics: {
    memoryUsage: number[];
    cpuUsage: number[];
    responseTimes: number[];
    commandCount: number;
  };

  constructor() {
    this.logger = new Logger('PerformanceMonitor');
    this.metrics = {
      memoryUsage: [],
      cpuUsage: [],
      responseTimes: [],
      commandCount: 0
    };
  }

  public startMonitoring(): void {
    if (this.intervalId) {
      this.logger.warn('Performance monitoring is already running');
      return;
    }

    this.logger.info('Starting performance monitoring...');
    
    // Initial metrics collection
    this.collectMetrics();
    
    // Set up periodic monitoring
    this.intervalId = setInterval(() => {
      this.collectMetrics();
      this.checkPerformanceThresholds();
    }, this.checkInterval);
  }

  public stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Performance monitoring stopped');
    }
  }

  public recordCommandExecution(duration: number): void {
    this.metrics.responseTimes.push(duration);
    this.metrics.commandCount++;
    
    // Keep only the last 1000 measurements
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }
  }

  public recordPerformance(operation: string, duration: number, details?: Record<string, any>): void {
    this.logger.performance(operation, duration, details);
  }

  private collectMetrics(): void {
    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memoryMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    this.metrics.memoryUsage.push(memoryMb);
    
    // Keep only the last 100 measurements
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
    }
    
    // CPU usage (approximation)
    const cpuUsage = this.getCpuUsage();
    this.metrics.cpuUsage.push(cpuUsage);
    
    // Keep only the last 100 measurements
    if (this.metrics.cpuUsage.length > 100) {
      this.metrics.cpuUsage = this.metrics.cpuUsage.slice(-100);
    }
    
    // Log current metrics
    this.logger.debug('Performance metrics collected', {
      memoryMb,
      cpuUsage: `${cpuUsage.toFixed(2)}%`,
      avgResponseTime: this.getAverageResponseTime(),
      commandCount: this.metrics.commandCount
    });
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        // @ts-ignore
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    const avgIdle = totalIdle / cpus.length;
    const avgTotal = totalTick / cpus.length;

    return Math.round((1 - avgIdle / avgTotal) * 100);
  }

  private getAverageResponseTime(): number {
    if (this.metrics.responseTimes.length === 0) return 0;
    
    const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.metrics.responseTimes.length);
  }

  private getAverageMemoryUsage(): number {
    if (this.metrics.memoryUsage.length === 0) return 0;
    
    const sum = this.metrics.memoryUsage.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.metrics.memoryUsage.length);
  }

  private getAverageCpuUsage(): number {
    if (this.metrics.cpuUsage.length === 0) return 0;
    
    const sum = this.metrics.cpuUsage.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.metrics.cpuUsage.length);
  }

  private checkPerformanceThresholds(): void {
    const avgMemory = this.getAverageMemoryUsage();
    const avgCpu = this.getAverageCpuUsage();
    const avgResponseTime = this.getAverageResponseTime();
    
    // Check if we're approaching resource limits
    const config = {
      maxMemoryUsage: 512, // MB
      cpuThreshold: 70, // Percentage
      maxResponseTime: 1000 // ms
    };
    
    if (avgMemory > config.maxMemoryUsage * 0.8) {
      this.logger.warn('Memory usage approaching threshold', {
        current: avgMemory,
        threshold: config.maxMemoryUsage
      });
    }
    
    if (avgCpu > config.cpuThreshold * 0.8) {
      this.logger.warn('CPU usage approaching threshold', {
        current: avgCpu,
        threshold: config.cpuThreshold
      });
    }
    
    if (avgResponseTime > config.maxResponseTime * 0.8) {
      this.logger.warn('Response time approaching threshold', {
        current: avgResponseTime,
        threshold: config.maxResponseTime
      });
    }
    
    // Log performance summary
    this.logger.info('Performance Summary', {
      avgMemoryUsage: `${avgMemory}MB`,
      avgCpuUsage: `${avgCpu}%`,
      avgResponseTime: `${avgResponseTime}ms`,
      commandCount: this.metrics.commandCount,
      uptime: Math.round(process.uptime())
    });
  }

  public getPerformanceReport(): any {
    return {
      memory: {
        current: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        average: this.getAverageMemoryUsage(),
        max: Math.max(...this.metrics.memoryUsage),
        min: Math.min(...this.metrics.memoryUsage)
      },
      cpu: {
        average: this.getAverageCpuUsage(),
        max: Math.max(...this.metrics.cpuUsage),
        min: Math.min(...this.metrics.cpuUsage)
      },
      response: {
        average: this.getAverageResponseTime(),
        totalCommands: this.metrics.commandCount
      },
      system: {
        uptime: process.uptime(),
        platform: os.platform(),
        arch: os.arch(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      }
    };
  }

  public measureFunction<T>(fn: () => T, operationName: string): T {
    const start = performance.now();
    try {
      const result = fn();
      const end = performance.now();
      const duration = Math.round(end - start);
      
      this.recordPerformance(operationName, duration);
      this.recordCommandExecution(duration);
      
      return result;
    } catch (error) {
      const end = performance.now();
      const duration = Math.round(end - start);
      
      this.recordPerformance(`${operationName} (error)`, duration);
      
      throw error;
    }
  }

  public async measureAsyncFunction<T>(fn: () => Promise<T>, operationName: string): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      const duration = Math.round(end - start);
      
      this.recordPerformance(operationName, duration);
      this.recordCommandExecution(duration);
      
      return result;
    } catch (error) {
      const end = performance.now();
      const duration = Math.round(end - start);
      
      this.recordPerformance(`${operationName} (error)`, duration);
      
      throw error;
    }
  }
}