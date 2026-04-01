(function() {
  const POLL_INTERVAL = 3000;
  const API_URL = '/api/modmail';
  let sessionId = localStorage.getItem('modmail_session');
  if (!sessionId) {
    sessionId = 'mm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem('modmail_session', sessionId);
  }
  let username = localStorage.getItem('modmail_username') || '';
  let chatOpen = false;
  let pollTimer = null;
  let lastMessageTime = null;
  let isNameSet = !!username;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .modmail-fab {
        position:fixed; right:24px; bottom:24px; z-index:9000;
        display:grid; place-items:center;
        width:60px; height:60px; border-radius:18px;
        border:1px solid rgba(124,111,255,.4);
        background:rgba(8,8,18,.88);
        -webkit-backdrop-filter:blur(24px); backdrop-filter:blur(24px);
        cursor:pointer;
        box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(124,111,255,.18),0 0 0 1px rgba(124,111,255,.1);
        transition:all .3s cubic-bezier(.16,1,.3,1);
      }
      .modmail-fab:hover {
        transform:translateY(-3px) scale(1.04);
        border-color:rgba(124,111,255,.7);
        box-shadow:0 16px 48px rgba(0,0,0,.6),0 0 30px rgba(124,111,255,.35);
      }
      .modmail-fab img { width:26px; height:26px; border-radius:4px; }
      .fab-badge {
        position:absolute; top:10px; right:10px;
        width:9px; height:9px; border-radius:50%;
        background:#34d399; border:2px solid rgba(8,8,18,.88); display:none;
      }
      .fab-badge.visible { display:block; }

      .modmail-panel {
        position:fixed; right:24px; bottom:96px; z-index:9001;
        width:400px; height:570px; max-height:82vh;
        display:none; flex-direction:column;
        border-radius:22px;
        background:rgba(7,7,15,.96);
        -webkit-backdrop-filter:blur(40px); backdrop-filter:blur(40px);
        border:1px solid rgba(255,255,255,.08);
        box-shadow:0 32px 80px rgba(0,0,0,.75),0 0 0 1px rgba(124,111,255,.07);
        overflow:hidden;
        font-family:'Inter',system-ui,sans-serif;
      }
      .modmail-panel.open { display:flex; animation:mmSlide .32s cubic-bezier(.16,1,.3,1) both; }
      @keyframes mmSlide {
        from{opacity:0;transform:translateY(14px) scale(.98);}
        to{opacity:1;transform:none;}
      }

      .modmail-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:15px 16px;
        background:rgba(255,255,255,.03);
        border-bottom:1px solid rgba(255,255,255,.07);
        flex-shrink:0; position:relative;
      }
      .modmail-header::before {
        content:''; position:absolute; top:0; left:0; right:0; height:2px;
        background:linear-gradient(90deg,transparent,#7c6fff,#a78bfa,transparent);
      }
      .modmail-header-info { display:flex; align-items:center; gap:10px; }
      .modmail-header-icon {
        width:36px; height:36px; border-radius:11px;
        background:rgba(124,111,255,.13); border:1px solid rgba(124,111,255,.25);
        display:grid; place-items:center; flex-shrink:0;
      }
      .modmail-header-icon img { width:18px; height:18px; }
      .modmail-header-text h4 { font-size:.92rem; font-weight:700; color:#eeeff8; margin:0; line-height:1.2; }
      .modmail-header-text p {
        font-size:.7rem; color:rgba(255,255,255,.38); margin:0;
        display:flex; align-items:center; gap:5px;
      }
      .modmail-header-text p::before {
        content:''; width:6px; height:6px; border-radius:50%;
        background:#34d399; box-shadow:0 0 6px #34d399; display:inline-block;
      }
      .modmail-close {
        width:28px; height:28px; border-radius:8px;
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08);
        color:rgba(255,255,255,.45); cursor:pointer; font-size:.95rem;
        display:grid; place-items:center; transition:all .18s;
      }
      .modmail-close:hover { background:rgba(255,255,255,.1); color:#fff; }

      .modmail-sticky-bar {
        background:rgba(124,111,255,.08); border-bottom:1px solid rgba(124,111,255,.15);
        padding:8px 16px; font-size:.73rem; color:rgba(196,181,253,.9);
        display:none; align-items:center; gap:8px; flex-shrink:0;
      }
      .modmail-sticky-bar svg { width:13px; height:13px; flex-shrink:0; color:#7c6fff; }

      .modmail-messages {
        flex:1; overflow-y:auto; padding:14px 8px;
        display:flex; flex-direction:column; gap:2px;
        scrollbar-width:thin; scrollbar-color:rgba(124,111,255,.2) transparent;
      }
      .modmail-messages::-webkit-scrollbar { width:4px; }
      .modmail-messages::-webkit-scrollbar-thumb { background:rgba(124,111,255,.25); border-radius:99px; }

      .modmail-msg-group {
        display:flex; gap:10px; padding:5px 8px;
        border-radius:10px; transition:background .15s;
      }
      .modmail-msg-group:hover { background:rgba(255,255,255,.02); }
      .discord-avatar {
        width:34px; height:34px; border-radius:50%;
        background:linear-gradient(135deg,#7c6fff,#a78bfa);
        flex-shrink:0; margin-top:2px; overflow:hidden;
      }
      .modmail-msg-group.staff .discord-avatar { background:linear-gradient(135deg,#34d399,#059669); }
      .discord-avatar img { width:100%; height:100%; object-fit:cover; }
      .modmail-msg-body { flex:1; min-width:0; }
      .modmail-msg-header { display:flex; align-items:baseline; gap:7px; margin-bottom:2px; }
      .modmail-msg-sender { font-size:.85rem; font-weight:700; color:#e5e5f8; }
      .modmail-msg-group.staff .modmail-msg-sender { color:#a78bfa; }
      .modmail-msg-time { font-size:.68rem; color:rgba(255,255,255,.25); font-weight:400; }
      .modmail-msg-content {
        font-size:.88rem; line-height:1.5; color:rgba(255,255,255,.72);
        white-space:pre-wrap; word-break:break-word;
      }
      .modmail-msg-content .msg-attachment {
        display:block; max-width:230px; margin-top:8px;
        border-radius:10px; border:1px solid rgba(255,255,255,.1);
      }

      .modmail-typing {
        padding:0 16px 4px; font-size:.7rem; color:rgba(167,139,250,.7);
        min-height:1rem; flex-shrink:0; display:none; align-items:center; gap:6px;
      }
      .typing-dots { display:flex; gap:3px; align-items:center; }
      .typing-dot {
        width:5px; height:5px; border-radius:50%; background:#a78bfa; opacity:.4;
        animation:tBounce 1.2s ease-in-out infinite;
      }
      .typing-dot:nth-child(2){animation-delay:.2s;} .typing-dot:nth-child(3){animation-delay:.4s;}
      @keyframes tBounce { 0%,60%,100%{transform:translateY(0);opacity:.4;} 30%{transform:translateY(-5px);opacity:1;} }

      .modmail-empty {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        flex:1; padding:36px 20px; text-align:center; gap:10px;
      }
      .modmail-empty-icon {
        width:68px; height:68px; border-radius:18px;
        background:rgba(124,111,255,.1); border:1px solid rgba(124,111,255,.2);
        display:grid; place-items:center;
      }
      .modmail-empty-icon img { width:32px; height:32px; }
      .modmail-empty h5 { font-size:.92rem; font-weight:700; color:rgba(255,255,255,.8); margin:0; }
      .modmail-empty p { font-size:.78rem; color:rgba(255,255,255,.32); margin:0; line-height:1.5; max-width:220px; }

      .modmail-name-form {
        padding:16px; background:rgba(255,255,255,.02);
        border-top:1px solid rgba(255,255,255,.07);
        display:flex; flex-direction:column; gap:10px; flex-shrink:0;
      }
      .modmail-name-form p { color:rgba(255,255,255,.4); margin:0; font-size:.78rem; }
      .modmail-name-input {
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
        border-radius:12px; padding:10px 13px; color:#fff; width:100%; outline:none;
        font-size:.88rem; font-family:inherit; transition:border-color .2s,box-shadow .2s;
      }
      .modmail-name-input:focus {
        border-color:rgba(124,111,255,.6); box-shadow:0 0 0 3px rgba(124,111,255,.12);
      }
      .modmail-name-btn {
        background:linear-gradient(135deg,#7c6fff,#a78bfa); color:#fff;
        padding:10px; border:none; border-radius:12px;
        font-weight:700; font-size:.88rem; cursor:pointer;
        transition:opacity .2s,transform .2s;
        box-shadow:0 6px 20px rgba(124,111,255,.35);
      }
      .modmail-name-btn:hover { opacity:.88; transform:translateY(-1px); }

      .modmail-input-area {
        padding:10px 12px 14px;
        background:rgba(255,255,255,.02);
        border-top:1px solid rgba(255,255,255,.06);
        flex-shrink:0;
      }
      .modmail-input-wrapper {
        display:flex; align-items:flex-end; gap:8px;
        background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
        border-radius:14px; padding:9px 11px;
        transition:border-color .2s,box-shadow .2s;
      }
      .modmail-input-wrapper:focus-within {
        border-color:rgba(124,111,255,.55); box-shadow:0 0 0 3px rgba(124,111,255,.1);
      }
      .modmail-input {
        flex:1; background:transparent; border:none; outline:none;
        color:#fff; font-size:.88rem; resize:none;
        max-height:120px; line-height:1.5; font-family:inherit;
      }
      .modmail-input::placeholder { color:rgba(255,255,255,.28); }
      .modmail-send {
        width:32px; height:32px; border-radius:9px;
        background:linear-gradient(135deg,#7c6fff,#a78bfa);
        border:none; cursor:pointer; flex-shrink:0;
        display:grid; place-items:center;
        transition:opacity .2s,transform .2s;
        box-shadow:0 4px 12px rgba(124,111,255,.4);
      }
      .modmail-send:hover { opacity:.85; transform:scale(1.06); }
      .modmail-send svg { width:15px; height:15px; color:#fff; }

      @media (max-width:480px) {
        .modmail-panel { right:0; bottom:0; width:100%; height:100%; max-height:100%; border-radius:0; }
        .modmail-fab { right:16px; bottom:16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createChatWidget() {

    const existingFab = document.querySelector('.ai-assistant-fab');
    if (existingFab) existingFab.remove();

    const fab = document.createElement('div');
    fab.className = 'modmail-fab magnetic-element hover-trigger';
    fab.innerHTML = `<img src="https://cdn.discordapp.com/emojis/1481397824028410008.png" alt="chat" /><div class="fab-badge"></div>`;
    fab.addEventListener('click', toggleChat);

    const panel = document.createElement('div');
    panel.className = 'modmail-panel';
    panel.id = 'modmailPanel';
    panel.innerHTML = `
      <div class="modmail-header">
        <div class="modmail-header-info">
          <div class="modmail-header-icon">
            <img src="https://cdn.discordapp.com/emojis/1481396753612804176.png" alt="staff" />
          </div>
          <div class="modmail-header-text">
            <h4>Hyperions Support</h4>
            <p>Staff usually replies within minutes</p>
          </div>
        </div>
        <button class="modmail-close" id="modmailClose">✕</button>
      </div>
      <div class="modmail-sticky-bar" id="modmailStickyBar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span id="modmailStickyContent"></span>
      </div>
      <div class="modmail-messages" id="modmailMessages">
        <div class="modmail-empty">
          <div class="modmail-empty-icon">
            <img src="https://cdn.discordapp.com/emojis/1481397824028410008.png" alt="chat" />
          </div>
          <h5>Start a Conversation</h5>
          <p>Send a message and our staff will reply directly here.</p>
        </div>
      </div>
      <div class="modmail-typing" id="modmailTyping">Staff is typing...</div>
      <div id="modmailNameArea"></div>
      <div class="modmail-input-area" id="modmailInputArea" style="display:none">
        <div class="modmail-input-wrapper">
          <textarea class="modmail-input" id="modmailInput" placeholder="Message #support" rows="1"></textarea>
          <button class="modmail-send" id="modmailSend">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    document.getElementById('modmailClose').addEventListener('click', toggleChat);
    document.getElementById('modmailSend').addEventListener('click', sendMessage);
    document.getElementById('modmailInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    const input = document.getElementById('modmailInput');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    if (isNameSet) {
      showChatInput();
      loadHistory();
    } else {
      showNameForm();
    }
  }

  function showNameForm() {
    const area = document.getElementById('modmailNameArea');
    area.innerHTML = `
      <div class="modmail-name-form">
        <p>Enter your name so our staff knows who they're helping:</p>
        <input class="modmail-name-input" id="modmailNameInput" placeholder="Your name or Discord tag" maxlength="60" />
        <button class="modmail-name-btn" id="modmailNameBtn">Start Chat</button>
      </div>
    `;
    document.getElementById('modmailNameBtn').addEventListener('click', submitName);
    document.getElementById('modmailNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitName();
    });
  }

  function submitName() {
    const input = document.getElementById('modmailNameInput');
    const name = input.value.trim();
    if (!name) { input.style.background = 'rgba(251,113,133,.1)'; return; }
    username = name;
    localStorage.setItem('modmail_username', username);
    isNameSet = true;
    document.getElementById('modmailNameArea').innerHTML = '';
    showChatInput();
    loadHistory();
  }

  function showChatInput() {
    document.getElementById('modmailInputArea').style.display = 'block';
    document.getElementById('modmailInput').focus();
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    const panel = document.getElementById('modmailPanel');
    if (chatOpen) {
      panel.classList.add('open');
      document.querySelector('.modmail-fab .fab-badge').style.display = 'none';
      if (isNameSet) {
        startPolling();
        document.getElementById('modmailInput').focus();
      }
    } else {
      panel.classList.remove('open');
      stopPolling();
    }
  }

  async function sendMessage() {
    const input = document.getElementById('modmailInput');
    const content = input.value.trim();
    if (!content) return;

    const btn = document.getElementById('modmailSend');
    btn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    appendMessage('user', username, content, new Date().toISOString());

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', sessionId, username, content })
      });
    } catch (err) {
      console.error('[modmail] Send failed:', err);
    }

    btn.disabled = false;
    input.focus();
    startPolling();
  }

  function appendMessage(sender, senderName, content, createdAt) {
    const container = document.getElementById('modmailMessages');

    const lastMsg = container.lastElementChild;
    if (lastMsg && lastMsg.classList.contains('modmail-msg-group')) {
      const lastContentEl = lastMsg.querySelector('.modmail-msg-content');
      const lastSenderEl = lastMsg.querySelector('.modmail-msg-sender');
      if (lastContentEl && lastSenderEl) {
        if (lastContentEl.textContent.trim() === content.trim() && 
            lastSenderEl.textContent.trim() === senderName.trim()) {
          return;
        }
      }
    }

    const empty = container.querySelector('.modmail-empty');
    if (empty) empty.remove();

    const time = new Date(createdAt);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarUrl = sender === 'staff' 
      ? "https://cdn.discordapp.com/emojis/1481396753612804176.png" 
      : "https://cdn.discordapp.com/emojis/1481397985370706122.png";

    let staffStyle = '';
    if (sender === 'staff') {
      const colors = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#f472b6'];
      let hash = 0;
      for (let i = 0; i < senderName.length; i++) hash = senderName.charCodeAt(i) + ((hash << 5) - hash);
      const color = colors[Math.abs(hash) % colors.length];
      staffStyle = `style="color: ${color}"`;
    }

    const div = document.createElement('div');
    div.className = `modmail-msg-group ${sender}`;

    const escaped = escapeHtml(content);
    const withImages = escaped.replace(/(https?:\/\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s<>"]*)?)/gi, (url) => {
      return `<img src="${url}" class="msg-attachment" loading="lazy" onclick="window.open(this.src, '_blank')" />`;
    });

    div.innerHTML = `
      <div class="discord-avatar">
        <img src="${avatarUrl}" alt="avatar" />
      </div>
      <div class="modmail-msg-header">
        <span class="modmail-msg-sender" ${staffStyle}>${escapeHtml(senderName)}</span>
        <span class="modmail-msg-time">${timeStr}</span>
      </div>
      <div class="modmail-msg-content">${withImages.replace(/\n/g, '<br>')}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function loadHistory() {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history', sessionId })
      });
      const data = await res.json();

      if (data.stickyMessage) {
        const bar = document.getElementById('modmailStickyBar');
        const content = document.getElementById('modmailStickyContent');
        content.textContent = data.stickyMessage;
        bar.style.display = 'flex';
      }

      if (data.ok) {
        const container = document.getElementById('modmailMessages');
        if (data.messages?.length) {
          const empty = container.querySelector('.modmail-empty');
          if (empty) empty.remove();
          container.innerHTML = '';
          data.messages.forEach(m => {
            appendMessage(m.sender, m.sender_name, m.content, m.created_at);
            lastMessageTime = m.created_at;
          });
        } else if (data.initialMessage) {

          const empty = container.querySelector('.modmail-empty');
          if (empty) empty.remove();
          appendMessage('staff', 'System', data.initialMessage, new Date().toISOString());
        }
      }
      if (chatOpen) startPolling();
    } catch (err) {
      console.error('[modmail] Load history failed:', err);
    }
  }

  async function pollMessages() {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history', sessionId, after: lastMessageTime })
      });
      const data = await res.json();
      
      const typingEl = document.getElementById('modmailTyping');
      if (typingEl) {
        typingEl.style.display = data.isStaffTyping ? 'block' : 'none';
      }

      if (data.ok && data.messages?.length) {
        data.messages.forEach(m => {
          appendMessage(m.sender, m.sender_name, m.content, m.created_at);
          lastMessageTime = m.created_at;
          if (m.sender === 'staff' && !chatOpen) {
            document.querySelector('.modmail-fab .fab-badge').style.display = 'block';
          }
        });
      }
    } catch (err) {
      console.error('[modmail] Poll failed:', err);
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollMessages, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function setupCursorInteractions() {
    const outer = document.getElementById('dotCursorOuter');
    if (!outer) return;

    document.querySelectorAll('.modmail-fab, .modmail-send, .modmail-close, .modmail-name-btn').forEach(el => {
      el.addEventListener('mouseenter', () => outer.classList.add('hovering'));
      el.addEventListener('mouseleave', () => outer.classList.remove('hovering'));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  injectStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createChatWidget();
      setupCursorInteractions();
    });
  } else {
    createChatWidget();
    setupCursorInteractions();
  }
})();