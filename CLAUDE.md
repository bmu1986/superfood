# SuperFood: заметки для Claude

Max пишет по-русски, отвечать по-русски, просто.

## Устройство
- PWA без сборки: `index.html`, `styles.css`, `js/*.js`, `sw.js`. База — sql.js (SQLite) в IndexedDB (`js/store.js`), у каждой строки `updated_at` и `deleted`, слияние построчно «новее побеждает».
- Синхронизация (`js/sync.js`) взята из Органайзера (bmu1986/superplan-mobile): Dropbox, тот же App key, файл `superfood.db.gz` и фото в `superfood-files/<sha256>`.
- Логика меню, калорий, полезности и списка покупок — `js/food.js` (тест: `node tools/test-food.js`). Интерфейс — `js/app.js`.
- Отделы магазина — таблица `depts` (справочник, Max правит сам). Продукт помнит отдел; при смене отдела строки покупок продукт тоже переезжает.
- Фото блюд: поиск в ru.wikipedia, Викискладе и Openverse (`searchPhotos`), обрезка 4:3 в 1400×1050 (`cropPhoto`).
- Состав блюда правится прямо в меню и в рецепте (`compEditor`); изменения пишутся в сам рецепт.
- Анимации в стиле Органайзера (`--ease`, `--spring`, `sp-in`, класс `enter` со `--i`), выключаются `html.no-anim` (Ещё → Оформление).

## Справочник («дообогати справочник»)
- Продукты: `data/products.tsv` (источник правды). Рецепты: `tools/recipes_src.py` → `data/recipes.json` (`python3 tools/recipes_src.py`).
- У изменённых строк ставить `updated` = текущее время в мс, иначе у Max не обновится. Отделы по умолчанию — `Catalog.DEPTS` в `js/catalog.js`.
- `tools/gen_products_once.py` больше не запускать.

## Выпуск
- Поднять версию в `js/app.js` (VERSION), `sw.js` (CACHE), `desktop/package.json`.
- `cd desktop && npm install && npm run build` → `desktop/dist` (Mac arm64 и Windows portable).
- Установщики кладутся в ~/Desktop/SuperFood у Max. Файлы больше 25 МБ передавать кусками по 20 МБ, склеивать `cat`, сверять md5.
- После каждого выпуска сразу переустановить и перезапустить SuperFood на MacBook Max через Remote Control: `bash ~/Desktop/SuperFood/"Установить SuperFood.command"` (Max ничего не нажимает).
- Телефон: GitHub Pages из main (Max включает сам в Settings → Pages).

## Безопасность (правило Max, всегда)
Ничего, что может сработать на антивирусе рабочего ПК с Windows: никаких закодированных/скрытых команд PowerShell, `-ExecutionPolicy Bypass`, Add-Type/user32, нажатий клавиш и движений мыши за пользователя, фоновых циклов. Пароли и токены (Dropbox) вводит только пользователь. Данные пользователя ценные: перед рискованными изменениями базы или синхронизации делать копию.
