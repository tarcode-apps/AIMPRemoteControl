AIMP Remote Control {VERSION}
Удалённое управление AIMP по локальной сети
Remote control of AIMP over the local network

https://github.com/tarcode-apps/AIMPRemoteControl
(c) Artem Tarasov. MIT License. См. LICENSE.txt / see LICENSE.txt

Плагин не связан с авторами AIMP и авторами приложения.
Not affiliated with the AIMP or the app authors.


================================================================================
РУССКИЙ
================================================================================

ОПИСАНИЕ

  Удалённое управление AIMP по локальной сети: из браузера на мобильном,
  планшете или другом компьютере или из приложения "AIMP Remote Control"
  для Android. Поддерживаются сборки плеера для Windows и для Linux.

  Требуется AIMP 5 или более новый.

  Возможности: плейлисты с группами, обложками и рейтингами, поиск по
  плейлисту или по всем плейлистам, сортировка и перестановка треков,
  управление воспроизведением, синхронизированные тексты песен, сведения
  о треке, запись радио, очередь, таймер сна, звуковые эффекты и
  20-полосный эквалайзер с пресетами, избранное, добавление файлов с
  компьютера и интернет-потоков, загрузка файлов и целых папок,
  скачивание треков.

  Приложение "AIMP Remote Control" работает с плагином без каких-либо
  изменений и настроек. Оно больше не поддерживается и удалено из
  Google Play; плагин рассчитан на последнюю выпущенную версию - 2.0.31.

УСТАНОВКА

  Откройте aimp_remote_control.aimppack плеером: двойной клик или
  перетащите файл на окно AIMP. Если по двойному клику файл не
  открывается, откройте Настройки -> Плагины и нажмите "установить".

  После установки включите плагин там же, в Настройки -> Плагины.

НАСТРОЙКА

  Настройки -> Плагины -> Удалённое управление:

  - "Подключение" - список адресов, на которых работает сервер. Откройте
    один из них в браузере (http://<адрес>:3333/) или введите в
    приложении, которое умеет и само найти плеер в сети. Снимите галочку
    с интерфейса, чтобы не слушать на нём.
  - "Разрешения клиента" - что браузеру и приложению позволено помимо
    управления воспроизведением. Всё выключено по умолчанию, включая обзор
    файлов на компьютере, кроме скачивания треков.
  - "Требовать авторизацию" - имя пользователя и пароль для всех
    клиентов; браузер спросит их один раз. Рекомендуется в любой сети,
    которой вы не доверяете полностью: без авторизации управлять плеером
    может любой, кто находится в этой сети.

  Порты: TCP 3333 (управление из браузера и из приложения), UDP 3332
  (поиск плеера приложением). Разрешите AIMP принимать подключения по ним
  в брандмауэре.

УДАЛЕНИЕ

  Закройте AIMP и удалите папку aimp_remote_control из папки Plugins.


================================================================================
ENGLISH
================================================================================

DESCRIPTION

  Remote control of AIMP over the local network: from a browser on a
  mobile, a tablet or another computer, or from the "AIMP Remote Control"
  Android app. Both the Windows and the Linux builds of the player are
  supported.

  AIMP 5 or newer is required.

  Features: playlists with groups, covers and ratings, search in a playlist
  or across all of them, sorting and reordering tracks, playback control,
  synced lyrics, track information, radio capture, queue, sleep timer,
  sound effects and the 20-band equalizer with presets, favorites, adding
  files of the computer and internet streams, uploading files and whole
  folders, downloading tracks.

  The "AIMP Remote Control" app works with the plugin as is, with nothing
  to change or configure. It is no longer maintained and has been removed
  from Google Play; the plugin targets its last released version - 2.0.31.

INSTALLATION

  Open aimp_remote_control.aimppack with AIMP: double-click it or drop it
  onto the player window. If double-clicking does nothing, open
  Options -> Plugins and click "install".

  Then enable the plugin there, in Options -> Plugins.

SETUP

  Options -> Plugins -> Remote Control:

  - "Connection" lists the addresses the server listens on. Open one of
    them in a browser (http://<address>:3333/) or enter it in the app,
    which can also discover the player on the local network. Untick an
    interface to stop listening on it.
  - "Client permissions" - what browsers and the app may do beyond
    playback. Everything here is off by default, including browsing the
    computer's files, except downloading tracks.
  - "Require authentication" - username and password every client must
    use; a browser asks for them once. Recommended on any network you do
    not fully trust: without it, anyone on the network can control the
    player.

  Ports: TCP 3333 (control, from a browser and from the app), UDP 3332
  (discovery for the app). Make sure the firewall lets AIMP accept
  connections on them.

UNINSTALL

  Close AIMP and delete the aimp_remote_control folder from Plugins.
