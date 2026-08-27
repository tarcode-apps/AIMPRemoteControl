AIMP Remote Control {VERSION}
Альтернативный сервер удалённого управления AIMP по локальной сети
An alternative remote control server for AIMP over the local network

https://github.com/tarcode-apps/AIMPRemoteControl
(c) Artem Tarasov. MIT License. См. LICENSE.txt / see LICENSE.txt

Плагин не связан с авторами AIMP и авторами приложения.
Not affiliated with the AIMP or the app authors.


================================================================================
РУССКИЙ
================================================================================

ОПИСАНИЕ

  Альтернативный сервер удалённого управления AIMP по локальной сети.
  Управлять плеером можно с телефона из приложения "AIMP Remote Control"
  для Android - оно работает с плагином без каких-либо изменений и
  настроек. Поддерживаются сборки плеера для Windows и для Linux.

  Требуется AIMP 5 или более новый.

  Возможности: плейлисты и очередь воспроизведения, управление
  воспроизведением, громкость, перемотка, повтор и перемешивание,
  18-полосный эквалайзер, обложки, тексты песен, рейтинги, поиск, обзор
  файлов на компьютере, добавление файлов и интернет-потоков, загрузка и
  скачивание треков, таймер сна, обновление состояния плеера в реальном
  времени.

  Приложение "AIMP Remote Control" больше не поддерживается и удалено из
  Google Play, официальной ссылки на APK не осталось. Плагин рассчитан на
  последнюю выпущенную версию приложения - 2.0.31.

УСТАНОВКА

  Откройте aimp_remote_control.aimppack плеером: двойной клик или
  перетащите файл на окно AIMP. Если по двойному клику файл не
  открывается, откройте Настройки -> Плагины и нажмите "установить".

  После установки включите плагин там же, в Настройки -> Плагины.

НАСТРОЙКА

  Настройки -> Плагины -> Удалённое управление:

  - "Подключение" - список адресов, на которых работает сервер. Введите один
    из них в приложении на телефоне или дайте приложению найти плеер в сети
    самостоятельно. Снимите галочку с интерфейса, чтобы не слушать на нём.
  - "Разрешения клиента" - что приложению позволено помимо управления
    воспроизведением. Всё выключено по умолчанию, включая обзор файлов на
    компьютере.
  - "Требовать авторизацию" - имя пользователя и пароль для приложения.
    Рекомендуется в любой сети, которой вы не доверяете полностью: без
    авторизации управлять плеером может любой, кто находится в этой сети.

  Порты: TCP 3333 (управление), UDP 3332 (поиск плеера в сети). Разрешите
  AIMP принимать подключения по ним в брандмауэре.

УДАЛЕНИЕ

  Закройте AIMP и удалите папку aimp_remote_control из папки Plugins.


================================================================================
ENGLISH
================================================================================

DESCRIPTION

  An alternative remote control server for AIMP over the local network.
  The player can be controlled from a phone with the "AIMP Remote Control"
  Android app - it works with the plugin as is, with nothing to change or
  configure on the phone. Both the Windows and the Linux builds of the
  player are supported.

  AIMP 5 or newer is required.

  Features: playlists and playback queue, playback control, volume, seeking,
  repeat and shuffle, 18-band equalizer, covers, lyrics, ratings, search,
  browsing the computer's files, adding files and internet streams,
  uploading and downloading tracks, sleep timer, real-time push of player
  state.

  The "AIMP Remote Control" app is no longer maintained and has been removed
  from Google Play; there is no official APK download anymore. This plugin
  targets the app's last released version - 2.0.31.

INSTALLATION

  Open aimp_remote_control.aimppack with AIMP: double-click it or drop it
  onto the player window. If double-clicking does nothing, open
  Options -> Plugins and click "install".

  Then enable the plugin there, in Options -> Plugins.

SETUP

  Options -> Plugins -> Remote Control:

  - "Connection" lists the addresses the server listens on. Enter one of them
    in the app on your phone, or let the app discover the player on the local
    network. Untick an interface to stop listening on it.
  - "Client permissions" - what the app is allowed to do beyond playback.
    Everything here is off by default, including browsing the computer's
    files.
  - "Require authentication" - username and password the app must use.
    Recommended on any network you do not fully trust: without it, anyone on
    the network can control the player.

  Ports: TCP 3333 (control), UDP 3332 (discovery). Make sure the firewall
  lets AIMP accept connections on them.

UNINSTALL

  Close AIMP and delete the aimp_remote_control folder from Plugins.
