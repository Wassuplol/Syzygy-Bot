import { Message, User } from 'discord.js';
import { config } from '../config';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface VisionAnalysisResult {
  isViolation: boolean;
  reason?: string;
  confidence: number;
  processingTime: number;
}

export interface NanoGPTAPIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class NanoGPTService {
  private apiKey: string;
  private baseUrl: string = 'https://nano-gpt.com/api/v1/chat/completions';
  private modelId: string;
  private cache = new Map<string, { result: VisionAnalysisResult; timestamp: number }>();
  private requestQueue: Array<() => Promise<VisionAnalysisResult>> = [];
  private activeRequests = 0;
  private circuitBreakerOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private processingTimes: number[] = [];

  constructor() {
    this.apiKey = config.nanogptApiKey;
    this.modelId = config.aiModelId;
    
    if (!this.apiKey) {
      logger.warn('NanoGPT API key not found. AI image moderation will be disabled.');
    }
  }

  /**
   * Analyzes an image attachment using the NanoGPT vision model
   * @param message The Discord message containing the image
   * @param imageBuffer The image buffer to analyze
   * @returns VisionAnalysisResult with violation status and details
   */
  async analyzeImage(message: Message, imageBuffer: Buffer): Promise<VisionAnalysisResult> {
    const startTime = Date.now();
    
    // Create a hash of the image for caching
    const imageHash = this.hashImage(imageBuffer);
    
    // Check cache first
    const cached = this.cache.get(imageHash);
    if (cached && (Date.now() - cached.timestamp) < config.aiCacheTtl * 1000) {
      logger.debug(`Image analysis cache hit for hash: ${imageHash}`);
      return cached.result;
    }

    // Check if circuit breaker is open
    if (this.circuitBreakerOpen) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > 30000) { // 30 seconds
        // Try to reset circuit breaker after 30 seconds
        this.circuitBreakerOpen = false;
        this.failureCount = 0;
        logger.info('Circuit breaker reset after 30 seconds');
      } else {
        logger.warn('Circuit breaker is open, returning fallback result');
        return {
          isViolation: false,
          confidence: 0,
          processingTime: Date.now() - startTime
        };
      }
    }

    // If we're at max concurrency, add to queue
    if (this.activeRequests >= config.aiMaxConcurrency) {
      return new Promise((resolve, reject) => {
        // Limit queue size to prevent memory issues
        if (this.requestQueue.length >= 20) {
          logger.warn('Request queue is full, rejecting image analysis request');
          reject(new Error('Too many concurrent requests'));
          return;
        }
        
        this.requestQueue.push(() => this.processImage(message, imageBuffer, startTime));
      });
    }

    return this.processImage(message, imageBuffer, startTime);
  }

  private async processImage(message: Message, imageBuffer: Buffer, startTime: number): Promise<VisionAnalysisResult> {
    this.activeRequests++;
    
    try {
      const result = await this.callNanoGPTAPI(message, imageBuffer);
      
      // Cache the result
      const imageHash = this.hashImage(imageBuffer);
      this.cache.set(imageHash, {
        result,
        timestamp: Date.now()
      });
      
      // Clean old cache entries (older than 10 minutes)
      this.cleanupCache();
      
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      // Keep only last 100 processing times for performance metrics
      if (this.processingTimes.length > 100) {
        this.processingTimes = this.processingTimes.slice(-100);
      }
      
      result.processingTime = processingTime;
      
      return result;
    } catch (error) {
      logger.error(`Error analyzing image: ${error.message}`, { error });
      
      // Increment failure count for circuit breaker
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= 5) {
        this.circuitBreakerOpen = true;
        logger.warn('Circuit breaker opened due to repeated failures');
      }
      
      // Return fallback result
      return {
        isViolation: false,
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    } finally {
      this.activeRequests--;
      
      // Process next request in queue if available
      if (this.requestQueue.length > 0 && this.activeRequests < config.aiMaxConcurrency) {
        const nextRequest = this.requestQueue.shift();
        if (nextRequest) {
          nextRequest().catch(err => logger.error('Error processing queued request', { err }));
        }
      }
    }
  }

  private async callNanoGPTAPI(message: Message, imageBuffer: Buffer): Promise<VisionAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('NanoGPT API key not configured');
    }

    // Convert image to base64
    const base64Image = imageBuffer.toString('base64');
    const imageType = this.getImageType(imageBuffer);
    
    // Prepare the payload for the API
    const payload = {
      model: this.modelId,
      messages: [
        {
          role: "system",
          content: "You are a Discord moderation AI. Analyze this image for NSFW content, hate symbols, or rule violations. Respond ONLY with 'VIOLATION: [reason]' or 'SAFE'."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Server context: ${message.guild?.name || 'Unknown'}, Channel: ${message.channel.isTextBased() ? message.channel.name : 'Unknown'}, User roles: ${message.member?.roles.cache.map(r => r.name).join(', ') || 'None'}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/${imageType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 100,
      temperature: 0.1
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.aiRequestTimeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      const data: NanoGPTAPIResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('Invalid API response: no choices returned');
      }

      const content = data.choices[0].message.content.trim();
      
      if (content.startsWith('VIOLATION:')) {
        const reason = content.substring(10).trim();
        return {
          isViolation: true,
          reason,
          confidence: config.aiMinConfidenceThreshold
        };
      } else if (content === 'SAFE') {
        return {
          isViolation: false,
          confidence: 1.0
        };
      } else {
        // If response doesn't match expected format, treat as violation for safety
        logger.warn(`Unexpected API response format: ${content}`);
        return {
          isViolation: true,
          reason: 'Unexpected API response format',
          confidence: 0.9
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      
      throw error;
    }
  }

  /**
   * Determines the image type based on the buffer
   */
  private getImageType(buffer: Buffer): string {
    // Check for JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[buffer.length - 2] === 0xFF && buffer[buffer.length - 1] === 0xD9) {
      return 'jpeg';
    }
    // Check for PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'png';
    }
    // Check for GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }
    // Default to jpeg if unknown
    return 'jpeg';
  }

  /**
   * Creates an MD5 hash of the image buffer
   */
  private hashImage(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Cleans up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > 600000) { // 10 minutes
        this.cache.delete(key);
      }
    }
  }

  /**
   * Gets performance metrics for the service
   */
  public getMetrics(): { 
    cacheSize: number; 
    activeRequests: number; 
    avgProcessingTime: number; 
    circuitBreakerOpen: boolean;
    failureCount: number;
  } {
    const avgProcessingTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length 
      : 0;
    
    return {
      cacheSize: this.cache.size,
      activeRequests: this.activeRequests,
      avgProcessingTime,
      circuitBreakerOpen: this.circuitBreakerOpen,
      failureCount: this.failureCount
    };
  }

  /**
   * Clears the cache (for testing purposes)
   */
  public clearCache(): void {
    this.cache.clear();
  }
}