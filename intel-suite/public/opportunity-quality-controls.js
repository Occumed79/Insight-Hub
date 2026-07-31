(() => {
  "use strict";

  const CONTROL_ATTRIBUTE = "data-opportunity-quality-controls";
  const grades = [
    { value: "excellent", label: "Excellent fit", short: "Excellent" },
    { value: "good", label: "Good fit", short: "Good" },
    { value: "poor", label: "Poor fit", short: "Poor" },
    { value: "spam", label: "Not relevant", short: "N/A" },
  ];

  const recordsByUrl = new Map();
  const recordsByTitle = new Map();
  let apiRoot = null;
  let scanQueued = false;

  const normalizeText = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const normalizeUrl = (value) => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return String(value).trim().replace(/\/$/, "");
    }
  };

  const rowsFromPayload = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const key of ["data", "results", "opportunities", "items"]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  };

  const rememberRecords = (payload, responseUrl) => {
    try {
      const parsed = new URL(responseUrl, window.location.href);
      const apiMatch = parsed.pathname.match(/^(.*)\/api\/(?:opportunities|search)(?:\/|$)/);
      if (apiMatch) apiRoot = `${parsed.origin}${apiMatch[1]}/api`;
    } catch {}

    for (const record of rowsFromPayload(payload)) {
      if (!record?.id || !record?.title) continue;

      const titleKey = normalizeText(record.title);
      if (titleKey) {
        const existing = recordsByTitle.get(titleKey) ?? [];
        const withoutDuplicate = existing.filter((item) => item.id !== record.id);
        recordsByTitle.set(titleKey, [...withoutDuplicate, record]);
      }

      for (const candidate of [record.samUrl, record.sourceUrl, record.url]) {
        const urlKey = normalizeUrl(candidate);
        if (urlKey) recordsByUrl.set(urlKey, record);
      }
    }

    queueScan();
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const input = args[0];
      const init = args[1];
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestMethod = String(init?.method ?? input?.method ?? "GET").toUpperCase();
      if (
        requestMethod === "GET" &&
        requestUrl &&
        (/\/api\/opportunities(?:\?|$)/.test(requestUrl) || /\/api\/search(?:\?|$)/.test(requestUrl))
      ) {
        response
          .clone()
          .json()
          .then((payload) => rememberRecords(payload, response.url || requestUrl))
          .catch(() => undefined);
      }
    } catch {}
    return response;
  };

  const resolveRecord = (article) => {
    const sourceAnchor = article.querySelector('a[target="_blank"][href]');
    const urlKey = normalizeUrl(sourceAnchor?.href);
    if (urlKey && recordsByUrl.has(urlKey)) return recordsByUrl.get(urlKey);

    const title = article.querySelector("h3")?.textContent;
    const candidates = recordsByTitle.get(normalizeText(title)) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const cardText = normalizeText(article.textContent);
      return (
        candidates.find((candidate) => {
          const agency = normalizeText(candidate.agency);
          return agency && agency !== "unknown" && cardText.includes(agency);
        }) ?? candidates[0]
      );
    }
    return null;
  };

  const updateActiveGrade = (root, grade) => {
    root.querySelectorAll("button[data-quality-grade]").forEach((button) => {
      const active = button.dataset.qualityGrade === grade;
      button.setAttribute("aria-pressed", String(active));
      button.className = active
        ? "px-1.5 py-0.5 rounded border text-[9px] transition-all duration-150 bg-white/15 border-white/30 text-white font-medium"
        : "px-1.5 py-0.5 rounded border text-[9px] transition-all duration-150 border-white/10 text-white/55 bg-transparent hover:bg-white/5 hover:text-white/85 hover:border-white/20";
    });
  };

  const submitGrade = async (record, grade, root) => {
    if (!apiRoot || root.dataset.submitting === "true") return;
    root.dataset.submitting = "true";
    root.querySelectorAll("button[data-quality-grade]").forEach((button) => {
      button.disabled = true;
      button.classList.add("opacity-40", "cursor-not-allowed");
    });

    const status = root.querySelector("[data-quality-status]");
    if (status) status.textContent = "Saving…";

    try {
      const response = await originalFetch(
        `${apiRoot}/opportunities/${encodeURIComponent(record.id)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Grade could not be saved");

      record.userGrade = grade;
      updateActiveGrade(root, grade);
      if (status) status.textContent = "Saved";
      window.setTimeout(() => {
        if (status) status.textContent = "Quality";
      }, 1200);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Save failed";
    } finally {
      root.dataset.submitting = "false";
      root.querySelectorAll("button[data-quality-grade]").forEach((button) => {
        button.disabled = false;
        button.classList.remove("opacity-40", "cursor-not-allowed");
      });
    }
  };

  const buildControls = (record) => {
    const root = document.createElement("div");
    root.setAttribute(CONTROL_ATTRIBUTE, "true");
    root.dataset.opportunityId = record.id;
    root.className = "mt-2 pt-2 border-t border-white/5 flex items-center gap-1 flex-wrap";
    root.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const label = document.createElement("span");
    label.dataset.qualityStatus = "true";
    label.className = "mr-1 text-[9px] uppercase tracking-wider text-white/40";
    label.textContent = "Quality";
    root.appendChild(label);

    for (const grade of grades) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = grade.label;
      button.textContent = grade.short;
      button.dataset.qualityGrade = grade.value;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void submitGrade(record, grade.value, root);
      });
      root.appendChild(button);
    }

    updateActiveGrade(root, record.userGrade ?? null);
    return root;
  };

  const scanCards = () => {
    scanQueued = false;
    if (!window.location.pathname.toLowerCase().includes("opportunit")) return;

    document.querySelectorAll("article").forEach((article) => {
      const record = resolveRecord(article);
      if (!record) return;

      const existing = article.querySelector(`[${CONTROL_ATTRIBUTE}]`);
      if (existing?.dataset.opportunityId === record.id) {
        updateActiveGrade(existing, record.userGrade ?? null);
        return;
      }
      existing?.remove();
      article.appendChild(buildControls(record));
    });
  };

  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    window.requestAnimationFrame(scanCards);
  };

  const observer = new MutationObserver(queueScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", queueScan);
  window.addEventListener("hashchange", queueScan);
  window.setInterval(queueScan, 1500);
})();
