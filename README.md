# TMCTQS (Test Management CTQS) — MVP com Appwrite

Plataforma inspirada no Qase para organizar e rastrear Test Cases em escala, com foco em gestão manual:
Tests, Execution, Environments, Issues e Reports.

Interface em Português (Brasil), mantendo termos técnicos em Inglês (ex.: Test Run, Suite, Case).

## Stack

- Frontend: React + TypeScript + Tailwind (Vite)
- Backend BaaS: Appwrite (Auth, Database, Storage e Real-time)

## Configuração (.env)

Copie `.env.example` para `.env` e ajuste conforme necessário:

- `VITE_APPWRITE_ENDPOINT`
- `VITE_APPWRITE_PROJECT_ID`
- `VITE_APPWRITE_DATABASE_ID` (use o `$id` do Database no Appwrite, ex.: `6a19efe1003445df5374`)
- `VITE_APPWRITE_BUCKET_ISSUE_EVIDENCES` (padrão: `issue-evidences`)

## Provisionar Appwrite (Database + Collections + Bucket)

1) Gere um API Key no Appwrite com permissões para Databases e Storage.
2) Preencha no `.env`:

- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID` (use o `$id` do Database)

3) Rode:

```bash
npm run appwrite:provision
```

## Rodar local

```bash
npm install
npm run dev
```

## Módulos do MVP

- Projects: cria Project e um Team para aplicar Document Level Security
- Tests: CRUD de Suites e Test Cases (hierarquia por `parent_id`)
- Execution: criação de Test Run e execução passo a passo (Run Results)
- Issues: registro de bugs internos com upload de evidências via Storage
- Reports: Dashboard com Pass Rate, Coverage e Open Issues em real-time
