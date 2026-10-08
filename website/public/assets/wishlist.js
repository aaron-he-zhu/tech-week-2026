'use strict';
(() => {
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const API = localPreview ? '/api' : document.querySelector('meta[name="tw-api-url"]').content;
  const KEY = 'tw26-wishlist-token-v1';
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const pending = new Set();
  let token = '',
    sessionPromise = null,
    summaryVersion = 0;
  try {
    token = localStorage.getItem(KEY) || '';
  } catch {
    // Storage may be blocked; the active page can still use an in-memory identity.
  }
  const fragment = new URLSearchParams(location.hash.slice(1)),
    restore = fragment.get('restore'),
    share = fragment.get('view');
  if (restore) history.replaceState(null, '', location.pathname + location.search);
  const W = (window.Wishlist = {
    counts: {},
    saved: new Map(),
    nickname: '',
    google: null,
    identityErrorStatus: null,
    loaded: false,
    readOnly: !!share,
    onChange: null,
    ready: null,
  });
  const emit = () => {
    document
      .querySelectorAll('[data-wishlist-count]')
      .forEach((el) => (el.textContent = !W.readOnly && W.saved.size ? String(W.saved.size) : ''));
    W.onChange?.();
  };
  let announceTimer;
  function announce(message) {
    const el = document.getElementById('wish-message');
    if (el) {
      el.textContent = message;
      el.hidden = false;
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => (el.hidden = true), 10000);
    }
  }
  async function api(path, { method = 'GET', data, credential = token } = {}) {
    const headers = {};
    if (credential) headers.Authorization = 'Bearer ' + credential;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(
        API +
          path +
          (path.includes('?') ? '&' : '?') +
          'lang=' +
          (window.TWLocale.en ? 'en' : 'zh'),
        {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new Error('连接失败，请稍后重试。');
    }
    const result = await response.json().catch(() => ({ error: '收藏服务暂不可用' }));
    if (!response.ok) {
      const error = new Error(window.TWLocale.text(result.error) || '请稍后重试');
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function remember(value) {
    token = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Storage may be blocked; the active page can still use an in-memory identity.
      announce('浏览器未允许保存身份。请到 Wishlist 复制恢复链接，以免关闭后找不到清单。');
    }
  }
  const useMe = (data) => {
    W.nickname = data.nickname || '';
    W.google = data.google || null;
    W.saved = new Map(data.wishes.map((w) => [w.id, w]));
  };
  async function ensureSession() {
    if (token) {
      if (!W.loaded) throw new Error('个人清单尚未载入，请刷新后重试。');
      return;
    }
    if (!sessionPromise)
      sessionPromise = api('/v1/session', { method: 'POST', data: {}, credential: '' })
        .then((data) => {
          remember(data.token);
          useMe(data);
          W.loaded = true;
        })
        .finally(() => (sessionPromise = null));
    return sessionPromise;
  }
  // Shared anonymous identity for the activity contribution modules; never expose the token.
  W.request = api;
  W.ensureSession = ensureSession;
  W.announce = announce;
  const identityChanged = () => {
    const input = document.getElementById('wish-nickname');
    if (input) input.value = W.nickname;
    document.dispatchEvent(new Event('wish-identity-change'));
    emit();
  };
  W.startGoogleLogin = async () => {
    if (W.readOnly) throw new Error('请返回自己的 Wishlist 登录');
    await W.ready;
    if (token && !W.loaded && W.identityErrorStatus === 401) {
      const data = await api('/v1/session', { method: 'POST', data: {}, credential: '' });
      remember(data.token);
      useMe(data);
      W.loaded = true;
      W.identityErrorStatus = null;
    }
    await ensureSession();
    return api('/v1/auth/google/challenge', { method: 'POST', data: {} });
  };
  W.finishGoogleLogin = async (data) => {
    const result = await api('/v1/auth/google', { method: 'POST', data });
    remember(result.token);
    useMe(result);
    W.loaded = true;
    W.identityErrorStatus = null;
    identityChanged();
    return result;
  };
  W.signOut = async () => {
    await api('/v1/auth/logout', { method: 'POST', data: {} });
    token = '';
    try {
      localStorage.removeItem(KEY);
    } catch {}
    useMe({ nickname: '', wishes: [] });
    W.loaded = true;
    identityChanged();
    announce('已退出，云端记录保留。可继续免注册使用。');
  };
  W.markup = (e) =>
    `<div class="wish-row"><button type="button" class="wish-toggle" data-wish="${esc(e.id)}" aria-pressed="false" ${W.readOnly ? 'hidden' : ''}>♡ 想去</button><button type="button" class="wish-people" data-people="${esc(e.id)}" aria-label="查看谁想去 ${esc(e.name)}"><span data-wish-total>加载中</span><span class="wish-names" data-wish-names></span></button></div>`;
  W.mount = () => {
    document.querySelectorAll('[data-wish]').forEach((el) => {
      const saved = W.saved.has(el.dataset.wish);
      el.textContent = saved ? '♥ 已加入' : '♡ 想去';
      el.setAttribute('aria-pressed', String(saved));
      el.disabled = pending.has(el.dataset.wish);
    });
    document.querySelectorAll('[data-people]').forEach((el) => {
      const n = W.counts[el.dataset.people];
      el.querySelector('[data-wish-total]').textContent =
        n === undefined ? '谁想去 →' : n + ' 人想去';
    });
    const version = ++summaryVersion,
      ids = [
        ...new Set([...document.querySelectorAll('[data-people]')].map((el) => el.dataset.people)),
      ];
    // Keep requests bounded even after pagination loads a long list.
    Promise.all(
      Array.from({ length: Math.ceil(ids.length / 24) }, (_, i) =>
        api('/v1/summary?ids=' + ids.slice(i * 24, i * 24 + 24).join(','), { credential: '' }),
      ),
    )
      .then((results) => {
        if (version !== summaryVersion) return;
        const summary = Object.assign({}, ...results.map((r) => r.events));
        window.Community?.paintSummary(summary);
        document.querySelectorAll('[data-people]').forEach((el) => {
          const row = summary[el.dataset.people];
          if (!row) return;
          W.counts[el.dataset.people] = row.count;
          el.querySelector('[data-wish-total]').textContent = row.count + ' 人想去';
          el.querySelector('[data-wish-names]').textContent = row.names.length
            ? row.names.join('、') + (row.count > row.names.length ? ' 等 →' : ' →')
            : '看看谁也想去 →';
        });
      })
      .catch(() => {
        if (version === summaryVersion)
          document.querySelectorAll('[data-wish-total]').forEach((el) => {
            if (el.textContent === '加载中') el.textContent = '查看谁想去 →';
          });
      });
  };
  W.toggle = async (e) => {
    if (pending.has(e.id)) return;
    pending.add(e.id);
    W.mount();
    try {
      await ensureSession();
      const wasSaved = W.saved.has(e.id);
      const snapshot = Object.fromEntries(
        ['name', 'city', 'date', 'time', 'endDate', 'endTime', 'url', 'place', 'status'].map(
          (k) => [k, String(e[k] || '')],
        ),
      );
      const result = await api('/v1/wishes/' + e.id, {
        method: wasSaved ? 'DELETE' : 'PUT',
        data: wasSaved ? undefined : { snapshot },
      });
      if (result.saved) W.saved.set(e.id, { id: e.id, snapshot, savedAt: Date.now() });
      else W.saved.delete(e.id);
      W.counts[e.id] = result.count;
      announce(
        result.saved
          ? W.nickname
            ? '已加入 Wishlist。昵称 ' + W.nickname + ' 会显示在这场活动下。'
            : '已加入 Wishlist，以匿名访客显示。可在 Wishlist 设置公开昵称。'
          : '已移出 Wishlist',
      );
      emit();
    } catch (error) {
      announce(error.message);
    } finally {
      pending.delete(e.id);
      W.mount();
    }
  };
  W.events = (all) => {
    const map = new Map(all.map((e) => [e.id, e]));
    return [...W.saved.values()].map((w) => {
      const current = map.get(w.id);
      if (!current)
        return {
          ...w.snapshot,
          id: w.id,
          hosts: [],
          formats: [],
          themes: [],
          purposes: [],
          featured: false,
          match: null,
          brief: '这场活动已移出当前官方日历。保留你收藏时的信息，具体是否举办请向主办方核实。',
          note: '已移出当前日历',
          removed: true,
        };
      const changes = [];
      for (const [key, label] of [
        ['name', '名称'],
        ['date', '日期'],
        ['time', '开始时间'],
        ['endDate', '结束日期'],
        ['endTime', '结束时间'],
        ['place', '地点'],
        ['status', '报名状态'],
      ])
        if (
          w.snapshot[key] !== undefined &&
          ![w.snapshot[key], current[key]].every((v) =>
            ['\u5730\u70b9\u5f85\u786e\u8ba4', 'Location to be confirmed'].includes(v),
          ) &&
          w.snapshot[key] !== current[key]
        )
          changes.push(label);
      return {
        ...current,
        note: [
          current.note,
          changes.length
            ? '收藏后更新：' + [...new Set(changes)].join('、') + '。以下显示最新资料。'
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      };
    });
  };
  async function showPeople(id, append = false) {
    const dialog = document.getElementById('wish-people-dialog'),
      list = document.getElementById('wish-people-list'),
      more = document.getElementById('wish-people-more');
    if (!append) {
      list.replaceChildren();
      document.getElementById('wish-people-heading').textContent = '谁想去';
      dialog.showModal();
      more.hidden = true;
    }
    try {
      const result = await api(
        '/v1/events/' + id + '/people?offset=' + (append ? more.dataset.offset : 0),
        { credential: '' },
      );
      document.getElementById('wish-people-heading').textContent = result.count + ' 人想去';
      if (!result.names.length && !append) list.textContent = '还没有人收藏这场活动。';
      for (const name of result.names) {
        const li = document.createElement('li');
        li.textContent = name;
        list.append(li);
      }
      more.hidden = result.next === null;
      more.dataset.id = id;
      more.dataset.offset = result.next ?? '';
    } catch (error) {
      list.textContent = error.message;
      more.hidden = true;
    }
  }
  async function copyLink(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      announce(label + '已复制');
    } catch {
      const box = document.getElementById('wish-link');
      box.value = value;
      box.hidden = false;
      box.focus();
      box.select();
      announce('请长按或复制下方链接');
    }
  }
  async function profile() {
    const input = document.getElementById('wish-nickname');
    if (!input) return;
    input.value = W.nickname;
    if (W.readOnly) {
      document.getElementById('wish-profile').hidden = true;
      document.getElementById('wishlist-title').textContent =
        (W.nickname || '匿名访客') + ' 的 Wishlist';
      document.getElementById('wishlist-intro').textContent =
        '分享的只读清单。可查看活动和谁想去；返回“我的 Wishlist”编辑自己的收藏。';
      return;
    }
    document.getElementById('wish-nickname-save').addEventListener('click', async (event) => {
      event.target.disabled = true;
      try {
        await ensureSession();
        const result = await api('/v1/me', { method: 'PATCH', data: { nickname: input.value } });
        W.nickname = result.nickname;
        input.value = W.nickname;
        announce(
          W.nickname
            ? '昵称已保存，会公开显示在收藏、地址爆料、评分和转写链接中。'
            : '已改为匿名访客',
        );
        W.mount();
      } catch (error) {
        announce(error.message);
      } finally {
        event.target.disabled = false;
      }
    });
    document.getElementById('wish-restore-copy').addEventListener('click', async () => {
      try {
        if (W.google) {
          announce('已使用 Google 保存，请在另一设备登录同一账号恢复。');
          return;
        }
        await ensureSession();
        await copyLink(
          location.origin + window.TWLocale.path('/wishlist/') + '#restore=' + token,
          '个人恢复链接',
        );
      } catch (error) {
        announce(error.message);
      }
    });
    document.getElementById('wish-share').addEventListener('click', async () => {
      try {
        await ensureSession();
        const result = await api('/v1/share', { method: 'POST', data: { enabled: true } });
        await copyLink(
          location.origin + window.TWLocale.path('/wishlist/') + '#view=' + result.shareToken,
          '只读分享链接',
        );
      } catch (error) {
        announce(error.message);
      }
    });
    document.getElementById('wish-share-revoke').addEventListener('click', async () => {
      try {
        if (!token) return;
        await api('/v1/share', { method: 'POST', data: { enabled: false } });
        announce('之前的分享链接已停用');
      } catch (error) {
        announce(error.message);
      }
    });
    if (restore) {
      const box = document.getElementById('wish-restore-panel');
      box.hidden = false;
      document.getElementById('wish-restore-apply').addEventListener('click', async () => {
        try {
          const data = await api('/v1/me', { credential: restore });
          remember(restore);
          useMe(data);
          W.loaded = true;
          input.value = W.nickname;
          box.hidden = true;
          announce('已恢复这个 Wishlist。此设备原来的清单仍保存在云端，恢复它需要原来的恢复链接。');
          identityChanged();
        } catch (error) {
          announce(error.message);
        }
      });
    }
  }
  document.addEventListener('click', (event) => {
    const people = event.target.closest('[data-people]');
    if (people) showPeople(people.dataset.people);
    if (event.target.closest('[data-wish-close]'))
      document.getElementById('wish-people-dialog').close();
    if (event.target.closest('#wish-people-more')) showPeople(event.target.dataset.id, true);
  });
  W.ready = (async () => {
    const jobs = [api('/v1/counts', { credential: '' }).then((d) => (W.counts = d.counts))];
    if (share) jobs.push(api('/v1/shared/' + share, { credential: '' }).then(useMe));
    else if (token) jobs.push(api('/v1/me').then(useMe));
    const results = await Promise.allSettled(jobs);
    const identity = results[1];
    W.loaded = !identity || identity.status === 'fulfilled';
    W.identityErrorStatus = identity?.status === 'rejected' ? identity.reason.status : null;
    if (identity?.status === 'rejected')
      announce(identity.reason.message + '，已保留当前身份，请勿重复创建。');
    if (results[0].status === 'rejected') announce('暂时无法读取想去人数，请稍后刷新。');
    emit();
    W.mount();
    await profile();
    return W;
  })();
  window.addEventListener('storage', (event) => {
    if (event.key === KEY && event.newValue !== token) location.reload();
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !W.loaded) return;
    try {
      if (token && !W.readOnly) {
        useMe(await api('/v1/me'));
        emit();
      }
      W.counts = (await api('/v1/counts', { credential: '' })).counts;
      W.mount();
    } catch {
      /* Existing data stays visible until the next successful refresh. */
    }
  });
})();
