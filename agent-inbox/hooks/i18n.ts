export type Lang = 'en' | 'tr' | 'de' | 'fr' | 'es'

export const LANGS: readonly Lang[] = ['en', 'tr', 'de', 'fr', 'es']

type Strings = {
  title: string
  commandDescription: string
  paneOpened: string
  waiting: (n: number) => string
  none: string
  noneLong: string
  updated: (time: string) => string
  reading: string
  readError: (reason: string) => string
  kind: { permission: string; question: string; idle: string }
  fallback: { permission: string; question: string; planApproval: string; idle: string }
  open: string
  copy: string
  remove: string
  terminalSession: string
  switching: (title: string) => string
  cannotSwitch: string
  terminalNoSwitch: string
  copied: (command: string) => string
  copyFailed: (reason: string, command: string) => string
  ago: { s: string; m: string; h: string; d: string }
  usage: string
  langUsage: (codes: string) => string
  langSet: (code: string) => string
  langFailed: (reason: string) => string
  cleared: (n: number) => string
  paneClosed: string
  thisSession: string
}

const en: Strings = {
  title: 'Inbox',
  commandDescription: 'Open the inbox pane: every agent session waiting on you, by project',
  paneOpened: 'Inbox pane opened.',
  waiting: n => (n === 1 ? '1 session waiting' : `${n} sessions waiting`),
  none: 'Nothing waiting',
  noneLong: 'No agent is waiting on you right now.',
  updated: time => `updated ${time}`,
  reading: 'reading…',
  readError: reason => `Could not read the inbox file: ${reason}`,
  kind: { permission: 'PERMISSION', question: 'QUESTION', idle: 'WAITING' },
  fallback: {
    permission: 'Waiting for your permission',
    question: 'Asking you a question',
    planApproval: 'Waiting for plan approval',
    idle: 'Turn finished, waiting for input',
  },
  open: 'Open',
  copy: 'Copy',
  remove: 'Dismiss',
  terminalSession: 'terminal session',
  switching: title => `Switching to "${title}"…`,
  cannotSwitch: 'Could not switch; copying the --resume command instead.',
  terminalNoSwitch: 'This session runs outside the Code tab (terminal); cannot switch. The --resume command was copied.',
  copied: command => `Copied: ${command}`,
  copyFailed: (reason, command) => `Copy failed (${reason}). Command: ${command}`,
  ago: { s: 's', m: 'min', h: 'h', d: 'd' },
  usage: 'Usage: /inbox [lang <code> | clear | close | status]',
  langUsage: codes => `Usage: /inbox lang <code>. Codes: ${codes}`,
  langSet: code => `Inbox language set to "${code}".`,
  langFailed: reason => `Could not save the language: ${reason}`,
  cleared: n => (n === 1 ? 'Dismissed 1 entry.' : `Dismissed ${n} entries.`),
  paneClosed: 'Inbox pane closed.',
  thisSession: 'this session',
}

const tr: Strings = {
  title: 'Gelen Kutusu',
  commandDescription: 'Gelen Kutusu panelini açar: sizden bir şey bekleyen tüm agent oturumları, proje bazında',
  paneOpened: 'Gelen Kutusu paneli açıldı.',
  waiting: n => `${n} oturum bekliyor`,
  none: 'Bekleyen iş yok',
  noneLong: 'Şu an hiçbir agent sizden bir şey beklemiyor.',
  updated: time => `güncellendi ${time}`,
  reading: 'okunuyor…',
  readError: reason => `Gelen kutusu dosyası okunamadı: ${reason}`,
  kind: { permission: 'İZİN', question: 'SORU', idle: 'BEKLİYOR' },
  fallback: {
    permission: 'İzninizi bekliyor',
    question: 'Size bir soru soruyor',
    planApproval: 'Plan onayı bekliyor',
    idle: 'Tur bitti, girdi bekliyor',
  },
  open: 'Aç',
  copy: 'Kopyala',
  remove: 'Kaldır',
  terminalSession: 'terminal oturumu',
  switching: title => `"${title}" oturumuna geçiliyor…`,
  cannotSwitch: 'Oturuma geçilemedi; --resume komutu panoya kopyalanıyor.',
  terminalNoSwitch: 'Bu oturum Code sekmesi dışında (terminal); geçiş yapılamaz. --resume komutu panoya kopyalandı.',
  copied: command => `Kopyalandı: ${command}`,
  copyFailed: (reason, command) => `Kopyalanamadı (${reason}). Komut: ${command}`,
  ago: { s: 'sn', m: 'dk', h: 'sa', d: 'g' },
  usage: 'Kullanım: /inbox [lang <kod> | clear | close | status]',
  langUsage: codes => `Kullanım: /inbox lang <kod>. Kodlar: ${codes}`,
  langSet: code => `Gelen kutusu dili "${code}" olarak ayarlandı.`,
  langFailed: reason => `Dil kaydedilemedi: ${reason}`,
  cleared: n => `${n} kayıt kaldırıldı.`,
  paneClosed: 'Gelen Kutusu paneli kapatıldı.',
  thisSession: 'bu oturum',
}

const de: Strings = {
  title: 'Posteingang',
  commandDescription: 'Öffnet den Posteingang: alle Agent-Sitzungen, die auf dich warten, nach Projekt',
  paneOpened: 'Posteingang geöffnet.',
  waiting: n => (n === 1 ? '1 Sitzung wartet' : `${n} Sitzungen warten`),
  none: 'Nichts wartet',
  noneLong: 'Gerade wartet kein Agent auf dich.',
  updated: time => `aktualisiert ${time}`,
  reading: 'wird gelesen…',
  readError: reason => `Posteingangsdatei konnte nicht gelesen werden: ${reason}`,
  kind: { permission: 'FREIGABE', question: 'FRAGE', idle: 'WARTET' },
  fallback: {
    permission: 'Wartet auf deine Freigabe',
    question: 'Stellt dir eine Frage',
    planApproval: 'Wartet auf Planfreigabe',
    idle: 'Zug beendet, wartet auf Eingabe',
  },
  open: 'Öffnen',
  copy: 'Kopieren',
  remove: 'Entfernen',
  terminalSession: 'Terminal-Sitzung',
  switching: title => `Wechsle zu „${title}“…`,
  cannotSwitch: 'Wechsel nicht möglich; der --resume-Befehl wird kopiert.',
  terminalNoSwitch: 'Diese Sitzung läuft außerhalb des Code-Tabs (Terminal); kein Wechsel möglich. Der --resume-Befehl wurde kopiert.',
  copied: command => `Kopiert: ${command}`,
  copyFailed: (reason, command) => `Kopieren fehlgeschlagen (${reason}). Befehl: ${command}`,
  ago: { s: 's', m: 'Min', h: 'Std', d: 'T' },
  usage: 'Aufruf: /inbox [lang <code> | clear | close | status]',
  langUsage: codes => `Aufruf: /inbox lang <code>. Codes: ${codes}`,
  langSet: code => `Sprache des Posteingangs auf „${code}“ gesetzt.`,
  langFailed: reason => `Sprache konnte nicht gespeichert werden: ${reason}`,
  cleared: n => (n === 1 ? '1 Eintrag entfernt.' : `${n} Einträge entfernt.`),
  paneClosed: 'Posteingang geschlossen.',
  thisSession: 'diese Sitzung',
}

const fr: Strings = {
  title: 'Boîte de réception',
  commandDescription: 'Ouvre la boîte de réception : toutes les sessions d’agent qui vous attendent, par projet',
  paneOpened: 'Boîte de réception ouverte.',
  waiting: n => (n === 1 ? '1 session en attente' : `${n} sessions en attente`),
  none: 'Rien en attente',
  noneLong: 'Aucun agent n’attend rien de vous pour le moment.',
  updated: time => `mis à jour ${time}`,
  reading: 'lecture…',
  readError: reason => `Impossible de lire le fichier de la boîte : ${reason}`,
  kind: { permission: 'PERMISSION', question: 'QUESTION', idle: 'EN ATTENTE' },
  fallback: {
    permission: 'Attend votre permission',
    question: 'Vous pose une question',
    planApproval: 'Attend l’approbation du plan',
    idle: 'Tour terminé, attend une saisie',
  },
  open: 'Ouvrir',
  copy: 'Copier',
  remove: 'Retirer',
  terminalSession: 'session terminal',
  switching: title => `Passage à « ${title} »…`,
  cannotSwitch: 'Changement impossible ; la commande --resume est copiée.',
  terminalNoSwitch: 'Cette session tourne hors de l’onglet Code (terminal) ; changement impossible. La commande --resume a été copiée.',
  copied: command => `Copié : ${command}`,
  copyFailed: (reason, command) => `Copie impossible (${reason}). Commande : ${command}`,
  ago: { s: 's', m: 'min', h: 'h', d: 'j' },
  usage: 'Usage : /inbox [lang <code> | clear | close | status]',
  langUsage: codes => `Usage : /inbox lang <code>. Codes : ${codes}`,
  langSet: code => `Langue de la boîte réglée sur « ${code} ».`,
  langFailed: reason => `Impossible d’enregistrer la langue : ${reason}`,
  cleared: n => (n === 1 ? '1 entrée retirée.' : `${n} entrées retirées.`),
  paneClosed: 'Boîte de réception fermée.',
  thisSession: 'cette session',
}

const es: Strings = {
  title: 'Bandeja de entrada',
  commandDescription: 'Abre la bandeja de entrada: todas las sesiones de agente que te esperan, por proyecto',
  paneOpened: 'Bandeja de entrada abierta.',
  waiting: n => (n === 1 ? '1 sesión en espera' : `${n} sesiones en espera`),
  none: 'Nada en espera',
  noneLong: 'Ningún agente espera nada de ti ahora mismo.',
  updated: time => `actualizado ${time}`,
  reading: 'leyendo…',
  readError: reason => `No se pudo leer el archivo de la bandeja: ${reason}`,
  kind: { permission: 'PERMISO', question: 'PREGUNTA', idle: 'ESPERANDO' },
  fallback: {
    permission: 'Espera tu permiso',
    question: 'Te hace una pregunta',
    planApproval: 'Espera la aprobación del plan',
    idle: 'Turno terminado, espera una entrada',
  },
  open: 'Abrir',
  copy: 'Copiar',
  remove: 'Quitar',
  terminalSession: 'sesión de terminal',
  switching: title => `Cambiando a «${title}»…`,
  cannotSwitch: 'No se pudo cambiar; se copia el comando --resume.',
  terminalNoSwitch: 'Esta sesión corre fuera de la pestaña Code (terminal); no se puede cambiar. Se copió el comando --resume.',
  copied: command => `Copiado: ${command}`,
  copyFailed: (reason, command) => `No se pudo copiar (${reason}). Comando: ${command}`,
  ago: { s: 's', m: 'min', h: 'h', d: 'd' },
  usage: 'Uso: /inbox [lang <código> | clear | close | status]',
  langUsage: codes => `Uso: /inbox lang <código>. Códigos: ${codes}`,
  langSet: code => `Idioma de la bandeja fijado en «${code}».`,
  langFailed: reason => `No se pudo guardar el idioma: ${reason}`,
  cleared: n => (n === 1 ? '1 entrada quitada.' : `${n} entradas quitadas.`),
  paneClosed: 'Bandeja de entrada cerrada.',
  thisSession: 'esta sesión',
}

const TABLE: Record<Lang, Strings> = { en, tr, de, fr, es }

export const strings = (lang: Lang): Strings => TABLE[lang]

const isLang = (v: string): v is Lang => (LANGS as readonly string[]).includes(v)

/** Picks the UI language: the option when set, else the first locale tag that names a language we have, else English. */
export const pickLanguage = (option: unknown, ...locales: readonly (string | undefined)[]): Lang => {
  const chosen = String(option ?? 'auto').toLowerCase()
  if (isLang(chosen)) return chosen
  for (const locale of locales) {
    const code = (locale ?? '').trim().toLowerCase().split(/[_.\-@]/)[0] ?? ''
    if (code !== '' && code !== 'c' && code !== 'posix' && isLang(code)) return code
  }
  return 'en'
}
