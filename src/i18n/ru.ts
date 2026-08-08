/**
 * Russian string dictionary. This is the reference locale: every other locale
 * must export an object of exactly this shape (see `Dict` in ./index.ts), so
 * adding English later means adding one file, not touching any component.
 *
 * Interpolation uses {name} placeholders. Plurals are NOT baked into strings —
 * use `plural()` from ./index.ts, because Russian needs three forms.
 *
 * Conventions for the wording itself, so additions stay consistent:
 *   — «вы» со строчной, никаких «Вы»;
 *   — кнопка — это реплика пользователя: «Сохранить», «Сбросить», а не «Сохраняю»;
 *   — лейбл называет данные («Метка»), а не действие ввода («Введите метку»);
 *   — тумблер называет настройку и читается одинаково в обоих положениях;
 *   — ошибка говорит, что случилось и что сделать, без «Ой» и «К сожалению»;
 *   — точка не ставится в конце кнопок, лейблов, коротких заголовков и тостов;
 *     в подсказках под полями — обычная проза с точками;
 *   — «Внимание:» не используем: заголовок должен быть конкретным сам по себе.
 */
export const ru = {
  'app.title': 'Чайный таймер',

  'common.save': 'Сохранить',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.back': 'Назад',
  'common.close': 'Закрыть',
  'common.ml': 'мл',
  'common.g': 'г',
  'common.none': '—',
  'common.loading': 'Загрузка…',

  'nav.settings': 'Настройки',
  'nav.newMode': 'Новый чай',

  'modes.title': 'Мои чаи',
  'modes.empty.title': 'Пока ни одного чая',
  // Кнопка ниже уже говорит «Добавить чай», поэтому здесь не повторяем призыв,
  // а объясняем, из чего состоит запись.
  'modes.empty.body':
    'У каждого чая своя кривая времени: объём посуды, вес листа и время каждого пролива.',
  'modes.empty.cta': 'Добавить чай',
  'modes.card.brew': 'Заваривать',
  'modes.card.edit': 'Изменить',
  'modes.card.duplicate': 'Дублировать',
  'modes.card.menu': 'Действия',
  // Единственная строка отсюда, которая становится данными: она попадает в title
  // записи и в имя .md-файла, а не только на экран.
  'modes.duplicate.title': '{title} (копия)',
  'modes.delete.title': 'Удалить «{title}»?',
  'modes.delete.body':
    'Запись удалится с устройства, а при следующей синхронизации — файл в репозитории. Отменить нельзя.',
  'modes.deleted': '«{title}» удалён',

  'editor.title.new': 'Новый чай',
  'editor.title.edit': 'Изменить чай',
  'editor.title.duplicate': 'Копия чая',
  'editor.field.title': 'Название',
  'editor.field.title.placeholder': 'Шу Пуэр 2018',
  'editor.field.title.required': 'Укажите название',
  'editor.field.notes': 'Заметки',
  'editor.field.notes.placeholder': 'Аромат, происхождение, где куплен…',
  'editor.field.image': 'Картинка',
  'editor.image.pick': 'Выбрать файл',
  'editor.image.remove': 'Убрать',
  'editor.image.hint': 'Уменьшится до 512 px, формат — WebP.',
  'editor.image.failed': 'Не получилось открыть картинку',
  'editor.presets': 'Объёмы посуды',
  'editor.preset.add': 'Добавить объём',
  'editor.preset.remove': 'Удалить объём',
  'editor.preset.removeLast': 'Оставьте хотя бы один объём',
  'editor.preset.volume': 'Посуда, мл',
  'editor.preset.grams': 'Лист, г',
  'editor.preset.temp': 'Вода, °C',
  'editor.preset.copyFrom': 'Скопировать проливы',
  'editor.preset.copyFrom.title': 'Откуда скопировать проливы',
  'editor.preset.copyFrom.body': 'Проливы этого объёма заменятся.',
  'editor.preset.copyFrom.empty': 'Других объёмов пока нет.',
  'editor.preset.copied': 'Проливы скопированы',
  'editor.steps': 'Проливы',
  'editor.steps.empty': 'Проливов пока нет',
  'editor.step.add': 'Добавить пролив',
  'editor.step.remove': 'Удалить пролив',
  'editor.step.up': 'Переместить выше',
  'editor.step.down': 'Переместить ниже',
  'editor.step.seconds': 'Время',
  'editor.step.label': 'Метка',
  // Лейбл метки не выводится визуально — плейсхолдер работает за него, поэтому
  // необязательность написана здесь, а не спрятана в подсказку.
  'editor.step.label.placeholder': 'Метка, если нужна',
  'editor.step.rinse': 'Промывка',
  'editor.step.rinse.hint':
    'Время набирается слева направо: 0 4 5 → 0:45, 2 0 0 → 2:00. Промывка не нумеруется и не идёт по таймеру: она остаётся в списке напоминанием, а первый пролив после неё — «Пролив 1».',
  'editor.saved': 'Сохранено',
  'editor.invalid': 'Проверьте выделенные поля',
  'editor.needStep': 'Добавьте хотя бы один пролив',

  'brew.pickPreset': 'В чём заваривать?',
  'brew.step': 'Пролив {n}',
  'brew.stepDone': 'Пройден',
  'brew.rinse': 'Промывка',
  'brew.of': 'из {total}',
  'brew.start': 'Старт',
  'brew.pause': 'Пауза',
  'brew.resume': 'Продолжить',
  'brew.reset': 'Сбросить',
  'brew.next': 'Далее',
  'brew.prev': 'Назад',
  'brew.ready': 'Готово — сливайте',
  'brew.silence': 'Отключить сигнал',
  'brew.finished': 'Все проливы пройдены',
  'brew.restore.title': 'Продолжить заваривание?',
  'brew.restore.body': 'Заваривание «{title}» не закончено.',
  'brew.restore.yes': 'Продолжить',
  'brew.restore.no': 'Начать заново',
  'brew.iosHint': 'Не блокируйте экран: на iOS приложение засыпает и сигнал не прозвучит.',
  // Заголовок окна, пока сигнал звучит и окно не в фокусе. Знак впереди — чтобы
  // строка читалась на панели задач, где видно только начало.
  'attention.flash': '⏰ Готово — сливайте',

  'settings.title': 'Настройки',
  'settings.appearance': 'Оформление',
  'settings.theme': 'Тема',
  'settings.theme.system': 'Системная',
  'settings.theme.light': 'Светлая',
  'settings.theme.dark': 'Тёмная',
  'settings.signals': 'Сигнал',
  'settings.sound': 'Звук',
  'settings.sound.hint': 'Повторяется, пока не отключите на экране заваривания.',
  'settings.volume': 'Громкость сигнала',
  'settings.volume.low': 'Тихо',
  'settings.volume.medium': 'Средне',
  'settings.volume.high': 'Громко',
  'settings.vibration': 'Вибрация',
  'settings.vibration.unsupported': 'Не поддерживается на этом устройстве',
  'settings.attention': 'Значок приложения и заголовок окна',
  'settings.attention.hint':
    'Пока сигнал звучит: точка на значке и мигающий заголовок. Видно, когда окно свёрнуто.',
  // Тумблер называет состояние, а не приказ: читается одинаково и включённым,
  // и выключенным.
  'settings.wakeLock': 'Экран не гаснет',
  'settings.wakeLock.hint': 'Только пока идёт пролив.',
  'settings.wakeLock.unsupported': 'Не поддерживается на этом устройстве',
  'settings.test': 'Проверить сигнал',

  'settings.github': 'Синхронизация с GitHub',
  'settings.github.hint':
    'Каждый чай — отдельный .md-файл в вашем приватном репозитории. Файлы читаются в Obsidian, а без синхронизации приложение работает так же.',
  'settings.github.owner': 'Владелец на GitHub',
  'settings.github.repo': 'Репозиторий',
  'settings.github.branch': 'Ветка',
  'settings.github.branch.hint':
    'Ветка репозитория с записями. К репозиторию с кодом приложения отношения не имеет.',
  'settings.github.modesDir': 'Папка для записей',
  'settings.github.assetsDir': 'Папка для картинок',
  'settings.github.token': 'Токен доступа',
  'settings.github.token.warning':
    'Нужен fine-grained PAT с доступом Contents: Read and write к одному репозиторию. Токен хранится только в этом браузере — не вводите его на чужом устройстве.',
  // Отдельная надпись: рядом уже есть «Сохранить» для всего блока, и две
  // одинаковые кнопки в одном экране не различить.
  'settings.github.token.save': 'Сохранить токен',
  'settings.github.token.set': 'Токен сохранён',
  'settings.github.token.clear': 'Удалить токен',
  'settings.github.token.cleared': 'Токен удалён',
  'settings.github.check': 'Проверить доступ',
  'settings.github.checking': 'Проверка…',
  'settings.github.ok': 'Доступ есть. Ветка {branch}, запись {write}.',
  'settings.github.branchMismatch':
    'В репозитории основная ветка — {default}, а указана {configured}. Записи уйдут в {configured}, и в Obsidian на ветке {default} их не будет. Обычно ставят {default}.',
  'settings.github.ok.write': 'разрешена',
  'settings.github.ok.noWrite': 'запрещена',
  'settings.github.ok.privateYes': 'Репозиторий приватный.',
  'settings.github.ok.privateNo': 'Репозиторий публичный — записи о чаях увидят все.',
  'settings.github.dirMissing': 'Папки {dir} пока нет — появится при первом сохранении.',
  'settings.saved': 'Настройки сохранены',

  'sync.button': 'Синхронизировать',
  'sync.running': 'Синхронизация…',
  'sync.notConfigured': 'Укажите репозиторий и токен в настройках',
  'sync.pending': 'Не отправлено: {count}',
  'sync.pushFailed': 'Не отправилось в репозиторий — синхронизируйте вручную',
  'sync.done': 'Синхронизировано: {count}',
  'sync.doneWithErrors': 'Синхронизировано: {count}, ошибок: {errors}',
  'sync.localOnly': 'Только на устройстве: {count}',
  'sync.never': 'Ещё не синхронизировано',
  'sync.lastAt': 'Синхронизация: {when}',

  'conflict.title': 'В репозитории версия новее',
  'conflict.body':
    'Файл «{title}» изменился после последней отправки — скорее всего, с другого устройства.',
  'conflict.remoteLabel': 'В репозитории',
  'conflict.localLabel': 'На этом устройстве',
  // Кнопки различаются по смыслу и обе называют, где окажется результат.
  'conflict.overwrite': 'Перезаписать в репозитории',
  'conflict.takeRemote': 'Взять из репозитория',
  'conflict.later': 'Решить позже',

  'error.offline': 'Нет подключения к интернету',
  'error.auth': 'Токен недействителен или истёк. Проверьте его в настройках',
  'error.forbidden':
    'Нет доступа. Проверьте у токена: право Contents: Read and write, этот репозиторий в списке доступных, авторизацию SSO, если репозиторий в организации',
  'error.notFound': 'Репозиторий не найден или токен не даёт к нему доступа',
  'error.conflict': 'Файл изменился в репозитории во время записи. Попробуйте ещё раз',
  'error.rateLimit': 'Лимит запросов GitHub исчерпан. Повторите после {when}',
  'error.network': 'Не получилось связаться с GitHub. Попробуйте позже',
  'error.badFile': 'Файл {name}: не получилось разобрать frontmatter',
  'error.unknown': 'Не получилось: {message}',
  'error.notConfigured': 'Репозиторий или токен не заданы',

  'pwa.updated': 'Приложение обновлено',
  'pwa.offlineReady': 'Готово к работе офлайн',
} as const

// NB: the markdown table headings are deliberately NOT in this dictionary.
// They are part of the on-disk file format (see src/md/tables.ts) and must stay
// fixed regardless of UI locale — otherwise switching language would rewrite
// every file in the repository.
