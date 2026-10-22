# Развёртывание Forever Journey Book Creator (VK Cloud)

Инструкция по публикации сайта в VK Cloud Object Storage и автоматизации
деплоя через GitHub Actions. Архитектура полностью статическая: сборка
`dist/` заливается в бакет S3, пользователи ходят через CDN-домен с
сертификатом. VPS, Docker, backend и база данных не используются.

```
GitHub Actions (npm ci → npm test → npm run build → upload)
        │
        ▼  S3 API, ключи из GitHub Secrets
VK Cloud Object Storage — бакет foreverjourney-web (регион Москва)
        │
        ▼  origin
VK Cloud CDN — personal domain + сертификат Let's Encrypt
        │
        ▼
https://<ваш-домен>/  ← единственный публичный URL сайта
```

## 1. Что деплоится

`npm run build` собирает сайт в `dist/`:

- `index.html` — единственная страница приложения;
- `assets/*.js`, `assets/*.css` — бандлы Vite с хешем в имени;
- `assets/*.ttf` — шрифты PT Serif, загружаются с того же домена.

Скрипт [`scripts/deploy-s3.mjs`](../scripts/deploy-s3.mjs) заливает файлы
через S3 API со следующими правилами (логика в
[`scripts/deploy-s3-lib.mjs`](../scripts/deploy-s3-lib.mjs), покрыта тестами):

| Файлы | Content-Type | Cache-Control |
| --- | --- | --- |
| `index.html` (и любой корневой HTML) | `text/html; charset=utf-8` | `public, max-age=0, must-revalidate` |
| `assets/*` (хешированные) | по расширению: JS `text/javascript`, CSS `text/css`, JSON `application/json`, SVG `image/svg+xml`, TTF `font/ttf`, … | `public, max-age=31536000, immutable` |
| прочие корневые файлы (если появятся) | по расширению | `public, max-age=0, must-revalidate` |

После загрузки скрипт перечитывает содержимое бакета (ListObjectsV2) и
падает с ошибкой, если хоть один ожидаемый объект отсутствует — деплой не
может «тихо» пройти наполовину.

Скрипт **никогда не удаляет объекты** и пишет только в бакет, указанный в
`S3_BUCKET`: старые хешированные ассеты остаются в бакете и не мешают
(несколько сотен килобайт на релиз). Бакет TalentForge и любые другие
ресурсы деплой не затрагивает.

## 2. Действия владельца в VK Cloud (один раз)

Ничего из этого не создаётся автоматически — ниже ручные шаги в личном
кабинете [cloud.vk.ru](https://cloud.vk.ru).

### 2.1. Создать бакет

1. Личный кабинет → **Объектное хранилище → Бакеты → Создать**.
2. Имя: `foreverjourney-web` (должно совпадать с `S3_BUCKET`).
3. Регион: **Москва** (`ru-msk`), класс хранения **Hotbox** — подходит для
   раздачи сайта.
4. Бакет TalentForge не трогаем: у сайта отдельный бакет.

### 2.2. Создать отдельного S3-пользователя для деплоя

1. **Объектное хранилище → S3-пользователи → Добавить**: имя, например
   `github-deploy-foreverjourney`.
2. Сохраните выданные **Access Key ID** и **Secret Access Key** — секретный
   ключ показывается один раз.
3. Дайте пользователю права **только на бакет сайта** (минимум для деплоя):
   `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` на
   `arn:aws:s3:::foreverjourney-web` и `arn:aws:s3:::foreverjourney-web/*`.

Ключи от TalentForge и другие существующие ключи не использовать: у
деплой-пользователя не должно быть прав за пределами `foreverjourney-web`.

### 2.3. Включить публичный доступ на чтение

Публичным должен быть только чтение. Деплой-скрипт по умолчанию ставит
каждому объекту ACL `public-read`; политика бакета ниже — дополнительная
гарантия, действующая на все объекты, даже залитые вручную:

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

Альтернатива — ACL бакета `public-read` (тогда все объекты тоже нужно
заливать с `--acl public-read`, что наш скрипт и делает).

Писать анонимно политика не разрешает: анонимам доступно только
`s3:GetObject`.

### 2.4. (Опционально) Конфигурация статического сайта

Нужна только если хотите проверять публикацию напрямую по website-endpoint,
без CDN (для основного URL не используется — см. раздел 5):

```bash
aws s3api put-bucket-website \
  --bucket foreverjourney-web \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"}}' \
  --endpoint-url https://hb.ru-msk.vkcloud-storage.ru
```

Website-endpoint примет вид
`https://foreverjourney-web.hb-website.hb.ru-msk.vkcloud-storage.ru/`.
Не рассчитывайте, что этот endpoint отдаёт HTTPS: режим статики в
S3-совместимых хранилищах исторически HTTP-only, и даже если раздача по
HTTPS работает, сертификат там сервисный. Не публикуйте этот адрес как
основной URL сайта.

## 3. Настройка GitHub Secrets

1. Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**.
2. Добавить два секрета:
   - `VK_S3_ACCESS_KEY_ID` — Access Key ID из шага 2.2;
   - `VK_S3_SECRET_ACCESS_KEY` — Secret Access Key из шага 2.2.

Ключи хранятся только в Secrets, в репозиторий не попадают; workflow
обращается к ним как `${{ secrets.VK_S3_* }}`. Имя бакета и endpoint — не
секреты: они задаются входными параметрами workflow (по умолчанию
`foreverjourney-web` и `https://hb.ru-msk.vkcloud-storage.ru`) и при
необходимости меняются в `.github/workflows/deploy.yml`.

Разрешений у workflow ровно одно: `contents: read` (checkout репозитория).
Токен GitHub деплою больше не нужен, S3-ключи действуют только на один
бакет.

## 4. Первый ручной деплой

`workflow_dispatch` доступен только после того, как файл
`.github/workflows/deploy.yml` окажется на `main` (то есть после merge PR
FJ-WEB-03).

1. Репозиторий → вкладка **Actions** → слева **Deploy to VK Cloud**.
2. **Run workflow** → ветка `main` → при необходимости переопределить
   бакет/endpoint → **Run workflow**.
3. Шаги: checkout → Node.js 22 LTS → `npm ci` → `npm test` →
   `npm run build` → `node scripts/deploy-s3.mjs`. Любая ошибка сборки,
   тестов или загрузки роняет workflow красным.
4. В логе шага загрузки видно каждый объект, его Content-Type и
   Cache-Control, а в конце — строка `done: N objects verified`.

Полезно сделать первый прогон с галкой **dry_run**: скрипт напечатает план
загрузки (ключи, типы, заголовки кеша) и ничего не запишет в бакет.

### Включение автоматического деплоя из main

После успешной проверки первой публикации (раздел 6):

1. Открыть `.github/workflows/deploy.yml`, раскомментировать блок:

   ```yaml
   on:
     push:
       branches: [main]
   ```

2. Закоммитить в `main` (мелкий PR «enable auto-deploy»). Теперь каждый
   merge в main деплоит сайт автоматически; параллельные запуски
   сериализуются через `concurrency: production-deploy`.

## 5. Собственный домен и HTTPS

S3 website-endpoint по HTTP (а тем более бакет-эндпоинт) не является
публичным URL сайта. Основной адрес — ваш домен за CDN VK Cloud с
сертификатом. Официально поддерживаемый путь (руководство
[«Развертывание сайта на объектном хранилище с CDN»](https://cloud.vk.ru/docs/ru/storage/s3/how-to-guides/cdn-ssh)):

1. Личный кабинет → **Объектное хранилище → Бакеты → foreverjourney-web →
   вкладка CDN** → включить «Использовать CDN для данного бакета».
2. Указать **персональный домен**, например `foreverjourney.example.ru`
   (домен должен быть вашим, DNS можно вести где угодно, в том числе в
   VK Cloud DNS).
3. Включить «Доступ к контенту конечным пользователям», протокол
   взаимодействия с источником — HTTPS.
4. В настройках шифрования выбрать **Let's Encrypt** — сертификат
   выпустится автоматически (до ~30 минут) после того, как CNAME начнёт
   резолвиться.
5. В DNS домена создать CNAME-запись: имя домена → служебное имя
   CDN-ресурса вида `cl-XXXXXXXX.service.cdn.msk.vkcs.cloud` (показывается
   в кабинете после создания ресурса).
6. Дождаться выпуска сертификата и проверить `https://<домен>/`.

Замечания по кешу CDN:

- `index.html` уходит с `max-age=0, must-revalidate` — CDN будет
  перезапрашивать его у бакета, релизы подхватываются быстро;
- хешированные `assets/*` кешируются на edge на срок TTL CDN-ресурса
  (1–7 дней) — это нормально: имя файла меняется при каждом изменении;
- TTL кеша CDN задаётся при создании ресурса; правило «время жизни кеша»
  для статусов 200/301/302 и т.д.

Смешанного контента (mixed content) нет: сайт не запрашивает внешние
HTTP-ресурсы вообще — шрифты, favicon и все ассеты раздаются с того же
домена, дневники не покидают браузер.

## 6. Проверка production

Чек-лист после первого деплоя (и после включения HTTPS):

1. Главная страница открывается, книга-пример на месте.
2. Переключение EN/RU работает, тексты переключаются.
3. Демо-журнал загружается.
4. Импорт реального файла FJBOOK1 (`*.fjbook`) проходит.
5. Книжный предпросмотр рендерится.
6. Download PDF скачивает корректный PDF.
7. В DevTools → Network: шрифты `PT_Serif-Web-*.ttf` загружаются с того же
   домена (200/304), без обращений к сторонним хостам.
8. В DevTools → Network: при работе с дневниками (ввод, импорт, PDF) нет
   исходящих запросов с содержимым дневников — все данные остаются в
   браузере.
9. Сайт открывается по `https://<домен>/`, замок валиден, в консоли нет
   предупреждений о mixed content.
10. `curl -I https://<домен>/` показывает `content-type: text/html` и
    `cache-control: public, max-age=0, must-revalidate`;
    `curl -I https://<домен>/assets/<file>.js` — `text/javascript` и
    `immutable`.

## 7. Откат на предыдущую сборку

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

  `index.html` с `max-age=0` подхватится сразу; CDN отдаст новую версию
  после истечения своего TTL (или сбросьте кеш CDN-ресурса в кабинете).

- **Через git**: сделать `git revert` проблемного коммита в main и
  дождаться автодеплоя (или запустить workflow вручную). Медленнее, но
  история деплоев остаётся в Actions.

## 8. Диагностика

### 403 Forbidden на сайте или в логе деплоя

- Нет публичного чтения: не применена политика бакета из 2.3 (или у
  объектов нет ACL `public-read`) — проверьте
  `curl -I https://foreverjourney-web.hb.ru-msk.vkcloud-storage.ru/index.html`.
- В логе деплоя 403 на PutObject: ключи деплой-пользователя неверны или у
  него нет прав на этот бакет (2.2). Убедитесь, что используются ключи
  `github-deploy-foreverjourney`, а не TalentForge.
- В логе деплоя 403 на ListObjectsV2: нет права `s3:ListBucket`.

### 404 Not Found

- В бакете нет `index.html`: деплой не дошёл до конца — смотрите лог
  шага загрузки (строка `done: N objects verified` обязательна).
- Опечатка в имени бакета (`S3_BUCKET`) или endpoint (`S3_ENDPOINT`) во
  входных параметрах запуска.
- Website-endpoint: не включена конфигурация статики (2.4).
- На CDN-домене 404 — источник/домен настроены не на тот бакет.

### MIME-ошибки (стили/скрипты не применяются, «Refused to apply»)

Деплой задаёт Content-Type явно, поэтому типичный источник — ручная
заливка мимо скрипта. Проверьте:

```bash
curl -I https://<домен>/index.html                  # text/html; charset=utf-8
curl -I https://<домен>/assets/<hash>.js           # text/javascript; charset=utf-8
curl -I https://<домен>/assets/<hash>.css          # text/css; charset=utf-8
curl -I https://<домен>/assets/<hash>.ttf          # font/ttf
```

Если тип неверный — перезалейте файлы скриптом деплоя (он выставит типы).
Полная карта типов — в `scripts/deploy-s3-lib.mjs` (`MIME_TYPES`).

### Кеш не отпускает старую версию

- Убедитесь, что проверяете именно `index.html` (у него `max-age=0`);
  ассеты со старым хешем обязаны кешироваться — новая сборка ссылается на
  новые имена.
- Сбросьте кеш CDN-ресурса в личном кабинете (CDN → CDN-ресурсы → очистка
  кеша) и кеш браузера (Ctrl+F5).

## 9. Ссылки на документацию VK Cloud

- [Хостинг статических сайтов (концепции)](https://cloud.vk.ru/docs/ru/storage/s3/concepts/static-site-hosting)
- [Развертывание сайта на объектном хранилище с CDN](https://cloud.vk.ru/docs/ru/storage/s3/how-to-guides/cdn-ssh)
- [Создание CDN-ресурса](https://cloud.vk.ru/docs/ru/networks/cdn/instructions/create-resource)
- [SSL-сертификат для CDN](https://cloud.vk.ru/docs/ru/networks/cdn/instructions/manage-cdn/ssl)
- [Object Storage: инструкции бакетов](https://cloud.vk.ru/docs/ru/storage/s3/instructions/buckets/manage-bucket)
