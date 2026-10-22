# FJ-WEB-03 — Деплой в VK Cloud

Подготовка Forever Journey Book Creator к публичному релизу: production-деплой
статической сборки в отдельный бакет VK Cloud Object Storage (Москва) с
ручным запуском через GitHub Actions. Основа — `main` после merge PR #3.
VPS, Docker, backend и БД не создаются; дизайн, формат FJBOOK1, локализация,
генерация PDF и Lua-аддон не изменялись.

## 1. Workflow `.github/workflows/deploy.yml`

- Триггер — только `workflow_dispatch` (первый деплой вручную). Блок
  `push: branches: [main]` присутствует закомментированным: включается
  одним PR после проверки первой публикации.
- Шаги: checkout → Node.js 22 LTS (кеш npm) → `npm ci` → `npm test` →
  `npm run build` → `node scripts/deploy-s3.mjs`. Ошибка любого шага роняет
  деплой.
- Входные параметры: `bucket` (default `foreverjourney-web`), `endpoint`
  (default `https://hb.ru-msk.vkcloud-storage.ru`), `dry_run`. Имя бакета и
  endpoint конфигурируемы без правки кода.
- Ключи — только из GitHub Secrets `VK_S3_ACCESS_KEY_ID` /
  `VK_S3_SECRET_ACCESS_KEY`; в репозитории их нет.
- Разрешения сужены до `contents: read`; `concurrency: production-deploy`
  не даёт деплоям накладываться.

## 2. Скрипт загрузки `scripts/deploy-s3.mjs` (+ `deploy-s3-lib.mjs`)

- S3-клиент `@aws-sdk/client-s3` (devDependency), path-style, регион
  `ru-msk`, endpoint только http/https; при реальной загрузке адреса
  localhost/loopback/private/reserved отклоняются (защита от утечки ключей
  на внутренние адреса; покрыто тестами).
- Content-Type задаются явно: HTML `text/html; charset=utf-8`, CSS
  `text/css`, JS `text/javascript`, JSON `application/json`, SVG
  `image/svg+xml`, TTF `font/ttf` (полная карта — `MIME_TYPES`).
- Кеш: `index.html` → `public, max-age=0, must-revalidate`; всё под
  `assets/` (хешированные файлы Vite) → `public, max-age=31536000,
  immutable`.
- Объекты публикуются с ACL `public-read`; после загрузки список бакета
  перечитывается и сверяется с планом — недостающий ключ роняет деплой.
- Скрипт ничего не удаляет и пишет только в `S3_BUCKET`; TalentForge не
  затрагивается ни при каких параметрах.
- `DRY_RUN=true` печатает план (ключи, типы, кеш, размер) без сети —
  использован при локальной проверке.

## 3. Документация `docs/DEPLOYMENT.md`

Полный runbook: создание бакета и отдельного S3-пользователя с правами
только на него, публичный доступ на чтение (политика бакета), GitHub
Secrets, первый ручной деплой, включение автодеплоя из main, собственный
домен с HTTPS через CDN VK Cloud (Let's Encrypt, CNAME на
`cl-XXXX.service.cdn.msk.vkcs.cloud`), чек-лист проверки production, откат
(локальная загрузка старого коммита или git revert), диагностика
403/404/MIME/кеша. Отдельно зафиксировано: HTTP website-endpoint не
публикуется как основной URL — только домен за CDN по HTTPS.

## 4. Тесты

`npm test` — 156 пройдено (было 142):

- новых 14 (`scripts/deploy-s3-lib.test.mjs`): Content-Type для всех типов
  файлов сайта, политика кеша (index.html не кешируется / assets
  immutable), валидация имени бакета, валидация endpoint (схема, креды в
  URL, блокировка localhost и приватных адресов для реальных загрузок),
  сбор плана загрузки, отказ при отсутствии `index.html`;
- существующие 142 — без изменений, регрессий нет.

Локальные проверки на Node 22.20: `npm ci` → `npm test` → `npm run build`
→ `DRY_RUN=true node scripts/deploy-s3.mjs` (план: 1 HTML, JS/CSS/TTF в
`assets/`, корректные типы и заголовки кеша).

## 5. Что должен сделать владелец

Кратко; полные шаги — `docs/DEPLOYMENT.md`, разделы 2–5.

1. VK Cloud: создать бакет `foreverjourney-web` (Москва, Hotbox).
2. VK Cloud: создать S3-пользователя `github-deploy-foreverjourney` с
   правами Put/Get/List только на этот бакет (ключи TalentForge не
   использовать).
3. VK Cloud: применить политику публичного чтения (раздел 2.3).
4. GitHub: добавить Secrets `VK_S3_ACCESS_KEY_ID`, `VK_S3_SECRET_ACCESS_KEY`.
5. Merge PR → Actions → Deploy to VK Cloud → Run workflow (main), при
   желании сначала с dry_run.
6. Проверить сайт по чек-листу (раздел 6), затем настроить домен + HTTPS
   через CDN (раздел 5) и включить автодеплой (раздел 4).

Облачные ресурсы автоматически не создавались и не изменялись.
