// ==UserScript==
// @name         GitHub-Freshness-rebuild
// @namespace    https://github.com/
// @version      2.0.1
// @description  Highlight fresh GitHub repos and file trees with stable timestamps and GitHub API data.
// @author       Paxton https://github.com/Paxton-PKJ/GitHub-Freshness-rebuild
// @license      MIT
// @homepageURL  https://github.com/Paxton-PKJ/GitHub-Freshness-rebuild
// @supportURL   https://github.com/Paxton-PKJ/GitHub-Freshness-rebuild/issues
// @updateURL    https://raw.githubusercontent.com/Paxton-PKJ/GitHub-Freshness-rebuild/main/GitHub-Freshness-rebuild.user.js
// @downloadURL  https://raw.githubusercontent.com/Paxton-PKJ/GitHub-Freshness-rebuild/main/GitHub-Freshness-rebuild.user.js
// @match        https://github.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @run-at       document-end
// ==/UserScript==

;(function () {
  'use strict'

  const STORAGE_KEY = 'github-freshness-config-v2'
  const API_FALLBACK_PROMPT_KEY = 'github-freshness-api-fallback-v1'
  const LEGACY_THEME_KEY = 'config_JSON'
  const LEGACY_CURRENT_THEME_KEY = 'CURRENT_THEME'
  const LEGACY_TOKEN_KEY = 'AWESOME_TOKEN'
  const SEARCH_PATHNAME = '/search'
  const REPO_PATH_PATTERN = /^\/([^/]+)\/([^/]+)\/?$/
  const AWESOME_PAGE_LINK_THRESHOLD = 8
  const repoCache = new Map()
  let rateLimitAlertShown = false
  let awesomeObserver = null
  let tokenPromptHandledThisPage = false

  const defaultTheme = {
    BGC: {
      highlightColor: 'rgba(15, 172, 83, 0.18)',
      warningColor: 'rgba(210, 153, 34, 0.18)',
      greyColor: 'rgba(127, 127, 127, 0.10)',
      isEnabled: true,
    },
    TIME_BOUNDARY: {
      number: 30,
      select: 'day',
      warningMultiplier: 2,
    },
    FONT: {
      highlightColor: 'rgb(9, 105, 218)',
      warningColor: 'rgb(154, 103, 0)',
      greyColor: 'rgb(101, 109, 118)',
      isEnabled: true,
    },
    DIR: {
      highlightColor: 'rgb(31, 136, 61)',
      warningColor: 'rgb(154, 103, 0)',
      greyColor: 'rgb(101, 109, 118)',
      isEnabled: true,
    },
    SORT: {
      select: 'desc',
      isEnabled: true,
    },
    AWESOME: {
      isEnabled: false,
    },
    TIME_FORMAT: {
      isEnabled: true,
    },
  }

  const defaultConfig = {
    currentTheme: 'auto',
    token: '',
    themes: {
      light: clone(defaultTheme),
      dark: clone(defaultTheme),
    },
  }

  let config = loadConfig()

  GM_addStyle(`
    .gfh-hidden-time {
      display: none !important;
    }

    .gfh-formatted-time,
    .gfh-api-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 8px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1.6;
      white-space: nowrap;
      border: 1px solid rgba(31, 35, 40, 0.15);
      background: rgba(175, 184, 193, 0.12);
      color: inherit;
      vertical-align: middle;
    }

    .gfh-api-badge[data-state="recent"] {
      border-color: rgba(31, 136, 61, 0.35);
      background: rgba(31, 136, 61, 0.12);
    }

    .gfh-api-badge[data-state="warning"] {
      border-color: rgba(210, 153, 34, 0.35);
      background: rgba(210, 153, 34, 0.12);
    }

    .gfh-api-badge[data-state="stale"] {
      border-color: rgba(101, 109, 118, 0.25);
      background: rgba(127, 127, 127, 0.10);
    }
  `)

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function mergeObjects(base, patch) {
    const output = clone(base)
    if (!patch || typeof patch !== 'object') {
      return output
    }
    for (const [key, value] of Object.entries(patch)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        output[key] &&
        typeof output[key] === 'object' &&
        !Array.isArray(output[key])
      ) {
        output[key] = mergeObjects(output[key], value)
      } else {
        output[key] = value
      }
    }
    return output
  }

  function normalizeTheme(theme) {
    return mergeObjects(defaultTheme, theme)
  }

  function loadConfig() {
    const saved = GM_getValue(STORAGE_KEY, null)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return normalizeConfig(parsed)
      } catch (error) {
        console.warn('GitHub-Freshness-rebuild: failed to parse v2 config.', error)
      }
    }

    const legacyThemesRaw = GM_getValue(LEGACY_THEME_KEY, null)
    if (legacyThemesRaw) {
      try {
        const legacyThemes = JSON.parse(legacyThemesRaw)
        const migrated = normalizeConfig({
          currentTheme: GM_getValue(LEGACY_CURRENT_THEME_KEY, 'light'),
          token: GM_getValue(LEGACY_TOKEN_KEY, ''),
          themes: {
            light: legacyThemes.light || legacyThemes.dark || legacyThemes,
            dark: legacyThemes.dark || legacyThemes.light || legacyThemes,
          },
        })
        GM_setValue(STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      } catch (error) {
        console.warn('GitHub-Freshness-rebuild: failed to migrate legacy config.', error)
      }
    }

    GM_setValue(STORAGE_KEY, JSON.stringify(defaultConfig))
    return clone(defaultConfig)
  }

  function normalizeConfig(input) {
    const normalized = mergeObjects(defaultConfig, input)
    normalized.currentTheme = ['auto', 'light', 'dark'].includes(normalized.currentTheme)
      ? normalized.currentTheme
      : 'auto'
    normalized.token = typeof normalized.token === 'string' ? normalized.token.trim() : ''
    normalized.themes = {
      light: normalizeTheme(normalized.themes?.light),
      dark: normalizeTheme(normalized.themes?.dark),
    }
    return normalized
  }

  function saveConfig() {
    GM_setValue(STORAGE_KEY, JSON.stringify(config))
  }

  function getEffectiveThemeName() {
    if (config.currentTheme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return config.currentTheme
  }

  function getActiveThemeConfig() {
    return config.themes[getEffectiveThemeName()]
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) {
      return String(dateValue)
    }
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function normalizeGmtOffset(hours, minutes = '00') {
    const numericHours = Number(hours)
    if (Number.isNaN(numericHours)) {
      return null
    }

    const sign = numericHours >= 0 ? '+' : '-'
    const paddedHours = String(Math.abs(numericHours)).padStart(2, '0')
    const paddedMinutes = String(minutes || '00').padStart(2, '0')
    return `${sign}${paddedHours}:${paddedMinutes}`
  }

  function normalizeTimezoneInTitle(title) {
    if (!title) {
      return title
    }

    return title
      .replace(/\s+/g, ' ')
      .replace(/\b(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/gi, (_, sign, hours, minutes) => {
        const normalized = `${sign}${String(hours).padStart(2, '0')}:${String(
          minutes || '00'
        ).padStart(2, '0')}`
        return normalized
      })
      .trim()
  }

  function parseFrontendDatetimeTitle(title) {
    if (!title) {
      return null
    }

    const normalizedTitle = normalizeTimezoneInTitle(title)

    const nativeParsed = new Date(normalizedTitle)
    if (!Number.isNaN(nativeParsed.getTime())) {
      return nativeParsed.toISOString()
    }

    const zhMatch = title.match(
      /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+GMT([+-]?\d{1,2})(?::?(\d{2}))?\s+(\d{1,2}):(\d{2})$/
    )
    if (zhMatch) {
      const [, year, month, day, offsetHours, offsetMinutes, hour, minute] = zhMatch
      const offset = normalizeGmtOffset(offsetHours, offsetMinutes)
      if (!offset) {
        return null
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`
    }

    return null
  }

  function getBoundaryDays(boundary) {
    const count = Number(boundary.number) || 0
    switch (boundary.select) {
      case 'day':
        return count
      case 'week':
        return count * 7
      case 'month':
        return count * 30
      case 'year':
        return count * 365
      default:
        return count
    }
  }

  function getFreshnessState(datetime, boundary) {
    const input = new Date(datetime)
    if (Number.isNaN(input.getTime())) {
      return 'stale'
    }

    const primaryDays = getBoundaryDays(boundary)
    const warningMultiplier = Math.max(2, Number(boundary.warningMultiplier) || 2)
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - primaryDays)

    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() - primaryDays * warningMultiplier)

    if (input >= recentDate) {
      return 'recent'
    }
    if (input >= warningDate) {
      return 'warning'
    }
    return 'stale'
  }

  function resolveStateColor(configBlock, state) {
    if (state === 'recent') {
      return configBlock.highlightColor
    }
    if (state === 'warning') {
      return configBlock.warningColor || configBlock.highlightColor
    }
    return configBlock.greyColor
  }

  function extractRepoInfo(href, exactOnly = false) {
    if (!href) {
      return null
    }

    let url
    try {
      url = new URL(href, window.location.origin)
    } catch {
      return null
    }

    if (url.origin !== 'https://github.com') {
      return null
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      return null
    }

    if (exactOnly && segments.length !== 2) {
      return null
    }

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    if (!owner || !repo) {
      return null
    }

    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      apiUrl: `https://api.github.com/repos/${owner}/${repo}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
    }
  }

  function gmRequest(url) {
    return new Promise((resolve, reject) => {
      const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
      if (config.token) {
        headers.Authorization = `Bearer ${config.token}`
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            try {
              resolve(JSON.parse(response.responseText))
            } catch (error) {
              reject(error)
            }
            return
          }

          if (response.status === 403 && !rateLimitAlertShown) {
            rateLimitAlertShown = true
            window.alert(
              'GitHub-Freshness-rebuild: GitHub API 请求达到限额。可以在油猴菜单里配置 Token 提升额度。'
            )
          }

          reject(new Error(`GitHub API request failed with status ${response.status}`))
        },
        onerror: () => {
          reject(new Error('GitHub API request failed.'))
        },
      })
    })
  }

  async function fetchRepoData(repoInfo) {
    const cacheKey = repoInfo.fullName
    if (!repoCache.has(cacheKey)) {
      repoCache.set(cacheKey, gmRequest(repoInfo.apiUrl))
    }
    return repoCache.get(cacheKey)
  }

  function setBackgroundColor(element, backgroundConfig, state) {
    if (!element) {
      return
    }
    if (!backgroundConfig.isEnabled) {
      element.style.removeProperty('background-color')
      return
    }
    const color = resolveStateColor(backgroundConfig, state)
    element.style.setProperty('background-color', color, 'important')
  }

  function setTextColor(elements, textConfig, state) {
    for (const element of elements.filter(Boolean)) {
      if (!textConfig.isEnabled) {
        element.style.removeProperty('color')
        continue
      }
      element.style.setProperty('color', resolveStateColor(textConfig, state), 'important')
    }
  }

  function setDirectoryColor(elements, dirConfig, state) {
    for (const element of elements.filter(Boolean)) {
      if (!dirConfig.isEnabled) {
        element.style.removeProperty('color')
        element.style.removeProperty('fill')
        continue
      }
      const color = resolveStateColor(dirConfig, state)
      element.style.setProperty('color', color, 'important')
      element.style.setProperty('fill', color, 'important')
    }
  }

  function updateFormattedTime(relativeTimeElement, enabled, datetime) {
    const parent = relativeTimeElement.parentElement
    if (!parent) {
      return
    }

    const existing = parent.querySelector(':scope > .gfh-formatted-time')
    if (!enabled) {
      relativeTimeElement.classList.remove('gfh-hidden-time')
      if (existing) {
        existing.remove()
      }
      return
    }

    relativeTimeElement.classList.add('gfh-hidden-time')
    const label = existing || document.createElement('span')
    label.className = 'gfh-formatted-time'
    label.textContent = formatDate(datetime)
    if (!existing) {
      parent.appendChild(label)
    }
  }

  function isFileRow(row) {
    return Boolean(row.querySelector('a[href*="/blob/"], a[href*="/tree/"]'))
  }

  function isCommitSummaryRow(row) {
    return Boolean(
      !isFileRow(row) &&
        row.querySelector('relative-time[datetime]') &&
        row.querySelector('a[href*="/commit/"]')
    )
  }

  function findFileTableBodies() {
    return Array.from(document.querySelectorAll('table tbody')).filter((tbody) => {
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(isFileRow)
      const datedRows = rows.filter((row) => row.querySelector('relative-time[datetime]'))
      return datedRows.length >= 2
    })
  }

  function sortRowsIfNeeded(theme) {
    if (!theme.SORT.isEnabled) {
      return
    }

    for (const tbody of findFileTableBodies()) {
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(isFileRow)
      const sortableRows = rows.filter((row) => row.querySelector('relative-time[datetime]'))
      if (sortableRows.length < 2) {
        continue
      }

      sortableRows.sort((left, right) => {
        const leftTime = new Date(
          left.querySelector('relative-time[datetime]')?.getAttribute('datetime') || 0
        ).getTime()
        const rightTime = new Date(
          right.querySelector('relative-time[datetime]')?.getAttribute('datetime') || 0
        ).getTime()
        return theme.SORT.select === 'asc' ? leftTime - rightTime : rightTime - leftTime
      })

      for (const row of sortableRows) {
        tbody.appendChild(row)
      }
    }
  }

  function processRepoAndTreePage(theme) {
    for (const tbody of findFileTableBodies()) {
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(isFileRow)
      for (const row of rows) {
        const relativeTimeElement = row.querySelector('relative-time[datetime]')
        if (!relativeTimeElement) {
          continue
        }

        const datetime = relativeTimeElement.getAttribute('datetime')
        if (!datetime) {
          continue
        }

        const freshnessState = getFreshnessState(datetime, theme.TIME_BOUNDARY)
        const timeCell = relativeTimeElement.closest('td') || row
        const textTargets = [
          relativeTimeElement.closest('a') || relativeTimeElement.parentElement,
          row.querySelector('a[href*="/blob/"], a[href*="/tree/"]'),
        ]
        const dirTargets = []
        const directoryLink = row.querySelector('a[href*="/tree/"]')
        if (directoryLink) {
          dirTargets.push(row.querySelector('svg'))
          dirTargets.push(row.querySelector('.color-fg-muted'))
        }

        setBackgroundColor(timeCell, theme.BGC, freshnessState)
        setTextColor(textTargets, theme.FONT, freshnessState)
        setDirectoryColor(dirTargets, theme.DIR, freshnessState)
        updateFormattedTime(relativeTimeElement, theme.TIME_FORMAT.isEnabled, datetime)
      }

      const summaryRows = Array.from(tbody.querySelectorAll('tr')).filter(isCommitSummaryRow)
      for (const row of summaryRows) {
        const relativeTimeElement = row.querySelector('relative-time[datetime]')
        if (!relativeTimeElement) {
          continue
        }

        const datetime = relativeTimeElement.getAttribute('datetime')
        if (!datetime) {
          continue
        }

        const freshnessState = getFreshnessState(datetime, theme.TIME_BOUNDARY)
        const backgroundTarget =
          row.querySelector('td[colspan]') ||
          row.querySelector('[data-testid="latest-commit"]') ||
          row
        const textTargets = [
          row.querySelector('a[href*="/commit/"]'),
          row.querySelector('a.Link--secondary'),
          ...Array.from(row.querySelectorAll('.fgColor-muted')),
          ...Array.from(row.querySelectorAll('.prc-Text-Text-9mHv3')),
          relativeTimeElement.closest('a') || relativeTimeElement.parentElement,
        ]

        setBackgroundColor(backgroundTarget, theme.BGC, freshnessState)
        setTextColor(textTargets, theme.FONT, freshnessState)
        updateFormattedTime(relativeTimeElement, theme.TIME_FORMAT.isEnabled, datetime)
      }
    }

    sortRowsIfNeeded(theme)
  }

  function findSearchEntries() {
    const main = document.querySelector('main')
    if (!main) {
      return []
    }

    const entries = new Map()
    const anchors = Array.from(main.querySelectorAll('a[href]'))
    for (const anchor of anchors) {
      if (anchor.closest('header, nav, aside, details')) {
        continue
      }

      const repoInfo = extractRepoInfo(anchor.href, true)
      if (!repoInfo) {
        continue
      }

      const container = findSearchResultContainer(anchor)
      if (!container || !isSearchPrimaryAnchor(anchor, repoInfo)) {
        continue
      }

      const key = `${repoInfo.fullName}::${getNodePath(container)}`
      if (entries.has(key)) {
        continue
      }

      entries.set(key, {
        anchor,
        container,
        repoInfo,
      })
    }

    return Array.from(entries.values())
  }

  function findSearchResultContainer(anchor) {
    return (
      anchor.closest('article') ||
      anchor.closest('[data-testid="results-list"] > div') ||
      anchor.closest('.Box-sc-g0xbh4-0')
    )
  }

  function isSearchPrimaryAnchor(anchor, repoInfo) {
    if (!anchor || !repoInfo) {
      return false
    }

    if (anchor.closest('h1, h2, h3, h4')) {
      return true
    }

    const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) {
      return false
    }

    const normalizedText = text.replace(/\s+/g, '').toLowerCase()
    const fullName = repoInfo.fullName.toLowerCase()
    const compactFullName = fullName.replace(/\s+/g, '')
    const repoName = repoInfo.repo.toLowerCase()

    return (
      normalizedText === compactFullName ||
      normalizedText === fullName ||
      normalizedText.endsWith(`/${repoName}`) ||
      normalizedText === repoName
    )
  }

  function getNodePath(node) {
    const parts = []
    let current = node
    while (current && current !== document.body && parts.length < 6) {
      const index = current.parentElement
        ? Array.from(current.parentElement.children).indexOf(current)
        : -1
      parts.push(`${current.tagName}:${index}`)
      current = current.parentElement
    }
    return parts.join('>')
  }

  function upsertApiBadge(anchor, text, state) {
    const parent = anchor.parentElement
    if (!parent) {
      return
    }
    let badge = parent.querySelector(':scope > .gfh-api-badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'gfh-api-badge'
      parent.appendChild(badge)
    }
    badge.dataset.state = state
    badge.textContent = text
  }

  function findFrontendDatetime(container) {
    if (!container) {
      return null
    }

    const directElement =
      container.querySelector('relative-time[datetime]') ||
      container.querySelector('time[datetime]') ||
      container.querySelector('[datetime]')
    if (directElement) {
      return {
        element: directElement,
        datetime: directElement.getAttribute('datetime'),
      }
    }

    const titleElement = Array.from(container.querySelectorAll('[title]')).find((element) =>
      /\b(?:GMT|UTC)\s*[+-]?\s*\d{1,2}/i.test(element.getAttribute('title') || '')
    )
    if (!titleElement) {
      return null
    }

    const datetime = parseFrontendDatetimeTitle(titleElement.getAttribute('title'))
    if (!datetime) {
      return null
    }

    return {
      element: titleElement,
      datetime,
    }
  }

  function confirmApiFallback(message) {
    const storedDecision = GM_getValue(API_FALLBACK_PROMPT_KEY, '')
    if (storedDecision === 'allow') {
      return true
    }
    if (storedDecision === 'deny') {
      return false
    }

    const shouldUseApi = window.confirm(message)
    GM_setValue(API_FALLBACK_PROMPT_KEY, shouldUseApi ? 'allow' : 'deny')
    return shouldUseApi
  }

  function maybePromptForTokenForApi() {
    if (tokenPromptHandledThisPage || config.token) {
      return
    }

    tokenPromptHandledThisPage = true
    const shouldConfigure = window.confirm(
      '当前将通过 GitHub API 获取时间信息。\n\n未配置 Token 也能使用，但更容易遇到限流。\n\n是否现在配置 Token？'
    )
    if (shouldConfigure) {
      configureToken()
    }
  }

  async function processSearchPage(theme) {
    const entries = findSearchEntries()
    if (!entries.length) {
      return
    }

    const apiFallbackEntries = []

    for (const { anchor, container, repoInfo } of entries) {
      const frontendDatetime = findFrontendDatetime(container)
      const datetimeElement = frontendDatetime?.element
      const datetime = frontendDatetime?.datetime
      if (!datetime) {
        apiFallbackEntries.push({ anchor, container, repoInfo })
        continue
      }

      const freshnessState = getFreshnessState(datetime, theme.TIME_BOUNDARY)
      setBackgroundColor(container, theme.BGC, freshnessState)
      setTextColor(
        [anchor, datetimeElement.closest('a') || datetimeElement.parentElement],
        theme.FONT,
        freshnessState
      )
    }

    if (!apiFallbackEntries.length) {
      return
    }

    const shouldUseApi = confirmApiFallback(
      '搜索页部分结果无法直接从前端读取更新时间。\n\n是否改为使用 GitHub API 获取这些结果的时间信息？'
    )
    if (!shouldUseApi) {
      return
    }

    maybePromptForTokenForApi()

    await Promise.all(
      apiFallbackEntries.map(async ({ anchor, container, repoInfo }) => {
        try {
          const data = await fetchRepoData(repoInfo)
          const freshnessState = getFreshnessState(data.updated_at, theme.TIME_BOUNDARY)
          setBackgroundColor(container, theme.BGC, freshnessState)
          setTextColor([anchor], theme.FONT, freshnessState)
          upsertApiBadge(anchor, `Updated ${formatDate(data.updated_at)}`, freshnessState)
        } catch (error) {
          console.warn(`GitHub-Freshness-rebuild: failed to load ${repoInfo.fullName}.`, error)
        }
      })
    )
  }

  function isAwesomePage() {
    const pathMatch = window.location.pathname.match(REPO_PATH_PATTERN)
    if (pathMatch && pathMatch[2].toLowerCase().startsWith('awesome')) {
      return true
    }
    return document.querySelectorAll('.markdown-body a[href*="github.com/"]').length >= AWESOME_PAGE_LINK_THRESHOLD
  }

  function collectAwesomeAnchors() {
    const markdownRoot = document.querySelector('.markdown-body')
    if (!markdownRoot) {
      return []
    }

    const anchors = Array.from(markdownRoot.querySelectorAll('a[href]'))
    const seen = new Set()
    return anchors.filter((anchor) => {
      const repoInfo = extractRepoInfo(anchor.href, true)
      if (!repoInfo || seen.has(repoInfo.fullName)) {
        return false
      }
      seen.add(repoInfo.fullName)
      anchor.dataset.gfhRepo = repoInfo.fullName
      return true
    })
  }

  async function processAwesomeAnchor(anchor, theme) {
    const repoInfo = extractRepoInfo(anchor.href, true)
    if (!repoInfo) {
      return
    }
    try {
      const data = await fetchRepoData(repoInfo)
      const freshnessState = getFreshnessState(data.updated_at, theme.TIME_BOUNDARY)
      setBackgroundColor(anchor, theme.BGC, freshnessState)
      setTextColor([anchor], theme.FONT, freshnessState)
      upsertApiBadge(
        anchor,
        `★ ${data.stargazers_count} · ${formatDate(data.updated_at)}`,
        freshnessState
      )
    } catch (error) {
      console.warn(`GitHub-Freshness-rebuild: failed to load ${repoInfo.fullName}.`, error)
    }
  }

  function processAwesomeList(theme) {
    if (!theme.AWESOME.isEnabled || !isAwesomePage()) {
      return
    }

    const anchors = collectAwesomeAnchors()
    if (!anchors.length) {
      return
    }

    const shouldUseApi = confirmApiFallback(
      'Awesome 列表通常不直接提供仓库更新时间和星标数。\n\n是否使用 GitHub API 获取这些信息？'
    )
    if (!shouldUseApi) {
      return
    }

    maybePromptForTokenForApi()

    if (awesomeObserver) {
      awesomeObserver.disconnect()
    }

    awesomeObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue
          }
          const anchor = entry.target
          awesomeObserver.unobserve(anchor)
          processAwesomeAnchor(anchor, theme)
        }
      },
      { rootMargin: '200px 0px' }
    )

    for (const anchor of anchors) {
      awesomeObserver.observe(anchor)
    }
  }

  function isRepoOrTreePage() {
    const segments = window.location.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      return false
    }
    return !window.location.pathname.startsWith('/search')
  }

  async function run() {
    config = loadConfig()
    tokenPromptHandledThisPage = false
    const theme = getActiveThemeConfig()

    if (window.location.pathname === SEARCH_PATHNAME) {
      await processSearchPage(theme)
      return
    }

    if (!isRepoOrTreePage()) {
      return
    }

    processRepoAndTreePage(theme)
    processAwesomeList(theme)
  }

  function debounce(func, wait) {
    let timeoutId = null
    return (...args) => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => func(...args), wait)
    }
  }

  const scheduleRun = debounce(() => {
    run().catch((error) => {
      console.error('GitHub-Freshness-rebuild: run failed.', error)
    })
  }, 240)

  function refreshNow() {
    scheduleRun()
  }

  function updateThemeSetting(themeName, updater) {
    const nextTheme = normalizeTheme(updater(clone(config.themes[themeName])))
    config.themes[themeName] = nextTheme
    saveConfig()
    refreshNow()
  }

  function promptForValue(message, defaultValue = '') {
    return window.prompt(message, defaultValue)
  }

  function configureCurrentThemeMode() {
    const value = promptForValue(
      '当前主题模式：输入 auto、light 或 dark',
      config.currentTheme
    )
    if (value === null) {
      return
    }
    const normalized = value.trim().toLowerCase()
    if (!['auto', 'light', 'dark'].includes(normalized)) {
      window.alert('无效主题模式，只能是 auto、light 或 dark。')
      return
    }
    config.currentTheme = normalized
    saveConfig()
    refreshNow()
  }

  function configureThreshold() {
    const activeThemeName = getEffectiveThemeName()
    const current = config.themes[activeThemeName].TIME_BOUNDARY
    const value = promptForValue(
      '为当前主题设置时间阈值，格式如：30 day、12 week、6 month、1 year',
      `${current.number} ${current.select}`
    )
    if (value === null) {
      return
    }
    const match = value.trim().match(/^(\d+)\s+(day|week|month|year)$/i)
    if (!match) {
      window.alert('格式错误，示例：30 day')
      return
    }
    updateThemeSetting(activeThemeName, (theme) => {
      theme.TIME_BOUNDARY.number = Number(match[1])
      theme.TIME_BOUNDARY.select = match[2].toLowerCase()
      return theme
    })
  }

  function configureWarningMultiplier() {
    const activeThemeName = getEffectiveThemeName()
    const current = config.themes[activeThemeName].TIME_BOUNDARY.warningMultiplier || 2
    const value = promptForValue(
      '设置黄色区间倍数。示例：2 表示“阈值到 2 倍阈值”为黄色。',
      String(current)
    )
    if (value === null) {
      return
    }

    const normalized = Number(value.trim())
    if (!Number.isFinite(normalized) || normalized <= 1) {
      window.alert('黄色区间倍数必须大于 1。示例：2')
      return
    }

    updateThemeSetting(activeThemeName, (theme) => {
      theme.TIME_BOUNDARY.warningMultiplier = normalized
      return theme
    })
  }

  function configureSort() {
    const activeThemeName = getEffectiveThemeName()
    const current = config.themes[activeThemeName].SORT
    const enabled = window.confirm(
      `当前主题文件排序现在为 ${current.isEnabled ? '开启' : '关闭'}。\n选择“确定”表示开启，选择“取消”表示关闭。`
    )
    const order = promptForValue(
      '排序方向：输入 asc 或 desc',
      current.select
    )
    if (order === null) {
      return
    }
    const normalized = order.trim().toLowerCase()
    if (!['asc', 'desc'].includes(normalized)) {
      window.alert('排序方向只能是 asc 或 desc。')
      return
    }
    updateThemeSetting(activeThemeName, (theme) => {
      theme.SORT.isEnabled = enabled
      theme.SORT.select = normalized
      return theme
    })
  }

  function configureTimeFormat() {
    const activeThemeName = getEffectiveThemeName()
    const current = config.themes[activeThemeName].TIME_FORMAT.isEnabled
    const enabled = window.confirm(
      `当前主题时间格式化现在为 ${current ? '开启' : '关闭'}。\n选择“确定”表示开启，选择“取消”表示关闭。`
    )
    updateThemeSetting(activeThemeName, (theme) => {
      theme.TIME_FORMAT.isEnabled = enabled
      return theme
    })
  }

  function configureAwesome() {
    const activeThemeName = getEffectiveThemeName()
    const current = config.themes[activeThemeName].AWESOME.isEnabled
    const enabled = window.confirm(
      `当前主题 Awesome 模式现在为 ${current ? '开启' : '关闭'}。\n选择“确定”表示开启，选择“取消”表示关闭。`
    )
    updateThemeSetting(activeThemeName, (theme) => {
      theme.AWESOME.isEnabled = enabled
      return theme
    })
  }

  function configureToken() {
    const masked = config.token ? `${config.token.slice(0, 4)}...` : ''
    const value = promptForValue(
      '输入 GitHub Token。留空可清除。当前值已做掩码显示。',
      masked
    )
    if (value === null) {
      return
    }
    if (value === masked) {
      return
    }
    config.token = value.trim()
    saveConfig()
    refreshNow()
  }

  function editThemeJson(themeName) {
    const value = promptForValue(
      `编辑 ${themeName} 主题 JSON。请只修改颜色、开关、阈值、排序等字段。`,
      JSON.stringify(config.themes[themeName], null, 2)
    )
    if (value === null) {
      return
    }
    try {
      const parsed = JSON.parse(value)
      config.themes[themeName] = normalizeTheme(parsed)
      saveConfig()
      refreshNow()
    } catch (error) {
      window.alert(`JSON 解析失败：${error.message}`)
    }
  }

  function resetConfig() {
    if (!window.confirm('确认将 GitHub-Freshness-rebuild 配置重置为默认值吗？')) {
      return
    }
    config = clone(defaultConfig)
    GM_setValue(API_FALLBACK_PROMPT_KEY, '')
    saveConfig()
    refreshNow()
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('立即刷新', refreshNow)
    GM_registerMenuCommand(`主题模式 (${config.currentTheme})`, configureCurrentThemeMode)
    GM_registerMenuCommand('当前主题时间阈值', configureThreshold)
    GM_registerMenuCommand('黄色区间倍数', configureWarningMultiplier)
    GM_registerMenuCommand('当前主题排序', configureSort)
    GM_registerMenuCommand('当前主题时间格式化', configureTimeFormat)
    GM_registerMenuCommand('当前主题 Awesome 模式', configureAwesome)
    GM_registerMenuCommand('GitHub Token', configureToken)
    GM_registerMenuCommand('编辑浅色主题 JSON', () => editThemeJson('light'))
    GM_registerMenuCommand('编辑深色主题 JSON', () => editThemeJson('dark'))
    GM_registerMenuCommand('重置配置', resetConfig)
  }

  function attachNavigationListeners() {
    window.addEventListener('load', scheduleRun)
    window.addEventListener('popstate', scheduleRun)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleRun()
      }
    })
    document.addEventListener('pjax:end', scheduleRun)
    document.addEventListener('pjax:success', scheduleRun)
    document.addEventListener('turbo:load', scheduleRun)
    document.addEventListener('turbo:render', scheduleRun)
    document.addEventListener('turbo:frame-load', scheduleRun)

    const mutationObserver = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) => mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0
        )
      ) {
        scheduleRun()
      }
    })
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (config.currentTheme === 'auto') {
          scheduleRun()
        }
      })

    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args)
      scheduleRun()
      return result
    }

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args)
      scheduleRun()
      return result
    }
  }

  registerMenuCommands()
  attachNavigationListeners()
  scheduleRun()
})()
