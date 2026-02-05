import './chat.css';
import { Agent, Session, ChatMessage, ExtensionMessage, ConnectionStatusEvent, NewMessageEvent, AgentStatusEvent } from '@/types';
import { createSessionId, createRequestId } from '@/lib/storage';

class ChatManager {
  private agents: Record<string, Agent> = {};
  private currentAgentId: string | null = null;
  private currentSessionId: string | null = null;
  private messages: ChatMessage[] = [];
  private isTyping = false;
  private sidebarCollapsed = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.bindEvents();
    this.setupMessageListener();
    await this.loadAgents();
    await this.restoreSelectedAgent();
    this.setupAutoResize();
  }

  private bindEvents(): void {
    // Sidebar controls
    document.getElementById('collapse-sidebar')?.addEventListener('click', () => {
      this.toggleSidebar();
    });

    document.getElementById('expand-sidebar')?.addEventListener('click', () => {
      this.toggleSidebar();
    });

    // Agent actions
    document.getElementById('pair-new-agent')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

    document.getElementById('pair-first-agent')?.addEventListener('click', () => {
      this.openPairingScreen();
    });

    // Chat actions
    document.getElementById('new-session')?.addEventListener('click', () => {
      this.startNewSession();
    });

    document.getElementById('clear-chat')?.addEventListener('click', () => {
      this.clearCurrentChat();
    });

    // Message input
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;

    messageInput?.addEventListener('input', () => {
      this.handleInputChange();
    });

    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendButton?.addEventListener('click', () => {
      this.sendMessage();
    });
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
      const response = await this.sendMessage({ type: 'get_agents' });
      
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
      const agentElement = this.createAgentListItem(agentId, agent);
      agentsList.appendChild(agentElement);
    });
  }

  private createAgentListItem(agentId: string, agent: Agent): HTMLElement {
    const template = document.getElementById('agent-list-item-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const agentItem = clone.querySelector('.agent-list-item') as HTMLElement;

    agentItem.dataset.agentId = agentId;

    // Set agent name
    const agentName = clone.querySelector('.agent-name') as HTMLElement;
    agentName.textContent = agent.display_name;

    // Set status
    const agentStatus = clone.querySelector('.agent-status') as HTMLElement;
    if (agent.online) {
      agentStatus.classList.add('online');
    }

    // Set last message placeholder
    const lastMessage = clone.querySelector('.agent-last-message') as HTMLElement;
    lastMessage.textContent = agent.online ? 'Online' : 'Offline';

    // Bind events
    agentItem.addEventListener('click', () => {
      this.selectAgent(agentId);
    });

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

    // Store selection
    await chrome.storage.session.set({ selected_agent_id: agentId });

    // Update UI
    this.updateAgentSelection();
    this.updateChatHeader(agent);
    this.showChatInterface();
    
    // Create or load session
    await this.loadOrCreateSession(agentId);
    
    // Connect agent if not connected
    this.ensureAgentConnection(agentId);
  }

  private updateAgentSelection(): void {
    document.querySelectorAll('.agent-list-item').forEach(item => {
      item.classList.remove('active');
    });

    if (this.currentAgentId) {
      const activeItem = document.querySelector(`[data-agent-id="${this.currentAgentId}"]`);
      activeItem?.classList.add('active');
    }
  }

  private updateChatHeader(agent: Agent): void {
    const agentName = document.getElementById('current-agent-name');
    const agentStatus = document.getElementById('current-agent-status');
    const agentStatusText = document.getElementById('current-agent-status-text');

    if (agentName) agentName.textContent = agent.display_name;
    
    if (agentStatus) {
      agentStatus.className = 'agent-status';
      if (agent.online) {
        agentStatus.classList.add('online');
      }
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
      const response = await this.sendMessage({ 
        type: 'get_sessions',
        agent_id: agentId
      });

      if (response.success && response.sessions.length > 0) {
        // Use the most recent session
        const latestSession = response.sessions.sort((a: Session, b: Session) => 
          new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
        )[0];
        
        this.currentSessionId = latestSession.id;
        await this.loadMessages(latestSession.id);
      } else {
        // Create new session
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
      const response = await this.sendMessage({
        type: 'create_session',
        agent_id: agentId,
        agent_name: agent.display_name,
      });

      if (response.success) {
        this.currentSessionId = response.session.id;
        this.messages = [];
        this.renderMessages();
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }

  private async loadMessages(sessionId: string): Promise<void> {
    try {
      const response = await this.sendMessage({
        type: 'get_messages',
        session_id: sessionId,
      });

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

    this.messages.forEach(message => {
      const messageElement = this.createMessageElement(message);
      messagesList.appendChild(messageElement);
    });

    this.scrollToBottom();
  }

  private createMessageElement(message: ChatMessage): HTMLElement {
    const template = document.getElementById('message-template') as HTMLTemplateElement;
    const clone = template.content.cloneNode(true) as DocumentFragment;
    const messageElement = clone.querySelector('.message') as HTMLElement;

    messageElement.dataset.messageId = message.id;
    messageElement.dataset.type = message.type;
    messageElement.classList.add(`${message.type}-message`);

    const messageText = clone.querySelector('.message-text') as HTMLElement;
    messageText.textContent = message.text;

    const messageTime = clone.querySelector('.message-time') as HTMLElement;
    messageTime.textContent = this.formatTime(message.timestamp);

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

    // Clear input immediately
    messageInput.value = '';
    this.handleInputChange();

    try {
      const response = await this.sendMessage({
        type: 'send_message',
        agent_id: this.currentAgentId,
        session_id: this.currentSessionId,
        text: text,
      });

      if (response.success) {
        // Message will be added via the message listener
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

    // Auto-resize textarea
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
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
    const typingIndicator = document.querySelector('.typing-indicator');
    typingIndicator?.remove();
  }

  private handleConnectionStatus(event: ConnectionStatusEvent): void {
    if (event.agent_id === this.currentAgentId) {
      this.updateConnectionStatus(event.status);
    }
  }

  private handleNewMessage(event: NewMessageEvent): void {
    const message = event.message;
    
    if (message.session_id === this.currentSessionId) {
      // Hide typing indicator if this is a response
      if (message.type === 'response') {
        this.hideTypingIndicator();
      }

      // Add message to current view
      this.messages.push(message);
      const messageElement = this.createMessageElement(message);
      document.getElementById('messages-list')?.appendChild(messageElement);
      this.scrollToBottom();
    }

    // Update agent last message preview
    this.updateAgentLastMessage(message.agent_id, message.text);
  }

  private handleAgentStatus(event: AgentStatusEvent): void {
    if (this.agents[event.agent_id]) {
      this.agents[event.agent_id].online = event.online;
      
      // Update agent list item
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

      // Update chat header if this is the current agent
      if (event.agent_id === this.currentAgentId) {
        this.updateChatHeader(this.agents[event.agent_id]);
      }
    }
  }

  private updateConnectionStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
    const statusIndicator = document.querySelector('.status-indicator') as HTMLElement;
    const statusText = document.querySelector('.status-text') as HTMLElement;

    if (statusIndicator && statusText) {
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
  }

  private updateAgentLastMessage(agentId: string, text: string): void {
    const agentItem = document.querySelector(`[data-agent-id="${agentId}"]`);
    if (agentItem) {
      const lastMessage = agentItem.querySelector('.agent-last-message') as HTMLElement;
      lastMessage.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
  }

  private async ensureAgentConnection(agentId: string): Promise<void> {
    try {
      await this.sendMessage({
        type: 'connect_agent',
        agent_id: agentId,
      });
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
    if (!this.currentSessionId) return;

    const confirmed = confirm('Clear current chat? This cannot be undone.');
    if (confirmed) {
      this.messages = [];
      this.renderMessages();
      await this.createNewSession(this.currentAgentId!);
    }
  }

  private async removeAgent(agentId: string, agentName: string): Promise<void> {
    const confirmed = confirm(`Remove agent "${agentName}"? This will disconnect and remove all local chat history.`);
    
    if (confirmed) {
      try {
        await this.sendMessage({ type: 'remove_agent', agent_id: agentId });
        
        delete this.agents[agentId];
        
        if (this.currentAgentId === agentId) {
          this.currentAgentId = null;
          this.currentSessionId = null;
          
          // Select another agent or show empty state
          const remainingAgents = Object.keys(this.agents);
          if (remainingAgents.length > 0) {
            this.selectAgent(remainingAgents[0]);
          } else {
            this.showEmptyState();
          }
        }
        
        this.renderAgentsList();
      } catch (error) {
        console.error('Failed to remove agent:', error);
        alert('Failed to remove agent. Please try again.');
      }
    }
  }

  private async openPairingScreen(): Promise<void> {
    try {
      await this.sendMessage({ type: 'open_pairing' });
    } catch (error) {
      console.error('Failed to open pairing screen:', error);
    }
  }

  private setupAutoResize(): void {
    // Auto-resize text area
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
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
             ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ChatManager();
});