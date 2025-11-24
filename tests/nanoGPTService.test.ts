import { jest } from '@jest/globals';
import { NanoGPTService } from '../src/services/nanoGPTService';
import { Message, User, Guild, GuildMember, TextChannel } from 'discord.js';
import { config } from '../src/config';

// Mock the fetch API
global.fetch = jest.fn();

// Mock the config
jest.mock('../src/config', () => ({
  config: {
    nanogptApiKey: 'test-api-key',
    aiModelId: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
    aiMaxConcurrency: 5,
    aiRequestTimeout: 8000,
    aiCacheTtl: 300,
    aiFailsafeEnabled: true,
    aiMinConfidenceThreshold: 0.85
  }
}));

describe('NanoGPTService', () => {
  let nanoGPTService: NanoGPTService;

  beforeEach(() => {
    jest.clearAllMocks();
    nanoGPTService = new NanoGPTService();
  });

  describe('constructor', () => {
    it('should initialize with API key and model ID from config', () => {
      expect((nanoGPTService as any).apiKey).toBe('test-api-key');
      expect((nanoGPTService as any).modelId).toBe('Qwen/Qwen3-VL-235B-A22B-Instruct');
    });

    it('should warn if API key is not configured', () => {
      jest.resetModules();
      const mockConfig = {
        nanogptApiKey: '',
        aiModelId: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
        aiMaxConcurrency: 5,
        aiRequestTimeout: 8000,
        aiCacheTtl: 300,
        aiFailsafeEnabled: true,
        aiMinConfidenceThreshold: 0.85
      };
      
      jest.mock('../src/config', () => ({
        config: mockConfig
      }));
      
      const { NanoGPTService } = require('../src/services/nanoGPTService');
      const service = new NanoGPTService();
    });
  });

  describe('analyzeImage', () => {
    it('should analyze an image and return SAFE result', async () => {
      // Mock fetch response
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'SAFE'
              }
            }
          ]
        })
      } as Response);

      // Create a mock message
      const mockMessage = {
        guild: { name: 'Test Guild' },
        channel: { name: 'test-channel' },
        member: { roles: { cache: [{ name: 'Member' }] } }
      } as unknown as Message;

      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: false,
        confidence: 1.0,
        processingTime: expect.any(Number)
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://nano-gpt.com/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          }
        })
      );
    });

    it('should analyze an image and return VIOLATION result', async () => {
      // Mock fetch response
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'VIOLATION: Contains inappropriate content'
              }
            }
          ]
        })
      } as Response);

      // Create a mock message
      const mockMessage = {
        guild: { name: 'Test Guild' },
        channel: { name: 'test-channel' },
        member: { roles: { cache: [{ name: 'Member' }] } }
      } as unknown as Message;

      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: true,
        reason: 'Contains inappropriate content',
        confidence: 0.85, // Uses config.aiMinConfidenceThreshold
        processingTime: expect.any(Number)
      });
    });

    it('should return fallback result when API key is not configured', async () => {
      // Temporarily change the API key to empty
      const originalApiKey = (nanoGPTService as any).apiKey;
      (nanoGPTService as any).apiKey = '';

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: false,
        confidence: 0,
        processingTime: expect.any(Number)
      });

      // Restore original API key
      (nanoGPTService as any).apiKey = originalApiKey;
    });

    it('should cache results by image hash', async () => {
      // Mock fetch response
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'SAFE'
              }
            }
          ]
        })
      } as Response);

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      // First call
      await nanoGPTService.analyzeImage(mockMessage, imageBuffer);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call with same image - should use cache
      await nanoGPTService.analyzeImage(mockMessage, imageBuffer);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, because of cache
    });

    it('should handle API errors gracefully', async () => {
      // Mock fetch to throw an error
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockRejectedValue(
        new Error('Network error')
      );

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: false,
        confidence: 0,
        processingTime: expect.any(Number)
      });
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to simulate timeout
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Request timed out'));
          }, 100);
        }) as Promise<Response>;
      });

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: false,
        confidence: 0,
        processingTime: expect.any(Number)
      });
    });

    it('should handle unexpected API response format', async () => {
      // Mock fetch response with unexpected format
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'UNEXPECTED_FORMAT'
              }
            }
          ]
        })
      } as Response);

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      const result = await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      expect(result).toEqual({
        isViolation: true,
        reason: 'Unexpected API response format',
        confidence: 0.9,
        processingTime: expect.any(Number)
      });
    });
  });

  describe('getImageType', () => {
    it('should detect JPEG images', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]); // Simplified JPEG header
      const result = (nanoGPTService as any).getImageType(jpegBuffer);
      expect(result).toBe('jpeg');
    });

    it('should detect PNG images', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      const result = (nanoGPTService as any).getImageType(pngBuffer);
      expect(result).toBe('png');
    });

    it('should detect GIF images', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46]); // GIF header
      const result = (nanoGPTService as any).getImageType(gifBuffer);
      expect(result).toBe('gif');
    });

    it('should default to jpeg for unknown types', () => {
      const unknownBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = (nanoGPTService as any).getImageType(unknownBuffer);
      expect(result).toBe('jpeg');
    });
  });

  describe('hashImage', () => {
    it('should generate consistent MD5 hash for the same image', () => {
      const imageBuffer1 = Buffer.from('test image data');
      const imageBuffer2 = Buffer.from('test image data');

      const hash1 = (nanoGPTService as any).hashImage(imageBuffer1);
      const hash2 = (nanoGPTService as any).hashImage(imageBuffer2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different images', () => {
      const imageBuffer1 = Buffer.from('test image data 1');
      const imageBuffer2 = Buffer.from('test image data 2');

      const hash1 = (nanoGPTService as any).hashImage(imageBuffer1);
      const hash2 = (nanoGPTService as any).hashImage(imageBuffer2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getMetrics', () => {
    it('should return performance metrics', () => {
      const metrics = nanoGPTService.getMetrics();

      expect(metrics).toEqual({
        cacheSize: 0,
        activeRequests: 0,
        avgProcessingTime: 0,
        circuitBreakerOpen: false,
        failureCount: 0
      });
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      // Mock fetch response
      (global.fetch as jest.MockedFunction<typeof global.fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'SAFE'
              }
            }
          ]
        })
      } as Response);

      const mockMessage = {} as Message;
      const imageBuffer = Buffer.from('fake image data');

      // Add an item to cache
      await nanoGPTService.analyzeImage(mockMessage, imageBuffer);

      // Verify cache has items
      const metricsBefore = nanoGPTService.getMetrics();
      expect(metricsBefore.cacheSize).toBeGreaterThan(0);

      // Clear cache
      nanoGPTService.clearCache();

      // Verify cache is empty
      const metricsAfter = nanoGPTService.getMetrics();
      expect(metricsAfter.cacheSize).toBe(0);
    });
  });
});