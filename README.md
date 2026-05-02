# ⚡ TaskFlow — Team Task Manager

> A full-stack project and task management platform with role-based access control, built with Node.js, Express, and PostgreSQL. Deployed live on Railway.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Railway](https://img.shields.io/badge/Deployed%20on-Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 🔗 Live Demo

**[→ taskflow.up.railway.app](https://team-task-manager-production-cdcc.up.railway.app/)**  

---

## 📸 Screenshots

<img width="1600" height="809" alt="WhatsApp Image 2026-05-03 at 1 46 51 AM" src="https://github.com/user-attachments/assets/9bb646c9-5e93-4776-9505-ddaee3a1d136" />

<img width="1917" height="911" alt="image" src="https://github.com/user-attachments/assets/ed4b9489-fa2d-465a-860e-d1c8465d4472" />

<img width="1576" height="917" alt="image" src="https://github.com/user-attachments/assets/046d3bef-2ebc-422a-bd28-c68f52f9e832" />

---

## ✨ Features

- 🔐 **Authentication** — Signup, login, and JWT-based session management (7-day tokens)
- 📂 **Project Management** — Create projects, write descriptions, track team activity
- 👥 **Team Invitations** — Add members to projects by email address
- 🛡️ **Role-Based Access Control** — Project-scoped Admin / Member roles (admins manage, members contribute)
- ✅ **Task Tracking** — Create tasks with title, description, priority, assignee, and due date
- 🔄 **Status Workflow** — One-click transitions: `Todo → In Progress → Done`
- 📊 **Personal Dashboard** — See your task stats, overdue items, and recent activity at a glance
- ⚠️ **Overdue Detection** — Tasks past their due date are flagged automatically via SQL
- 🔒 **Secure by default** — bcrypt password hashing, JWT auth, XSS-escaped output

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js 4.x |
| **Database** | PostgreSQL 15 (via `pg` driver) |
| **Auth** | JSON Web Tokens (JWT) + bcryptjs |
| **Frontend** | Vanilla HTML / CSS / JavaScript (no build step) |
| **Deployment** | Railway (app + managed PostgreSQL) |

---

## 📁 Project Structure

```
taskmanager/
├── src/
│   ├── index.js                  # Express app entry point
│   ├── db/
│   │   ├── index.js              # PostgreSQL connection pool
│   │   └── migrate.js            # Auto-creates schema on startup
│   ├── middleware/
│   │   └── auth.js               # JWT verification + role guard
│   └── routes/
│       ├── auth.js               # POST /api/auth/signup, /login, /me
│       ├── projects.js           # CRUD + member management
│       ├── tasks.js              # Task CRUD + status updates
│       └── dashboard.js          # Aggregated stats
├── public/
│   ├── index.html                # Single-page app shell
│   ├── css/app.css
│   └── js/app.js                 # Frontend logic + API layer
├── .env.example
├── package.json
└── README.md
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites

- Node.js 18+
- PostgreSQL (or a free cloud DB like [Neon](https://neon.tech))

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/taskmanager.git
cd taskmanager
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/taskmanager
JWT_SECRET=your-long-random-secret-here
NODE_ENV=development
PORT=3000
```

### 3. Start the dev server

```bash
npm run dev
```

Visit **http://localhost:3000** — database tables are created automatically on first run.

---

## 🌐 Deploying to Railway

1. **Push to GitHub** — `git push origin main`
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
3. Click **+ New → Database → Add PostgreSQL** — Railway injects `DATABASE_URL` automatically
4. In your app's **Variables** tab, add:
   ```
   JWT_SECRET=
   NODE_ENV=production
   ```
5. Railway redeploys automatically. Go to **Settings → Domains** for your live URL.

---

## 📡 API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Get current user |

### Projects

| Method | Endpoint | Role required | Description |
|---|---|---|---|
| `GET` | `/api/projects` | Any member | List my projects |
| `POST` | `/api/projects` | Logged in | Create project |
| `GET` | `/api/projects/:id` | Member | Project details + members |
| `PUT` | `/api/projects/:id` | Admin | Update project |
| `DELETE` | `/api/projects/:id` | Admin | Delete project |
| `POST` | `/api/projects/:id/members` | Admin | Invite by email |
| `DELETE` | `/api/projects/:id/members/:userId` | Admin | Remove member |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks/project/:id` | List tasks (with filters) |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/:id` | Update task |
| `PATCH` | `/api/tasks/:id/status` | Quick status change |
| `DELETE` | `/api/tasks/:id` | Delete task |

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Stats, overdue tasks, recent activity |

---

## 🛡️ Role-Based Access

Roles are **project-scoped** — you can be Admin on your own project and Member on a colleague's.

| Action | Member | Admin |
|---|---|---|
| View project & tasks | ✅ | ✅ |
| Create tasks | ✅ | ✅ |
| Update own tasks | ✅ | ✅ |
| Update any task | ❌ | ✅ |
| Delete own tasks | ✅ | ✅ |
| Delete any task | ❌ | ✅ |
| Invite / remove members | ❌ | ✅ |
| Edit / delete project | ❌ | ✅ |

---

## 🗄️ Database Schema

```sql
users (id, name, email, password, created_at)
projects (id, name, description, owner_id, created_at)
project_members (id, project_id, user_id, role, joined_at)
tasks (id, project_id, title, description, status, priority, assigned_to, due_date, created_by, created_at, updated_at)
```

---

## 🔒 Security Notes

- Passwords hashed with **bcrypt** (cost factor 10)
- JWT tokens expire after **7 days**
- User enumeration prevented — same error for wrong email and wrong password
- All user-generated content is **XSS-escaped** before rendering
- SQL injection prevented via **parameterised queries** (`$1`, `$2` placeholders)

---

## 📄 License

MIT — free to use and modify.

---

> Built as a full-stack engineering assignment · Deployed on Railway
