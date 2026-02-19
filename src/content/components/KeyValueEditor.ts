// src/content/components/KeyValueEditor.ts
// Reusable component for editing key-value pairs (headers, query params)

export interface KeyValuePair {
  key: string;
  value: string;
  enabled: boolean;
}

export interface KeyValueEditorOptions {
  title: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  placeholder?: { key: string; value: string };
}

export class KeyValueEditor {
  private container: HTMLElement;
  private pairs: KeyValuePair[];
  private onChange: (pairs: KeyValuePair[]) => void;
  private title: string;
  private placeholder: { key: string; value: string };

  constructor(options: KeyValueEditorOptions) {
    this.title = options.title;
    this.pairs = [...options.pairs];
    this.onChange = options.onChange;
    this.placeholder = options.placeholder || { key: 'Key', value: 'Value' };
    this.container = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setPairs(pairs: KeyValuePair[]): void {
    this.pairs = [...pairs];
    this.render();
  }

  public getPairs(): KeyValuePair[] {
    return [...this.pairs];
  }

  private render(): void {
    const count = this.pairs.filter(p => p.enabled).length;

    this.container.innerHTML = `
      <details style="margin-bottom: 12px;" open>
        <summary style="
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          padding: 6px 0;
          user-select: none;
          display: flex;
          align-items: center;
          gap: 6px;
        ">
          <span style="transition: transform 0.2s;">&#9660;</span>
          ${this.title} ${count > 0 ? `<span style="
            background: #e5e7eb;
            color: #6b7280;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
          ">${count}</span>` : ''}
        </summary>

        <div class="kv-list" style="
          margin-top: 8px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        ">
          ${this.pairs.map((pair, index) => this.renderRow(pair, index)).join('')}

          <button class="kv-add-btn" style="
            width: 100%;
            padding: 8px;
            background: transparent;
            border: none;
            border-top: 1px solid #e5e7eb;
            color: #6366f1;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s;
          ">
            + Add
          </button>
        </div>
      </details>
    `;

    this.attachEventListeners();
  }

  private renderRow(pair: KeyValuePair, index: number): string {
    return `
      <div class="kv-row" data-index="${index}" style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border-bottom: 1px solid #e5e7eb;
        background: ${pair.enabled ? '#fff' : '#f3f4f6'};
        opacity: ${pair.enabled ? '1' : '0.6'};
      ">
        <input
          type="checkbox"
          class="kv-checkbox"
          ${pair.enabled ? 'checked' : ''}
          style="
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: #8b5cf6;
          "
        />
        <input
          type="text"
          class="kv-key"
          value="${this.escapeHtml(pair.key)}"
          placeholder="${this.placeholder.key}"
          style="
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 11px;
            font-family: monospace;
            color: #374151;
            background: ${pair.enabled ? '#fff' : '#f3f4f6'};
            outline: none;
            transition: border-color 0.15s;
          "
        />
        <input
          type="text"
          class="kv-value"
          value="${this.escapeHtml(pair.value)}"
          placeholder="${this.placeholder.value}"
          style="
            flex: 2;
            padding: 6px 8px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 11px;
            font-family: monospace;
            color: #374151;
            background: ${pair.enabled ? '#fff' : '#f3f4f6'};
            outline: none;
            transition: border-color 0.15s;
          "
        />
        <button class="kv-delete" style="
          width: 24px;
          height: 24px;
          padding: 0;
          background: transparent;
          border: none;
          color: #ef4444;
          font-size: 14px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s;
        " title="Remove">
          &#128465;
        </button>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Checkbox change
    this.container.querySelectorAll('.kv-checkbox').forEach((checkbox, index) => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.pairs[index].enabled = target.checked;
        this.onChange(this.pairs);
        this.render();
      });
    });

    // Key input change
    this.container.querySelectorAll('.kv-key').forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.pairs[index].key = target.value;
        this.onChange(this.pairs);
      });

      input.addEventListener('focus', (e) => {
        (e.target as HTMLElement).style.borderColor = '#8b5cf6';
      });

      input.addEventListener('blur', (e) => {
        (e.target as HTMLElement).style.borderColor = '#d1d5db';
      });
    });

    // Value input change
    this.container.querySelectorAll('.kv-value').forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        this.pairs[index].value = target.value;
        this.onChange(this.pairs);
      });

      input.addEventListener('focus', (e) => {
        (e.target as HTMLElement).style.borderColor = '#8b5cf6';
      });

      input.addEventListener('blur', (e) => {
        (e.target as HTMLElement).style.borderColor = '#d1d5db';
      });
    });

    // Delete button
    this.container.querySelectorAll('.kv-delete').forEach((button, index) => {
      button.addEventListener('click', () => {
        this.pairs.splice(index, 1);
        this.onChange(this.pairs);
        this.render();
      });

      button.addEventListener('mouseenter', (e) => {
        (e.target as HTMLElement).style.background = '#fee2e2';
      });

      button.addEventListener('mouseleave', (e) => {
        (e.target as HTMLElement).style.background = 'transparent';
      });
    });

    // Add button
    const addBtn = this.container.querySelector('.kv-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.pairs.push({ key: '', value: '', enabled: true });
        this.onChange(this.pairs);
        this.render();

        // Focus on the new key input
        setTimeout(() => {
          const lastKeyInput = this.container.querySelector('.kv-row:last-of-type .kv-key') as HTMLInputElement;
          if (lastKeyInput) {
            lastKeyInput.focus();
          }
        }, 10);
      });

      addBtn.addEventListener('mouseenter', (e) => {
        (e.target as HTMLElement).style.background = '#f3f4f6';
      });

      addBtn.addEventListener('mouseleave', (e) => {
        (e.target as HTMLElement).style.background = 'transparent';
      });
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
  }
}
