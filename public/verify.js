document.addEventListener('DOMContentLoaded', () => {
    const stages = {
        init: document.getElementById('stage-init'),
        login: document.getElementById('stage-login'),
        scan: document.getElementById('stage-scan'),
        success: document.getElementById('stage-success')
    };

    const initRows = [
        document.getElementById('status-1'),
        document.getElementById('status-2'),
        document.getElementById('status-3')
    ];

    const scanRows = [
        { el: document.getElementById('scan-1'), text: 'ID_VALIDATION_QUEUE' },
        { el: document.getElementById('scan-2'), text: 'ROLE_ASSIGNMENT_CHECK' },
        { el: document.getElementById('scan-3'), text: 'TRADE_ACCESS_SIGNAL' }
    ];

    const scanFill = document.getElementById('scanFill');
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const trustValEl = document.getElementById('trustVal');
    const rankValEl = document.getElementById('rankVal');
    const identityDockEl = document.getElementById('identityDock');
    const identityNameEl = document.getElementById('identityName');
    const identityAvatarEl = document.getElementById('identityAvatar');

    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    function getAvatarUrl(user) {
        if (user?.id && user?.avatar) {
            const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
            return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
        }
        const fallbackIndex = Number(user?.discriminator || 0) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
    }

    function hydrateIdentity(user) {
        if (!user) return;
        identityDockEl.classList.add('active');
        identityNameEl.textContent = user.username || 'Discord User';
        identityAvatarEl.src = getAvatarUrl(user);
        userAvatarEl.src = getAvatarUrl(user);
    }

    async function runTerminalSequence() {
        for (const row of initRows) {
            await wait(600 + Math.random() * 400);
            row.classList.add('complete');
            gsap.from(row, { x: -10, opacity: 0.5, duration: 0.3 });
        }

        await wait(800);

        const userData = getCookie('discord_user');
        if (userData) {
            try {
                const user = JSON.parse(decodeURIComponent(userData));
                hydrateIdentity(user);
                transitionTo('scan');
                runFullScan(user);
                return;
            } catch (e) {
                console.error('Cookie parse failed:', e);
            }
        }
        transitionTo('login');
    }

    async function runFullScan(user) {
        let progress = 0;
        const totalSteps = scanRows.length;

        for (let i = 0; i < totalSteps; i++) {
            const row = scanRows[i];
            row.el.classList.add('complete');
            if (i === 0) row.text = `ID_VALID_FOR_${user.username.toUpperCase()}`;
            if (i === 1) row.text = 'TRADE_VERIFIED_ROLE_GRANTED';
            if (i === 2) row.text = 'DISCORD_ACCESS_SIGNAL_SENT';

            const targetProg = ((i + 1) / totalSteps) * 100;
            const startProg = progress;
            const duration = 1300;
            const startTime = performance.now();
            const span = row.el.querySelector('span');
            const originalText = row.text;

            const textInterval = setInterval(() => {
                const randomChars = '!@#$%^&*()_+{}[]';
                const char = randomChars[Math.floor(Math.random() * randomChars.length)];
                span.textContent = `${originalText} [${char}]`;
            }, 50);

            function updateProgress(now) {
                const elapsed = now - startTime;
                const p = Math.min(elapsed / duration, 1);
                progress = startProg + (targetProg - startProg) * p;
                scanFill.style.width = `${progress}%`;
                if (p < 1) requestAnimationFrame(updateProgress);
            }
            requestAnimationFrame(updateProgress);

            await wait(duration);
            clearInterval(textInterval);
            span.textContent = originalText
                .replace('_QUEUE', '_OK')
                .replace('_CHECK', '_PASSED')
                .replace('_SIGNAL', '_CONFIRMED')
                .replace('_GRANTED', '_ACTIVE');
        }

        await wait(600);
        showFinal(user);
    }

    async function showFinal(user) {
        const avatarUrl = getAvatarUrl(user);
        userNameEl.textContent = user.username;
        userAvatarEl.src = avatarUrl;
        hydrateIdentity(user);

        let profile = { trustScore: 98, rank: 'Trade Verified', isVerified: true };
        try {
            const res = await fetch(`/api/user-profile?id=${encodeURIComponent(user.id)}`);
            if (res.ok) {
                const data = await res.json();
                profile = { ...profile, ...data };
            }
        } catch (e) {
            console.error('Profile fetch failed, using fallback profile');
        }

        trustValEl.textContent = `${profile.trustScore}%`;
        rankValEl.textContent = profile.isVerified ? 'Trade Verified' : (profile.rank || 'Member');

        transitionTo('success');

        gsap.to('.glass-panel', {
            borderColor: 'rgba(34, 197, 94, 0.4)',
            duration: 1.5,
            boxShadow: '0 40px 100px rgba(34, 197, 94, 0.15)'
        });
    }

    function transitionTo(stageKey) {
        Object.values(stages).forEach((stage) => {
            if (stage === stages[stageKey]) {
                stage.style.display = 'flex';
                stage.classList.add('active');
            } else {
                stage.style.display = 'none';
                stage.classList.remove('active');
            }
        });
    }

    runTerminalSequence();
});
