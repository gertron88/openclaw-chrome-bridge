import './popup.css';
import { Agent, BillingAccount, ExtensionMessage, ConnectionStatusEvent, AgentStatusEvent } from '@/types';

class PopupManager {
  private agents: Record<string, Agent> = {};
  private billingAccount: BillingAccount | null = null;
  private billingSessionToken: string | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.bindEvents();
    await Promise.all([this.loadAgents(), this.loadBillingState()]);
    this.setupMessageListener();
  }

  private bindEvents(): void {
    document.getElementById('pair-agent-btn')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

    document.querySelector('.empty-state .btn')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

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

    document.getElementById('sign-in-btn')?.addEventListener('click', () => {
      this.signInWithChromeProfile();
    });

    document.getElementById('sign-out-btn')?.addEventListener('click', () => {
      this.signOutBilling();
    });

    document.getElementById('upgrade-btn')?.addEventListener('click', () => {
      this.openCheckout();
    });

    document.getElementById('manage-billing-btn')?.addEventListener('click', () => {
      this.openBillingPortal();
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
        await this.syncAgentUsage();
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

    if (loadingElement) loadingElement.style.display = 'none';

    const agentEntries = Object.entries(this.agents);

    if (agentEntries.length === 0) {
      if (noAgentsElement) noAgentsElement.style.display = 'block';
      if (agentsListElement) agentsListElement.style.display = 'none';
    } else {
      if (noAgentsElement) noAgentsElement.style.display = 'none';
      if (agentsListElement) agentsListElement.style.display = 'block';
      if (agentsCount) agentsCount.textContent = agentEntries.length.toString();

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

    agentItem.dataset.agentId = agentId;

    const agentName = clone.querySelector('.agent-name') as HTMLElement;
    agentName.textContent = agent.display_name;

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

    agentItem.addEventListener('click', () => {
      this.openChatForAgent(agentId, agent.display_name);
    });

    return agentItem;
  }

  private async getRelayBaseUrl(): Promise<string> {
    const stored = await chrome.storage.sync.get(['relay_configs', 'active_relay_config', 'connection_mode', 'local_webui_url']);

    const connectionMode = stored.connection_mode as string | undefined;
    const localGatewayUrl = (stored.local_webui_url as string | undefined)?.trim();
    if (connectionMode === 'local_webui') {
      return localGatewayUrl || 'http://127.0.0.1:18789';
    }

    const relayConfigs = (stored.relay_configs as Record<string, { url: string }> | undefined) || {};
    const activeRelay = (stored.active_relay_config as string) || 'hosted';
    const activeConfig = relayConfigs[activeRelay] || relayConfigs.hosted;
    return activeConfig?.url || 'https://openclaw-chrome-relay.gertron88.workers.dev';
  }

  private async loadBillingState(): Promise<void> {
    const local = await chrome.storage.local.get(['billing_session_token', 'billing_account']);
    this.billingSessionToken = (local.billing_session_token as string) || null;
    this.billingAccount = (local.billing_account as BillingAccount) || null;

    if (this.billingSessionToken) {
      await this.refreshBillingAccount();
    } else {
      this.renderBillingState();
    }
  }

  private renderBillingState(): void {
    const accountStatusEl = document.getElementById('account-status');
    const planStatusEl = document.getElementById('plan-status');
    const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement | null;
    const signOutBtn = document.getElementById('sign-out-btn') as HTMLButtonElement | null;
    const upgradeBtn = document.getElementById('upgrade-btn') as HTMLButtonElement | null;
    const manageBillingBtn = document.getElementById('manage-billing-btn') as HTMLButtonElement | null;

    if (!this.billingAccount) {
      if (accountStatusEl) accountStatusEl.textContent = 'Not signed in';
      if (planStatusEl) planStatusEl.textContent = 'Plan: Free (1 relay agent)';
      if (signInBtn) signInBtn.style.display = 'inline-flex';
      if (signOutBtn) signOutBtn.style.display = 'none';
      if (upgradeBtn) upgradeBtn.disabled = true;
      if (manageBillingBtn) manageBillingBtn.disabled = true;
      return;
    }

    if (accountStatusEl) accountStatusEl.textContent = `Signed in as ${this.billingAccount.email}`;

    const planLabel = this.billingAccount.plan === 'pro' ? 'Pro' : 'Free';
    const usage = this.billingAccount.agent_limit === null
      ? `${this.billingAccount.agents_in_use} agents`
      : `${this.billingAccount.agents_in_use}/${this.billingAccount.agent_limit} agents`;
    if (planStatusEl) planStatusEl.textContent = `Plan: ${planLabel} · ${usage}`;

    if (signInBtn) signInBtn.style.display = 'none';
    if (signOutBtn) signOutBtn.style.display = 'inline-flex';
    if (upgradeBtn) upgradeBtn.disabled = this.billingAccount.plan === 'pro';
    if (manageBillingBtn) manageBillingBtn.disabled = false;
  }

  private async refreshBillingAccount(): Promise<void> {
    if (!this.billingSessionToken) {
      this.renderBillingState();
      return;
    }

    try {
      const relayUrl = await this.getRelayBaseUrl();
      const response = await fetch(`${relayUrl}/api/billing/me`, {
        headers: { Authorization: `Bearer ${this.billingSessionToken}` },
      });

      if (!response.ok) {
        throw new Error(`Billing account fetch failed (${response.status})`);
      }

      const data = await response.json() as { account: BillingAccount };
      this.billingAccount = data.account;
      await chrome.storage.local.set({ billing_account: this.billingAccount });
      this.renderBillingState();
    } catch (error) {
      console.warn('Could not refresh billing account:', error);
      this.renderBillingState();
    }
  }

  private async signInWithChromeProfile(): Promise<void> {
    if (!chrome.identity) {
      alert('Chrome identity APIs are not available in this environment.');
      return;
    }

    try {
      const relayUrl = await this.getRelayBaseUrl();

      let response: Response | null = null;
      if (chrome.identity.getAuthToken) {
        try {
          const googleAccessToken = await new Promise<string>((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
              if (chrome.runtime.lastError || !token) {
                reject(new Error(chrome.runtime.lastError?.message || 'No Google OAuth token received'));
                return;
              }
              resolve(token);
            });
          });

          response = await fetch(`${relayUrl}/api/billing/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ google_access_token: googleAccessToken }),
          });
        } catch (oauthError) {
          console.warn('Google OAuth sign-in unavailable, falling back to profile email:', oauthError);
        }
      }

      if (!response) {
        if (!chrome.identity.getProfileUserInfo) {
          throw new Error('Google OAuth unavailable and no profile fallback available.');
        }

        const profileInfo = await new Promise<chrome.identity.UserInfo>((resolve) => {
          chrome.identity.getProfileUserInfo((userInfo) => resolve(userInfo));
        });
        if (!profileInfo.email) {
          throw new Error('No Google profile email found. Please sign in to Chrome and allow profile access.');
        }

        response = await fetch(`${relayUrl}/api/billing/auth/chrome-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: profileInfo.email,
            chrome_profile_id: profileInfo.id || undefined,
          }),
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sign-in failed: ${response.status} ${errText}`);
      }

      const data = await response.json() as { session_token: string; account: BillingAccount };
      this.billingSessionToken = data.session_token;
      this.billingAccount = data.account;

      await chrome.storage.local.set({
        billing_session_token: this.billingSessionToken,
        billing_account: this.billingAccount,
      });

      await this.syncAgentUsage();
      this.renderBillingState();
    } catch (error) {
      console.error('Failed to sign in:', error);
      alert(error instanceof Error ? error.message : 'Failed to sign in');
    }
  }

  private async signOutBilling(): Promise<void> {
    this.billingSessionToken = null;
    this.billingAccount = null;
    await chrome.storage.local.remove(['billing_session_token', 'billing_account']);
    this.renderBillingState();
  }

  private async syncAgentUsage(): Promise<void> {
    if (!this.billingSessionToken) return;

    try {
      const relayUrl = await this.getRelayBaseUrl();
      const response = await fetch(`${relayUrl}/api/billing/sync-agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.billingSessionToken}`,
        },
        body: JSON.stringify({ agent_ids: Object.keys(this.agents) }),
      });

      if (!response.ok) return;
      const data = await response.json() as { account: BillingAccount };
      this.billingAccount = data.account;
      await chrome.storage.local.set({ billing_account: this.billingAccount });
      this.renderBillingState();
    } catch (error) {
      console.warn('Failed to sync agent usage:', error);
    }
  }

  private async openCheckout(): Promise<void> {
    if (!this.billingSessionToken) {
      alert('Sign in first to upgrade.');
      return;
    }

    try {
      const relayUrl = await this.getRelayBaseUrl();
      const response = await fetch(`${relayUrl}/api/billing/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.billingSessionToken}` },
      });

      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      await chrome.tabs.create({ url: data.url });
    } catch (error) {
      console.error('Checkout failed:', error);
      alert(error instanceof Error ? error.message : 'Checkout failed');
    }
  }

  private async openBillingPortal(): Promise<void> {
    if (!this.billingSessionToken) {
      alert('Sign in first to manage billing.');
      return;
    }

    try {
      const relayUrl = await this.getRelayBaseUrl();
      const response = await fetch(`${relayUrl}/api/billing/portal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.billingSessionToken}` },
      });

      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Failed to create billing portal session');
      }

      await chrome.tabs.create({ url: data.url });
    } catch (error) {
      console.error('Billing portal failed:', error);
      alert(error instanceof Error ? error.message : 'Billing portal failed');
    }
  }

  private async canAddAnotherAgent(): Promise<boolean> {
    if (!this.billingAccount) {
      return Object.keys(this.agents).length < 1;
    }

    if (this.billingAccount.can_add_agent) {
      return true;
    }

    return false;
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
    (document.getElementById('local-webui-url') as HTMLInputElement).value = (stored.local_webui_url as string) || 'http://127.0.0.1:18789';

    this.updateSettingsVisibility();
    this.renderBillingState();
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
      await chrome.storage.sync.set({
        connection_mode: 'local_webui',
        local_webui_url: localWebUiUrl || 'http://127.0.0.1:18789',
      });
    }

    this.closeSettings();
  }

  private async openExtensionSidePanel(path: string): Promise<boolean> {
    if (!chrome.sidePanel?.open || !chrome.sidePanel?.setOptions) {
      return false;
    }

    const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow.id) return false;

    const [activeTab] = await chrome.tabs.query({ windowId: currentWindow.id, active: true });
    if (!activeTab?.id) return false;

    await chrome.sidePanel.setOptions({ tabId: activeTab.id, path, enabled: true });
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    return true;
  }

  private showLoading(): void {
    const noAgentsElement = document.getElementById('no-agents');
    const agentsListElement = document.getElementById('agents-list');
    const loadingElement = document.getElementById('loading');

    if (noAgentsElement) noAgentsElement.style.display = 'none';
    if (agentsListElement) agentsListElement.style.display = 'none';
    if (loadingElement) loadingElement.style.display = 'block';
  }

  private showError(message: string): void {
    console.error(message);
  }

  private async openPairingScreen(): Promise<void> {
    try {
      const allowed = await this.canAddAnotherAgent();
      if (!allowed) {
        alert('Free plan allows 1 relay agent. Upgrade to Pro in Settings to pair more agents.');
        return;
      }

      const opened = await this.openExtensionSidePanel('pairing.html');
      if (!opened) {
        await this.sendMessage({ type: 'open_pairing' });
      }
      window.close();
    } catch (error) {
      console.error('Failed to open pairing screen:', error);
    }
  }

  private async openChatInterface(): Promise<void> {
    try {
      const opened = await this.openExtensionSidePanel('chat.html');
      if (!opened) {
        await this.sendMessage({ type: 'open_chat' });
      }
      window.close();
    } catch (error) {
      console.error('Failed to open chat interface:', error);
    }
  }

  private async openChatForAgent(agentId: string, agentName: string): Promise<void> {
    try {
      await chrome.storage.session.set({
        selected_agent_id: agentId,
        selected_agent_name: agentName,
      });

      const opened = await this.openExtensionSidePanel('chat.html');
      if (!opened) {
        await this.sendMessage({ type: 'open_chat' });
      }
      window.close();
    } catch (error) {
      console.error('Failed to open chat for agent:', error);
    }
  }

  private async removeAgent(agentId: string, agentName: string): Promise<void> {
    const confirmed = confirm(`Remove agent "${agentName}"? This will disconnect and remove all local chat history.`);
    if (!confirmed) return;

    try {
      await this.sendMessage({ type: 'remove_agent', agent_id: agentId });
      delete this.agents[agentId];
      this.renderAgents();
      await this.syncAgentUsage();
    } catch (error) {
      console.error('Failed to remove agent:', error);
      alert('Failed to remove agent. Please try again.');
    }
  }

  private handleConnectionStatus(event: ConnectionStatusEvent): void {
    if (event.agent_id && this.agents[event.agent_id]) {
      // Reserved for richer popup status rendering.
    }
  }

  private handleAgentStatus(event: AgentStatusEvent): void {
    if (this.agents[event.agent_id]) {
      this.agents[event.agent_id].online = event.online;
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

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
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

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
