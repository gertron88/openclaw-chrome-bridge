import './chat.css';
import { Agent, Session, ChatMessage, ExtensionMessage, ConnectionStatusEvent, NewMessageEvent, AgentStatusEvent } from '@/types';

type WorkspaceView = 'chat' | 'subagents' | 'cron';

type AgentDashboardStats = {
  id: string;
  name: string;
  online: boolean;
  sessionCount: number;
  lastActivity?: string;
};

class ChatManager {
  private agents: Record<string, Agent> = {};
  private currentAgentId: string | null = null;
  private currentSessionId: string | null = null;
  private messages: ChatMessage[] = [];
  private isTyping = false;
  private sidebarCollapsed = false;
  private currentView: WorkspaceView = 'chat';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.bindEvents();
    this.setupMessageListener();
    await this.loadAgents();
    await this.restoreSelectedAgent();
    this.setupAutoResize();
    await this.renderDashboards();
  }

  private bindEvents(): void {
    document.getElementById('collapse-sidebar')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('expand-sidebar')?.addEventListener('click', () => this.toggleSidebar());

    document.querySelectorAll('.view-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = (tab as HTMLElement).dataset.view as WorkspaceView;
        this.switchView(view);
      });
    });

    document.getElementById('pair-new-agent')?.addEventListener('click', () => this.openPairingScreen());
    document.getElementById('pair-first-agent')?.addEventListener('click', () => this.openPairingScreen());

    document.getElementById('new-session')?.addEventListener('click', () => this.startNewSession());
    document.getElementById('clear-chat')?.addEventListener('click', () => this.clearCurrentChat());

    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;

    messageInput?.addEventListener('input', () => this.handleInputChange());
    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendButton?.addEventListener('click', () => this.sendMessage());
  }

  private switchView(view: WorkspaceView): void {
    this.currentView = view;

    document.querySelectorAll('.view-tab').forEach((tab) => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.view === view);
    });

    document.getElementById('view-chat')?.classList.toggle('active', view === 'chat');
    document.getElementById('view-subagents')?.classList.toggle('active', view === 'subagents');
    document.getElementById('view-cron')?.classList.toggle('active', view === 'cron');
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
      switch (message.type) {
        case 'connection_status':
          this.handleConnectionStatus(message as ConnectionStatusEvent);
          break;
        case 'new_message':
          this.handleNewMessage(message as NewMessageEvent);
          break;
        case 'agent_status':
          this.handleAgentStatus(message as AgentStatusEvent);
          break;
      }
    });
  }

  private async loadAgents(): Promise<void> {
    try {
      const response = await this.sendExtensionMessage({ type: 'get_agents' });
      if (response.success) {
        this.agents = response.agents;
        this.renderAgentsList();
        if (Object.keys(this.agents).length === 0) {
          this.showEmptyState();
        }
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }

  private async restoreSelectedAgent(): Promise<void> {
    try {
      const result = await chrome.storage.session.get(['selected_agent_id']);
      const agentId = result.selected_agent_id;
      if (agentId && this.agents[agentId]) {
        this.selectAgent(agentId);
      }
    } catch (error) {
      console.error('Failed to restore selected agent:', error);
    }
  }

  private renderAgentsList(): void {
    const agentsList = document.getElementById('agents-list');
    if (!agentsList) return;

    agentsList.innerHTML = '';
    Object.entries(this.agents).forEach(([agentId, agent]) => {
      agentsList.appendChild(this.createAgentListItem(agentId, agent));
    });
  }

  private createAgentListItem(agentId: string, agent: Agent): HTMLElement {
    const template = document.getElementById('agent-list-item-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const agentItem = clone.querySelector('.agent-list-item') as HTMLElement;

    agentItem.dataset.agentId = agentId;
    (clone.querySelector('.agent-name') as HTMLElement).textContent = agent.display_name;

    const agentStatus = clone.querySelector('.agent-status') as HTMLElement;
    if (agent.online) agentStatus.classList.add('online');

    const lastMessage = clone.querySelector('.agent-last-message') as HTMLElement;
    lastMessage.textContent = agent.online ? 'Online' : 'Offline';

    agentItem.addEventListener('click', () => this.selectAgent(agentId));

    const removeBtn = clone.querySelector('.remove-agent') as HTMLElement;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeAgent(agentId, agent.display_name);
    });

    return agentItem;
  }

  private async selectAgent(agentId: string): Promise<void> {
    if (!this.agents[agentId]) return;

    const agent = this.agents[agentId];
    this.currentAgentId = agentId;
    await chrome.storage.session.set({ selected_agent_id: agentId });

    this.updateAgentSelection();
    this.updateChatHeader(agent);
    this.showChatInterface();

    await this.loadOrCreateSession(agentId);
    this.ensureAgentConnection(agentId);
    this.switchView('chat');
  }

  private updateAgentSelection(): void {
    document.querySelectorAll('.agent-list-item').forEach((item) => item.classList.remove('active'));
    if (this.currentAgentId) {
      document.querySelector(`[data-agent-id="${this.currentAgentId}"]`)?.classList.add('active');
    }
  }

  private updateChatHeader(agent: Agent): void {
    const agentName = document.getElementById('current-agent-name');
    const agentStatus = document.getElementById('current-agent-status');
    const agentStatusText = document.getElementById('current-agent-status-text');

    if (agentName) agentName.textContent = agent.display_name;

    if (agentStatus) {
      agentStatus.className = 'agent-status';
      if (agent.online) agentStatus.classList.add('online');
    }

    if (agentStatusText) {
      agentStatusText.textContent = agent.online ? 'Online' : 'Offline';
      agentStatusText.className = agent.online ? 'online' : '';
    }
  }

  private showEmptyState(): void {
    document.getElementById('empty-state')?.style.setProperty('display', 'flex');
    document.getElementById('chat-interface')?.style.setProperty('display', 'none');
  }

  private showChatInterface(): void {
    document.getElementById('empty-state')?.style.setProperty('display', 'none');
    document.getElementById('chat-interface')?.style.setProperty('display', 'flex');
  }

  private async loadOrCreateSession(agentId: string): Promise<void> {
    try {
      const response = await this.sendExtensionMessage({ type: 'get_sessions', agent_id: agentId });

      if (response.success && response.sessions.length > 0) {
        const latestSession = response.sessions.sort((a: Session, b: Session) =>
          new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
        )[0];

        this.currentSessionId = latestSession.id;
        await this.loadMessages(latestSession.id);
      } else {
        await this.createNewSession(agentId);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      await this.createNewSession(agentId);
    }
  }

  private async createNewSession(agentId: string): Promise<void> {
    const agent = this.agents[agentId];
    if (!agent) return;

    try {
      const response = await this.sendExtensionMessage({
        type: 'create_session',
        agent_id: agentId,
        agent_name: agent.display_name,
      });

      if (response.success) {
        this.currentSessionId = response.session.id;
        this.messages = [];
        this.renderMessages();
        await this.renderDashboards();
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }

  private async loadMessages(sessionId: string): Promise<void> {
    try {
      const response = await this.sendExtensionMessage({ type: 'get_messages', session_id: sessionId });
      if (response.success) {
        this.messages = response.messages;
        this.renderMessages();
        this.scrollToBottom();
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  private renderMessages(): void {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList) return;

    messagesList.innerHTML = '';
    this.messages.forEach((message) => messagesList.appendChild(this.createMessageElement(message)));
    this.scrollToBottom();
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const template = document.getElementById('message-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const messageElement = clone.querySelector('.message') as HTMLElement;

    messageElement.dataset.messageId = message.id;
    messageElement.dataset.type = message.type;
    messageElement.classList.add(`${message.type}-message`);

    (clone.querySelector('.message-text') as HTMLElement).textContent = message.text;
    (clone.querySelector('.message-time') as HTMLElement).textContent = this.formatTime(message.timestamp);

    const messageStatus = clone.querySelector('.message-status') as HTMLElement;
    if (message.type === 'request' && message.status) {
      messageStatus.className = `message-status ${message.status}`;
    } else {
      messageStatus.style.display = 'none';
    }

    return messageElement;
  }

  private async sendMessage(): Promise<void> {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const text = messageInput.value.trim();

    if (!text || !this.currentAgentId || !this.currentSessionId) return;

    messageInput.value = '';
    this.handleInputChange();

    try {
      const response = await this.sendExtensionMessage({
        type: 'send_message',
        agent_id: this.currentAgentId,
        session_id: this.currentSessionId,
        text,
      });

      if (response.success) {
        this.showTypingIndicator();
      } else {
        console.error('Failed to send message:', response.error);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  private handleInputChange(): void {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;

    const hasText = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasText;

    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  }

  private showTypingIndicator(): void {
    if (this.isTyping) return;

    this.isTyping = true;
    const template = document.getElementById('typing-indicator-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const messagesList = document.getElementById('messages-list');

    if (messagesList) {
      messagesList.appendChild(clone);
      this.scrollToBottom();
    }
  }

  private hideTypingIndicator(): void {
    if (!this.isTyping) return;
    this.isTyping = false;
    document.querySelector('.typing-indicator')?.remove();
  }

  private handleConnectionStatus(event: ConnectionStatusEvent): void {
    if (event.agent_id === this.currentAgentId) {
      this.updateConnectionStatus(event.status);
    }
  }

  private async handleNewMessage(event: NewMessageEvent): Promise<void> {
    const message = event.message;

    if (message.session_id === this.currentSessionId) {
      if (message.type === 'response') this.hideTypingIndicator();
      this.messages.push(message);
      document.getElementById('messages-list')?.appendChild(this.createMessageElement(message));
      this.scrollToBottom();
    }

    this.updateAgentLastMessage(message.agent_id, message.text);
    await this.renderDashboards();
  }

  private async handleAgentStatus(event: AgentStatusEvent): Promise<void> {
    if (this.agents[event.agent_id]) {
      this.agents[event.agent_id].online = event.online;

      const agentItem = document.querySelector(`[data-agent-id="${event.agent_id}"]`);
      if (agentItem) {
        const statusElement = agentItem.querySelector('.agent-status') as HTMLElement;
        const lastMessage = agentItem.querySelector('.agent-last-message') as HTMLElement;

        if (event.online) {
          statusElement.classList.add('online');
          lastMessage.textContent = 'Online';
        } else {
          statusElement.classList.remove('online');
          lastMessage.textContent = 'Offline';
        }
      }

      if (event.agent_id === this.currentAgentId) {
        this.updateChatHeader(this.agents[event.agent_id]);
      }

      await this.renderDashboards();
    }
  }

  private updateConnectionStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
    const statusIndicator = document.querySelector('.status-indicator') as HTMLElement;
    const statusText = document.querySelector('.status-text') as HTMLElement;

    if (!statusIndicator || !statusText) return;

    statusIndicator.className = 'status-indicator';

    switch (status) {
      case 'connected':
        statusIndicator.classList.add('online');
        statusText.textContent = 'Connected';
        break;
      case 'connecting':
        statusIndicator.classList.add('connecting');
        statusText.textContent = 'Connecting...';
        break;
      case 'error':
        statusText.textContent = 'Connection Error';
        break;
      default:
        statusText.textContent = 'Disconnected';
    }
  }

  private updateAgentLastMessage(agentId: string, text: string): void {
    const agentItem = document.querySelector(`[data-agent-id="${agentId}"]`);
    if (agentItem) {
      const lastMessage = agentItem.querySelector('.agent-last-message') as HTMLElement;
      lastMessage.textContent = text.length > 50 ? `${text.substring(0, 50)}...` : text;
    }
  }

  private async ensureAgentConnection(agentId: string): Promise<void> {
    try {
      await this.sendExtensionMessage({ type: 'connect_agent', agent_id: agentId });
    } catch (error) {
      console.error('Failed to connect agent:', error);
    }
  }

  private toggleSidebar(): void {
    const sidebar = document.getElementById('sidebar');
    const expandButton = document.getElementById('expand-sidebar');

    if (!sidebar) return;

    this.sidebarCollapsed = !this.sidebarCollapsed;

    if (this.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (expandButton) expandButton.style.display = 'block';
    } else {
      sidebar.classList.remove('collapsed');
      if (expandButton) expandButton.style.display = 'none';
    }
  }

  private async startNewSession(): Promise<void> {
    if (!this.currentAgentId) return;
    await this.createNewSession(this.currentAgentId);
  }

  private async clearCurrentChat(): Promise<void> {
    if (!this.currentSessionId || !this.currentAgentId) return;

    const confirmed = confirm('Clear current chat? This cannot be undone.');
    if (confirmed) {
      this.messages = [];
      this.renderMessages();
      await this.createNewSession(this.currentAgentId);
    }
  }

  private async removeAgent(agentId: string, agentName: string): Promise<void> {
    const confirmed = confirm(`Remove agent "${agentName}"? This will disconnect and remove all local chat history.`);
    if (!confirmed) return;

    try {
      await this.sendExtensionMessage({ type: 'remove_agent', agent_id: agentId });

      delete this.agents[agentId];

      if (this.currentAgentId === agentId) {
        this.currentAgentId = null;
        this.currentSessionId = null;

        const remainingAgents = Object.keys(this.agents);
        if (remainingAgents.length > 0) {
          this.selectAgent(remainingAgents[0]);
        } else {
          this.showEmptyState();
        }
      }

      this.renderAgentsList();
      await this.renderDashboards();
    } catch (error) {
      console.error('Failed to remove agent:', error);
      alert('Failed to remove agent. Please try again.');
    }
  }

  private async openPairingScreen(): Promise<void> {
    try {
      await this.sendExtensionMessage({ type: 'open_pairing' });
    } catch (error) {
      console.error('Failed to open pairing screen:', error);
    }
  }

  private setupAutoResize(): void {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    if (messageInput) {
      messageInput.addEventListener('input', this.handleInputChange.bind(this));
    }
  }

  private scrollToBottom(): void {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 50);
    }
  }

  private formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  private async sendExtensionMessage(message: ExtensionMessage): Promise<any> {
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

  private async getAgentSessionStats(): Promise<AgentDashboardStats[]> {
    const entries = Object.entries(this.agents);
    const stats = await Promise.all(entries.map(async ([agentId, agent]) => {
      try {
        const response = await this.sendExtensionMessage({ type: 'get_sessions', agent_id: agentId });
        const sessions: Session[] = response.success ? response.sessions : [];

        const latest = sessions
          .map((session) => session.last_activity)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        return {
          id: agentId,
          name: agent.display_name,
          online: agent.online,
          sessionCount: sessions.length,
          lastActivity: latest,
        };
      } catch {
        return {
          id: agentId,
          name: agent.display_name,
          online: agent.online,
          sessionCount: 0,
        };
      }
    }));

    return stats;
  }

  private async renderDashboards(): Promise<void> {
    const stats = await this.getAgentSessionStats();
    this.renderSubagentDashboard(stats);
    this.renderCronDashboard(stats);
  }

  private renderSubagentDashboard(stats: AgentDashboardStats[]): void {
    const summaryEl = document.getElementById('subagent-summary');
    const tableEl = document.getElementById('subagent-table');
    if (!summaryEl || !tableEl) return;

    const utilized = stats.filter((item) => item.sessionCount > 0).length;
    const online = stats.filter((item) => item.online).length;

    summaryEl.innerHTML = `
      <article class="dashboard-card"><div class="dashboard-card-label">Created Subagents</div><div class="dashboard-card-value">${stats.length}</div></article>
      <article class="dashboard-card"><div class="dashboard-card-label">Utilized Subagents</div><div class="dashboard-card-value">${utilized}</div></article>
      <article class="dashboard-card"><div class="dashboard-card-label">Online Right Now</div><div class="dashboard-card-value">${online}</div></article>
    `;

    if (stats.length === 0) {
      tableEl.innerHTML = '<div class="dashboard-empty">No subagents paired yet. Pair an agent to populate this dashboard.</div>';
      return;
    }

    tableEl.innerHTML = stats
      .sort((a, b) => Number(b.online) - Number(a.online))
      .map((item) => `
        <div class="dashboard-row">
          <div>
            <strong>${item.name}</strong>
            <div class="dashboard-row-meta">Sessions: ${item.sessionCount}${item.lastActivity ? ` · Last activity: ${this.formatTime(item.lastActivity)}` : ''}</div>
          </div>
          <span class="badge ${item.online ? 'online' : 'offline'}">${item.online ? 'Online' : 'Offline'}</span>
        </div>
      `)
      .join('');
  }

  private renderCronDashboard(stats: AgentDashboardStats[]): void {
    const summaryEl = document.getElementById('cron-summary');
    const tableEl = document.getElementById('cron-table');
    if (!summaryEl || !tableEl) return;

    const cronAgents = stats.filter((item) => /cron|schedule|job/i.test(item.name));
    const running = cronAgents.filter((item) => item.online).length;

    summaryEl.innerHTML = `
      <article class="dashboard-card"><div class="dashboard-card-label">Cron Agents</div><div class="dashboard-card-value">${cronAgents.length}</div></article>
      <article class="dashboard-card"><div class="dashboard-card-label">Running</div><div class="dashboard-card-value">${running}</div></article>
      <article class="dashboard-card"><div class="dashboard-card-label">Idle/Offline</div><div class="dashboard-card-value">${Math.max(cronAgents.length - running, 0)}</div></article>
    `;

    if (cronAgents.length === 0) {
      tableEl.innerHTML = '<div class="dashboard-empty">No cron-job agents detected. Name an agent with "cron", "schedule", or "job" to track it here.</div>';
      return;
    }

    tableEl.innerHTML = cronAgents
      .map((item) => `
        <div class="dashboard-row">
          <div>
            <strong>${item.name}</strong>
            <div class="dashboard-row-meta">Sessions: ${item.sessionCount}${item.lastActivity ? ` · Last run: ${this.formatTime(item.lastActivity)}` : ''}</div>
          </div>
          <span class="badge ${item.online ? 'online' : 'offline'}">${item.online ? 'Running' : 'Idle'}</span>
        </div>
      `)
      .join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ChatManager();
});
