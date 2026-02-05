/**
 * @openclaw/protocol - Shared TypeScript types and schemas for OpenClaw Chrome Bridge
 * 
 * This package provides:
 * - Zod schemas for WebSocket message validation
 * - Zod schemas for REST API request/response validation  
 * - TypeScript types with full type inference
 * - Shared constants and configuration
 * - Type guards and helper functions
 */

// Export all constants
export * from './constants';

// Export all WebSocket message schemas and types
export * from './messages';

// Export all REST API schemas and types
export * from './api';

// Re-export zod for convenience
export { z } from 'zod';