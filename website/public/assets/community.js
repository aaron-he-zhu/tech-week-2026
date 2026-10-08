'use strict';
(() => {
  const W = window.Wishlist;
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const page = document.getElementById('page-data');
  const events = page ? JSON.parse(page.textContent).events || [] : [];
  const C = (window.Community = {});
  C.addressIndex = { counts: null, loading: false, error: false };
  let addressRequest = null;
  let addressCheckedAt = 0;
  C.refreshAddressIndex = (force = false) => {
    if (addressRequest)
      return force ? addressRequest.then(() => C.refreshAddressIndex(true)) : addressRequest;
    if (!force && C.addressIndex.counts && Date.now() - addressCheckedAt < 30000)
      return Promise.resolve();
    C.addressIndex.loading = true;
    C.addressIndex.error = false;
    window.dispatchEvent(new Event('tw-address-index'));
    addressRequest = (async () => {
      try {
        const data = await W.request('/v1/community/address-events', { credential: '' });
        if (
          !data.events ||
          typeof data.events !== 'object' ||
          Array.isArray(data.events) ||
          Object.entries(data.events).some(
            ([id, count]) =>
              !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(id) ||
              !Number.isSafeInteger(count) ||
              count < 1,
          )
        )
          throw new Error('Invalid address index');
        C.addressIndex.counts = data.events;
        addressCheckedAt = Date.now();
      } catch {
        C.addressIndex.error = true;
      } finally {
        C.addressIndex.loading = false;
        addressRequest = null;
        window.dispatchEvent(new Event('tw-address-index'));
      }
    })();
    return addressRequest;
  };
  const homeStats = document.getElementById('home-community-stats');
  if (homeStats) {
    const count = homeStats.querySelector('[data-home-address-count]'),
      eventCount = homeStats.querySelector('[data-home-address-events]'),
      status = homeStats.querySelector('[data-home-stats-status]');
    const number = new Intl.NumberFormat('zh-CN');
    let pending = false;
    async function refreshHomeStats() {
      if (pending || document.hidden || navigator.onLine === false) return;
      pending = true;
      try {
        const data = await W.request('/v1/community/stats', { credential: '' });
        if (
          !Number.isSafeInteger(data.addressCount) ||
          data.addressCount < 0 ||
          !Number.isSafeInteger(data.addressEventCount) ||
          data.addressEventCount < 0 ||
          data.addressEventCount > data.addressCount
        )
          throw new Error('Invalid stats');
        count.textContent = number.format(data.addressCount);
        eventCount.textContent = number.format(data.addressEventCount);
        if (window.TWLocale.en) {
          count.nextSibling.textContent =
            data.addressCount === 1 ? ' address tip' : ' address tips';
          eventCount.nextSibling.textContent = data.addressEventCount === 1 ? ' event' : ' events';
        }
        status.textContent = '每 30 秒自动更新';
      } catch {
        status.textContent = '暂时无法更新，将自动重试';
      } finally {
        pending = false;
      }
    }
    refreshHomeStats();
    setInterval(refreshHomeStats, 30000);
    document.addEventListener('visibilitychange', refreshHomeStats);
    window.addEventListener('pageshow', refreshHomeStats);
    window.addEventListener('online', refreshHomeStats);
  }
  C.markup = (e) =>
    `<div class="community-row"><button type="button" class="community-entry" data-community="addresses" data-community-event="${esc(e.id)}"><span class="community-label">⌖ 地址爆料</span><span data-address-summary>查看 / 提供具体地址 →</span></button><button type="button" class="community-entry" data-community="ratings" data-community-event="${esc(e.id)}"><span class="community-label">☆ 去过并评分</span><span data-rating-summary>查看 / 评 1–5 分 →</span></button></div>`;
  C.paintSummary = (summary) => {
    document.querySelectorAll('[data-community-event]').forEach((button) => {
      const row = summary[button.dataset.communityEvent];
      if (!row) return;
      const address = button.querySelector('[data-address-summary]'),
        rating = button.querySelector('[data-rating-summary]');
      if (address)
        address.textContent = row.addressCount
          ? window.TWLocale.en
            ? row.addressCount + (row.addressCount === 1 ? ' address tip →' : ' address tips →')
            : row.addressCount + ' 条地址爆料 →'
          : '还没有地址 · 来爆料 →';
      if (rating)
        rating.textContent = row.ratingCount
          ? Number(row.ratingAverage).toFixed(1) +
            ' / 5 · ' +
            (window.TWLocale.en
              ? row.ratingCount +
                (row.ratingCount === 1 ? ' attendee rated →' : ' attendees rated →')
              : row.ratingCount + ' 人去过 →')
          : '暂无评分 · 参加后评分 →';
    });
  };
  if (!events.length) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'community-dialog';
  dialog.setAttribute('aria-labelledby', 'community-heading');
  dialog.innerHTML = `<div class="wish-dialog-head"><h2 id="community-heading">活动交流</h2><button type="button" data-community-close aria-label="关闭活动交流">×</button></div>
  <p id="community-event-name" class="community-event-name"></p>
  <div class="community-tabs" role="group" aria-label="活动交流模块"><button type="button" data-community-tab="addresses" aria-pressed="true">地址爆料</button><button type="button" data-community-tab="ratings" aria-pressed="false">去过并评分</button></div>
  <p id="community-feedback" class="community-feedback" role="status" hidden></p><button type="button" id="community-retry" class="wish-action" hidden>重新加载</button>
  <section id="community-addresses" aria-label="地址爆料"><p class="site-caption">访客提供的具体地址，未经主办方核实。若地址不同，请以主办方最新通知为准。</p>
   <div id="address-list" class="contribution-list"></div><button type="button" id="address-more" class="wish-action" hidden>更多地址爆料</button>
   <form id="address-form" class="contribution-form"><h3>我来提供地址</h3><p class="community-identity"></p><fieldset>
    <label for="tip-address">具体活动地址</label><textarea id="tip-address" required minlength="3" maxlength="600" rows="2" placeholder="场地名、街道、门牌号和城市"></textarea>
    <label for="tip-note">补充说明 <span>选填</span></label><input id="tip-note" maxlength="600" placeholder="例如楼层、入口或地址来源" autocomplete="off">
    <p class="site-caption">地址和说明各最多 300 个字，将连同昵称公开显示。</p><div class="contribution-actions"><button type="submit" class="wish-action primary-action">发布地址</button></div>
   </fieldset><button type="button" id="address-remove" class="wish-action" hidden>撤回我的地址</button></form>
  </section>
  <section id="community-ratings" aria-label="去过并评分" hidden><div id="rating-summary" class="rating-summary"></div><p class="site-caption">参加情况由访客自报。每个免注册身份每场计一份评分，修改会替换原评分。</p>
   <div id="rating-list" class="contribution-list"></div><button type="button" id="rating-more" class="wish-action" hidden>更多评分</button>
   <form id="rating-form" class="contribution-form"><h3>我的参会评分</h3><p class="community-identity"></p><p id="rating-gate" class="site-caption" hidden>活动尚未开始，参加后再来评分。</p><fieldset>
    <label class="attended-confirm"><input id="rating-attended" type="checkbox" required>我已实际参加这场活动</label>
    <fieldset class="rating-options"><legend>这次体验你打几分？</legend>${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="community-score" value="${n}" required><span>${n}<small>分</small></span></label>`).join('')}</fieldset>
    <p class="site-caption">1 分很不满意 · 3 分一般 · 5 分很满意</p><div class="contribution-actions"><button type="submit" class="wish-action primary-action">提交评分</button></div>
   </fieldset><button type="button" id="rating-remove" class="wish-action" hidden>撤回我的评分</button></form>
  </section><p id="community-readonly" class="site-caption" hidden>这是只读分享页面。<a href="${window.TWLocale.path('/wishlist/')}">返回我的 Wishlist</a> 后可用自己的身份参与。</p>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  const nameTime = (row) =>
    (row.nickname || '匿名访客') +
    ' · ' +
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'America/Los_Angeles',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(row.updatedAt)) +
    ' PDT';
  let current = null,
    version = 0,
    busy = false;
  const feedback = (text, isError = false) => {
    const el = $('#community-feedback');
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('is-error', isError);
  };
  function selectKind(value) {
    $('#community-addresses').hidden = value !== 'addresses';
    $('#community-ratings').hidden = value !== 'ratings';
    dialog
      .querySelectorAll('[data-community-tab]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.communityTab === value)));
  }
  function identity() {
    dialog.querySelectorAll('.community-identity').forEach((el) => {
      el.replaceChildren(
        document.createTextNode('以 ' + (W.nickname || '匿名访客') + ' 公开发布 · '),
      );
      const a = document.createElement('a');
      a.href = window.TWLocale.path('/wishlist/');
      a.textContent = '修改昵称';
      el.append(a);
    });
  }
  function drawAddresses(rows, append = false) {
    const list = $('#address-list');
    if (!append) list.replaceChildren();
    if (!rows.length && !append) {
      list.textContent = '还没有地址爆料。知道具体地点的话，可以在下方补充。';
      return;
    }
    for (const row of rows) {
      const article = document.createElement('article'),
        meta = document.createElement('p'),
        address = document.createElement('p'),
        note = document.createElement('p'),
        link = document.createElement('a');
      article.className = 'contribution';
      meta.className = 'contribution-meta';
      meta.textContent = nameTime(row);
      address.className = 'contribution-address';
      address.textContent = row.address;
      note.textContent = row.note;
      note.className = 'contribution-note';
      link.textContent = '在地图中查看 ↗';
      link.href =
        'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(row.address);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      article.append(meta, address);
      if (row.note) article.append(note);
      article.append(link);
      list.append(article);
    }
  }
  function drawRatings(rows, append = false) {
    const list = $('#rating-list');
    if (!append) list.replaceChildren();
    if (!rows.length && !append) {
      list.textContent = '还没有评分，参加后分享你的体验。';
      return;
    }
    for (const row of rows) {
      const article = document.createElement('article'),
        meta = document.createElement('p'),
        score = document.createElement('strong');
      article.className = 'contribution rating-contribution';
      meta.className = 'contribution-meta';
      meta.textContent = nameTime(row);
      score.textContent = row.score + ' / 5 分';
      article.append(meta, score);
      list.append(article);
    }
  }
  function moreButton(selector, offset) {
    const b = $(selector);
    b.hidden = offset === null;
    b.dataset.offset = offset ?? '';
    b.disabled = false;
  }
  function setFormsDisabled(disabled) {
    $('#address-form > fieldset').disabled = disabled;
    $('#rating-form > fieldset').disabled = disabled;
    $('#address-remove').disabled = disabled;
    $('#rating-remove').disabled = disabled;
  }
  async function load() {
    const active = current,
      requestVersion = ++version;
    setFormsDisabled(true);
    $('#community-retry').hidden = true;
    feedback('正在加载地址和评分…');
    try {
      await W.ready;
      const result = await W.request(
        '/v1/events/' + active.id + '/community',
        W.readOnly ? { credential: '' } : {},
      );
      if (version !== requestVersion || current !== active || !dialog.open) return;
      drawAddresses(result.addresses);
      drawRatings(result.ratings);
      moreButton('#address-more', result.nextAddresses);
      moreButton('#rating-more', result.nextRatings);
      $('#rating-summary').textContent = result.ratingCount
        ? Number(result.ratingAverage).toFixed(1) +
          ' / 5 · ' +
          (window.TWLocale.en
            ? result.ratingCount +
              (result.ratingCount === 1 ? ' attendee rated' : ' attendees rated')
            : result.ratingCount + ' 人去过并评分')
        : '暂无评分';
      $('#address-form').hidden = W.readOnly;
      $('#rating-form').hidden = W.readOnly;
      $('#community-readonly').hidden = !W.readOnly;
      identity();
      $('#address-form').reset();
      $('#rating-form').reset();
      const tip = result.mine?.address,
        rating = result.mine?.rating;
      $('#tip-address').value = tip?.address || '';
      $('#tip-note').value = tip?.note || '';
      $('#address-remove').hidden = !tip;
      $('#address-form button[type=submit]').textContent = tip ? '更新我的地址' : '发布地址';
      if (rating) {
        $('#rating-attended').checked = true;
        dialog.querySelector(`input[name="community-score"][value="${rating.score}"]`).checked =
          true;
      }
      $('#rating-form button[type=submit]').textContent = rating ? '更新我的评分' : '提交评分';
      $('#rating-remove').hidden = !rating;
      setFormsDisabled(false);
      $('#rating-form > fieldset').disabled = !result.canRate;
      $('#rating-gate').hidden = result.canRate;
      $('#rating-gate').textContent = active.removed
        ? '活动已移出当前日历，可撤回已有评分。'
        : '活动尚未开始，参加后再来评分。';
      if (active.removed) {
        $('#address-form > fieldset').disabled = true;
        $('#address-remove').disabled = false;
      }
      feedback('');
      C.paintSummary({ [active.id]: result });
      dialog.scrollTop = 0;
    } catch (error) {
      if (version === requestVersion && current === active && dialog.open) {
        feedback(error.message, true);
        $('#community-retry').hidden = false;
      }
    }
  }
  async function open(id, value) {
    const event = events.find((e) => e.id === id) || W.events(events).find((e) => e.id === id);
    if (!event) return;
    current = event;
    selectKind(value);
    $('#community-event-name').textContent = event.name;
    $('#address-list').replaceChildren();
    $('#rating-list').replaceChildren();
    $('#rating-summary').textContent = '';
    $('#address-form').reset();
    $('#rating-form').reset();
    $('#address-form').hidden = true;
    $('#rating-form').hidden = true;
    $('#address-more').hidden = true;
    $('#rating-more').hidden = true;
    $('#community-readonly').hidden = true;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    await load();
  }
  async function mutate(target, method, data) {
    if (busy || W.readOnly) return;
    busy = true;
    const active = current;
    setFormsDisabled(true);
    feedback('正在保存…');
    try {
      await W.ensureSession();
      await W.request('/v1/' + target + '/' + active.id, { method, data });
      W.mount();
      if (target === 'addresses') await C.refreshAddressIndex(true);
      if (current === active && dialog.open) {
        await load();
        if ($('#community-retry').hidden)
          feedback(
            method === 'DELETE'
              ? '已撤回'
              : target === 'addresses'
                ? '地址已发布，可随时修改或撤回。'
                : '评分已保存，可随时修改或撤回。',
          );
      }
    } catch (error) {
      if (current === active && dialog.open) {
        setFormsDisabled(false);
        feedback(error.message, true);
      }
    } finally {
      busy = false;
    }
  }
  $('#address-form').addEventListener('submit', (event) => {
    event.preventDefault();
    mutate('addresses', 'PUT', { address: $('#tip-address').value, note: $('#tip-note').value });
  });
  $('#rating-form').addEventListener('submit', (event) => {
    event.preventDefault();
    mutate('ratings', 'PUT', {
      score: Number(dialog.querySelector('input[name="community-score"]:checked')?.value),
      attended: $('#rating-attended').checked,
    });
  });
  $('#address-remove').addEventListener('click', () => mutate('addresses', 'DELETE'));
  $('#rating-remove').addEventListener('click', () => mutate('ratings', 'DELETE'));
  $('#community-retry').addEventListener('click', load);
  for (const [selector, value, draw, next] of [
    ['#address-more', 'addresses', drawAddresses, 'nextAddresses'],
    ['#rating-more', 'ratings', drawRatings, 'nextRatings'],
  ])
    $(selector).addEventListener('click', async () => {
      const active = current,
        requestVersion = version,
        b = $(selector);
      b.disabled = true;
      try {
        const result = await W.request(
          '/v1/events/' + active.id + '/community?kind=' + value + '&offset=' + b.dataset.offset,
          W.readOnly ? { credential: '' } : {},
        );
        if (current !== active || version !== requestVersion || !dialog.open) return;
        draw(result[value], true);
        moreButton(selector, result[next]);
      } catch (error) {
        if (current === active && version === requestVersion) {
          feedback(error.message, true);
          b.disabled = false;
        }
      }
    });
  dialog.addEventListener('close', () => {
    version++;
    current = null;
  });
  document.addEventListener('click', (event) => {
    const entry = event.target.closest('[data-community-event]');
    if (entry) open(entry.dataset.communityEvent, entry.dataset.community);
    const tab = event.target.closest('[data-community-tab]');
    if (tab) {
      selectKind(tab.dataset.communityTab);
      if (!busy) feedback('');
    }
    if (event.target.closest('[data-community-close]')) dialog.close();
  });
})();
