import './popup.css';
import { Agent, ExtensionMessage, ConnectionStatusEvent, AgentStatusEvent } from '@/types';

class PopupManager {
  private agents: Record<string, Agent> = {};
  
  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.bindEvents();
    await this.loadAgents();
    this.setupMessageListener();
  }

  private bindEvents(): void {
    // Pair agent buttons
    document.getElementById('pair-agent-btn')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

    document.querySelector('.empty-state .btn')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

    // Footer buttons
    document.getElementById('open-chat-btn')?.addEventListener('click', () => {
      this.openChatInterface();
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.openSettings();
    });

    document.getElementById('settings-backdrop')?.addEventListener('click', () => {
      this.closeSettings();
    });

    document.getElementById('cancel-settings-btn')?.addEventListener('click', () => {
      this.closeSettings();
    });

    document.getElementById('save-settings-btn')?.addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('connection-mode')?.addEventListener('change', () => {
      this.updateSettingsVisibility();
    });

    document.getElementById('relay-type')?.addEventListener('change', () => {
      this.updateSettingsVisibility();
    });
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
      switch (message.type) {
        case 'connection_status':
          this.handleConnectionStatus(message as ConnectionStatusEvent);
          break;
        case 'agent_status':
          this.handleAgentStatus(message as AgentStatusEvent);
          break;
      }
    });
  }

  private async loadAgents(): Promise<void> {
    this.showLoading();

    try {
      const response = await this.sendMessage({ type: 'get_agents' });
      
      if (response.success) {
        this.agents = response.agents;
        this.renderAgents();
      } else {
        this.showError('Failed to load agents');
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      this.showError('Failed to load agents');
    }
  }

  private renderAgents(): void {
    const noAgentsElement = document.getElementById('no-agents');
    const agentsListElement = document.getElementById('agents-list');
    const loadingElement = document.getElementById('loading');
    const agentsContainer = document.getElementById('agents-container');
    const agentsCount = document.getElementById('agents-count');

    // Hide loading
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }

    const agentEntries = Object.entries(this.agents);

    if (agentEntries.length === 0) {
      // Show empty state
      if (noAgentsElement) {
        noAgentsElement.style.display = 'block';
      }
      if (agentsListElement) {
        agentsListElement.style.display = 'none';
      }
    } else {
      // Show agents list
      if (noAgentsElement) {
        noAgentsElement.style.display = 'none';
      }
      if (agentsListElement) {
        agentsListElement.style.display = 'block';
      }

      // Update count
      if (agentsCount) {
        agentsCount.textContent = agentEntries.length.toString();
      }

      // Render agent items
      if (agentsContainer) {
        agentsContainer.innerHTML = '';
        
        agentEntries.forEach(([agentId, agent]) => {
          const agentElement = this.createAgentElement(agentId, agent);
          agentsContainer.appendChild(agentElement);
        });
      }
    }
  }

  private createAgentElement(agentId: string, agent: Agent): HTMLElement {
    const template = document.getElementById('agent-item-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const agentItem = clone.querySelector('.agent-item') as HTMLElement;

    // Set agent ID
    agentItem.dataset.agentId = agentId;

    // Set agent name
    const agentName = clone.querySelector('.agent-name') as HTMLElement;
    agentName.textContent = agent.display_name;

    // Set status
    const agentStatus = clone.querySelector('.agent-status') as HTMLElement;
    const agentStatusText = clone.querySelector('.agent-status-text') as HTMLElement;
    
    if (agent.online) {
      agentStatus.classList.add('online');
      agentStatusText.textContent = 'Online';
      agentStatusText.classList.add('online');
    } else {
      agentStatus.classList.remove('online');
      agentStatusText.textContent = agent.last_seen ? `Last seen ${this.formatLastSeen(agent.last_seen)}` : 'Offline';
      agentStatusText.classList.remove('online');
    }

    // Bind events
    const chatBtn = clone.querySelector('.chat-btn') as HTMLElement;
    chatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openChatForAgent(agentId, agent.display_name);
    });

    const removeBtn = clone.querySelector('.remove-btn') as HTMLElement;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeAgent(agentId, agent.display_name);
    });

    // Make entire item clickable for chat
    agentItem.addEventListener('click', () => {
      this.openChatForAgent(agentId, agent.display_name);
    });

    return agentItem;
  }


  private async openSettings(): Promise<void> {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const stored = await chrome.storage.sync.get([
      'connection_mode',
      'relay_configs',
      'active_relay_config',
      'local_webui_url',
    ]);

    const mode = (stored.connection_mode as string) || 'relay';
    const relayConfigs = stored.relay_configs || {};
    const activeRelay = (stored.active_relay_config as string) || 'hosted';
    const activeConfig = relayConfigs[activeRelay] || relayConfigs.hosted || null;

    (document.getElementById('connection-mode') as HTMLSelectElement).value = mode;
    (document.getElementById('relay-type') as HTMLSelectElement).value = activeConfig?.type === 'custom' ? 'custom' : 'hosted';
    (document.getElementById('custom-relay-url') as HTMLInputElement).value = activeConfig?.type === 'custom' ? activeConfig.url : '';
    (document.getElementById('local-webui-url') as HTMLInputElement).value = (stored.local_webui_url as string) || 'http://127.0.0.1:18789/chat?session=agent:main:main';

    this.updateSettingsVisibility();
    modal.style.display = 'block';
  }

  private closeSettings(): void {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
  }

  private updateSettingsVisibility(): void {
    const mode = (document.getElementById('connection-mode') as HTMLSelectElement)?.value || 'relay';
    const relayType = (document.getElementById('relay-type') as HTMLSelectElement)?.value || 'hosted';

    const relayGroup = document.getElementById('relay-settings-group');
    const localGroup = document.getElementById('local-settings-group');
    const customInput = document.getElementById('custom-relay-url') as HTMLInputElement;

    if (relayGroup) relayGroup.style.display = mode === 'relay' ? 'block' : 'none';
    if (localGroup) localGroup.style.display = mode === 'local_webui' ? 'block' : 'none';
    if (customInput) customInput.style.display = relayType === 'custom' ? 'block' : 'none';
  }

  private async saveSettings(): Promise<void> {
    const mode = (document.getElementById('connection-mode') as HTMLSelectElement).value;
    const relayType = (document.getElementById('relay-type') as HTMLSelectElement).value;
    const customRelayUrl = (document.getElementById('custom-relay-url') as HTMLInputElement).value.trim();
    const localWebUiUrl = (document.getElementById('local-webui-url') as HTMLInputElement).value.trim();

    const stored = await chrome.storage.sync.get('relay_configs');
    const relayConfigs = stored.relay_configs || {};

    if (mode === 'relay') {
      if (relayType === 'custom') {
        if (!customRelayUrl) {
          alert('Please enter a custom relay URL.');
          return;
        }

        relayConfigs[customRelayUrl] = {
          type: 'custom',
          url: customRelayUrl,
          display_name: 'Custom Relay',
        };

        await chrome.storage.sync.set({
          relay_configs: relayConfigs,
          active_relay_config: customRelayUrl,
          connection_mode: 'relay',
        });
      } else {
        relayConfigs.hosted = {
          type: 'hosted',
          url: 'https://openclaw-chrome-relay.gertron88.workers.dev',
          display_name: 'OpenClaw Hosted',
        };

        await chrome.storage.sync.set({
          relay_configs: relayConfigs,
          active_relay_config: 'hosted',
          connection_mode: 'relay',
        });
      }
    } else {
      if (!localWebUiUrl) {
        alert('Please enter a local web UI URL.');
        return;
      }

      await chrome.storage.sync.set({
        connection_mode: 'local_webui',
        local_webui_url: localWebUiUrl,
      });
    }

    this.closeSettings();
  }

  private showLoading(): void {
    const noAgentsElement = document.getElementById('no-agents');
    const agentsListElement = document.getElementById('agents-list');
    const loadingElement = document.getElementById('loading');

    if (noAgentsElement) {
      noAgentsElement.style.display = 'none';
    }
    if (agentsListElement) {
      agentsListElement.style.display = 'none';
    }
    if (loadingElement) {
      loadingElement.style.display = 'block';
    }
  }

  private showError(message: string): void {
    // Simple error display - could be enhanced with a proper error UI
    console.error(message);
  }

  private async openPairingScreen(): Promise<void> {
    try {
      await this.sendMessage({ type: 'open_pairing' });
      window.close(); // Close popup after opening pairing
    } catch (error) {
      console.error('Failed to open pairing screen:', error);
    }
  }

  private async openChatInterface(): Promise<void> {
    try {
      await this.sendMessage({ type: 'open_chat' });
      window.close(); // Close popup after opening chat
    } catch (error) {
      console.error('Failed to open chat interface:', error);
    }
  }

  private async openChatForAgent(agentId: string, agentName: string): Promise<void> {
    try {
      // Store the selected agent for the chat interface
      await chrome.storage.session.set({ 
        selected_agent_id: agentId,
        selected_agent_name: agentName 
      });
      
      await this.sendMessage({ type: 'open_chat' });
      window.close(); // Close popup after opening chat
    } catch (error) {
      console.error('Failed to open chat for agent:', error);
    }
  }

  private async removeAgent(agentId: string, agentName: string): Promise<void> {
    const confirmed = confirm(`Remove agent "${agentName}"? This will disconnect and remove all local chat history.`);
    
    if (confirmed) {
      try {
        await this.sendMessage({ type: 'remove_agent', agent_id: agentId });
        
        // Remove from local state and re-render
        delete this.agents[agentId];
        this.renderAgents();
      } catch (error) {
        console.error('Failed to remove agent:', error);
        alert('Failed to remove agent. Please try again.');
      }
    }
  }

  private handleConnectionStatus(event: ConnectionStatusEvent): void {
    if (event.agent_id && this.agents[event.agent_id]) {
      // Update connection-related UI if needed
      // For now, we primarily show online/offline status
    }
  }

  private handleAgentStatus(event: AgentStatusEvent): void {
    if (this.agents[event.agent_id]) {
      this.agents[event.agent_id].online = event.online;
      
      // Update the specific agent element
      const agentElement = document.querySelector(`[data-agent-id="${event.agent_id}"]`);
      if (agentElement) {
        const agentStatus = agentElement.querySelector('.agent-status') as HTMLElement;
        const agentStatusText = agentElement.querySelector('.agent-status-text') as HTMLElement;
        
        if (event.online) {
          agentStatus.classList.add('online');
          agentStatusText.textContent = 'Online';
          agentStatusText.classList.add('online');
        } else {
          agentStatus.classList.remove('online');
          agentStatusText.textContent = 'Offline';
          agentStatusText.classList.remove('online');
        }
      }
    }
  }

  private formatLastSeen(lastSeen: string): string {
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  private async sendMessage(message: ExtensionMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});