# Team Task Manager

A full-stack project and task tracking app for teams. It includes signup/login, role-based access control, projects, project members, task assignment, status tracking, overdue reporting, and a dashboard.

## Tech Stack

- Node.js, Express, vanilla HTML/CSS/JavaScript
- PostgreSQL with relational tables and foreign keys
- JWT authentication and bcrypt password hashing
- Zod request validation
- Railway-ready deployment config

## Features

- Auth: signup, login, JWT session, protected APIs
- Roles: first signup becomes `admin`; later signups become `member`
- Admin: create/edit projects, add members, create/update/delete tasks
- Member: view assigned projects/tasks and update assigned task status
- Dashboard: task counts by status, overdue tasks, upcoming deadlines
- Database: users, projects, project_members, tasks, task_comments

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `env.example` and set:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/team_task_manager
JWT_SECRET=use-a-long-random-secret
PORT=3000
NODE_ENV=development
```

3. Create a local PostgreSQL database named `team_task_manager`.

4. Start the app:

```bash
npm run dev
```

The server runs migrations automatically on startup. Open `http://localhost:3000`.

## REST API

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/members`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/status`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## Railway Deployment

1. Push this folder to GitHub.
2. In Railway, create a new project and deploy from the GitHub repo.
3. Add a PostgreSQL database service in the same Railway project.
4. In the web service Variables tab, add:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-long-random-production-secret
NODE_ENV=production
```

5. Railway will use `npm start` and the `/api/health` healthcheck from `railway.json`.
6. After deploy, open the generated Railway domain. Create the first account as the admin.

## Submission Checklist

- Live URL: your Railway public domain
- GitHub repo: your pushed repository URL
- README: this file
- Demo video: 2 to 5 minutes showing signup, admin project creation, member signup, adding member, task assignment, status update, and dashboard
