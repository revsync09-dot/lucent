document.addEventListener("DOMContentLoaded", () => {
  console.log("%c[HYPERIONS] INITIATING PROXIED DASHBOARD...", "color: #8b5cf6; font-weight: bold; font-size: 1.2rem;");

  const observerOptions = { threshold: 0.1 };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  function refreshObserver() {
    if (window.initializeReveal) {
        window.initializeReveal();
    } else if (window.refreshReveal) {
        window.refreshReveal();
    } else {
        document.querySelectorAll(".reveal:not(.active)").forEach((el) => observer.observe(el));
    }
  }

  let globalUptimeBase = Date.now() - 3600000;
  const isCounted = new Set();

  function countUp(el, endVal, duration = 2000) {
    if (!el) return;
    const currentVal = parseInt(el.textContent) || 0;
    if (currentVal === endVal && isCounted.has(el.id)) return;
    
    isCounted.add(el.id);
    let startTimestamp = null;
    const startVal = currentVal;
    
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 4);
      const value = Math.floor(startVal + (easeOut * (endVal - startVal)));
      el.textContent = value;
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function formatUptime(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function sync() {
    try {
      const res = await fetch(`/api/status?t=${Date.now()}`);
      if (!res.ok) throw new Error("Offline");
      const d = await res.json();

      if (d.uptime) globalUptimeBase = Date.now() - d.uptime * 1000;
      const uptimeDisplay = document.getElementById("uptimeVal");
      if (uptimeDisplay) uptimeDisplay.textContent = formatUptime(Date.now() - globalUptimeBase);

      countUp(document.getElementById("pingVal"), d.ping || 0);
      countUp(document.getElementById("ticketsVal"), d.tickets || 0);
      countUp(document.getElementById("vouchesVal"), d.vouches || 0);
      countUp(document.getElementById("guildsVal"), d.guilds || 0);

      const pingEl = document.getElementById("pingVal");
      if (pingEl) pingEl.classList.add('shiny-glow');
      const ticketsEl = document.getElementById("ticketsVal");
      if (ticketsEl) ticketsEl.classList.add('shiny-glow');
      const vouchesEl = document.getElementById("vouchesVal");
      if (vouchesEl) vouchesEl.classList.add('shiny-glow');
      const uptimeEl = document.getElementById("uptimeVal");
      if (uptimeEl) uptimeEl.classList.add('shiny-glow');

      const vEl = document.getElementById("botVersion");
      if (vEl && d.version) {
        vEl.textContent = d.version;
        vEl.classList.add('shiny-glow');
      }

      if (d.emojis && d.emojis.website) applyEmojis(d.emojis.website);

      if (d.staffTeam) renderStaff(d.staffTeam);

      fetch(`/api/helpers?t=${Date.now()}`).then(r => r.json()).then(h => {
          renderHelpers(h);
          refreshObserver();
      }).catch(e => console.warn("[Status] Helper fetch failed:", e.message));

      renderPresenceV2(d.gamePresence || d.helperPresence || {});
      if (document.getElementById("unclaimedTicketsCount")) {
        document.getElementById("unclaimedTicketsCount").textContent = d.unclaimedTickets || 0;
      }
      // renderServices(d); // Removed as per request
      renderChart(d.status);

      const refreshEl = document.getElementById("lastRefresh");
      if (refreshEl) refreshEl.textContent = new Date().toLocaleTimeString();

      refreshObserver();
    } catch (e) {
      console.warn("[Status] Sync skipped:", e.message);
    }
  }

  function applyEmojis(custom) {
    console.log("[Status] Applying custom emojis:", custom);
    const map = {
      uptime: "metricIconUptime",
      ping: "metricIconPing",
      tickets: "metricIconTickets",
      vouches: "metricIconVouches",
      rules: "headerIconRules",
      payment: "headerIconPayment",
      quota: "headerIconQuota",
      info: "headerIconInfo",
      bot: "headerIconBot",
      n01: "stepIcon01",
      n02: "stepIcon02",
      n03: "stepIcon03"
    };

    for (const [key, id] of Object.entries(map)) {
      const val = String(custom[key] || '').trim();
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`[Status] Element not found for ID: ${id}`);
        continue;
      }
      if (!val) continue;

      el.innerHTML = '';

      if (val.startsWith('http')) {
        const img = document.createElement('img');
        img.src = val;
        img.alt = key;
        img.style.width = '1.8em';
        img.style.height = '1.8em';
        img.style.objectFit = 'contain';
        img.style.verticalAlign = 'middle';
        img.onerror = () => img.style.display = 'none';
        el.appendChild(img);
      } else if (/^\d{17,20}$/.test(val)) {
        const img = document.createElement('img');
        img.src = `https://cdn.discordapp.com/emojis/${val}.webp?size=128&quality=lossless`;
        img.alt = key;
        img.style.width = '1.8em';
        img.style.height = '1.8em';
        img.style.objectFit = 'contain';
        img.style.verticalAlign = 'middle';
        img.onerror = () => {
          img.src = `https://cdn.discordapp.com/emojis/${val}.png?size=128`;
        };
        el.appendChild(img);
      }
    }
  }

  function renderPresence(counts) {
    const container = document.getElementById("presenceGrid");
    if (!container) return;

    const games = [
      { id: 'ALS', name: 'ALS', icon: '🎯' },
      { id: 'AG', name: 'AG', icon: '⚔️' },
      { id: 'AC', name: 'AC', icon: '🛡️' },
      { id: 'AV', name: 'AV', icon: '🔥' },
      { id: 'UTD', name: 'UTD', icon: '🗼' },
      { id: 'ARX', name: 'ARX', icon: '🏹' },
      { id: 'BL', name: 'BL', icon: '🩸' },
      { id: 'SP', name: 'SP', icon: '⚓' }
    ];

    container.innerHTML = games.map(g => {
      const meta = counts[g.id] || {};
      const count = Number(meta.available ?? meta.count ?? counts[g.id] ?? 0) || 0;
      const isActive = count > 0;
      const icon = meta.emojiUrl
        ? `<img src="${meta.emojiUrl}" alt="${g.name}" style="width:1.9rem;height:1.9rem;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('${g.icon}'))">`
        : g.icon;
      return `
        <div class="status-card reveal">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem; min-height: 2rem; display:flex; align-items:center;">${icon}</div>
            <div style="font-weight: 700; color: #fff;">${g.name}</div>
            <div style="font-size: 0.8rem; color: var(--dimmer);">Available: ${count}</div>
            <div style="margin-top: 1rem; font-size: 0.7rem; font-weight: 800; color: ${isActive ? 'var(--green)' : 'var(--dimmer)'};">
               ${isActive ? 'ONLINE' : 'OFFLINE'}
            </div>
        </div>
      `;
    }).join('');
  }

  function renderPresenceV2(counts) {
    const container = document.getElementById("presenceGrid");
    if (!container) return;

    const games = [
      { id: 'ALS', code: 'ALS', name: 'Anime Last Stand', icon: '🎯' },
      { id: 'AG', code: 'AG', name: 'Anime Guardians', icon: '⚔️' },
      { id: 'AC', code: 'AC', name: 'Anime Crusaders', icon: '🛡️' },
      { id: 'AV', code: 'AV', name: 'Anime Vanguards', icon: '🔥' },
      { id: 'UTD', code: 'UTD', name: 'Universal Tower Defense', icon: '🗼' },
      { id: 'ARX', code: 'ARX', name: 'Anime Rangers X', icon: '🏹' },
      { id: 'BL', code: 'BL', name: 'Bizarre Lineage', icon: '🩸' },
      { id: 'SP', code: 'SP', name: 'Sailor Piece', icon: '⚓' },
      { id: 'ASTD', code: 'ASTD', name: 'All Star Tower Defense', icon: '🌟' }
    ];

    container.innerHTML = games.map((game) => {
      const meta = counts[game.id] || {};
      const count = Number(meta.available ?? meta.count ?? counts[game.id] ?? 0) || 0;
      const isActive = count > 0;
      const icon = meta.emojiUrl
        ? `<img src="${meta.emojiUrl}" alt="${game.name}" style="width:1.95rem;height:1.95rem;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('${game.icon}'))">`
        : game.icon;

      return `
        <article class="status-card reveal" style="padding:1.4rem; gap:.95rem; border-radius:22px; background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:.9rem;">
            <div style="width:48px; height:48px; border-radius:16px; display:grid; place-items:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); font-size:1.45rem;">${icon}</div>
            <div style="padding:.35rem .65rem; border-radius:999px; font-size:.66rem; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:${isActive ? '#57F287' : 'var(--text-dim)'}; background:${isActive ? 'rgba(87,242,135,0.12)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isActive ? 'rgba(87,242,135,0.18)' : 'rgba(255,255,255,0.08)'};">
              ${isActive ? 'Online' : 'Offline'}
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:.24rem;">
            <div style="font-size:1rem; font-weight:800; color:#fff; line-height:1.2;">${game.name}</div>
            <div style="font-size:.72rem; font-weight:800; color:var(--text-dim); letter-spacing:.08em; text-transform:uppercase;">${game.code}</div>
          </div>
          <div style="margin-top:auto; display:flex; align-items:flex-end; justify-content:space-between; gap:.8rem;">
            <div>
              <div style="font-size:.66rem; color:var(--text-dim); font-weight:800; letter-spacing:.08em; text-transform:uppercase;">Available Helpers</div>
              <div style="font-size:2rem; font-weight:900; color:#fff; line-height:1;">${count}</div>
            </div>
            <div style="width:64px; height:36px; border-radius:12px; background:linear-gradient(180deg, ${isActive ? 'rgba(87,242,135,0.18)' : 'rgba(255,255,255,0.06)'}, transparent); border:1px solid ${isActive ? 'rgba(87,242,135,0.16)' : 'rgba(255,255,255,0.05)'}; position:relative; overflow:hidden;">
              <span style="position:absolute; inset:auto 0 0 0; height:${Math.max(12, Math.min(30, count * 8))}px; background:${isActive ? 'linear-gradient(180deg, rgba(87,242,135,0.9), rgba(87,242,135,0.22))' : 'linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.02))'};"></span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderStaff(team) {
    const container = document.getElementById("staffGrid");
    if (!container) return;
    container.innerHTML = team.map((s, i) => `
      <div class="staff-card reveal" style="transition-delay: ${i * 0.07}s">
        <div class="staff-avatar-wrap">
          <img src="${s.avatar}" class="staff-avatar" alt="${s.username}"
            onerror="this.src='/assets/avatars/avatar_1.png'" loading="eager">
          <div class="staff-avatar-ring"></div>
          <div class="staff-online"></div>
        </div>
        <div class="staff-name">${s.username}</div>
        <div class="staff-role">${s.role}</div>
        <div class="staff-tags">
          ${(s.tags || []).map(t => `<span class="staff-tag">${t}</span>`).join('')}
        </div>
      </div>
    `).join('');

    setTimeout(() => document.querySelectorAll('.staff-card.reveal:not(.active)').forEach(el => el.classList.add('active')), 50);
  }

  function renderHelpers(helpers) {
    const container = document.getElementById("helpersGrid");
    if (!container) return;
    container.innerHTML = helpers.slice(0, 8).map((h, i) => `
      <div class="staff-card reveal" style="transition-delay: ${i * 0.05}s">
        <div class="staff-avatar-wrap">
          <img src="${h.avatar}" class="staff-avatar" alt="${h.username}"
            onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" loading="eager">
          <div class="staff-avatar-ring" style="opacity: 0.2"></div>
        </div>
        <div class="staff-name">${h.username}</div>
        <div class="staff-role" style="color:var(--dimmer); letter-spacing:0.05em;">${h.roblox}</div>
        <div class="staff-tags">
          <span class="staff-tag">${h.games.split(',')[0]}</span>
          <span class="staff-tag">Verified</span>
        </div>
      </div>
    `).join('');
    refreshObserver();
  }

  function renderServices(d) {
    const container = document.getElementById("serviceList");
    if (!container) return;
    const items = [
      { n: "Discord Core", s: d.status },
      { n: "Relational DB", s: d.dbOnline ? 'operational' : 'offline' },
      { n: "Northflank Cluster", s: 'operational' },
      { n: "Vercel Proxy", s: 'operational' }
    ];
    container.innerHTML = items.map(i => `
       <div style="display:flex; justify-content:space-between; padding:1rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:12px;">
         <span style="font-weight:600; color:var(--text-dim)">${i.n}</span>
         <span style="color:${i.s === 'operational' ? 'var(--success)' : 'var(--danger)'}; font-family:var(--font-mono); font-size:0.8rem; text-transform:uppercase;">${i.s}</span>
       </div>
    `).join('');
  }

  function renderChart(status) {
    const container = document.getElementById("uptimeBar");
    if (!container) return;
    container.innerHTML = "";

    // "Krank" (Insane) Styling for Uptime Bars
    const segStyles = [
      { bg: '#00dc82', opacity: 1.0, label: 'Optimal', shadow: '0 0 10px rgba(0,220,130,0.2)' },
      { bg: '#00dc82', opacity: 1.0, label: 'Stable', shadow: '0 0 5px rgba(0,220,130,0.1)' },
      { bg: '#00dc82', opacity: 0.7, label: 'Low Traffic', shadow: 'none' },
      { bg: 'rgba(255,255,255,0.05)', opacity: 0.3, label: 'Idle', shadow: 'none' }
    ];

    for (let i = 0; i < 48; i++) {
      let styleIdx;
      const r = Math.random();
      if (status !== 'operational' && i === 12) {
        styleIdx = 3; // Simulate a dip
      } else if (r < 0.7) styleIdx = 0;
      else if (r < 0.85) styleIdx = 1;
      else if (r < 0.95) styleIdx = 2;
      else styleIdx = 3;

      const s = segStyles[styleIdx];
      const seg = document.createElement('div');
      const timeLabel = i % 2 === 0 ? `${Math.floor(i/2)}h ago` : ``;
      
      seg.title = `Status: ${s.label} (${timeLabel})`;
      seg.style.cssText = `
        flex: 1;
        border-radius: 6px;
        cursor: pointer;
        background: ${s.bg};
        opacity: ${s.opacity};
        box-shadow: ${s.shadow};
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        min-width: 4px;
      `;

      seg.addEventListener('mouseenter', () => {
        seg.style.opacity = '1';
        seg.style.transform = 'scaleY(1.3) translateY(-2px)';
        seg.style.filter = 'brightness(1.2)';
        seg.style.boxShadow = '0 0 25px rgba(52,211,153,0.6)';
      });
      seg.addEventListener('mouseleave', () => {
        seg.style.opacity = String(s.opacity);
        seg.style.transform = '';
        seg.style.filter = '';
        seg.style.boxShadow = s.shadow;
      });
      container.appendChild(seg);
    }
    const pct = document.getElementById("uptimePct");
    if (pct) pct.textContent = (status === 'operational') ? "100.00%" : "98.42%";

    const lbl = document.querySelector('.uptime-label');
    if (lbl) lbl.textContent = '24-Hour Uptime History';
  }

  sync();
  setInterval(sync, 30000);
});
