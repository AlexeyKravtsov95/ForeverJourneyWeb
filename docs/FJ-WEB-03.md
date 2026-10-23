# FJ-WEB-03 — Деплой в VK Cloud

Подготовка Forever Journey Book Creator к публичному релизу: production-деплой
статической сборки в отдельный бакет VK Cloud Object Storage (Москва) с
ручным запуском через GitHub Actions. Основа — `main` после merge PR #3.
VPS, Docker, backend и БД не создаются; дизайн, формат FJBOOK1, локализация,
генерация PDF и Lua-аддон не изменялись.

## 1. Workflow `.github/workflows/deploy.yml`

- Триггер — только `workflow_dispatch` (первый деплой вручную) с единственным
  входом `dry_run`. Автодеплой из main — закомментированный блок `push`
  **внутри** ключа `on:`: включается раскомментированием двух строк, второй
  ключ `on:` не появляется.
- Шаги: checkout → Node.js 22 LTS (кеш npm) → `npm ci` → `npm test` →
  `npm run build` → `node scripts/deploy-s3.mjs`. Ошибка любого шага роняет
  деплой.
- Цель публикации зафиксирована и не принимается на входе: бакет
  `foreverjourney-web`, endpoint `https://hb.ru-msk.vkcloud-storage.ru`
  (константы в env workflow и в `PRODUCTION_TARGET`).
- Ключи — только из GitHub Secrets `VK_S3_ACCESS_KEY_ID` /
  `VK_S3_SECRET_ACCESS_KEY`; в репозитории их нет, в лог не выводятся.
- Разрешения сужены до `contents: read`; `concurrency: production-deploy`
  не даёт деплоям накладываться.

## 2. Скрипт загрузки `scripts/deploy-s3.mjs` (+ `deploy-s3-lib.mjs`)

- S3-клиент `@aws-sdk/client-s3` (devDependency), path-style, регион
  `ru-msk`. Цель публикации сверяется с `PRODUCTION_TARGET`
  (бакет/endpoint/публичный URL) **до** создания клиента: подписанные
  запросы не уходят на сторонние endpoints и в чужие бакеты. Реальные
  загрузки — только HTTPS; приватные/loopback-адреса отклоняются.
- Content-Type задаются явно: HTML `text/html; charset=utf-8`, CSS
  `text/css`, JS `text/javascript`, JSON `application/json`, SVG
  `image/svg+xml`, TTF `font/ttf` (полная карта — `MIME_TYPES`).
- Кеш: `index.html` → `public, max-age=0, must-revalidate`; всё под
  `assets/` (хешированные файлы Vite) → `public, max-age=31536000,
  immutable`.
- Объекты загружаются **без object ACL** (`buildPutObjectInput`, покрыто
  тестом): публичное чтение даёт политика бакета с анонимным
  `s3:GetObject`; анонимной записи и листинга нет. Деплой-пользователю
  достаточно `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`.
- После загрузки список бакета (ListObjectsV2) сверяется с планом —
  недостающий ключ роняет деплой.
- Скрипт ничего не удаляет и пишет только в `foreverjourney-web`;
  TalentForge не затрагивается ни при каких параметрах.
- Итоговый вывод: имя бакета, число загруженных объектов, фактический S3
  endpoint и ожидаемый публичный адрес `https://journal.mythweld.com` —
  с оговоркой, что публичный адрес работает только после настройки и
  проверки CDN/HTTPS. Несуществующие website-URL не конструируются.
- `DRY_RUN=true` печатает план (ключи, типы, кеш, размер) без сети.

## 3. Документация `docs/DEPLOYMENT.md`

Полный runbook с реальной конфигурацией проекта (DNS — Beget, домен
mythweld.com, публичный адрес `https://journal.mythweld.com`, storage и
CDN — VK Cloud): создание бакета и отдельного S3-пользователя с правами
только на него, публичное чтение исключительно через политику бакета,
GitHub Secrets, первый ручной деплой, включение автодеплоя из main (без
второго ключа `on:`), CDN-ресурс (website-endpoint как origin, Host,
HTTPS к источнику, Let's Encrypt, HTTP→HTTPS redirect, TTL), CNAME
`journal` в Beget, проверки `/` → `index.html`, `/assets/*`,
Cache-Control/TTL, очистка кеша CDN после деплоя, откат, диагностика
403/404/MIME/кеша. Существующие ресурсы legal./ota.mythweld.com не
затрагиваются. HTTP website-endpoint не публикуется как основной URL.

## 4. Тесты

`npm test` — 162 пройдено (было 142):

- новых 20 (`scripts/deploy-s3-lib.test.mjs`): Content-Type для всех типов
  файлов сайта, политика кеша (index.html не кешируется / assets
  immutable), валидация имени бакета, валидация endpoint (схема, креды в
  URL, обязательный HTTPS для реальных загрузок, блокировка localhost и
  приватных адресов), allowlist цели публикации (`PRODUCTION_TARGET`:
  точный endpoint, отказ сторонним endpoints/бакетам), отсутствие ACL в
  `buildPutObjectInput`, отказ при отсутствии `index.html`, отсутствие
  ключей доступа в console-выводе скрипта;
- существующие 142 — без изменений, регрессий нет.

Локальные проверки на Node 22.20: `npm ci` → `npm test` → `npm run build`
→ `DRY_RUN=true node scripts/deploy-s3.mjs` (план: 1 HTML, JS/CSS/TTF в
`assets/`, корректные типы и заголовки кеша).

## 5. Что должен сделать владелец

Кратко; полные шаги — `docs/DEPLOYMENT.md`, разделы 3–6.

1. VK Cloud: создать бакет `foreverjourney-web` (Москва, Hotbox).
2. VK Cloud: создать S3-пользователя `github-deploy-foreverjourney` с
   правами Put/Get/List только на этот бакет (ключи TalentForge не
   использовать).
3. VK Cloud: применить политику публичного чтения (раздел 3.3) и включить
   конфигурацию статики (3.4).
4. GitHub: добавить Secrets `VK_S3_ACCESS_KEY_ID`, `VK_S3_SECRET_ACCESS_KEY`.
5. Merge PR → Actions → Deploy to VK Cloud → Run workflow (main), при
   желании сначала с dry_run.
6. VK Cloud: создать CDN-ресурс с доменом journal.mythweld.com и
   сертификатом Let's Encrypt (раздел 6), Beget: CNAME `journal` на
   служебный домен CDN; записи legal/ota не трогать.
7. Проверить сайт по чек-листу (раздел 7) и включить автодеплой (раздел 5).

Облачные ресурсы автоматически не создавались и не изменялись.

## 6. Правки по ревью PR #4

- **Object ACL убран**: PutObjectCommand не передаёт ACL, конфигурация
  `S3_PUBLIC_READ` удалена; публичное чтение — только политика бакета с
  анонимным `s3:GetObject`; деплой-пользователю оставлены права
  PutObject/GetObject/ListBucket. Отсутствие ACL покрыто тестом
  (`buildPutObjectInput`).
- **Цель публикации зафиксирована**: workflow больше не принимает
  произвольные bucket/endpoint; константы в env workflow сверяются со
  значением `PRODUCTION_TARGET` в `deploy-s3-lib.mjs` перед созданием
  клиента — сторонние endpoints и чужие бакеты отклоняются (тесты
  `isAllowedTarget`), реальные загрузки только по HTTPS (тест
  `validateEndpoint`).
- **Вывод адресов исправлен**: website-URL больше не конструируется; после
  деплоя печатаются бакет, число объектов, фактический S3 endpoint и
  ожидаемый публичный адрес `https://journal.mythweld.com` с оговоркой про
  необходимость проверки CDN/HTTPS.
- **CDN-рубук переписан** под реальную конфигурацию (Beget DNS +
  VK Cloud CDN, новый ресурс для journal.mythweld.com, CNAME, Let's
  Encrypt, HTTP→HTTPS, Origin Host, HTTPS к источнику, проверки `/` и
  `/assets/*`, Cache-Control/TTL, очистка кеша); ресурсы legal./ota.
  mythweld.com не затрагиваются.
- **Автодеплой**: блок `push` закомментирован внутри единственного ключа
  `on:` — при включении второй `on:` не появляется; YAML проверен линтом.
- Тесты: 20 в `scripts/deploy-s3-lib.test.mjs` (было 14), включая
  проверку, что ключи доступа не попадают в console-вывод скрипта.
