# Публикация в каталоге дополнений AIMP

Что требует каталог — в правилах раздела *Plugins*:
[Публикация плагинов в каталоге](https://www.aimp.ru/forum/index.php?topic=32363.msg183948).
Здесь лежат исходники этих файлов; готовый комплект собирает
[GitHub Actions](../../.github/workflows/build.yml) (job `catalog`, артефакт
`aimp_remote_control-catalog`).

| Файл | Что это | Откуда берётся |
|---|---|---|
| `aimp_remote_control.zip` | тот же файл, что и `.aimppack`, под именем из правил | CI |
| `aimp_remote_control.txt` | файл описания для каталога | [aimp_remote_control.txt](aimp_remote_control.txt), `Version:` подставляется из `src/pluginInfo.h` |
| `aimp_remote_control_sm.png` | превью 200 × 150 | [aimp_remote_control_sm.html](aimp_remote_control_sm.html), см. ниже |
| `aimp_remote_control_full.png` | полный скриншот, открывается по клику | положить рядом с этим файлом — CI добавит его в комплект |
| `readme.txt` | описание и установка (RU/EN), лежит внутри архива | [readme.txt](readme.txt) |

`.zip` и `.aimppack` — один и тот же архив, CI просто копирует его под вторым
именем: правила требуют `%plugin_name%.zip`, а сам каталог раздаёт плагины
как `.aimppack` (ссылка «Скачать» у соседей ведёт на
`/files/desktop/plugins/remote/fluke_server.aimppack`). В тему на форуме
прикладывайте `.aimppack` — так плагин ставится из плеера, и это совпадает с
тем, что написано в разделе «Установка» самой темы.

Тема плагина на форуме — <https://aimp.ru/forum/index.php?topic=78138.0>;
она же в поле `Topic:` файла описания.

Текст самой темы: [forum-topic.txt](forum-topic.txt) (BBCode, по шаблону из
[правил раздела](https://www.aimp.ru/forum/index.php?topic=32363.0)).

## Файл описания

Поля — из шаблона в правилах, но `Description:` в нём одиночный, а карточка
каталога хранит **два независимых текста**, русский и английский, и
переключает их вместе с языком сайта (видно на любой карточке, например
[Spectralyzer](https://www.aimp.ru/?do=catalog&os=desktop&id=2)). Поэтому в
файле два блока: `Description:` (русский, ключ из шаблона) и
`Description (English):`. Многострочность, списки через `-` и ссылки каталог
отображает.

## Скриншоты

Правила раздела упоминают одну картинку, `%plugin_name%.jpg` 200 × 150, но в
каталоге у карточки их две: превью, а по клику лайтбокс открывает другой,
полноразмерный снимок. Имена — с суффиксами, как в
[правилах для обложек](https://www.aimp.ru/forum/index.php?topic=54949.msg337442);
это видно прямо в разметке карточек:

```html
<a href="/files/desktop/plugins/remote/fluke_server_full.png" rel="lightbox">
  <img class="card_preview" src="/files/desktop/plugins/remote/fluke_server_sm.png">
```

| | Имя | Размер |
|---|---|---|
| превью | `aimp_remote_control_sm.png` | ровно **200 × 150** |
| полный | `aimp_remote_control_full.png` | произвольный, реальный снимок окна |

В каталог идут только эти два. Рядом лежит `aimp_remote_control_full_ru.png` —
тот же снимок с русским интерфейсом, он для темы на форуме; CI забирает в
комплект строго `_sm` и `_full`, без языковых вариантов.

Отдельного места для второй картинки нет — обе кладутся в тот же комплект,
разложит их модератор. PNG каталог принимает наравне с JPG (у соседних
плагинов лежат именно PNG); если JPG, то качество 85–90 % без
субдискретизации цвета. Плагину без большого снимка оставляют одну картинку
без суффикса — `%plugin_name%.png`.

Превью здесь — не кроп скриншота, а логотип из
[wwwroot/favicon.svg](../../wwwroot/favicon.svg) на прозрачном фоне, 130 px по
центру. Пересобрать из
[aimp_remote_control_sm.html](aimp_remote_control_sm.html) (Chromium или Edge), из этой папки:

```bash
msedge --headless --disable-gpu --force-device-scale-factor=1 \
       --default-background-color=00000000 --window-size=200,150 \
       --screenshot=aimp_remote_control_sm.png aimp_remote_control_sm.html
```

SVG страница подтягивает по ссылке, так что превью не разъедется с иконкой
плагина.

В теме на форуме нужен тот же полноразмерный снимок, но залитый на
картинкохостинг (imgbb / hostingkartinok / imgur) — правила просят не
прикреплять картинки вложением.

## Порядок

1. Собрать релиз (тег `v*`) — CI выложит `.aimppack` в Releases и соберёт
   артефакт `aimp_remote_control-catalog`.
2. Обновить первое сообщение темы по [forum-topic.txt](forum-topic.txt),
   заменив вложенный `aimp_remote_control.aimppack` на новую версию (лимит
   вложения 4 МБ; если не влезет — файлообменник или ссылка на релиз).
3. Выложить комплект (`zip` + `txt` + картинки) и сообщить в теме о готовности
   плагина к публикации в каталоге — так описан порядок в соседних правилах
   ([отбор обложек](https://www.aimp.ru/forum/index.php?topic=54949.msg337442)).
