# Развёртывание Forever Journey Book Creator (VK Cloud)

Инструкция по публикации сайта в VK Cloud Object Storage и автоматизации
деплоя через GitHub Actions. Архитектура полностью статическая: сборка
`dist/` заливается в бакет S3, пользователи ходят на
`https://journal.mythweld.com` через CDN VK Cloud с сертификатом
Let's Encrypt. VPS, Docker, backend и база данных не используются.

```
GitHub Actions (npm ci → npm test → npm run build → upload)
        │  S3 API, только HTTPS, ключи из GitHub Secrets
        ▼
VK Cloud Object Storage — бакет foreverjourney-web
  endpoint: https://hb.ru-msk.vkcloud-storage.ru (регион Москва)
        │  origin
        ▼
VK Cloud CDN — персональный домен journal.mythweld.com + Let's Encrypt
        ▲
        │  CNAME journal → cl-XXXXXXXX.service.cdn.msk.vkcs.cloud
DNS Beget (домен mythweld.com)
```

## 1. Фиксированная production-конфигурация

| Параметр | Значение | Где зафиксировано |
| --- | --- | --- |
| Бакет | `foreverjourney-web` | env workflow + `PRODUCTION_TARGET` в `scripts/deploy-s3-lib.mjs` |
| S3 endpoint | `https://hb.ru-msk.vkcloud-storage.ru` (только HTTPS) | там же |
| Публичный URL | `https://journal.mythweld.com` | `PRODUCTION_TARGET.publicUrl` |
| Ключи доступа | `VK_S3_ACCESS_KEY_ID`, `VK_S3_SECRET_ACCESS_KEY` | GitHub Secrets (в репозитории их нет) |

Workflow **не принимает** произвольные bucket и endpoint: цель публикации
задана константами, а `scripts/deploy-s3.mjs` перед созданием S3-клиента
сверяет переменные окружения с `PRODUCTION_TARGET` — подписанные S3-запросы
не уйдут на сторонний endpoint и в чужой бакет даже при ошибке в окружении.
Реальные загрузки — исключительно по HTTPS. Смена конфигурации = правка
workflow + `PRODUCTION_TARGET` через PR.

## 2. Что деплоится

`npm run build` собирает сайт в `dist/`:

- `index.html` — единственная страница приложения;
- `assets/*.js`, `assets/*.css` — бандлы Vite с хешем в имени;
- `assets/*.ttf` — шрифты PT Serif, загружаются с того же домена.

Скрипт [`scripts/deploy-s3.mjs`](../scripts/deploy-s3.mjs) заливает файлы
через S3 API (логика в [`scripts/deploy-s3-lib.mjs`](../scripts/deploy-s3-lib.mjs),
покрыта тестами):

| Файлы | Content-Type | Cache-Control |
| --- | --- | --- |
| `index.html` (и любой корневой HTML) | `text/html; charset=utf-8` | `public, max-age=0, must-revalidate` |
| `assets/*` (хешированные) | по расширению: JS `text/javascript`, CSS `text/css`, JSON `application/json`, SVG `image/svg+xml`, TTF `font/ttf`, … | `public, max-age=31536000, immutable` |
| прочие корневые файлы (если появятся) | по расширению | `public, max-age=0, must-revalidate` |

Права и целостность:

- объекты загружаются **без object ACL** — публичное чтение даёт политика
  бакета (анонимный `s3:GetObject` только на этот бакет); анонимной записи
  и листинга нет;
- после загрузки список бакета (ListObjectsV2) сверяется с планом —
  недостающий объект роняет деплой;
- скрипт ничего не удаляет и пишет только в `foreverjourney-web`; старые
  хешированные ассеты остаются в бакете и не мешают. Бакет TalentForge и
  другие ресурсы деплой не затрагивает.

## 3. Действия владельца в VK Cloud (один раз)

Ничего из этого не создаётся автоматически — ниже ручные шаги в личном
кабинете [cloud.vk.ru](https://cloud.vk.ru).

### 3.1. Создать бакет

1. Личный кабинет → **Объектное хранилище → Бакеты → Создать**.
2. Имя: `foreverjourney-web`.
3. Регион: **Москва** (`ru-msk`), класс хранения **Hotbox** — подходит для
   раздачи сайта.
4. Бакет TalentForge не трогаем: у сайта отдельный бакет.

### 3.2. Создать отдельного S3-пользователя для деплоя

1. **Объектное хранилище → S3-пользователи → Добавить**: имя, например
   `github-deploy-foreverjourney`.
2. Сохраните выданные **Access Key ID** и **Secret Access Key** — секретный
   ключ показывается один раз.
3. Дайте пользователю минимальные права **только на бакет сайта**:
   `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` на
   `arn:aws:s3:::foreverjourney-web` и `arn:aws:s3:::foreverjourney-web/*`.

Ключи от TalentForge и другие существующие ключи не использовать: у
деплой-пользователя не должно быть прав за пределами `foreverjourney-web`.

### 3.3. Включить публичный доступ на чтение (политика бакета)

Единственный механизм публичного чтения — политика бакета с анонимным
`s3:GetObject`. Запись и листинг анонимно не разрешаются.

`policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForeverJourneyWeb",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::foreverjourney-web/*"
    }
  ]
}
```

Применить через AWS CLI:

```bash
aws s3api put-bucket-policy \
  --bucket foreverjourney-web \
  --policy file://policy.json \
  --endpoint-url https://hb.ru-msk.vkcloud-storage.ru
```

### 3.4. Включить конфигурацию статического сайта

Нужна, чтобы website-endpoint бакета отдавал `index.html` на запрос `/` —
CDN использует его как источник (раздел 6):

```bash
aws s3api put-bucket-website \
  --bucket foreverjourney-web \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"}}' \
  --endpoint-url https://hb.ru-msk.vkcloud-storage.ru
```

Website-endpoint (`foreverjourney-web.hb-website.hb.ru-msk.vkcloud-storage.ru`)
— служебный адрес источника для CDN, **не** публичный URL сайта: не
рассчитывайте на его HTTPS и не публикуйте его. Публичный адрес один —
`https://journal.mythweld.com` за CDN.

## 4. Настройка GitHub Secrets

1. Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**.
2. Добавить два секрета:
   - `VK_S3_ACCESS_KEY_ID` — Access Key ID из раздела 3.2;
   - `VK_S3_SECRET_ACCESS_KEY` — Secret Access Key из раздела 3.2.

Ключи хранятся только в Secrets; workflow обращается к ним как
`${{ secrets.VK_S3_* }}` и не выводит их в лог. Разрешения workflow —
только `contents: read`.

## 5. Первый ручной деплой

`workflow_dispatch` доступен после того, как
`.github/workflows/deploy.yml` окажется на `main` (после merge PR).

1. Репозиторий → вкладка **Actions** → слева **Deploy to VK Cloud**.
2. **Run workflow** → ветка `main`. Настраиваемых параметров нет, кроме
   галочки **dry_run** («Проверить план без загрузки»): бакет и endpoint
   зафиксированы (раздел 1).
3. Шаги: checkout → Node.js 22 LTS → `npm ci` → `npm test` →
   `npm run build` → `node scripts/deploy-s3.mjs`. Любая ошибка сборки,
   тестов или загрузки роняет workflow.
4. Скрипт печатает: имя бакета, план и число объектов, фактический S3
   endpoint и ожидаемый публичный адрес `https://journal.mythweld.com` —
   с оговоркой: публичный адрес считается рабочим только после настройки и
   проверки CDN/HTTPS (раздел 6), сам деплой этого не гарантирует.

Первый прогон имеет смысл сделать с dry_run: скрипт напечатает план
загрузки (ключи, Content-Type, Cache-Control) и ничего не запишет.

### Включение автоматического деплоя из main

После успешной проверки первой публикации раскомментируйте две строки
**внутри** существующего ключа `on:` (второй ключ `on:` создавать не нужно
— файл уже подготовлен):

```yaml
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Проверить план без загрузки'
        type: boolean
        default: false
  # После первого успешного релиза:
  # push:
  #   branches: [main]
```

После правки проверьте синтаксис YAML (GitHub подсвечивает ошибки при
коммите; локально — например `npx --yes yaml-lint .github/workflows/deploy.yml`).
Теперь каждый merge в main деплоит автоматически; параллельные запуски
сериализуются через `concurrency: production-deploy`.

## 6. Домен и HTTPS: Beget DNS + VK Cloud CDN

Реальная конфигурация проекта:

- домен **mythweld.com**, DNS обслуживает **Beget** (только DNS);
- **VK Cloud** — Object Storage и CDN;
- публичный адрес сайта — **`https://journal.mythweld.com`**;
- уже существующие ресурсы `legal.mythweld.com` и `ota.mythweld.com`
  (записи DNS и CDN-ресурсы) **не изменять** — все шаги ниже создают новый
  CDN-ресурс и одну новую DNS-запись.

### Шаг 1. Конфигурация статики на бакете

Выполните раздел 3.4, если ещё не сделали: website-endpoint должен
отдавать `index.html` на `/` — CDN будет использовать его как источник.

### Шаг 2. Новый CDN-ресурс в VK Cloud

Личный кабинет → **CDN → CDN-ресурсы → Создать ресурс**:

1. **Источник контента** (origin): website-endpoint бакета
   `foreverjourney-web.hb-website.hb.ru-msk.vkcloud-storage.ru`.
   Мастер «вкладка CDN в настройках бакета» рассчитан на объекты с ACL
   `public-read` — у нас доступ через политику бакета, поэтому ресурс
   создаётся вручную в разделе CDN.
2. **Заголовок Host**: «Не менять» — источнику уходит Host origin-хоста,
   и S3 корректно резолвит бакет и `index.html`.
3. **Протокол взаимодействия с источником**: HTTPS (website-endpoint
   обслуживается сервисным сертификатом хранилища). Если при проверке
   источник по HTTPS недоступен — переключите на HTTP: это внутренний
   канал CDN→S3, публичный URL остаётся HTTPS, mixed content не возникает.
4. **Персональный домен**: `journal.mythweld.com`.
5. **Сертификат**: Let's Encrypt — выпустится автоматически (до ~30 минут)
   после того, как CNAME начнёт резолвиться.
6. **Перенаправление HTTP → HTTPS**: включить в настройках ресурса, чтобы
   запросы `http://journal.mythweld.com` уводились на HTTPS.
7. **Доступ к контенту конечным пользователям**: включить (иначе ресурс в
   состоянии «Приостановлен»).
8. **Кеширование**: TTL 1–7 дней для статики; для HTML убедитесь, что
   edge-кеш не живёт дольше нескольких минут (см. проверку ниже — Cache-Control
   источника `max-age=0, must-revalidate`, при необходимости добавьте
   отдельное правило кеширования для `*.html` с малым TTL).

После создания скопируйте **служебный домен CDN-ресурса** вида
`cl-XXXXXXXX.service.cdn.msk.vkcs.cloud`.

### Шаг 3. CNAME в Beget

Панель Beget → Управление DNS → домен `mythweld.com`:

- добавить запись: тип `CNAME`, имя `journal`, значение — служебный домен
  CDN-ресурса из шага 2 (`cl-XXXXXXXX.service.cdn.msk.vkcs.cloud.`);
- записи `legal` и `ota` **не трогать**;
- дождаться распространения DNS (обычно минуты, до нескольких часов).

### Шаг 4. Проверки

- Корень: `curl -I https://journal.mythweld.com/` → `200`,
  `content-type: text/html; charset=utf-8`, заголовок кеша не длиннее
  нескольких минут (CDN должен перезапрашивать HTML у источника — у него
  `max-age=0, must-revalidate`). Если `/` отдаёт 403/404 или XML-ответ S3 —
  источник указан не на website-endpoint или статика не включена (3.4).
  Если сам CDN не резолвит `/` в `index.html` — проверьте в настройках
  ресурса опцию корневого объекта/подмены пути; при её отсутствии источник
  website-endpoint уже решает вопрос.
- Ассеты: `curl -I https://journal.mythweld.com/assets/<hash>.js|.css|.ttf`
  → `200` + `text/javascript` / `text/css` / `font/ttf` +
  `cache-control: public, max-age=31536000, immutable`.
- HTTPS: замок валиден на `https://journal.mythweld.com/`, открывается без
  предупреждений; `http://journal.mythweld.com/` редиректит на HTTPS.
- Функциональность — чек-лист раздела 7.

### Очистка кеша CDN после деплоя

CDN кеширует на edge TTL ресурса, поэтому свежий `index.html` после релиза
может прийти не сразу. После каждого деплоя: **CDN → CDN-ресурсы → выбрать
ресурс journal → Очистить кеш** (полная очистка или по путям `/` и
`/index.html`). Ассеты чистить не нужно — их имена меняются с каждым
релизом.

## 7. Проверка production

Чек-лист после первого деплоя и после включения HTTPS:

1. Главная страница `https://journal.mythweld.com/` открывается.
2. Переключение EN/RU работает, тексты переключаются.
3. Демо-журнал загружается.
4. Импорт реального файла FJBOOK1 (`*.fjbook`) проходит.
5. Книжный предпросмотр рендерится.
6. Download PDF скачивает корректный PDF.
7. В DevTools → Network: шрифты `PT_Serif-Web-*.ttf` загружаются с
   `journal.mythweld.com` (200/304), обращений к сторонним хостам нет.
8. При работе с дневниками (ввод, импорт, PDF) исходящих запросов с их
   содержимым нет — все данные остаются в браузере.
9. Сайт открывается по HTTPS, в консоли нет mixed content.
10. `curl -I`-проверки из раздела 6 (шаг 4) пройдены.

## 8. Откат на предыдущую сборку

Деплой не удаляет объекты, поэтому предыдущая сборка продолжает лежать в
бакете. Два способа отката:

- **Быстрый (рекомендуемый)**: локально на нужном коммите
  (`git checkout <хороший-коммит>`) выполнить сборку и загрузку вручную:

  ```bash
  npm ci && npm run build
  S3_ENDPOINT=https://hb.ru-msk.vkcloud-storage.ru \
  S3_BUCKET=foreverjourney-web \
  S3_ACCESS_KEY_ID=<id> S3_SECRET_ACCESS_KEY=<secret> \
  node scripts/deploy-s3.mjs
  ```

  Затем очистить кеш CDN для `/` и `/index.html` (раздел 6).

- **Через git**: `git revert` проблемного коммита в main и дождаться
  автодеплоя (или запустить workflow вручную). История деплоев остаётся в
  Actions.

## 9. Диагностика

### 403 Forbidden

- На сайте: политика бакета из 3.3 не применена — анонимный `s3:GetObject`
  отсутствует (ACL не используется, «выдать ACL вручную» не вариант —
  объекты управляются только политикой и деплой-скриптом).
- В логе деплоя 403 на PutObject: ключи деплой-пользователя неверны или у
  него нет прав на этот бакет (3.2). Использовать ключи TalentForge нельзя.
- В логе деплоя 403 на ListObjectsV2: нет права `s3:ListBucket`.
- На CDN-домене: сертификат не выпущен (CNAME ещё не резолвится) или
  «Доступ к контенту» выключен.

### 404 Not Found

- В бакете нет `index.html`: деплой не дошёл до конца — в логе обязательна
  строка `done: N objects uploaded and verified`.
- `/` на CDN отдаёт 404/XML: источник указан не на website-endpoint либо
  не включена конфигурация статики (3.4); проверьте Host источника.
- Конкретный ассет 404: деплой старой сборки, а HTML новой (или наоборот) —
  очистите кеш CDN и перезагрузите страницу.

### MIME-ошибки (стили/скрипты не применяются, «Refused to apply»)

Деплой задаёт Content-Type явно, поэтому типичный источник — ручная
заливка мимо скрипта или подмена кешем CDN. Проверьте:

```bash
curl -I https://journal.mythweld.com/                    # text/html; charset=utf-8
curl -I https://journal.mythweld.com/assets/<hash>.js   # text/javascript; charset=utf-8
curl -I https://journal.mythweld.com/assets/<hash>.css  # text/css; charset=utf-8
curl -I https://journal.mythweld.com/assets/<hash>.ttf  # font/ttf
```

Если тип неверный — перезалейте файлы скриптом деплоя и очистите кеш CDN.
Полная карта типов — в `scripts/deploy-s3-lib.mjs` (`MIME_TYPES`).

### Кеш не отпускает старую версию

- Убедитесь, что проверяете `index.html` (у него `max-age=0`); ассеты со
  старым хешем обязаны кешироваться — новая сборка ссылается на новые имена.
- Очистите кеш CDN-ресурса (раздел 6) и кеш браузера (Ctrl+F5).

## 10. Ссылки на документацию VK Cloud

- [Хостинг статических сайтов (концепции)](https://cloud.vk.ru/docs/ru/storage/s3/concepts/static-site-hosting)
- [Развертывание сайта на объектном хранилище с CDN](https://cloud.vk.ru/docs/ru/storage/s3/how-to-guides/cdn-ssh)
- [Создание CDN-ресурса](https://cloud.vk.ru/docs/ru/networks/cdn/instructions/create-resource)
- [SSL-сертификат для CDN](https://cloud.vk.ru/docs/ru/networks/cdn/instructions/manage-cdn/ssl)
- [Object Storage: инструкции бакетов](https://cloud.vk.ru/docs/ru/storage/s3/instructions/buckets/manage-bucket)
