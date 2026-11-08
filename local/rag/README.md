# local_rag — серверная интеграция Moodle

Установите `local/rag` и `blocks/ragchat` в соответствующие каталоги Moodle 4.5 LTS и выполните `php admin/cli/upgrade.php --non-interactive`. Нужны PHP cURL, DOM/libxml, ZipArchive, стандартная БД Moodle и cron. Тема `theme/inzhe` поставляется отдельно для общего оформления: [инструкция установки](../../README.md).

## Серверная конфигурация

`RAG_SERVICE_URL` и `RAG_SERVICE_TOKEN` достаточны для чата и ingestion. `RAG_ADMIN_TOKEN` нужен дополнительно только для управления backend через admin page. Env имеет приоритет над `local_rag` settings; явно пустой токен отключает интеграцию. Ключи не включаются в HTML/bootstrap, не передаются браузеру и не логируются плагином. PHP-FPM/Apache и cron должны видеть одинаковые env; одной проверки CLI недостаточно. URL можно задать также в Site administration → Plugins → Local plugins → Smart search; секреты задавайте серверными средствами.

Без service token не выводятся чат, scripts/styles и menu integration, proxy/preferences отклоняются, observers/tasks пропускают ingestion. Только администратор видит предупреждение. Admin page требует `local/rag:manage` и отдельный admin token.

## Доступ и область поиска

Чат появляется на настоящей странице курса или его activity. Читаемая нативная Database activity поддерживается также на SITEID. Домашняя страница, dashboard, профиль и site administration не получают чат. URL parameters не выбирают область поиска: она определяется текущими Moodle PAGE/context на сервере.

Нужны вход, зачисление либо явная course-view capability и `local/rag:use`. Moodle проверяет видимость/availability модулей и view capabilities при каждом запросе. Для Database файлов учитываются approval/ownership, группы, view dates и minimum entry count. PHP формирует `allowed_doc_ids`; backend обязан применять whitelist до retrieval/generation. Ссылки на оригиналы проходят повторные Moodle permission checks.

## Документы и синхронизация

Поддерживаются PDF, DOCX, PPTX из Resource, Folder и Database file fields в записях преподавателей/пользователей с `mod/data:manageentries`; student-authored entries не индексируются. Native adapters охватывают Page, главы Book, Label, summaries разделов курса и принадлежащие курсу HTML blocks; поддерживаемые вложения этих областей также индексируются. Сторонние activity plugins и произвольные таблицы/файлы не сканируются. HTML становится инертным текстом и временным DOCX для существующего backend ingestion API; встроенные script/style/iframe исключаются. Результаты native sources ведут на соответствующую Moodle страницу/якорь.

События добавляют ad-hoc sync. Retry каждую минуту и reconciliation каждые 15 минут восстанавливают пропущенные изменения/удаления. Запустите initial reconciliation и штатный cron после установки:

```sh
php admin/cli/scheduled_task.php --execute='\local_rag\task\reconcile_documents'
php admin/cli/cron.php
```

Файлы передаются server-to-server multipart bytes, Moodle URL backend не загружает. Temporary files удаляются в `finally`; Moodle locks сериализуют ingestion; стабильный doc ID и content hash отслеживают изменения. Retry использует ограниченную экспоненциальную задержку, ошибки сохраняются без секретов. Database metadata распознаёт title/name/название, author/автор, year/год, keywords/tags/теги.

Library page показывает состояние синхронизации и позволяет управлять backend model/search/chunk settings с admin token. Плагин сохраняет chat preferences; история разговоров не хранится им. Privacy provider описывает передачу вопросов и user IDs настроенному backend.

## Проверка

В отдельном настроенном Moodle PHPUnit окружении:

```sh
vendor/bin/phpunit --testsuite local_rag_testsuite
```

Проверяются disabled integration, bootstrap без секретов, enrolment, visibility, стабильные identities, Database restrictions и native sources. Медленный chat освобождает Moodle session lock после авторизации, чтобы навигация не блокировалась.
