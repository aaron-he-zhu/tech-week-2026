'use strict';
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escapeText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const params = new URLSearchParams(location.search);
function cityButtons(city) {
  $$('[data-city]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.city === city)));
}
const pageData = $('#page-data');
if (pageData) {
  const data = JSON.parse(pageData.textContent);
  if (data.type === 'home') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    $$('[data-home-date]').forEach((link) => {
      if (link.dataset.homeDate === today) link.setAttribute('aria-current', 'date');
    });
    let city = ['sf', 'la'].includes(params.get('city')) ? params.get('city') : 'all',
      group = data.topics.some((t) => t.group === params.get('group'))
        ? params.get('group')
        : 'all';
    $('#topic-search').value = params.get('q') || '';
    const apply = () => {
      const q = $('#topic-search').value.toLowerCase().trim();
      let shown = 0;
      const count = (t) => (city === 'all' ? t.total : t[city]);
      const cards = new Map($$('.topic-card').map((card) => [card.dataset.slug, card]));
      [...data.topics]
        .sort((a, b) => count(b) - count(a))
        .forEach((item) => {
          const card = cards.get(item.slug);
          $('.topic-grid').append(card);
          const ok =
            (group === 'all' || item.group === group) &&
            (!q ||
              (item.name + ' ' + item.en + ' ' + item.description + ' ' + (item.searchText || ''))
                .toLowerCase()
                .includes(q));
          card.hidden = !ok;
          if (ok) shown++;
          $('.count', card).textContent = count(item);
          card.href =
            window.TWLocale.path('/topics/' + item.slug + '/') +
            (city === 'all' ? '' : '?city=' + city);
        });
      $$('[data-group]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.group === group)),
      );
      $('#topic-result').textContent = shown + ' 个专题';
      $('#topic-empty').hidden = shown > 0;
      cityButtons(city);
      const p = new URLSearchParams();
      if (city !== 'all') p.set('city', city);
      if (group !== 'all') p.set('group', group);
      if (q) p.set('q', $('#topic-search').value);
      history.replaceState(null, '', location.pathname + (p.size ? '?' + p : '') + location.hash);
    };
    $$('[data-city]').forEach((b) =>
      b.addEventListener('click', () => {
        city = b.dataset.city;
        apply();
      }),
    );
    $$('[data-group]').forEach((b) =>
      b.addEventListener('click', () => {
        group = b.dataset.group;
        $$('[data-group]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        apply();
      }),
    );
    $('#topic-search').addEventListener('input', apply);
    apply();
  } else if (data.type === 'events') {
    const valid = (key, values, fallback) =>
      values.includes(params.get(key)) ? params.get(key) : fallback;
    const state = {
      city: valid('city', ['sf', 'la'], 'all'),
      date: params.get('date') || '',
      format: params.get('format') || '',
      purpose: $('#filter-purpose') ? params.get('purpose') || '' : '',
      status: valid('status', ['open', 'waitlist', 'full', 'closed'], ''),
      sort: valid('sort', ['time', 'relevance', 'popular'], 'time'),
      q: params.get('q') || '',
      address: params.get('address') === '1',
      view: valid('view', ['list', 'calendar'], 'list'),
      limit: 12,
    };
    if (state.view === 'calendar') state.sort = 'time';
    const filterKeys = [
      'date',
      'format',
      'status',
      'sort',
      ...($('#filter-purpose') ? ['purpose'] : []),
    ];
    for (const key of filterKeys) {
      const element = $('#filter-' + key);
      if (![...element.options].some((option) => option.value === state[key]))
        state[key] = element.options[0].value;
      element.value = state[key];
    }
    const dates = [...$('#filter-date').options].map((option) => option.value).filter(Boolean);
    const dayLabel = new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: 'UTC',
    });
    const monthLabel = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    const dayDate = (day) => new Date(day + 'T12:00:00Z');
    $('#event-search').value = state.q;
    $('#filter-address').checked = state.address;
    $('#calendar-picker').open = state.view === 'calendar';
    const card = (e, day = e.date) => {
      const status =
        {
          open: '开放申请',
          waitlist: '候补',
          full: '已满',
          closed: '已关闭',
          unknown: '状态待确认',
        }[e.status] || '状态待确认';
      const match = e.match
        ? '相关主题' + ' · ' + e.match.terms.join(' / ')
        : e.featured
          ? '官网精选'
          : e.formats.slice(0, 2).join(' · ');
      return `<article class="event-card" data-event-id="${escapeText(e.id)}"><div class="event-meta"><span class="date-label">${escapeText(day.slice(5).replace('-', '/'))} · ${day > e.date ? '跨日活动' : escapeText(e.time)}</span><span class="pill ${escapeText(e.city)}">${e.city.toUpperCase()}</span>${e.featured ? '<span class="pill">官网精选</span>' : ''}<span class="status ${escapeText(e.status)}">${status}</span></div><h3><a href="${escapeText(e.url)}" target="_blank" rel="noopener noreferrer">${escapeText(e.name)}</a></h3><p class="event-summary">${escapeText(e.brief)}</p><div class="event-host">${escapeText(e.hosts.join(' / '))}</div><div class="event-host">${escapeText(e.place)}${e.endDate && e.endDate !== e.date ? ' · 持续至 ' + escapeText(e.endDate.slice(5).replace('-', '/')) : ''}</div>${e.note ? '<p class="event-note">' + escapeText(e.note) + '</p>' : ''}<div class="event-bottom"><span class="match-note">${escapeText(match)}</span><span class="source-links">${e.lumaUrl ? '<a href="' + escapeText(e.lumaUrl) + '" target="_blank" rel="noopener noreferrer">Luma ↗</a>' : ''}<a href="${escapeText(e.url)}" target="_blank" rel="noopener noreferrer">官网 ↗</a></span></div>${window.Wishlist?.markup(e) || ''}${window.Community?.markup(e) || ''}</article>`;
    };
    let filtered = [];
    let calendarEntries = [];
    const index = () => window.Community.addressIndex;
    const allEvents = () => (data.wishlist ? window.Wishlist.events(data.events) : data.events);
    const draw = () => {
      if (state.view === 'calendar') {
        let previous = '';
        $('#event-list').innerHTML =
          calendarEntries
            .slice(0, state.limit)
            .map(({ date, event }) => {
              const heading =
                date !== previous
                  ? (previous ? '</div></section>' : '') +
                    '<section class="calendar-day"><h2>' +
                    escapeText(dayLabel.format(dayDate(date))) +
                    '</h2><div class="calendar-agenda">'
                  : '';
              previous = date;
              return heading + card(event, date);
            })
            .join('') + (previous ? '</div></section>' : '');
      } else {
        $('#event-list').innerHTML = filtered
          .slice(0, state.limit)
          .map((event) => card(event))
          .join('');
      }
      window.Wishlist?.mount();
      const total = state.view === 'calendar' ? calendarEntries.length : filtered.length;
      $('#load-more').hidden = total <= state.limit;
      const remaining = Math.min(12, Math.max(0, total - state.limit));
      $('#load-more').textContent =
        state.view === 'calendar' ? `再看 ${remaining} 项日程` : `再看 ${remaining} 场活动`;
    };
    function paintCalendar() {
      const candidates = allEvents().filter((event) =>
        window.EventCalendar.matches(event, state, index().counts, true),
      );
      const counts = window.EventCalendar.dayCounts(candidates, dates);
      const waiting = state.address && index().counts === null;
      $('#calendar-month').textContent = dates.length ? monthLabel.format(dayDate(dates[0])) : '';
      const offset = dates.length ? (dayDate(dates[0]).getUTCDay() + 6) % 7 : 0;
      $('#calendar-grid').innerHTML =
        '<span aria-hidden="true"></span>'.repeat(offset) +
        dates
          .map(
            (date) =>
              `<button type="button" class="calendar-date" data-calendar-date="${date}" aria-pressed="${date === state.date}" aria-label="${escapeText(dayLabel.format(dayDate(date)))}${waiting ? '' : ' · ' + counts[date] + ' 场活动'}"><span>${Number(date.slice(-2))}</span><small>${waiting ? '—' : counts[date]}</small></button>`,
          )
          .join('');
      $('#calendar-selection').textContent = state.date
        ? dayLabel.format(dayDate(state.date))
        : '所有日期';
      $('#calendar-all').setAttribute('aria-pressed', String(!state.date));
    }
    const apply = (preserveLimit = false) => {
      filtered = allEvents().filter((event) =>
        window.EventCalendar.matches(event, state, index().counts),
      );
      filtered.sort((a, b) =>
        state.sort === 'popular'
          ? (window.Wishlist.counts[b.id] || 0) - (window.Wishlist.counts[a.id] || 0) ||
            a.date.localeCompare(b.date) ||
            a.time.localeCompare(b.time)
          : state.sort === 'relevance'
            ? (b.match?.score || 0) - (a.match?.score || 0) ||
              Number(b.featured) - Number(a.featured) ||
              a.date.localeCompare(b.date) ||
              a.time.localeCompare(b.time)
            : a.date.localeCompare(b.date) ||
              a.time.localeCompare(b.time) ||
              a.name.localeCompare(b.name),
      );
      calendarEntries =
        state.view === 'calendar'
          ? window.EventCalendar.entries(filtered, state.date ? [state.date] : dates)
          : [];
      if (!preserveLimit) state.limit = 12;
      draw();
      paintCalendar();
      cityButtons(state.city);
      $$('[data-view]').forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.view === state.view)),
      );
      $('#filter-sort').disabled = state.view === 'calendar';
      $('#calendar-view-note').hidden = state.view !== 'calendar';
      const unavailable = state.address && index().counts === null;
      $('#event-count').textContent = unavailable
        ? index().error
          ? '暂时无法读取爆料地址'
          : '正在加载爆料地址…'
        : `${filtered.length.toLocaleString()} 场活动${state.city === 'all' ? ' · SF + LA' : ' · ' + state.city.toUpperCase()}`;
      $('#address-filter-feedback').hidden = !state.address || (!index().loading && !index().error);
      $('#address-filter-status').textContent = index().error
        ? index().counts
          ? '爆料地址暂时无法更新，当前显示上次结果。'
          : '爆料地址加载失败，请重试。'
        : '正在更新爆料地址…';
      $('#address-filter-retry').hidden = !index().error;
      $('#event-empty').hidden = filtered.length > 0 || unavailable;
      if (data.wishlist) {
        const empty = $('#event-empty');
        $('h3', empty).textContent = !window.Wishlist.loaded
          ? '正在载入你的清单'
          : window.Wishlist.saved.size
            ? '这个筛选下没有收藏'
            : '还没有想去的活动';
        $('p', empty).textContent = window.Wishlist.loaded
          ? '到专题或全部活动页点「♡ 想去」，就会出现在这里。'
          : '连接成功后会显示云端清单；加载失败时，请查看下方提示并刷新重试。';
      }
      const query = new URLSearchParams();
      for (const key of ['city', 'date', 'format', 'purpose', 'status', 'sort', 'q'])
        if (state[key] && !(key === 'city' && state[key] === 'all')) query.set(key, state[key]);
      if (state.address) query.set('address', '1');
      if (state.view === 'calendar') query.set('view', 'calendar');
      history.replaceState(
        null,
        '',
        location.pathname + (query.size ? '?' + query : '') + location.hash,
      );
    };
    const selectDate = (date) => {
      state.date = date;
      $('#filter-date').value = date;
      apply();
    };
    $('#calendar-grid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-calendar-date]');
      if (button) selectDate(button.dataset.calendarDate);
    });
    $('#calendar-all').addEventListener('click', () => selectDate(''));
    $$('[data-view]').forEach((button) =>
      button.addEventListener('click', () => {
        state.view = button.dataset.view;
        if (state.view === 'calendar') {
          state.sort = 'time';
          $('#filter-sort').value = 'time';
          $('#calendar-picker').open = true;
        }
        apply();
      }),
    );
    $('#filter-address').addEventListener('change', (event) => {
      state.address = event.target.checked;
      apply();
      if (state.address) window.Community.refreshAddressIndex();
    });
    $('#address-filter-retry').addEventListener('click', () =>
      window.Community.refreshAddressIndex(true),
    );
    window.addEventListener('tw-address-index', () => {
      if (state.address) apply(true);
    });
    const refreshAddresses = () => {
      if (state.address && !document.hidden && navigator.onLine !== false)
        window.Community.refreshAddressIndex();
    };
    setInterval(refreshAddresses, 30000);
    document.addEventListener('visibilitychange', refreshAddresses);
    window.addEventListener('pageshow', refreshAddresses);
    window.addEventListener('online', refreshAddresses);
    $$('[data-city]').forEach((button) =>
      button.addEventListener('click', () => {
        state.city = button.dataset.city;
        selectDate('');
      }),
    );
    for (const key of filterKeys)
      $('#filter-' + key).addEventListener('change', (event) => {
        state[key] = event.target.value;
        apply();
      });
    let timer;
    $('#event-search').addEventListener('input', (event) => {
      state.q = event.target.value;
      clearTimeout(timer);
      timer = setTimeout(apply, 120);
    });
    $$('[data-reset]').forEach((button) =>
      button.addEventListener('click', () => {
        Object.assign(state, {
          city: 'all',
          date: '',
          format: '',
          purpose: '',
          status: '',
          q: '',
          sort: 'time',
          address: false,
        });
        for (const key of filterKeys) $('#filter-' + key).value = state[key];
        $('#event-search').value = '';
        $('#filter-address').checked = false;
        apply();
      }),
    );
    $('#load-more').addEventListener('click', () => {
      const previous = state.limit;
      state.limit += 12;
      draw();
      $$('.event-card')[previous]?.querySelector('h3 a')?.focus({ preventScroll: true });
    });
    $('#event-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-wish]');
      if (!button) return;
      const item = filtered.find((item) => item.id === button.dataset.wish);
      if (item) window.Wishlist.toggle(item);
    });
    if (window.Wishlist) {
      window.Wishlist.onChange = () => {
        if (data.wishlist || state.sort === 'popular') apply();
        else window.Wishlist.mount();
      };
      window.Wishlist.ready.then(apply);
    }
    apply();
    refreshAddresses();
  }
}
