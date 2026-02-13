#!/usr/bin/env node

/**
 * OpenClaw Agent Connector CLI
 * 
 * Simple command-line interface for testing the agent connector
 * with mock handlers before integrating with real OpenClaw
 */

import { AgentConnector } from './connector';
import { loadConfig } from './config';
import { createMockHandler, createAdvancedMockHandler } from './handlers/mock';

function printUsage() {
  console.log(`
OpenClaw Agent Connector CLI

Usage:
  openclaw-connector [command]

Commands:
  start                Start the connector with basic mock handler
  start-advanced       Start the connector with advanced mock handler
  pair                 Request a pairing code and display it
  help                 Show this help message

Environment Variables:
  RELAY_URL           WebSocket URL of the relay server (required)
  AGENT_ID           Unique identifier for this agent (required)
  AGENT_SECRET       Agent-specific secret for relay authentication (required)  
  AGENT_DISPLAY_NAME Display name for the agent (optional)

Example:
  RELAY_URL=wss://relay.example.com AGENT_ID=test-agent AGENT_SECRET=secret123 openclaw-connector start
`);
}

async function startConnector(useAdvancedHandler = false) {
  try {
    console.log('Loading configuration...');
    const config = loadConfig();
    
    console.log('Initializing Agent Connector...');
    console.log(`- Relay URL: ${config.relayUrl}`);
    console.log(`- Agent ID: ${config.agentId}`);
    console.log(`- Display Name: ${config.agentDisplayName}`);
    console.log(`- Handler: ${useAdvancedHandler ? 'Advanced Mock' : 'Basic Mock'}`);
    
    const connector = new AgentConnector(config);

    // Set up event handlers
    connector.on('connected', () => {
      console.log('✅ Connected to relay server');
    });

    connector.on('disconnected', () => {
      console.log('❌ Disconnected from relay server');
    });

    connector.on('error', (error) => {
      console.error('🚨 Connector error:', error.message);
    });

    connector.on('chatRequest', (request) => {
      console.log(`💬 Chat request received from session ${request.session_id}: "${request.text}"`);
    });

    // Register the appropriate handler
    const handler = useAdvancedHandler ? createAdvancedMockHandler() : createMockHandler();
    connector.onChatRequest(handler);

    console.log('\nConnecting to relay...');
    await connector.connect();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down...');
      await connector.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\nShutting down...');
      await connector.disconnect();
      process.exit(0);
    });

    console.log('\n🚀 Agent connector is running. Press Ctrl+C to stop.');
    console.log('💡 Use the "pair" command to get a pairing code for the Chrome extension.');

  } catch (error) {
    console.error('❌ Failed to start connector:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function requestPairingCode() {
  try {
    console.log('Loading configuration...');
    const config = loadConfig();
    
    console.log('Requesting pairing code...');
    const connector = new AgentConnector(config);
    
    const { code, expiresAt } = await connector.requestPairingCode();
    
    console.log('\n✅ Pairing code generated successfully!');
    console.log(`📋 Pairing Code: ${code}`);
    console.log(`⏰ Expires At: ${expiresAt.toLocaleString()}`);
    console.log(`🕐 Time remaining: ${Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60)} minutes`);
    console.log('\n💡 Enter this code in the Chrome extension to pair with this agent.');
    
  } catch (error) {
    console.error('❌ Failed to request pairing code:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main() {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'start':
      await startConnector(false);
      break;
      
    case 'start-advanced':
      await startConnector(true);
      break;
      
    case 'pair':
      await requestPairingCode();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}