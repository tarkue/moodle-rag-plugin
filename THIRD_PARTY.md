# Сторонние компоненты и права

- Moodle и Boost — внешняя зависимость, GPL v3 или более поздняя версия. Moodle core не включён в этот репозиторий.
- `theme/inzhe/templates/theme_boost/navbar.mustache` содержит существующее уведомление Moodle GPL; оно сохранено без изменений.
- Inter Variable (`theme/inzhe/fonts/InterVariable.woff2`) — SIL Open Font License 1.1, полный текст и copyright в `theme/inzhe/fonts/OFL.txt`.
- AMD использует RequireJS из Moodle. Build scripts используют только стандартные модули Node.js; production npm dependencies отсутствуют. Новый `block_ragchat/markdown` — собственный DOM renderer без внешнего parser/CDN, с явным GPL v3-or-later header в исходнике.
- LinkeDOM **0.18.12**, ISC (copyright Andrea Giammarchi), нужен только для необязательных real-DOM dev tests Markdown. Версия/лицензия сверены с его package.json и LICENSE. Его код/node_modules не включены в поставку; инструкция установки в отдельный temporary directory есть в README.
- Графика INZHE сохранена из исходного проекта; существующий README темы указывает источник логотипа как публичный URL из предоставленного CSS. Отдельного файла лицензии на брендовые assets в исходном наборе нет.

Единая новая лицензия всему коду здесь не назначена: в исходном наборе нет общей LICENSE, у большинства авторских PHP/JS файлов нет явной лицензии. Существующие уведомления сохранены; это описание состава исходников, а не предоставление дополнительных прав.
