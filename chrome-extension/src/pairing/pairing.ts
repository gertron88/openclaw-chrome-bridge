import './pairing.css';
import { PairingRequest, RelayConfig, ExtensionMessage } from '@/types';

class PairingManager {
  private currentStep = 'step-relay-mode';
  private relayMode: 'hosted' | 'custom' = 'hosted';
  private relayUrl = '';
  
  constructor() {
    this.init();
  }

  private init(): void {
    this.bindEvents();
    this.generateDeviceLabel();
  }

  private bindEvents(): void {
    // Step 1: Relay mode selection
    document.querySelectorAll('input[name="relay-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.relayMode = target.value as 'hosted' | 'custom';
      });
    });

    document.getElementById('continue-btn')?.addEventListener('click', () => {
      if (this.relayMode === 'hosted') {
        this.goToStep('step-pairing-code');
      } else {
        this.goToStep('step-custom-relay');
      }
    });

    // Step 2: Custom relay URL
    document.getElementById('back-to-mode')?.addEventListener('click', () => {
      this.goToStep('step-relay-mode');
    });

    document.getElementById('test-relay-btn')?.addEventListener('click', () => {
      this.testRelayConnection();
    });

    document.getElementById('continue-custom-btn')?.addEventListener('click', () => {
      if (this.validateCustomRelay()) {
        this.goToStep('step-pairing-code');
      }
    });

    // Step 3: Pairing code entry
    document.getElementById('back-to-relay')?.addEventListener('click', () => {
      if (this.relayMode === 'custom') {
        this.goToStep('step-custom-relay');
      } else {
        this.goToStep('step-relay-mode');
      }
    });

    const pairingCodeInput = document.getElementById('pairing-code') as HTMLInputElement;
    pairingCodeInput?.addEventListener('input', () => {
      this.validatePairingForm();
    });

    document.getElementById('pair-btn')?.addEventListener('click', () => {
      this.startPairing();
    });

    // Success/Error actions
    document.getElementById('open-chat-success-btn')?.addEventListener('click', () => {
      this.openChat();
    });

    document.getElementById('pair-another-btn')?.addEventListener('click', () => {
      this.resetToStart();
    });

    document.getElementById('retry-btn')?.addEventListener('click', () => {
      this.goToStep('step-pairing-code');
    });

    document.getElementById('back-to-start-btn')?.addEventListener('click', () => {
      this.resetToStart();
    });

    // Help links
    document.getElementById('help-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openHelp();
    });

    document.getElementById('support-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openSupport();
    });

    // Enter key handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleEnterKey();
      }
    });
  }

  private goToStep(stepId: string): void {
    // Hide all steps
    document.querySelectorAll('.step').forEach(step => {
      (step as HTMLElement).style.display = 'none';
    });

    // Show target step
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
      targetStep.style.display = 'block';
      this.currentStep = stepId;
      
      // Focus first input in step
      const firstInput = targetStep.querySelector('input') as HTMLInputElement;
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  private generateDeviceLabel(): void {
    const deviceLabelInput = document.getElementById('device-label') as HTMLInputElement;
    if (deviceLabelInput) {
      // Generate a default device label
      const platform = navigator.platform || 'Unknown';
      const browserName = this.getBrowserName();
      deviceLabelInput.value = `${browserName} on ${platform}`;
    }
  }

  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Browser';
  }

  private validateCustomRelay(): boolean {
    const relayUrlInput = document.getElementById('relay-url') as HTMLInputElement;
    const url = relayUrlInput.value.trim();

    if (!url) {
      this.showFieldError('relay-url', 'Please enter a relay URL');
      return false;
    }

    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        this.showFieldError('relay-url', 'URL must start with http:// or https://');
        return false;
      }
      
      this.relayUrl = url;
      this.clearFieldError('relay-url');
      return true;
    } catch (error) {
      this.showFieldError('relay-url', 'Please enter a valid URL');
      return false;
    }
  }

  private async testRelayConnection(): Promise<void> {
    const testBtn = document.getElementById('test-relay-btn') as HTMLButtonElement;
    const originalText = testBtn.textContent;
    
    if (!this.validateCustomRelay()) {
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';

    try {
      // Simple health check - try to fetch relay info
      const response = await fetch(`${this.relayUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        this.showSuccess('✅ Connection successful');
      } else {
        this.showError(`Connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.showError('Connection timeout - please check the URL and try again');
      } else {
        this.showError(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  }

  private validatePairingForm(): void {
    const pairingCodeInput = document.getElementById('pairing-code') as HTMLInputElement;
    const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
    
    const code = pairingCodeInput.value.trim();
    const isValid = code.length >= 3; // Minimum code length

    pairBtn.disabled = !isValid;
  }

  private async startPairing(): Promise<void> {
    const pairingCodeInput = document.getElementById('pairing-code') as HTMLInputElement;
    const deviceLabelInput = document.getElementById('device-label') as HTMLInputElement;
    
    const code = pairingCodeInput.value.trim();
    const deviceLabel = deviceLabelInput.value.trim() || 'Chrome Extension';

    if (!code) {
      this.showFieldError('pairing-code', 'Please enter the pairing code');
      return;
    }

    this.goToStep('step-loading');
    this.updateLoadingMessage('Connecting to relay server...');

    try {
      const pairingRequest: PairingRequest = {
        code: code,
        device_label: deviceLabel,
        relay_url: this.relayMode === 'custom' ? this.relayUrl : undefined,
      };

      // Store relay configuration
      const relayConfig: RelayConfig = {
        type: this.relayMode,
        url: this.relayMode === 'custom' ? this.relayUrl : 'https://relay.clawdbot.com',
        display_name: this.relayMode === 'custom' ? 'Custom Relay' : 'OpenClaw Hosted',
      };

      this.updateLoadingMessage('Pairing with agent...');

      const response = await this.sendMessage({
        type: 'complete_pairing',
        pairing_request: pairingRequest,
      });

      if (response.success) {
        // Store relay config
        await chrome.storage.sync.set({
          relay_config: relayConfig,
        });

        this.showPairingSuccess(response.result.agent_display_name);
      } else {
        this.showPairingError(response.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Pairing failed:', error);
      this.showPairingError(error instanceof Error ? error.message : 'Network error occurred');
    }
  }

  private showPairingSuccess(agentName: string): void {
    const successAgentName = document.getElementById('success-agent-name');
    if (successAgentName) {
      successAgentName.textContent = agentName;
    }
    this.goToStep('step-success');
  }

  private showPairingError(errorMessage: string): void {
    const errorMessageElement = document.getElementById('error-message');
    if (errorMessageElement) {
      errorMessageElement.textContent = errorMessage;
    }
    this.goToStep('step-error');
  }

  private updateLoadingMessage(message: string): void {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
      loadingMessage.textContent = message;
    }
  }

  private async openChat(): Promise<void> {
    try {
      await this.sendMessage({ type: 'open_chat' });
      window.close();
    } catch (error) {
      console.error('Failed to open chat:', error);
    }
  }

  private resetToStart(): void {
    // Reset form
    const pairingCodeInput = document.getElementById('pairing-code') as HTMLInputElement;
    const deviceLabelInput = document.getElementById('device-label') as HTMLInputElement;
    const relayUrlInput = document.getElementById('relay-url') as HTMLInputElement;
    
    if (pairingCodeInput) pairingCodeInput.value = '';
    if (relayUrlInput) relayUrlInput.value = '';
    
    // Reset to hosted mode
    const hostedRadio = document.querySelector('input[value="hosted"]') as HTMLInputElement;
    if (hostedRadio) hostedRadio.checked = true;
    this.relayMode = 'hosted';
    
    // Regenerate device label
    this.generateDeviceLabel();
    
    // Go to first step
    this.goToStep('step-relay-mode');
  }

  private handleEnterKey(): void {
    switch (this.currentStep) {
      case 'step-relay-mode':
        document.getElementById('continue-btn')?.click();
        break;
      case 'step-custom-relay':
        if (this.validateCustomRelay()) {
          document.getElementById('continue-custom-btn')?.click();
        }
        break;
      case 'step-pairing-code':
        const pairBtn = document.getElementById('pair-btn') as HTMLButtonElement;
        if (!pairBtn.disabled) {
          pairBtn.click();
        }
        break;
    }
  }

  private showFieldError(fieldId: string, message: string): void {
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.add('error');
      
      // Remove existing error message
      const existingError = field.parentElement?.querySelector('.error-message');
      if (existingError) {
        existingError.remove();
      }
      
      // Add error message
      const errorElement = document.createElement('small');
      errorElement.className = 'error-message form-help';
      errorElement.style.color = '#dc3545';
      errorElement.textContent = message;
      field.parentElement?.appendChild(errorElement);
    }
  }

  private clearFieldError(fieldId: string): void {
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.remove('error');
      const errorMessage = field.parentElement?.querySelector('.error-message');
      if (errorMessage) {
        errorMessage.remove();
      }
    }
  }

  private showSuccess(message: string): void {
    // Simple success feedback - could be enhanced with a toast notification
    console.log('Success:', message);
  }

  private showError(message: string): void {
    // Simple error feedback - could be enhanced with a toast notification
    console.error('Error:', message);
  }

  private openHelp(): void {
    chrome.tabs.create({
      url: 'https://docs.clawdbot.com/chrome-extension/pairing',
    });
  }

  private openSupport(): void {
    chrome.tabs.create({
      url: 'https://support.clawdbot.com',
    });
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

// Initialize pairing when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PairingManager();
});