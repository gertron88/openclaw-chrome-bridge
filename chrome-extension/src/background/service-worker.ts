import { ConnectionManager } from './connection';
import { AuthManager } from './auth';
import { SyncStorageManager, SessionStorageManager, initializeDeviceId } from '@/lib/storage';
import { ExtensionMessage } from '@/types';

// Global connection managers for each agent
const connectionManagers: Map<string, ConnectionManager> = new Map();

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Initialize device ID
  await initializeDeviceId();
  
  // Set up periodic cleanup alarm
  chrome.alarms.create('cleanup-scrollback', { 
    delayInMinutes: 60, // Run every hour
    periodInMinutes: 60 
  });
  
  // Set up connection health check alarm
  chrome.alarms.create('connection-health', {
    delayInMinutes: 5, // Run every 5 minutes
    periodInMinutes: 5
  });

  // Prefer the Chrome side panel for chat workflows
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'cleanup-scrollback':
      await SessionStorageManager.cleanupExpiredScrollback();
      console.log('Cleaned up expired scrollback');
      break;
      
    case 'connection-health':
      await checkConnectionHealth();
      break;
  }
});


async function getPreferredPanelTarget(sender: chrome.runtime.MessageSender): Promise<{ windowId: number; tabId?: number } | null> {
  const senderWindowId = sender.tab?.windowId;
  const senderTabId = sender.tab?.id;

  if (senderWindowId !== undefined) {
    return { windowId: senderWindowId, tabId: senderTabId };
  }

  const focusedWindow = await chrome.windows.getLastFocused();
  if (!focusedWindow.id) {
    return null;
  }

  const tabs = await chrome.tabs.query({ windowId: focusedWindow.id, active: true });
  const activeTab = tabs[0];

  return {
    windowId: focusedWindow.id,
    tabId: activeTab?.id,
  };
}

async function configureSidePanelPath(
  sender: chrome.runtime.MessageSender,
  path: string
): Promise<boolean> {
  if (!chrome.sidePanel?.setOptions) {
    return false;
  }

  const target = await getPreferredPanelTarget(sender);
  if (!target?.tabId) {
    return false;
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId: target.tabId,
      path,
      enabled: true,
    });
    return true;
  } catch (error) {
    console.warn('Unable to configure side panel path, will use fallback navigation:', error);
    return false;
  }
}

// Handle messages from UI components
chrome.runtime.onMessage.addListener((request: ExtensionMessage, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep message channel open for async responses
});

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  await initializeConnections();
});

/**
 * Initialize connections for all authenticated agents
 */
async function initializeConnections(): Promise<void> {
  try {
    const agents = await SyncStorageManager.getAgents();
    
    for (const [agentId, agent] of Object.entries(agents)) {
      const isAuthenticated = await AuthManager.isAgentAuthenticated(agentId);
      
      if (isAuthenticated) {
        const manager = getConnectionManager(agentId);
        await manager.connect();
        console.log('Connected to agent:', agent.display_name);
      }
    }
  } catch (error) {
    console.error('Failed to initialize connections:', error);
  }
}

/**
 * Get or create connection manager for an agent
 */
function getConnectionManager(agentId: string): ConnectionManager {
  let manager = connectionManagers.get(agentId);
  
  if (!manager) {
    manager = new ConnectionManager(agentId);
    connectionManagers.set(agentId, manager);
  }
  
  return manager;
}

/**
 * Handle messages from UI components
 */
async function handleMessage(
  message: ExtensionMessage, 
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    switch (message.type) {
      case 'get_agents':
        const agents = await SyncStorageManager.getAgents();
        sendResponse({ success: true, agents });
        break;

      case 'connect_agent':
        const manager = getConnectionManager(message.agent_id);
        await manager.connect();
        sendResponse({ success: true });
        break;

      case 'disconnect_agent':
        const disconnectManager = connectionManagers.get(message.agent_id);
        if (disconnectManager) {
          disconnectManager.disconnect();
        }
        sendResponse({ success: true });
        break;

      case 'send_message':
        const sendManager = connectionManagers.get(message.agent_id);
        if (sendManager) {
          const requestId = await sendManager.sendChatMessage(
            message.session_id,
            message.text
          );
          sendResponse({ success: true, request_id: requestId });
        } else {
          sendResponse({ success: false, error: 'Agent not connected' });
        }
        break;

      case 'get_connection_status':
        const statusManager = connectionManagers.get(message.agent_id);
        const status = statusManager ? statusManager.getConnectionStatus() : 'disconnected';
        sendResponse({ success: true, status });
        break;

      case 'complete_pairing':
        try {
          const pairingResult = await AuthManager.completePairing(message.pairing_request);
          
          // Connect to the newly paired agent
          const newManager = getConnectionManager(pairingResult.agent_id);
          await newManager.connect();
          
          sendResponse({ success: true, result: pairingResult });
        } catch (error) {
          console.error('Pairing failed:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
        break;

      case 'remove_agent':
        // Disconnect and remove agent
        const removeManager = connectionManagers.get(message.agent_id);
        if (removeManager) {
          removeManager.disconnect();
          connectionManagers.delete(message.agent_id);
        }
        
        await AuthManager.removeAgent(message.agent_id);
        sendResponse({ success: true });
        break;

      case 'get_sessions':
        const sessions = await SessionStorageManager.getSessions();
        const agentSessions = Object.values(sessions).filter(
          session => session.agent_id === message.agent_id
        );
        sendResponse({ success: true, sessions: agentSessions });
        break;

      case 'get_remote_agents':
        try {
          const remoteAgents = await AuthManager.getAgentsList(message.agent_id);
          sendResponse({ success: true, agents: remoteAgents });
        } catch (error) {
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error), agents: [] });
        }
        break;

      case 'get_messages':
        const messages = await SessionStorageManager.getMessages(message.session_id);
        sendResponse({ success: true, messages });
        break;

      case 'create_session':
        const sessionId = `${message.agent_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = {
          id: sessionId,
          agent_id: message.agent_id,
          agent_name: message.agent_name || 'Unknown Agent',
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          message_count: 0,
        };
        
        await SessionStorageManager.setSession(sessionId, session);
        sendResponse({ success: true, session });
        break;

      case 'open_chat':
        const settings = await chrome.storage.sync.get(['connection_mode', 'local_webui_url']);
        const connectionMode = settings.connection_mode as string | undefined;

        if (connectionMode === 'local_webui' && settings.local_webui_url) {
          chrome.tabs.create({ url: settings.local_webui_url });
        } else if (!(await configureSidePanelPath(sender, 'chat.html'))) {
          chrome.tabs.create({ url: chrome.runtime.getURL('chat.html') });
        }
        sendResponse({ success: true });
        break;

      case 'open_pairing':
        if (!(await configureSidePanelPath(sender, 'pairing.html'))) {
          chrome.tabs.create({ url: chrome.runtime.getURL('pairing.html') });
        }
        sendResponse({ success: true });
        break;

      default:
        console.warn('Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Check connection health and reconnect if needed
 */
async function checkConnectionHealth(): Promise<void> {
  const agents = await SyncStorageManager.getAgents();
  
  for (const [agentId, agent] of Object.entries(agents)) {
    const isAuthenticated = await AuthManager.isAgentAuthenticated(agentId);
    
    if (isAuthenticated) {
      const manager = connectionManagers.get(agentId);
      
      if (!manager || !manager.isConnected()) {
        console.log('Reconnecting to agent:', agent.display_name);
        const reconnectManager = getConnectionManager(agentId);
        await reconnectManager.connect();
      }
    }
  }
}

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener((details) => {
  console.log('Extension update available:', details);
  // Optionally reload the extension
  // chrome.runtime.reload();
});

// Handle extension suspension (mobile)
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, closing connections');
  
  // Close all connections gracefully
  for (const manager of connectionManagers.values()) {
    manager.disconnect();
  }
});

// Export for debugging
if (typeof window !== 'undefined') {
  (window as any).connectionManagers = connectionManagers;
  (window as any).AuthManager = AuthManager;
}
