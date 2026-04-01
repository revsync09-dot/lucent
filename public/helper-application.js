document.addEventListener("DOMContentLoaded", () => {
  console.log("%c[HYPERIONS] HELPER APPLICATION INITIALIZED", "color: #8b5cf6; font-weight: bold;");

  const SCREENSHOT_PROMPT = "Please send an screenshot of your team below";
  const MEDIA_ONLY_QUESTIONS = new Set([
    SCREENSHOT_PROMPT.toLowerCase(),
    "picture of the meta units with ultima",
    "picture of artifacts",
    "what ascension are you on (picture)",
    "what level are you (picture)",
    "usage of any ai software will result in your rejection."
  ]);
  const GAME_QUESTIONS = {
    ALS: [
      "Do you got tui goku glitch (photo)",
      "Can you solo the new event gamemode",
      "How many hours are you available",
      "Do you have the meta units for the update with glitch or double avatar"
    ],
    AG: [
      "Picture of the meta units with ultima",
      "Are you able to solo new event gamemode",
      "Are you able to do 1000% for all types of gamemode",
      "How many hours your available",
      "Picture of artifacts"
    ],
    AC: [
      "Can you solo all content",
      "Picture of meta units",
      "How many hours are you available",
      "What lvl are you ingame"
    ],
    UTD: [
      "What level are you ingame?",
      "What are your best units (in a image)",
      "How many hours are you available",
      "Can you solo all content"
    ],
    AV: [
      "Are you able to go through new update",
      "Do you got meta units with monarch(picture)",
      "Do you have most of the vanguards units (picture)",
      "Are you able to do the vanguard units quest line",
      "How many hours are you available"
    ],
    BL: [
      "usage of any ai software will result in your rejection.",
      "Do you know exactly what stats each stand scales off of?",
      "Give us the top 3 stands you think are best in your opinion.",
      "What's your prestige ingame? (We will verify so do not lie)",
      "How long have you been playing bizzare lineage for?",
      "If a member asks you for help with raids in the server, what will you do?",
      "What makes you a more suitable person for this role instead of the other applicants?",
      "Prove us you are knowledgeable enough for this role by telling us a few key stuff about the game.",
      "How much free time do you approximately have to dedicate into answering questions?",
      "Can you give us a few examples of what questions you are able to answer?",
      "Have you ever participated in gang wars? And if so, did you win?"
    ],
    SP: [
      "How would you help a new player progress quickly in Sailor Piece?",
      "What is your step-by-step plan when carrying someone through bosses or grinding?",
      "How do you deal with a player who keeps dying during farming or bosses?",
      "How do you explain grinding routes or farming methods clearly?",
      "What do you focus on more when helping: levels, gear, or money? Why?",
      "How do you adapt if a player has very weak stats or bad equipment?",
      "If a player doesn’t follow your instructions, what do you do?",
      "How do you make grinding less boring for the player you are helping?"
    ],
    ARX: [
      "How would you carry a low-level player through a difficult ARX stage step by step?",
      "What do you do if the player places units incorrectly during a run?",
      "How do you adjust your strategy if your carry is about to fail?",
      "How do you explain unit placement to a beginner in ARX?",
      "What do you prioritize during a carry: protecting the base or maximizing damage? Why?",
      "How do you manage timing and ability usage during a carry?",
      "If a player is too slow in ARX, how do you handle it without being toxic?",
      "How do you choose which units to use when carrying weaker players?"
    ],
    ASTD: [
      "Do you have cooler and aizen",
      "Do you have 3x (not need)",
      "Do you have the meta units",
      "Do you have most of the 7 stars (picture included with previous question)",
      "How many hours are you available",
      "Are you able to solo the raids",
      "How far are you able to reach in gauntlet, infinite, and farm",
      "Are you able to solo trial 25-100 on extreme"
    ],
    APX: [
      "Can you solo all content",
      "Picture of meta units",
      "How many hours are you available",
      "What lvl are you ingame",
      "What is your highest wave in siege mode"
    ]
  };
  const GAME_LABELS = {
    ALS: "Anime Last Stand (ALS)",
    AG: "Anime Guardians (AG)",
    AC: "Anime Crusaders (AC)",
    UTD: "Universal Tower Defense (UTD)",
    AV: "Anime Vanguards (AV)",
    BL: "Bizarre Lineage (BL)",
    SP: "Sailor Piece (SP)",
    ARX: "Anime Rangers X (ARX)",
    ASTD: "All Star Tower Defense (ASTD)",
    APX: "Anime Paradox (APX)"
  };

  const loader = document.getElementById("loadingScreen");
  const loaderBar = document.getElementById("loaderBar");
  let loadProgress = 0;
  const loadInterval = setInterval(() => {
    loadProgress += Math.random() * 15;
    if (loadProgress >= 100) {
      loadProgress = 100;
      clearInterval(loadInterval);
      const loaderText = loader.querySelector(".loader-text");
      if (loaderText) loaderText.textContent = "Systems Ready";
      setTimeout(() => loader && loader.classList.add("hidden"), 500);
    }
    if (loaderBar) loaderBar.style.width = `${loadProgress}%`;
  }, 100);

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return null;
  };

  function isMediaOnlyQuestion(question) {
    return MEDIA_ONLY_QUESTIONS.has(String(question).trim().toLowerCase());
  }

  function requiresMediaUpload(question) {
    return /(picture|photo|clip|screenshot)/i.test(String(question));
  }

  const discordUserStr = getCookie("discord_user");
  const loginSection = document.getElementById("loginSection");
  const formSection = document.getElementById("formSection");

  if (discordUserStr) {
    try {
      const user = JSON.parse(decodeURIComponent(discordUserStr));
      if (loginSection) loginSection.style.display = "none";
      if (formSection) formSection.style.display = "block";

      const tagInput = document.getElementById("discordTag");
      const idInput = document.getElementById("discordUserId");
      if (tagInput) {
        tagInput.value = user.discriminator === "0" ? user.username : `${user.username}#${user.discriminator}`;
        tagInput.readOnly = true;
      }
      if (idInput) {
        idInput.value = user.id;
        idInput.readOnly = true;
      }
    } catch (e) {
      console.warn("Auth error:", e);
    }
  }

  const setupCustomSelect = (btnId, dropdownId, labelId, hiddenId) => {
    const btn = document.getElementById(btnId);
    const dropdown = document.getElementById(dropdownId);
    const label = document.getElementById(labelId);
    const hidden = document.getElementById(hiddenId);
    const wrap = btn.closest(".custom-select-wrap");
    const closeDropdown = () => {
      dropdown.classList.remove("open");
      btn.classList.remove("open");
      wrap.classList.remove("is-open");
    };

    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle("open");
      btn.classList.toggle("open", isOpen);
      wrap.classList.toggle("is-open", isOpen);

      document.querySelectorAll(".custom-select-dropdown.open").forEach((node) => {
        if (node !== dropdown) {
          node.classList.remove("open");
          node.previousElementSibling.classList.remove("open");
          node.closest(".custom-select-wrap").classList.remove("is-open");
        }
      });
    });

    dropdown.querySelectorAll(".custom-select-option").forEach((opt) => {
      opt.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hidden.value = opt.getAttribute("data-value");
        label.textContent = opt.textContent.trim();
        dropdown.querySelectorAll(".custom-select-option").forEach((item) => item.classList.remove("active"));
        opt.classList.add("active");
        closeDropdown();
        updateProgress();
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!wrap.contains(event.target)) closeDropdown();
    });
  };

  setupCustomSelect("ageBtn", "ageDropdown", "ageLabel", "age");
  setupCustomSelect("timezoneBtn", "timezoneDropdown", "timezoneLabel", "timezone");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

  const form = document.getElementById("helperApplicationForm");
  const catQuestions = document.getElementById("categoryQuestions");
  const catList = document.getElementById("categoryQuestionsList");
  const progressPercent = document.getElementById("progressPercent");
  const progressBar = document.getElementById("progressBar");
  const uploadZone = document.getElementById("uploadZone");
  const fileInput = document.getElementById("inventoryScreenshots");
  const preview = document.getElementById("screenshotPreview");
  const submitBtn = document.getElementById("submitButton");
  const statusEl = document.getElementById("formStatus");
  let selectedFiles = [];

  function renderCategoryQuestions() {
    const selected = Array.from(form.querySelectorAll('input[name="strongestGames"]:checked')).map((input) => input.value);
    const savedValues = {};
    form.querySelectorAll('[name^="question_"]').forEach((input) => {
      savedValues[input.name] = input.value;
    });

    catList.innerHTML = "";
    const withQuestions = selected.filter((game) => GAME_QUESTIONS[game]);
    if (withQuestions.length === 0) {
      catQuestions.style.display = "none";
      return;
    }

    catQuestions.style.display = "block";
    withQuestions.forEach((code) => {
      const panel = document.createElement("div");
      panel.className = "question-item reveal active";
      panel.innerHTML = `<span class="question-text">${GAME_LABELS[code] || code} Application</span>`;

      GAME_QUESTIONS[code].forEach((question, idx) => {
        if (isMediaOnlyQuestion(question)) {
          const note = document.createElement("p");
          note.className = "question-media-note";
          note.textContent = question;
          panel.appendChild(note);
          return;
        }

        const wrap = document.createElement("div");
        wrap.className = "input-wrapper form-group";
        const inputName = `question_${code}_${idx}`;
        const existingValue = savedValues[inputName] || "";
        wrap.innerHTML = `
          <input type="text" name="${inputName}" required placeholder=" " value="${existingValue}">
          <label>${question}</label>
        `;
        panel.appendChild(wrap);

        if (requiresMediaUpload(question)) {
          const hint = document.createElement("p");
          hint.className = "question-media-hint";
          hint.textContent = "Upload the requested proof in the asset section below.";
          panel.appendChild(hint);
        }
      });

      catList.appendChild(panel);
    });
  }

  function updateProgress() {
    const data = new FormData(form);
    const coreFields = ["discordTag", "discordUserId", "age", "timezone", "availability", "experience", "motivation"];
    let filled = 0;

    coreFields.forEach((field) => {
      const value = data.get(field);
      const minLen = field === "age" || field === "timezone" ? 1 : 2;
      if (value && value.toString().trim().length >= minLen) filled++;
    });

    if (document.getElementById("termsAccepted")?.checked) filled++;

    const selectedGames = data.getAll("strongestGames").slice(0, 1);
    if (selectedGames.length > 0) filled++;

    let totalRequiredQs = 0;
    let answeredQs = 0;
    selectedGames.forEach((code) => {
      (GAME_QUESTIONS[code] || []).forEach((question, index) => {
        if (!isMediaOnlyQuestion(question)) {
          totalRequiredQs++;
          if ((data.get(`question_${code}_${index}`) || "").trim().length > 0) answeredQs++;
        }
      });
    });

    const mediaRequired = selectedGames.some((code) => (GAME_QUESTIONS[code] || []).some(requiresMediaUpload));
    if (mediaRequired && selectedFiles.length > 0) filled++;

    const totalPossible = coreFields.length + 1 + 1 + totalRequiredQs + (mediaRequired ? 1 : 0);
    const currentPoints = filled + answeredQs;
    const progress = Math.floor((currentPoints / totalPossible) * 100);
    const final = Math.min(progress, 100);

    if (progressPercent) progressPercent.textContent = final;
    if (progressBar) progressBar.style.width = `${final}%`;
  }

  form.addEventListener("input", updateProgress);
  form.addEventListener("change", (e) => {
    if (e.target?.name === "strongestGames") renderCategoryQuestions();
    updateProgress();
  });

  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = "var(--primary)";
  });
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.style.borderColor = "";
  });
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

  function handleFiles(files) {
    Array.from(files).forEach((file) => {
      if (selectedFiles.length >= 4 || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) return;
      selectedFiles.push(file);

      const appendPreview = (bodyHtml = "", background = "") => {
        const div = document.createElement("div");
        div.className = "game-item-box preview-box";
        div.style.position = "relative";
        div.style.height = "100px";
        div.style.background = background;
        if (!background) {
          div.style.display = "flex";
          div.style.flexDirection = "column";
          div.style.alignItems = "center";
          div.style.justifyContent = "center";
          div.style.gap = "0.35rem";
        }
        div.innerHTML = `${bodyHtml}<button type="button" class="hover-target" style="position:absolute; top:5px; right:5px; background:var(--danger); border:none; color:#fff; width:20px; height:20px; border-radius:50%; font-size:10px;">x</button>`;
        div.querySelector("button").onclick = () => {
          div.remove();
          selectedFiles = selectedFiles.filter((item) => item !== file);
          updateProgress();
        };
        preview.appendChild(div);
      };

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => appendPreview("", `url(${e.target.result}) center/cover`);
        reader.readAsDataURL(file);
      } else {
        appendPreview(
          `<strong style="font-size:0.72rem; letter-spacing:0.08em;">VIDEO</strong><span style="font-size:0.68rem; color:var(--text-dim); max-width:80%; text-align:center; word-break:break-word;">${file.name}</span>`
        );
      }
    });

    updateProgress();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));

    let firstError = null;
    const data = new FormData(form);
    const selectedGames = data.getAll("strongestGames").slice(0, 1);
    const mediaRequired = selectedGames.some((code) => (GAME_QUESTIONS[code] || []).some(requiresMediaUpload));

    const validate = (name, minLen, selector) => {
      const value = data.get(name);
      if (!value || value.toString().trim().length < minLen) {
        const el = document.getElementsByName(name)[0]?.closest(".input-wrapper") || document.querySelector(selector);
        el?.classList.add("has-error");
        if (!firstError) firstError = el;
      }
    };

    validate("discordTag", 2);
    validate("discordUserId", 2);
    validate("age", 1);
    validate("timezone", 1);
    validate("availability", 5);
    validate("experience", 10);
    validate("motivation", 10);

    if (selectedGames.length === 0) {
      const grid = document.querySelector(".game-selection-grid");
      grid?.classList.add("has-error");
      if (!firstError) firstError = grid;
    }

    selectedGames.forEach((code) => {
      (GAME_QUESTIONS[code] || []).forEach((question, index) => {
        if (!isMediaOnlyQuestion(question)) {
          const name = `question_${code}_${index}`;
          if (!data.get(name)) {
            const field = document.getElementsByName(name)[0]?.closest(".input-wrapper");
            field?.classList.add("has-error");
            if (!firstError) firstError = field;
          }
        }
      });
    });

    if (mediaRequired && selectedFiles.length === 0) {
      uploadZone.classList.add("has-error");
      if (!firstError) firstError = uploadZone;
    }

    if (!document.getElementById("termsAccepted").checked) {
      const section = document.querySelector(".confirmation-section");
      section?.classList.add("has-error");
      if (!firstError) firstError = section;
    }

    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      statusEl.textContent = "[!] SECURITY ALERT: COMPLETE ALL HIGHLIGHTED SECTORS";
      statusEl.style.color = "var(--danger)";
      return;
    }

    const btnText = submitBtn.querySelector(".btn-text");
    btnText.textContent = "ENCRYPTING DOSSIER...";
    submitBtn.style.pointerEvents = "none";
    submitBtn.style.opacity = "0.5";

    const payload = {
      discordTag: data.get("discordTag"),
      discordUserId: data.get("discordUserId"),
      age: data.get("age"),
      timezone: data.get("timezone"),
      availability: data.get("availability"),
      experience: data.get("experience"),
      motivation: data.get("motivation"),
      proofs: data.get("proofs") || "",
      strongestGames: selectedGames,
      categoryResponses: {},
      termsAccepted: true,
      screenshots: []
    };

    selectedGames.forEach((game) => {
      payload.categoryResponses[game] = (GAME_QUESTIONS[game] || []).map((question, index) => ({
        question,
        answer: isMediaOnlyQuestion(question) ? "Included in telemetry" : data.get(`question_${game}_${index}`)
      })).filter((entry) => entry.answer);
    });

    try {
      for (const file of selectedFiles) {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        payload.screenshots.push({ name: file.name, dataUrl });
      }

      const response = await fetch("/api/helper-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "UPLINK FAILED");

      btnText.textContent = "TRANSMISSION COMPLETE";
      submitBtn.style.background = "var(--success)";
      statusEl.textContent = `PROTOCOL FINISHED. REF_ID: ${json.referenceId}`;
      statusEl.style.color = "var(--success)";
      form.style.opacity = "0.3";
      form.style.pointerEvents = "none";
    } catch (err) {
      btnText.textContent = "RETRY UPLINK";
      submitBtn.style.pointerEvents = "auto";
      submitBtn.style.opacity = "1";
      statusEl.textContent = `[ERROR] ${err.message}`;
      statusEl.style.color = "var(--danger)";
    }
  });

  async function loadEmojis() {
    try {
      const response = await fetch(`/api/status?t=${Date.now()}`);
      const data = await response.json();
      if (!data.emojis?.website) return;

      const custom = data.emojis.website;
      const map = { n01: "stepIcon01", n02: "stepIcon02", n03: "stepIcon03" };
      for (const [key, id] of Object.entries(map)) {
        const value = String(custom[key] || "").trim();
        const el = document.getElementById(id);
        if (!el || !value) continue;

        el.innerHTML = "";
        if (value.startsWith("http")) {
          const img = document.createElement("img");
          img.src = value;
          img.style.width = "1.8em";
          img.style.height = "1.8em";
          img.style.objectFit = "contain";
          img.style.verticalAlign = "middle";
          img.onerror = () => { img.style.display = "none"; };
          el.appendChild(img);
        } else if (/^\d{17,20}$/.test(value)) {
          const img = document.createElement("img");
          img.src = `https://cdn.discordapp.com/emojis/${value}.webp?size=128&quality=lossless`;
          img.style.width = "1.8em";
          img.style.height = "1.8em";
          img.style.objectFit = "contain";
          img.style.verticalAlign = "middle";
          img.onerror = () => {
            img.src = `https://cdn.discordapp.com/emojis/${value}.png?size=128`;
          };
          el.appendChild(img);
        }
      }
    } catch (e) {}
  }

  loadEmojis();
});
