/* =========================================================
   Orbit — Job Application Tracker
   Vanilla JS, localStorage persistence, Chart.js for the pie.
   ========================================================= */

const STORAGE_KEY = "orbit.jobTracker.v1";

const STATUS_COLORS = {
  "Applied":               "#60a5fa",
  "Under Review":          "#fbbf24",
  "Interview Scheduled":   "#22d3ee",
  "Interviewing":          "#8b5cf6",
  "Offer Received":        "#34d399",
  "Rejected":              "#f87171",
  "Withdrawn":             "#94a3b8",
  "Ghosted":               "#64748b",
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function statusPillStyle(status) {
  const color = STATUS_COLORS[status] || "#94a3b8";
  return `background:${hexToRgba(color, 0.16)}; color:${color}; border-color:${hexToRgba(color, 0.45)};`;
}

const ACTIVE_STATUSES = ["Applied", "Under Review", "Interview Scheduled", "Interviewing"];
const INTERVIEW_STATUSES = ["Interview Scheduled", "Interviewing"];

let jobs = [];
let sortState = { key: "dateApplied", dir: "desc" };
let pieChart = null;

// ---------- Storage ----------
function loadJobs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    jobs = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Could not read saved data:", e);
    jobs = [];
  }
}

function saveJobs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.error("Could not save data:", e);
    alert("Your browser blocked saving. Data may not persist after refresh.");
  }
}

function uid() {
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---------- DOM refs ----------
const tableBody = document.getElementById("jobTableBody");
const tableWrap = document.querySelector(".table-wrap");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const sourceFilter = document.getElementById("sourceFilter");

const modalOverlay = document.getElementById("modalOverlay");
const jobForm = document.getElementById("jobForm");
const modalTitle = document.getElementById("modalTitle");

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  loadJobs();
  populateStatusFilter();
  bindEvents();
  renderAll();
});

function bindEvents() {
  document.getElementById("addJobBtn").addEventListener("click", () => openModal());
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  jobForm.addEventListener("submit", handleSave);

  searchInput.addEventListener("input", renderTable);
  statusFilter.addEventListener("change", renderTable);
  sourceFilter.addEventListener("change", renderTable);
  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    searchInput.value = "";
    statusFilter.value = "";
    sourceFilter.value = "";
    renderTable();
  });

  document.querySelectorAll("thead th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState = { key, dir: "asc" };
      }
      renderTable();
    });
  });

  document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
  document.getElementById("importJsonInput").addEventListener("change", importJson);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
}

function populateStatusFilter() {
  Object.keys(STATUS_COLORS).forEach(status => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    statusFilter.appendChild(opt);
  });
}

function refreshSourceFilterOptions() {
  const currentVal = sourceFilter.value;
  const sources = [...new Set(jobs.map(j => j.source).filter(Boolean))].sort();
  sourceFilter.innerHTML = '<option value="">All sources</option>';
  sources.forEach(src => {
    const opt = document.createElement("option");
    opt.value = src;
    opt.textContent = src;
    sourceFilter.appendChild(opt);
  });
  if (sources.includes(currentVal)) sourceFilter.value = currentVal;
}

// ---------- Modal ----------
function openModal(job = null) {
  jobForm.reset();
  document.getElementById("jobId").value = "";

  if (job) {
    modalTitle.textContent = "Edit application";
    document.getElementById("jobId").value = job.id;
    document.getElementById("company").value = job.company || "";
    document.getElementById("jobTitle").value = job.jobTitle || "";
    document.getElementById("jobLink").value = job.jobLink || "";
    document.getElementById("dateApplied").value = job.dateApplied || "";
    document.getElementById("source").value = job.source || "";
    document.getElementById("peopleContacted").value = job.peopleContacted || "";
    document.getElementById("status").value = job.status || "Applied";
    document.getElementById("interviewStage").value = job.interviewStage || "N/A";
    document.getElementById("lastContact").value = job.lastContact || "";
    document.getElementById("nextFollowUp").value = job.nextFollowUp || "";
    document.getElementById("ctc").value = job.ctc || "";
    document.getElementById("notes").value = job.notes || "";
  } else {
    modalTitle.textContent = "Log application";
    document.getElementById("dateApplied").value = todayStr();
    document.getElementById("status").value = "Applied";
    document.getElementById("interviewStage").value = "N/A";
  }

  modalOverlay.classList.add("is-open");
  document.getElementById("company").focus();
}

function closeModal() {
  modalOverlay.classList.remove("is-open");
}

function handleSave(e) {
  e.preventDefault();
  const id = document.getElementById("jobId").value;

  const jobData = {
    id: id || uid(),
    company: document.getElementById("company").value.trim(),
    jobTitle: document.getElementById("jobTitle").value.trim(),
    jobLink: document.getElementById("jobLink").value.trim(),
    dateApplied: document.getElementById("dateApplied").value,
    source: document.getElementById("source").value.trim(),
    peopleContacted: document.getElementById("peopleContacted").value.trim(),
    status: document.getElementById("status").value,
    interviewStage: document.getElementById("interviewStage").value,
    lastContact: document.getElementById("lastContact").value,
    nextFollowUp: document.getElementById("nextFollowUp").value,
    ctc: document.getElementById("ctc").value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };

  const previousStatus = id ? (jobs.find(j => j.id === id) || {}).status : null;

  if (id) {
    const idx = jobs.findIndex(j => j.id === id);
    if (idx !== -1) jobs[idx] = jobData;
  } else {
    jobs.push(jobData);
  }

  saveJobs();
  closeModal();
  refreshSourceFilterOptions();
  renderAll();

  if (jobData.status === "Offer Received" && previousStatus !== "Offer Received") {
    fireConfetti();
  }
}

function deleteJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  if (!confirm(`Delete the application for "${job.jobTitle}" at "${job.company}"? This can't be undone.`)) return;
  jobs = jobs.filter(j => j.id !== id);
  saveJobs();
  refreshSourceFilterOptions();
  renderAll();
}

// ---------- Rendering ----------
function renderAll() {
  refreshSourceFilterOptions();
  renderPipelineStrip();
  renderStats();
  renderPieChart();
  renderFollowups();
  renderTable();
}

function getFilteredJobs() {
  const q = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;
  const sourceVal = sourceFilter.value;

  return jobs.filter(j => {
    const matchesQuery = !q ||
      (j.company || "").toLowerCase().includes(q) ||
      (j.jobTitle || "").toLowerCase().includes(q);
    const matchesStatus = !statusVal || j.status === statusVal;
    const matchesSource = !sourceVal || j.source === sourceVal;
    return matchesQuery && matchesStatus && matchesSource;
  });
}

function renderTable() {
  const filtered = getFilteredJobs();
  const sorted = sortJobs(filtered, sortState.key, sortState.dir);

  tableBody.innerHTML = "";

  if (jobs.length === 0) {
    tableWrap.classList.add("is-empty");
    return;
  }
  tableWrap.classList.remove("is-empty");

  const todayISO = todayStr();

  sorted.forEach(job => {
    const tr = document.createElement("tr");
    const isOverdue = job.nextFollowUp && job.nextFollowUp < todayISO &&
      !["Rejected", "Withdrawn", "Offer Received"].includes(job.status);
    if (isOverdue) tr.classList.add("is-overdue");

    tr.innerHTML = `
      <td class="company-cell">
        ${escapeHtml(job.company)}
        ${job.jobLink ? `<a href="${escapeAttr(job.jobLink)}" target="_blank" rel="noopener">View posting ↗</a>` : ""}
      </td>
      <td>${escapeHtml(job.jobTitle)}</td>
      <td class="cell-date">${formatDate(job.dateApplied)}</td>
      <td>${escapeHtml(job.source) || "—"}</td>
      <td>${escapeHtml(job.peopleContacted) || "—"}</td>
      <td><span class="status-pill" style="${statusPillStyle(job.status)}">${escapeHtml(job.status)}</span></td>
      <td>${escapeHtml(job.interviewStage) || "N/A"}</td>
      <td class="cell-date">${formatDate(job.lastContact)}</td>
      <td class="cell-date">${formatDate(job.nextFollowUp)}</td>
      <td class="mono">${escapeHtml(job.ctc) || "—"}</td>
      <td class="cell-notes" title="${escapeAttr(job.notes || "")}">${escapeHtml(job.notes) || "—"}</td>
      <td class="actions-cell">
        <button class="icon-btn edit-btn" title="Edit" data-id="${job.id}">✎</button>
        <button class="icon-btn danger delete-btn" title="Delete" data-id="${job.id}">🗑</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const job = jobs.find(j => j.id === btn.dataset.id);
      if (job) openModal(job);
    });
  });
  tableBody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteJob(btn.dataset.id));
  });
}

function sortJobs(list, key, dir) {
  const factor = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let av = (a[key] || "").toString().toLowerCase();
    let bv = (b[key] || "").toString().toLowerCase();
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}

function renderPipelineStrip() {
  const strip = document.getElementById("pipelineStrip");
  strip.innerHTML = "";

  if (jobs.length === 0) {
    strip.innerHTML = `<div class="pipeline-empty">Your pipeline will appear here once you log an application.</div>`;
    return;
  }

  const counts = {};
  Object.keys(STATUS_COLORS).forEach(s => counts[s] = 0);
  jobs.forEach(j => { counts[j.status] = (counts[j.status] || 0) + 1; });

  Object.entries(counts).forEach(([status, count]) => {
    if (count === 0) return;
    const seg = document.createElement("div");
    seg.className = "pipeline-seg";
    seg.style.flexGrow = count;
    seg.style.background = STATUS_COLORS[status];
    seg.style.color = "#fff";
    seg.innerHTML = `<span class="seg-count">${count}</span><span class="seg-label">${status}</span>`;
    strip.appendChild(seg);
  });
}

function renderStats() {
  document.getElementById("statTotal").textContent = jobs.length;
  document.getElementById("statActive").textContent = jobs.filter(j => ACTIVE_STATUSES.includes(j.status)).length;
  document.getElementById("statInterviews").textContent = jobs.filter(j => INTERVIEW_STATUSES.includes(j.status)).length;
  document.getElementById("statOffers").textContent = jobs.filter(j => j.status === "Offer Received").length;
}

function renderPieChart() {
  const counts = {};
  jobs.forEach(j => { counts[j.status] = (counts[j.status] || 0) + 1; });

  const labels = Object.keys(counts);
  const data = Object.values(counts);
  const colors = labels.map(l => STATUS_COLORS[l] || "#999");

  const ctx = document.getElementById("statusPie").getContext("2d");

  if (pieChart) pieChart.destroy();

  if (labels.length === 0) {
    document.getElementById("pieLegend").innerHTML = `<span class="followup-empty">No data yet — log an application to see the breakdown.</span>`;
    return;
  }

  pieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: "#12162a",
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / jobs.length * 100)}%)`
          }
        }
      },
      cutout: "62%",
    }
  });

  const legend = document.getElementById("pieLegend");
  legend.innerHTML = labels.map((l, i) => `
    <span class="legend-item">
      <span class="legend-swatch" style="background:${colors[i]}"></span>${l} (${data[i]})
    </span>
  `).join("");
}

function renderFollowups() {
  const list = document.getElementById("followupList");
  const todayISO = todayStr();

  const withFollowup = jobs
    .filter(j => j.nextFollowUp && !["Rejected", "Withdrawn", "Offer Received"].includes(j.status))
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

  if (withFollowup.length === 0) {
    list.innerHTML = `<li class="followup-empty">No upcoming follow-ups scheduled.</li>`;
    return;
  }

  list.innerHTML = withFollowup.slice(0, 8).map(j => {
    const overdue = j.nextFollowUp < todayISO;
    return `
      <li class="followup-item ${overdue ? "overdue" : ""}">
        <span class="fu-company">${escapeHtml(j.company)} — ${escapeHtml(j.jobTitle)}</span>
        <span class="fu-date">${overdue ? "OVERDUE · " : ""}${formatDate(j.nextFollowUp)}</span>
      </li>
    `;
  }).join("");
}

// ---------- Export / Import ----------
function exportJson() {
  const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: "application/json" });
  downloadBlob(blob, `job-tracker-backup-${todayStr()}.json`);
}

function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Invalid file format");
      const replace = confirm(
        `Import ${imported.length} entries?\n\nOK = replace all current data\nCancel = merge with current data`
      );
      if (replace) {
        jobs = imported;
      } else {
        const existingIds = new Set(jobs.map(j => j.id));
        imported.forEach(j => {
          if (!j.id || existingIds.has(j.id)) j.id = uid();
          jobs.push(j);
        });
      }
      saveJobs();
      renderAll();
      alert("Import complete.");
    } catch (err) {
      alert("Could not import this file. Make sure it's a backup exported from Ledger.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function exportCsv() {
  if (jobs.length === 0) {
    alert("Nothing to export yet.");
    return;
  }
  const headers = ["company","jobTitle","jobLink","dateApplied","source","peopleContacted","status","interviewStage","lastContact","nextFollowUp","ctc","notes"];
  const rows = jobs.map(j => headers.map(h => csvEscape(j[h] || "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, `job-tracker-${todayStr()}.csv`);
}

function csvEscape(value) {
  const str = String(value).replace(/"/g, '""');
  return /[",\n]/.test(str) ? `"${str}"` : str;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Helpers ----------
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

/* =========================================================
   Interactive backdrop: floating particle field
   ========================================================= */
function initParticleField() {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];
  const COLORS = ["#8b5cf6", "#22d3ee", "#f472b6", "#60a5fa"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function makeParticles() {
    const count = Math.min(70, Math.floor((canvas.width * canvas.height) / 22000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      twinkle: Math.random() * Math.PI * 2,
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.twinkle += 0.02;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      const alpha = 0.35 + Math.sin(p.twinkle) * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(p.color, Math.max(0.1, alpha));
      ctx.fill();
    });
    if (!reduceMotion) requestAnimationFrame(tick);
  }

  window.addEventListener("resize", () => { resize(); makeParticles(); });
  resize();
  makeParticles();
  tick();
}

/* =========================================================
   Confetti burst — fires when an application reaches "Offer Received"
   ========================================================= */
function fireConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ["#8b5cf6", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#60a5fa"];
  const pieces = Array.from({ length: 140 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -12 - 4,
    size: Math.random() * 7 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    vr: (Math.random() - 0.5) * 14,
    gravity: 0.35,
    life: 0,
  }));

  let frame = 0;
  const maxFrames = 130;

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.vy += p.gravity * 0.15;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
      p.life++;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    frame++;
    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  tick();
}

/* =========================================================
   Button ripple micro-interaction
   ========================================================= */
function initButtonRipples() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initParticleField();
  initButtonRipples();
});
