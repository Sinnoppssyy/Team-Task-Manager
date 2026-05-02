const state = {
  user: null,
  token: localStorage.getItem("ttm_token"),
  view: "dashboard",
  projects: [],
  tasks: [],
  dashboard: null,
  selectedProjectId: ""
};

const statusLabels = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done"
};

const app = document.querySelector("#app");

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function setSession({ token, user }) {
  state.token = token;
  state.user = user;
  localStorage.setItem("ttm_token", token);
}

function clearSession() {
  localStorage.removeItem("ttm_token");
  state.token = null;
  state.user = null;
  renderAuth();
}

function formatDate(value) {
  if (!value) return "No date";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function canAdmin() {
  return state.user?.role === "admin";
}

function renderAuth(mode = "login") {
  const template = document.querySelector("#auth-template");
  app.innerHTML = "";
  app.appendChild(template.content.cloneNode(true));
  const form = document.querySelector("#auth-form");
  const title = document.querySelector("#auth-title");
  const toggle = document.querySelector("#toggle-auth");
  const message = document.querySelector("#auth-message");
  let currentMode = mode;

  function paintMode() {
    const signup = currentMode === "signup";
    form.classList.toggle("signup-hidden", !signup);
    title.textContent = signup ? "Create account" : "Sign in";
    toggle.textContent = signup ? "I already have an account" : "Create an account";
    form.password.autocomplete = signup ? "new-password" : "current-password";
    message.textContent = "";
  }

  toggle.addEventListener("click", () => {
    currentMode = currentMode === "signup" ? "login" : "signup";
    paintMode();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const data = await api(`/auth/${currentMode === "signup" ? "signup" : "login"}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setSession(data);
      await loadApp();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  paintMode();
}

function shell(content) {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">TT</span><span>Team Tasks</span></div>
        <nav class="nav">
          <button data-view="dashboard">Dashboard</button>
          <button data-view="projects">Projects</button>
          <button data-view="tasks">Tasks</button>
          <button data-view="team">Team</button>
        </nav>
        <div class="user-box">
          <strong>${escapeHtml(state.user.name)}</strong><br />
          <span>${escapeHtml(state.user.email)}</span><br />
          <span class="role-pill">${state.user.role}</span>
          <button class="ghost" id="logout" type="button">Sign out</button>
        </div>
      </aside>
      <section class="main">${content}</section>
    </div>
    <div class="modal hidden" id="modal"></div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      await render();
    });
  });
  document.querySelector("#logout").addEventListener("click", clearSession);
}

async function refreshData() {
  const [dashboard, projects, tasks] = await Promise.all([
    api("/dashboard"),
    api("/projects"),
    api(`/tasks${state.selectedProjectId ? `?projectId=${state.selectedProjectId}` : ""}`)
  ]);
  state.dashboard = dashboard;
  state.projects = projects.projects;
  state.tasks = tasks.tasks;
}

function dashboardView() {
  const summary = state.dashboard?.summary || {};
  const upcoming = state.dashboard?.upcoming || [];
  return `
    <div class="topbar">
      <div><h1>Dashboard</h1><p>Track task load, status, and deadlines across your workspace.</p></div>
      ${canAdmin() ? '<button class="primary" data-open="project">New project</button>' : ""}
    </div>
    <div class="grid stats-grid">
      ${statCard("Total tasks", summary.total || 0)}
      ${statCard("In progress", summary.in_progress || 0)}
      ${statCard("Done", summary.done || 0)}
      ${statCard("Overdue", summary.overdue || 0)}
    </div>
    <div class="grid two-col" style="margin-top:16px">
      <section class="card">
        <div class="section-head"><h2>Status overview</h2></div>
        <table class="table">
          <tbody>
            ${["todo", "in_progress", "review", "done"].map((key) => `
              <tr><td>${statusLabels[key]}</td><td><strong>${summary[key] || 0}</strong></td></tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="card">
        <div class="section-head"><h2>Upcoming deadlines</h2></div>
        ${upcoming.length ? `<div class="stack">${upcoming.map((task) => `
          <div class="task-card">
            <header><h3>${escapeHtml(task.title)}</h3><span class="status ${task.status}">${statusLabels[task.status]}</span></header>
            <div class="meta">${escapeHtml(task.project_name)} &middot; ${formatDate(task.due_date)}</div>
          </div>
        `).join("")}</div>` : '<div class="empty">No upcoming deadlines yet.</div>'}
      </section>
    </div>
  `;
}

function statCard(label, value) {
  return `<section class="card stat"><div class="label">${label}</div><div class="value">${value}</div></section>`;
}

function projectsView() {
  return `
    <div class="topbar">
      <div><h1>Projects</h1><p>Create project spaces, add teammates, and measure progress.</p></div>
      ${canAdmin() ? '<div class="actions"><button class="primary" data-open="project">New project</button></div>' : ""}
    </div>
    <div class="project-list">
      ${state.projects.length ? state.projects.map(projectCard).join("") : '<div class="card empty">No projects yet.</div>'}
    </div>
  `;
}

function projectCard(project) {
  const percent = project.totalTasks ? Math.round((project.doneTasks / project.totalTasks) * 100) : 0;
  return `
    <article class="project-card">
      <header>
        <div>
          <h3>${escapeHtml(project.name)}</h3>
          <div class="meta">${escapeHtml(project.description || "No description")}</div>
        </div>
        <div class="actions">
          <button class="secondary" data-project-detail="${project.id}">Open</button>
          ${canAdmin() ? `<button class="danger" data-delete-project="${project.id}" data-project-name="${escapeHtml(project.name)}">Delete</button>` : ""}
        </div>
      </header>
      <div class="progress-track"><div class="progress-bar" style="width:${percent}%"></div></div>
      <div class="meta">${percent}% complete &middot; ${project.totalTasks} tasks &middot; ${project.members} members &middot; Due ${formatDate(project.dueDate)}</div>
    </article>
  `;
}

function tasksView() {
  return `
    <div class="topbar">
      <div><h1>Tasks</h1><p>Assign owners, move work through status, and surface overdue items.</p></div>
      <div class="actions">
        ${state.selectedProjectId ? '<button class="secondary" data-clear-filter>Clear filter</button>' : ""}
        ${canAdmin() ? '<button class="danger" data-clear-completed>Clear completed</button><button class="primary" data-open="task">New task</button>' : ""}
      </div>
    </div>
    <section class="card" style="margin-bottom:16px">
      <label class="field">
        <span>Project filter</span>
        <select id="project-filter">
          <option value="">All projects</option>
          ${state.projects.map((project) => `<option value="${project.id}" ${state.selectedProjectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}
        </select>
      </label>
    </section>
    <div class="task-list">
      ${state.tasks.length ? state.tasks.map(taskCard).join("") : '<div class="card empty">No tasks match this view.</div>'}
    </div>
  `;
}

function taskCard(task) {
  const canMove = canAdmin() || task.assigneeId === state.user.id;
  return `
    <article class="task-card">
      <header>
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <div class="meta">${escapeHtml(task.projectName || "")} &middot; Assigned to ${escapeHtml(task.assigneeName || "Unassigned")}</div>
        </div>
        <span class="priority ${task.priority}">${task.priority}</span>
      </header>
      <p class="meta">${escapeHtml(task.description || "No description")}</p>
      <div class="actions">
        <span class="status ${task.status}">${statusLabels[task.status]}</span>
        <span class="meta">Due ${formatDate(task.dueDate)}</span>
      </div>
      ${canMove ? `<div class="actions">${Object.keys(statusLabels).map((status) => `
        <button class="secondary" data-status="${status}" data-task="${task.id}" ${task.status === status ? "disabled" : ""}>${statusLabels[status]}</button>
      `).join("")}</div>` : ""}
      ${canAdmin() ? `<div class="actions"><button class="danger" data-delete-task="${task.id}" data-task-title="${escapeHtml(task.title)}">Delete task</button></div>` : ""}
    </article>
  `;
}

async function teamView() {
  const projectId = state.selectedProjectId || state.projects[0]?.id || "";
  if (!projectId) {
    return `
      <div class="topbar"><div><h1>Team</h1><p>Add members after creating a project.</p></div></div>
      <div class="card empty">No projects available.</div>
    `;
  }
  const detail = await api(`/projects/${projectId}`);
  return `
    <div class="topbar">
      <div><h1>Team</h1><p>Manage the people who can see and work inside a project.</p></div>
      ${canAdmin() ? '<button class="primary" data-open="member">Add member</button>' : ""}
    </div>
    <section class="card" style="margin-bottom:16px">
      <label class="field">
        <span>Project</span>
        <select id="team-project">
          ${state.projects.map((project) => `<option value="${project.id}" ${projectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}
        </select>
      </label>
    </section>
    <section class="card">
      <table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Project role</th><th>App role</th>${canAdmin() ? "<th>Actions</th>" : ""}</tr></thead>
        <tbody>
          ${detail.members.map((member) => `
            <tr>
              <td>${escapeHtml(member.name)}</td>
              <td>${escapeHtml(member.email)}</td>
              <td>${escapeHtml(member.projectRole)}</td>
              <td>${escapeHtml(member.appRole)}</td>
              ${canAdmin() ? `<td>${member.id === state.user.id ? '<span class="meta">Current user</span>' : `<button class="danger compact" data-remove-member="${member.id}" data-project-id="${projectId}" data-member-name="${escapeHtml(member.name)}">Remove</button>`}</td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function modal(content) {
  const node = document.querySelector("#modal");
  node.classList.remove("hidden");
  node.innerHTML = `<div class="modal-panel">${content}</div>`;
  node.addEventListener("click", (event) => {
    if (event.target === node) closeModal();
  }, { once: true });
}

function closeModal() {
  const node = document.querySelector("#modal");
  node.classList.add("hidden");
  node.innerHTML = "";
}

function projectForm() {
  modal(`
    <form id="project-form">
      <div class="section-head"><h2>New project</h2><button class="ghost" type="button" data-close>Close</button></div>
      <label class="field"><span>Name</span><input name="name" required minlength="3" /></label>
      <label class="field"><span>Description</span><textarea name="description"></textarea></label>
      <label class="field"><span>Due date</span><input name="dueDate" type="date" /></label>
      <button class="primary" type="submit">Create project</button>
      <p class="form-message"></p>
    </form>
  `);
  bindClose();
  document.querySelector("#project-form").addEventListener("submit", submitProject);
}

async function taskForm() {
  const initialProjectId = state.selectedProjectId || state.projects[0]?.id;
  const detail = initialProjectId ? await api(`/projects/${initialProjectId}`) : { members: [] };
  modal(`
    <form id="task-form">
      <div class="section-head"><h2>New task</h2><button class="ghost" type="button" data-close>Close</button></div>
      <label class="field"><span>Project</span><select name="projectId" required>${state.projects.map((project) => `<option value="${project.id}" ${project.id === initialProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Title</span><input name="title" required minlength="3" /></label>
      <label class="field"><span>Description</span><textarea name="description"></textarea></label>
      <div class="split">
        <label class="field"><span>Status</span><select name="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <label class="field"><span>Priority</span><select name="priority"><option>low</option><option selected>medium</option><option>high</option><option>urgent</option></select></label>
      </div>
      <div class="split">
        <label class="field"><span>Assignee</span><select name="assigneeId"><option value="">Unassigned</option>${detail.members.map((member) => `<option value="${member.id}">${escapeHtml(member.name)} - ${escapeHtml(member.email)}</option>`).join("")}</select></label>
        <label class="field"><span>Due date</span><input name="dueDate" type="date" /></label>
      </div>
      <button class="primary" type="submit">Create task</button>
      <p class="form-message"></p>
    </form>
  `);
  bindClose();
  document.querySelector("#task-form").addEventListener("submit", submitTask);
}

function memberForm() {
  modal(`
    <form id="member-form">
      <div class="section-head"><h2>Add member</h2><button class="ghost" type="button" data-close>Close</button></div>
      <label class="field"><span>Project</span><select name="projectId" required>${state.projects.map((project) => `<option value="${project.id}" ${state.selectedProjectId === project.id ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Teammate email</span><input name="email" type="email" required /></label>
      <label class="field"><span>Project role</span><select name="role"><option value="contributor">Contributor</option><option value="manager">Manager</option></select></label>
      <button class="primary" type="submit">Add member</button>
      <p class="form-message"></p>
    </form>
  `);
  bindClose();
  document.querySelector("#member-form").addEventListener("submit", submitMember);
}

function bindClose() {
  document.querySelector("[data-close]").addEventListener("click", closeModal);
}

async function submitProject(event) {
  event.preventDefault();
  const message = event.target.querySelector(".form-message");
  try {
    await api("/projects", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries()))
    });
    closeModal();
    await render();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitTask(event) {
  event.preventDefault();
  const message = event.target.querySelector(".form-message");
  try {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries()))
    });
    closeModal();
    await render();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitMember(event) {
  event.preventDefault();
  const message = event.target.querySelector(".form-message");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    await api(`/projects/${payload.projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ email: payload.email, role: payload.role })
    });
    state.selectedProjectId = payload.projectId;
    closeModal();
    await render();
  } catch (error) {
    message.textContent = error.message;
  }
}

function bindPageEvents() {
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.open === "project") projectForm();
      if (button.dataset.open === "task") taskForm();
      if (button.dataset.open === "member") memberForm();
    });
  });

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/tasks/${button.dataset.task}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.status })
      });
      await render();
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const title = button.dataset.taskTitle || "this task";
      if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
      await api(`/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      await render();
    });
  });

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.projectName || "this project";
      if (!confirm(`Delete "${name}" and all of its tasks? This cannot be undone.`)) return;
      await api(`/projects/${button.dataset.deleteProject}`, { method: "DELETE" });
      if (state.selectedProjectId === button.dataset.deleteProject) {
        state.selectedProjectId = "";
      }
      await render();
    });
  });

  document.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.memberName || "this member";
      if (!confirm(`Remove ${name} from this project?`)) return;
      await api(`/projects/${button.dataset.projectId}/members/${button.dataset.removeMember}`, {
        method: "DELETE"
      });
      await render();
    });
  });

  const clearCompleted = document.querySelector("[data-clear-completed]");
  if (clearCompleted) {
    clearCompleted.addEventListener("click", async () => {
      const scope = state.selectedProjectId ? "this project" : "all projects";
      if (!confirm(`Clear completed tasks from ${scope}?`)) return;
      const path = state.selectedProjectId
        ? `/tasks/completed?projectId=${state.selectedProjectId}`
        : "/tasks/completed";
      await api(path, { method: "DELETE" });
      await render();
    });
  }

  const clearFilter = document.querySelector("[data-clear-filter]");
  if (clearFilter) {
    clearFilter.addEventListener("click", async () => {
      state.selectedProjectId = "";
      await render();
    });
  }

  document.querySelectorAll("[data-project-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedProjectId = button.dataset.projectDetail;
      state.view = "tasks";
      await render();
    });
  });

  const filter = document.querySelector("#project-filter");
  if (filter) {
    filter.addEventListener("change", async () => {
      state.selectedProjectId = filter.value;
      await render();
    });
  }

  const teamProject = document.querySelector("#team-project");
  if (teamProject) {
    teamProject.addEventListener("change", async () => {
      state.selectedProjectId = teamProject.value;
      await render();
    });
  }
}

async function render() {
  await refreshData();
  let content = "";
  if (state.view === "dashboard") content = dashboardView();
  if (state.view === "projects") content = projectsView();
  if (state.view === "tasks") content = tasksView();
  if (state.view === "team") content = await teamView();
  shell(content);
  bindPageEvents();
}

async function loadApp() {
  try {
    const data = await api("/auth/me");
    state.user = data.user;
    await render();
  } catch (error) {
    clearSession();
  }
}

if (state.token) {
  loadApp();
} else {
  renderAuth();
}
